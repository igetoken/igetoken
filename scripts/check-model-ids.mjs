#!/usr/bin/env node
/**
 * 以官方「免 Key」模型列表为基准，核对站内引用的模型 ID 是否仍在线。
 *
 * 为什么需要它：模型 ID 会同时出现在两处事实源 —— ① models.json 的平台条目；
 * ② 该平台 active 快讯（deals.json）的 reward / summary / pitfalls 文案。
 * 只改一处会留下「照抄即 404」的过时 ID（2026-09-16 opencode 实例）。
 *
 * 用法：
 *   node scripts/check-model-ids.mjs                 # 检查全部已配置平台
 *   node scripts/check-model-ids.mjs opencode        # 只检查指定平台
 *   node scripts/check-model-ids.mjs --suffix=free,alpha   # 覆盖后缀白名单
 *
 * 退出码：全部在线 → 0；发现离线 ID → 1（便于脚本化/CI）。
 */
import fs from 'node:fs';

/** 平台 slug → 官方免 Key 模型列表接口（可多个，合并为一个在线集合） */
const SOURCES = {
  opencode: ['https://opencode.ai/zen/v1/models', 'https://opencode.ai/zen/go/v1/models'],
  zenmux: ['https://zenmux.ai/api/v1/models'],
  openrouter: ['https://openrouter.ai/api/v1/models'],
};

/** 候选模型 ID 的**末段**白名单（比对时会自动补前导连字符，如 `free` → `-free`） */
const DEFAULT_SUFFIXES = ['free', 'alpha', 'pickle', 'preview', 'flash', 'tiny', 'mini'];

const argv = process.argv.slice(2);
const suffixArg = argv.find((a) => a.startsWith('--suffix='));
const platforms = argv.filter((a) => !a.startsWith('--'));
const suffixes = (suffixArg ? suffixArg.split('=')[1].split(',') : DEFAULT_SUFFIXES)
  .map((s) => s.trim().replace(/^-/, ''))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

// 主体 `xxx` + 任意 `-段`/`.段` + 末段后缀。后缀必须自带分隔符，否则 `union-alpha` 这类无主体后缀的 ID 匹配不到。
const ID_RE = new RegExp(`\\b[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*(?:-${suffixes.join('|-')})\\b`, 'g');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\ufeff/, ''));

/** 递归收集对象里的全部字符串（带路径，便于定位出处）。
 *  跳过 id / slug / platform_slug —— 那些是**本站快讯与平台的标识符**，不是模型 ID，抽出来只会误报。 */
const SKIP_KEYS = new Set(['id', 'slug', 'platform_slug']);
function collectStrings(value, path, sink) {
  if (typeof value === 'string') sink.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, sink));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => {
      if (SKIP_KEYS.has(k)) return;
      collectStrings(v, `${path}.${k}`, sink);
    });
  }
}

async function fetchOnline(urls) {
  const ids = new Set();
  for (const url of urls) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      const list = j.data || j.models || [];
      // 聚合器常用 `vendor/model` 命名空间；取末段入库，便于与站内裸 ID 比对。
      list.forEach((m) => {
        const id = m && (m.id || m.name);
        if (!id) return;
        ids.add(String(id));
        const base = String(id).split('/').pop();
        if (base) ids.add(base);
      });
      console.log(`  接口 OK  ${url}  (${list.length} 个模型)`);
    } catch (e) {
      console.log(`  接口失败 ${url}  ${e.message}`);
    }
  }
  return ids;
}

const modelsRaw = readJson('src/data/models.json');
const modelArr = Array.isArray(modelsRaw) ? modelsRaw : modelsRaw.platforms || [];
const deals = readJson('src/data/deals.json');

const targets = platforms.length ? platforms : Object.keys(SOURCES);
let offlineTotal = 0;
let hardTotal = 0;

for (const slug of targets) {
  if (!SOURCES[slug]) {
    console.log(`\n[${slug}] 未配置官方列表接口 —— 请在 SOURCES 里补充后重跑`);
    continue;
  }
  console.log(`\n[${slug}] 拉取官方列表：`);
  const online = await fetchOnline(SOURCES[slug]);
  if (online.size === 0) {
    console.log(`  ⚠️ 未取到任何在线模型，跳过（避免误报全离线）`);
    continue;
  }

  /** 站内引用：models 条目 + 该平台所有 deals 的文案 */
  const refs = [];
  const platform = modelArr.find((p) => p.slug === slug);
  if (platform) collectStrings(platform, `models.json:${slug}`, refs);
  deals
    .filter((d) => d.platform_slug === slug)
    .forEach((d) => collectStrings(d, `deals.json:${d.id}(${d.status})`, refs));

  const found = new Map(); // id -> {online, sources: Map<path, text>}
  refs.forEach(([path, text]) => {
    for (const id of text.match(ID_RE) || []) {
      if (!found.has(id)) found.set(id, { online: online.has(id), sources: new Map() });
      found.get(id).sources.set(path, text);
    }
  });

  if (found.size === 0) {
    console.log(`  （未抽到候选模型 ID —— 可用 --suffix= 放宽后缀白名单）`);
    continue;
  }

  /** 判定该处引用是否为「刻意举例」——pitfalls 内的举例，或原文本身带下架语义 */
  const GONE_RE = /已下架|已下线|下架|已消失|不再在架|已移除|曾|早期|轮换/;

  const isSoft = (path, text) => /\.pitfalls\[\d+\]$/.test(path) || GONE_RE.test(text);

  const offline = [...found.entries()].filter(([, v]) => !v.online);
  let hardCount = 0;
  found.forEach((v, id) => {
    console.log(`  ${v.online ? '✓' : '✗'} ${id}${v.online ? '' : '   ← 不在官方列表'}`);
    if (v.online) return;
    let soft = true;
    v.sources.forEach((text, path) => {
      if (!isSoft(path, text)) soft = false;
      console.log(`      ↳ ${path}${isSoft(path, text) ? '  ⓘ 原文含「已下架/轮换」语义的举例 → 属刻意引用，通常无需修改' : '  ⚠️ 疑似当前在架口径，需核对'}`);
    });
    if (!soft) hardCount += 1;
  });
  offlineTotal += offline.length;
  hardTotal += hardCount;
  console.log(`  小结：候选 ${found.size} 个，离线 ${offline.length} 个（其中**疑似需修 ${hardCount} 个**）`);
}

console.log(`\n离线 ID 合计：${offlineTotal}（其中疑似需修 ${hardTotal} 个）`);
if (hardTotal > 0) {
  console.log('处置口径：只修 status=active 的条目（ended 历史快讯保留当时口径），改文案后重跑本脚本复验。');
  process.exit(1);
}
console.log('未发现「当前在架口径」里引用了已下线 ID 的情况。');
