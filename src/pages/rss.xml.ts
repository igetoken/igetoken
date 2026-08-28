import type { APIRoute } from 'astro';
import { getDeals } from '../lib/data';

const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const GET: APIRoute = (context) => {
  const site = context.site ?? new URL('https://igetoken.com');
  const items = getDeals()
    .map((deal) => {
      const url = new URL(`/deals/${deal.id}/`, site).href;
      return `    <item>
      <title>${escapeXml(deal.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(deal.date).toUTCString()}</pubDate>
      <description>${escapeXml(`${deal.reward} —— ${deal.summary}`)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>iGetToken 活动快讯</title>
    <link>${site.href}</link>
    <description>大模型免费 Token 限时活动、注册福利、价格变动速报</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
