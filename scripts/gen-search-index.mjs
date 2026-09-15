// 构建期生成「站内全局搜索」索引 public/search-index.json。
// 数据源：models / deals / perks / search 四份 JSON（与 src/lib/data.ts 同源）。
// 输出瘦身记录（title/sub/url/标签/检索串），供 header 搜索框运行时 fetch（懒加载，不阻塞首屏）。
// 说明：分类标签与 data.ts 保持一致，新增类型时两处同步（此处为 .mjs，无法直接 import TS）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'src/data', f), 'utf8'));

// 与 src/lib/data.ts 的 LABEL 映射保持一致
const CATEGORY_LABEL = { domestic: '国内大厂', overseas: '海外平台', aggregator: '聚合与工具' };
const DEAL_TYPE_LABEL = {
  limited_time: '限时活动',
  signup_bonus: '新人福利',
  price_change: '价格变动',
  new_model: '免费上新',
  referral: '邀请奖励',
  verify_bonus: '认证福利',
  task_reward: '任务奖励',
};
const PERK_TYPE_LABEL = { signin: '每日签到', student: '学生认证', limited: '限时活动', invite: '邀请有礼' };
const SEARCH_TYPE_LABEL = {
  free_tier: '免费额度',
  freemium: '免费增值',
  limited: '限时免费',
  credit: '积分额度',
};

const models = read('models.json');
const deals = read('deals.json');
const perks = read('perks.json');
const search = read('search.json');

const norm = (s) => (s ?? '').toString().toLowerCase();
const join = (arr) => arr.filter(Boolean).join(' ');

const recs = [];

// 资源库（平台）——含已归档，检索时降权；详情页永不删除
for (const p of models) {
  const tags = [CATEGORY_LABEL[p.category] ?? '', ...(p.tags ?? [])].filter(Boolean);
  recs.push({
    t: 'platform',
    title: p.name,
    sub: p.tagline,
    url: `/models/${p.slug}/`,
    tags,
    status: p.status === 'ended' ? 'ended' : 'active',
    hay: norm(
      join([
        p.name,
        p.slug,
        p.tagline,
        p.highlight,
        (p.tags ?? []).join(' '),
        p.example_model,
        p.api_base,
        CATEGORY_LABEL[p.category],
      ])
    ),
  });
}

// 活动快讯——active + ended 均纳入（已结束降权，保留可查）
for (const d of deals) {
  const tags = [DEAL_TYPE_LABEL[d.type] ?? '', d.platform_name].filter(Boolean);
  recs.push({
    t: 'deal',
    title: d.title,
    sub: d.reward || d.summary,
    url: `/deals/${d.id}/`,
    tags,
    status: d.status === 'ended' ? 'ended' : 'active',
    hay: norm(
      join([d.title, d.reward, d.summary, d.platform_name, DEAL_TYPE_LABEL[d.type], d.platform_slug])
    ),
  });
}

// 积分福利——外链官方来源
for (const k of perks) {
  const tags = [k.product, PERK_TYPE_LABEL[k.type] ?? ''].filter(Boolean);
  recs.push({
    t: 'perk',
    title: k.title,
    sub: k.amount || k.condition,
    url: k.source,
    ext: 1,
    tags,
    status: 'active',
    hay: norm(join([k.product, k.title, k.amount, k.condition, k.note, PERK_TYPE_LABEL[k.type]])),
  });
}

// 搜索 API——外链官方来源
for (const a of search) {
  const tags = [...(a.interfaces ?? []), SEARCH_TYPE_LABEL[a.type] ?? ''].filter(Boolean);
  recs.push({
    t: 'search',
    title: `${a.product} · ${a.title}`,
    sub: a.amount,
    url: a.source,
    ext: 1,
    tags,
    status: 'active',
    hay: norm(
      join([a.product, a.title, a.amount, a.auth, (a.interfaces ?? []).join(' '), a.note, SEARCH_TYPE_LABEL[a.type]])
    ),
  });
}

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/search-index.json'), JSON.stringify(recs));
console.log(`[gen-search-index] ${recs.length} records -> public/search-index.json`);
