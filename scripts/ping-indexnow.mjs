// IndexNow 自动推送脚本
// 触发条件（满足其一才真正发请求，避免本地验证构建误发）：
//   - 在 Cloudflare Pages 部署构建时（CF_PAGES=true）
//   - 本地显式设置 INDEXNOW_PING=1 做测试
// 行为：读取 dist 下所有 sitemap-*.xml，提取全部 URL，POST 给 IndexNow
//       （api.indexnow.org 广播给 Bing/Yandex/Naver 等；另发 www.bing.com 让 BWT 可见）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'a876d641-e8f9-4539-8036-cdbeac42d4c3';
const HOST = 'igetoken.com';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

if (!process.env.CF_PAGES && !process.env.INDEXNOW_PING) {
  console.log('[indexnow] 非部署环境，跳过 ping（设 CF_PAGES=1 或 INDEXNOW_PING=1 可强制）。');
  process.exit(0);
}

function collectUrls() {
  const urls = [];
  const files = readdirSync(DIST).filter((f) => f.startsWith('sitemap-') && f.endsWith('.xml'));
  for (const f of files) {
    const xml = readFileSync(join(DIST, f), 'utf8');
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    for (const l of locs) {
      const url = l.replace(/<\/?loc>/g, '').trim();
      if (url.endsWith('.xml') && !url.endsWith('.html')) {
        // 子 sitemap 地址：读取其内容，收集真实页面 URL
        try {
          const sub = readFileSync(join(DIST, url.split('/').pop()), 'utf8');
          const subs = sub.match(/<loc>([^<]+)<\/loc>/g) || [];
          for (const s of subs) urls.push(s.replace(/<\/?loc>/g, '').trim());
        } catch {
          /* 忽略读取失败 */
        }
      } else {
        urls.push(url);
      }
    }
  }
  return [...new Set(urls)].filter((u) => u.startsWith('http'));
}

const urlList = collectUrls();
if (urlList.length === 0) {
  console.log('[indexnow] 未发现可推送 URL，跳过。');
  process.exit(0);
}

const payload = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });

async function post(endpoint) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    console.log(`[indexnow] ${endpoint} -> HTTP ${res.status} (${urlList.length} URLs)`);
  } catch (e) {
    console.error(`[indexnow] ${endpoint} 请求失败（不影响部署）:`, e.message);
  }
}

await post('https://api.indexnow.org/indexnow');
await post('https://www.bing.com/indexnow');
