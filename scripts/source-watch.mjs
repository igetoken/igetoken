#!/usr/bin/env node
/**
 * iGetToken 信源监控（零依赖）
 * ------------------------------------------------------------------
 * 抓取 monitor/sources.json 里的官方信源页与社区 RSS，做快照比对，
 * 命中变化/线索时推飞书群机器人卡片；每日 09:00 CST 必发一条汇总。
 *
 * 设计要点（详见 docs/信源监控规划.md）：
 *  - 只产「线索告警」，绝不自动写库（收录仍走人工核实 + 三向分流）
 *  - 变化判定 = 正文归一化后的 sha256；keywords 只用于命中时抽取上下文
 *  - 源类型：page（整页 hash 比对）| openrouter-free（$0 模型集合增删）
 *            | rss / hn-algolia（新条目关键词命中 → 社区线索）
 *  - 状态写 monitor/state/state.json（由 workflow 提交到 monitor-state 分支）
 *  - 抓取失败不算变化；连续 3 次失败单独告警
 *
 * 环境变量：
 *  FEISHU_WEBHOOK_NOTICE  飞书自定义机器人 webhook（必填，否则只打印）
 *  FEISHU_SECRET          可选，机器人开启「签名校验」时必填
 *  DRY_RUN=1       只打印，不推送、不写状态
 *  FORCE_REPORT=1  强制按「汇总」模式发送
 *  SCHEDULE        GitHub Actions 传入的 cron（'0 1 * * *' = 每日汇总）
 *  ONLY_IDS        仅巡检指定 id（逗号分隔，调试用）
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';

const ROOT = process.cwd();
const SOURCES_PATH = `${ROOT}/monitor/sources.json`;
const STATE_DIR = `${ROOT}/monitor/state`;
const STATE_PATH = `${STATE_DIR}/state.json`;
const DEALS_PATH = `${ROOT}/src/data/deals.json`;

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const FORCE_REPORT = process.env.FORCE_REPORT === 'true' || process.env.FORCE_REPORT === '1';
const DAILY_CRON = '0 1 * * *'; // UTC 01:00 = CST 09:00
const IS_DAILY = process.env.SCHEDULE === DAILY_CRON || FORCE_REPORT;
const MAX_SNIPPETS_PER_SOURCE = 3;
const MAX_ITEMS_IN_CARD = 10;
const MAX_SEEN_PER_FEED = 300;
const FAIL_ALERT_THRESHOLD = 3;
const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 6;
const UA = 'Mozilla/5.0 (compatible; igetoken-monitor/1.0; +https://igetoken.com)';

// ---------------------------------------------------------------- 工具

const nowISO = () => new Date().toISOString();
const cstDate = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
const cstStamp = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

/** 正文归一化：优先取 <main>/<article>，没有就用整篇（去 script/style 后） */
function normalizeHtml(html) {
  const body = html.match(/<(main|article)[\s>][\s\S]*?<\/\1>/i);
  return stripTags(body ? body[0] : html);
}

/** 抽取关键词上下文片段（每词前后各 60 字，去重，最多 N 段） */
function extractSnippets(text, keywords) {
  const out = [];
  for (const kw of keywords || []) {
    const i = text.indexOf(kw);
    if (i < 0) continue;
    const s = text.slice(Math.max(0, i - 60), i + kw.length + 60).trim();
    if (out.some((x) => x.includes(s.slice(20, 60)))) continue;
    out.push(`…${s}…`);
    if (out.length >= MAX_SNIPPETS_PER_SOURCE) break;
  }
  return out;
}

function matchedKeywords(title, desc, keywords) {
  const hay = `${title} ${desc}`;
  return (keywords || []).filter((k) => hay.toLowerCase().includes(k.toLowerCase()));
}

async function fetchText(url) {
  const res = await fetch(url, {
    // accept-language 固定英文：Google 等站点会按地域返回机器翻译版本，会导致「假变化」
    headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function parseFeed(xml) {
  const isAtom = /<entry[\s>]/.test(xml);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const items = [];
  for (const block of xml.match(re) || []) {
    const pick = (...patterns) => {
      for (const p of patterns) {
        const m = block.match(p);
        if (m) return decodeEntities(m[1]).trim();
      }
      return '';
    };
    const title = stripTags(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    const link = isAtom
      ? (block.match(/<link[^>]*href="([^"]+)"/i) || [, ''])[1]
      : stripTags(pick(/<link[^>]*>([\s\S]*?)<\/link>/i));
    const guid = pick(/<guid[^>]*>([\s\S]*?)<\/guid>/i, /<id[^>]*>([\s\S]*?)<\/id>/i) || link;
    const desc = stripTags(pick(/<description>([\s\S]*?)<\/description>/i, /<summary[^>]*>([\s\S]*?)<\/summary>/i, /<content[^>]*>([\s\S]*?)<\/content>/i));
    if (title) items.push({ guid: guid || title, title, link, desc });
  }
  return items;
}

/** HN 官方 Algolia Search API → 统一 item 结构 */
function parseHnAlgolia(json) {
  let data;
  try { data = JSON.parse(json); } catch { return []; }
  return (data.hits || []).map((h) => ({
    guid: String(h.objectID || h.url || h.title || ''),
    title: stripTags(String(h.title || '')).trim(),
    link: h.url || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : ''),
    desc: stripTags(String(h.story_text || h.url || '')),
  })).filter((it) => it.title);
}

async function loadJSON(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

// ---------------------------------------------------------------- 飞书

// 兜底 webhook 地址：机器人「签名校验」开启时，仅凭该地址无法投递（缺密钥必被拒），
// 因此可安全内置。若日后关闭签名校验，请把地址改走 FEISHU_WEBHOOK_URL secret。
const DEFAULT_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/fbfbdfd5-7795-4ebb-a0c7-d359e0ca4e83';

function feishuSign(secret, timestamp) {
  // 飞书规范：stringToSign = `${timestamp}\n${secret}`；HMAC-SHA256(key=stringToSign, data='')
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).update('').digest('base64');
}

function resolveFeishu() {
  // 兼容两种配置：A) 地址放 NOTICE、密钥放 SECRET；B) 密钥放 NOTICE、地址放 URL
  const notice = (process.env.FEISHU_WEBHOOK_NOTICE || process.env.FEISHU_WEBHOOK || '').trim();
  const looksUrl = /^https?:\/\//i.test(notice);
  const url = looksUrl ? notice : (process.env.FEISHU_WEBHOOK_URL || DEFAULT_WEBHOOK);
  const secret = (process.env.FEISHU_SECRET || (notice && !looksUrl ? notice : '')).trim();
  return { url, secret };
}

async function sendFeishu(card) {
  const { url, secret } = resolveFeishu();
  if (!url) { console.log('[notify] 未配置飞书 webhook，跳过推送。卡片内容：\n' + JSON.stringify(card, null, 2)); return; }
  const payload = { msg_type: 'interactive', card };
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    payload.timestamp = String(ts);
    payload.sign = feishuSign(secret, ts);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let ok = res.ok;
  try { const j = JSON.parse(text); if (j.code !== undefined && j.code !== 0) ok = false; } catch { /* 非 JSON */ }
  console.log(`[notify] HTTP ${res.status} ok=${ok} resp=${text.slice(0, 200)}`);
  if (!ok) throw new Error(`飞书推送失败: ${res.status} ${text.slice(0, 200)}`);
}

function buildCard({ changed, leads, failures, isDaily, total, checked, overdue }) {
  const hasChange = changed.length > 0;
  const hasLead = leads.length > 0;
  const hasFail = failures.length > 0;

  let title, template;
  if (isDaily) { title = `📊 iGetToken 信源监控 · 每日汇总`; template = 'turquoise'; }
  else if (hasChange) { title = `🔔 iGetToken 信源监控 · 发现 ${changed.length} 处变化`; template = 'orange'; }
  else if (hasLead) { title = `🔎 iGetToken 信源监控 · 社区线索 ${leads.length} 条`; template = 'blue'; }
  else { title = `⚠️ iGetToken 信源监控 · 信源异常`; template = 'red'; }
  if (!isDaily && hasFail && !hasChange) template = 'red';

  const elements = [];
  let shown = 0;

  if (hasChange) {
    const lines = [];
    for (const c of changed) {
      if (shown >= MAX_ITEMS_IN_CARD) break;
      shown++;
      const head = `**[${c.src.name}](${c.src.url})**`;
      const body = c.kind === 'free-models'
        ? `  免费模型 ${c.total} 个：新增 ${c.added.length || 0}${c.added.length ? `（${c.added.slice(0, 5).join('、')}）` : ''}${c.removed.length ? ` · 移除 ${c.removed.length}` : ''}`
        : (c.snippets.length ? c.snippets.map((s) => `  ${s}`).join('\n') : '  正文有变化（未命中关键词，建议人工打开确认）');
      lines.push(`${head}\n${body}`);
    }
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**【官方信源 · ${changed.length}】**\n${lines.join('\n')}` } });
  }

  if (hasLead) {
    const lines = leads.slice(0, MAX_ITEMS_IN_CARD).map((l) =>
      `• [${l.title.slice(0, 70)}](${l.link || l.src.url})\n  _${l.src.name} · 命中：${l.hits.slice(0, 3).join('、')}_`);
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**【社区线索 · ${leads.length}】（仅线索，须回官方页核实）**\n${lines.join('\n')}` } });
  }

  if (hasFail) {
    const lines = failures.map((f) => `• ${f.src.name} — ${f.err}（连续 ${f.failCount} 次）`);
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**🔴 信源异常 · ${failures.length}**\n${lines.join('\n')}\n_建议核实该页是否改版/下线，必要时从 sources.json 移除_` } });
  }

  if (isDaily) {
    const status = hasChange ? `${changed.length} 处官方信源变化`
      : hasLead ? `${leads.length} 条社区线索（无官方信源变化）`
      : '无变化';
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**近 24h 巡检结果：${status}**\n信源 ${total} 个 · 成功 ${checked} · 失败 ${failures.length}` } });
    if (overdue && overdue.length) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**📌 站内到期待办（3 日内 / 已过期，仍 active）**\n${overdue.map((o) => `• ${o.line}`).join('\n')}` } });
    }
  }

  if (shown > 0 && changed.length > shown) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `_另有 ${changed.length - shown} 条变化未展开，请到仓库 state.json 查看_` } });
  }

  elements.push({ tag: 'hr' });
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `巡检 ${cstStamp()} CST · 信源 ${total} 个 · 失败 ${failures.length} · igetoken.com` }] });

  return { config: { wide_screen_mode: true }, header: { template, title: { tag: 'plain_text', content: title } }, elements };
}

// ---------------------------------------------------------------- 到期待办

/** 从 deals.json 里挑出「已过期 / 3 日内到期」且仍 active 的条目，作为每日汇总的提醒 */
function collectOverdue(deals) {
  if (!Array.isArray(deals)) return [];
  const today = cstDate();
  const limit = cstDate(new Date(Date.now() + 3 * 86400e3));
  const out = [];
  for (const d of deals) {
    if (d.status === 'ended') continue;
    const m = String(d.deadline || '').match(/(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    const date = m[1];
    if (date <= limit) {
      const tag = date < today ? '已过期' : '临期';
      out.push({ date, line: `${tag} ${date} · ${d.id}${d.pinHeadline ? '（当前头条）' : ''}` });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const cfg = JSON.parse(await readFile(SOURCES_PATH, 'utf8'));
  const only = (process.env.ONLY_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sources = only.length ? cfg.sources.filter((s) => only.includes(s.id)) : cfg.sources;

  const state = await loadJSON(STATE_PATH, { version: 1, sources: {}, rss: {} });
  const deals = await loadJSON(DEALS_PATH, []);
  const overdue = collectOverdue(deals);

  const changed = [], leads = [], failures = [];
  let checked = 0;

  const tasks = sources.map((src) => async () => {
    const prev = state.sources[src.id] || {};
    try {
      const body = await fetchText(src.url);
      checked++;

      if (src.type === 'rss' || src.type === 'hn-algolia') {
        const rssPrev = state.rss[src.id];
        const seen = new Set(rssPrev?.seen || []);
        const items = src.type === 'rss' ? parseFeed(body) : parseHnAlgolia(body);
        for (const it of items) {
          if (seen.has(it.guid)) continue;
          const hits = matchedKeywords(it.title, it.desc, src.keywords);
          seen.add(it.guid);
          // 首次运行只建基线，不回溯轰炸（闸门读 state.rss，不是 state.sources）
          if (hits.length && rssPrev?.lastFetchedAt) leads.push({ src, ...it, hits });
        }
        state.rss[src.id] = { seen: [...seen].slice(-MAX_SEEN_PER_FEED), lastFetchedAt: nowISO() };
      } else if (src.type === 'openrouter-free') {
        const data = JSON.parse(body);
        const freeIds = (data.data || [])
          .filter((m) => Number((m.pricing || {}).prompt) === 0 && Number((m.pricing || {}).completion) === 0)
          .map((m) => m.id).sort();
        const prevIds = prev.freeIds || [];
        if (prev.fetchedAt) {
          const added = freeIds.filter((i) => !prevIds.includes(i));
          const removed = prevIds.filter((i) => !freeIds.includes(i));
          if (added.length || removed.length) changed.push({ src, kind: 'free-models', added, removed, total: freeIds.length });
        }
        state.sources[src.id] = { fetchedAt: nowISO(), freeIds, freeCount: freeIds.length, failCount: 0, lastChangedAt: prev.lastChangedAt };
      } else {
        const text = normalizeHtml(body);
        const hash = createHash('sha256').update(text).digest('hex');
        const isChanged = Boolean(prev.hash) && prev.hash !== hash;
        if (isChanged) {
          changed.push({ src, kind: 'page', snippets: extractSnippets(text, src.keywords), textLen: text.length });
        }
        state.sources[src.id] = {
          fetchedAt: nowISO(),
          hash,
          textLen: text.length,
          failCount: 0,
          lastChangedAt: isChanged ? nowISO() : prev.lastChangedAt,
        };
      }
    } catch (e) {
      const failCount = (prev.failCount || 0) + 1;
      state.sources[src.id] = { ...prev, fetchedAt: prev.fetchedAt, failCount, lastError: String(e).slice(0, 120) };
      if (failCount >= FAIL_ALERT_THRESHOLD) failures.push({ src, err: String(e).slice(0, 120), failCount });
      console.log(`[fail] ${src.id} (${failCount}): ${e}`);
    }
  });

  // 并发池
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) await tasks[cursor++]();
  }));

  console.log(`[scan] 信源 ${sources.length} · 成功 ${checked} · 变化 ${changed.length} · 线索 ${leads.length} · 失败告警 ${failures.length}`);

  const shouldNotify = IS_DAILY || changed.length > 0 || leads.length > 0 || failures.length > 0;
  if (shouldNotify) {
    const card = buildCard({ changed, leads, failures, isDaily: IS_DAILY, total: sources.length, checked, overdue });
    if (DRY_RUN) {
      console.log('[dry-run] 本应推送的卡片：\n' + JSON.stringify(card, null, 2));
    } else {
      await sendFeishu(card);
    }
  } else {
    console.log('[notify] 无命中，静默。');
  }

  if (DRY_RUN) { console.log('[dry-run] 不写状态。'); return; }
  await mkdir(STATE_DIR, { recursive: true });
  state.updatedAt = nowISO();
  state.lastRun = { at: nowISO(), checked, changed: changed.length, leads: leads.length, failures: failures.length, notified: shouldNotify };
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  console.log(`[state] 已写入 ${STATE_PATH}`);

  if (changed.length || leads.length || failures.length) {
    console.log('--- 本次命中明细 ---');
    for (const c of changed) console.log(`  [变化] ${c.src.id}${c.kind === 'free-models' ? ` +${c.added.length}/-${c.removed.length}` : ''}`);
    for (const l of leads) console.log(`  [线索] ${l.src.id} · ${l.title.slice(0, 60)}`);
    for (const f of failures) console.log(`  [失败] ${f.src.id} ×${f.failCount}`);
  }
}

main().catch((e) => { console.error('[fatal]', e); process.exit(2); });
