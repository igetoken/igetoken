import type { APIRoute } from 'astro';
import { getDeals, getPlatforms, getPerks } from '../lib/data';

const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

interface FeedItem {
  title: string;
  link: string;
  /** ISO 日期/时间字符串，用于排序与 pubDate */
  pubDate: string;
  description: string;
}

export const GET: APIRoute = (context) => {
  const site = context.site ?? new URL('https://igetoken.com');
  const items: FeedItem[] = [];

  // ① 活动快讯（deals.json，含已归档，全部输出）
  for (const deal of getDeals()) {
    items.push({
      title: deal.title,
      link: new URL(`/deals/${deal.id}/`, site).href,
      pubDate: deal.date,
      description: `${deal.reward} —— ${deal.summary}`,
    });
  }

  // ② 平台上新（models.json，仅输出有收录日期 publishedAt 的新平台）
  for (const p of getPlatforms()) {
    if (!p.publishedAt) continue;
    items.push({
      title: `新平台上线：${p.name}`,
      link: new URL(`/models/${p.slug}/`, site).href,
      pubDate: p.publishedAt,
      description: p.highlight,
    });
  }

  // ③ 积分福利上新（perks.json，仅输出有收录日期 publishedAt 的新福利）
  for (const perk of getPerks()) {
    if (!perk.publishedAt) continue;
    items.push({
      title: `积分福利：${perk.product} · ${perk.title}`,
      link: new URL('/perks/', site).href,
      pubDate: perk.publishedAt,
      description: perk.amount,
    });
  }

  // 按发布时间倒序，新内容在前
  items.sort((a, b) => b.pubDate.localeCompare(a.pubDate));

  const itemXml = items
    .map(
      (it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.link)}</guid>
      <pubDate>${new Date(it.pubDate).toUTCString()}</pubDate>
      <description>${escapeXml(it.description)}</description>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>iGetToken 上新速报</title>
    <link>${site.href}</link>
    <description>大模型免费 API 平台上新、限时活动、积分福利速报</description>
    <language>zh-CN</language>
${itemXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
