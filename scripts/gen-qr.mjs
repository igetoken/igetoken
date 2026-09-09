// 构建期生成分享卡片用的二维码 PNG（同源静态资源，避免运行时跨域污染 canvas）。
// 每个平台一张，路径 public/share/qr/<slug>.png，另生成站点根回退 public/share/qr-site.png。
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const SITE = 'https://igetoken.com';
const opts = { margin: 1, width: 512, color: { dark: '#0f172a', light: '#ffffff' } };

const models = JSON.parse(fs.readFileSync(path.join(root, 'src/data/models.json'), 'utf8'));
const qrDir = path.join(root, 'public/share/qr');
fs.mkdirSync(qrDir, { recursive: true });

let n = 0;
for (const p of models) {
  const url = `${SITE}/models/${p.slug}/`;
  await QRCode.toFile(path.join(qrDir, `${p.slug}.png`), url, opts);
  n++;
}
await QRCode.toFile(path.join(root, 'public/share/qr-site.png'), SITE, opts);
console.log(`[gen-qr] generated ${n} platform QR codes + site-root fallback`);
