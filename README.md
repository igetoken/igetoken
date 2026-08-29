# iGetToken

> **你的免费 AI 额度导航** —— 收集全网正规渠道的大模型免费额度：注册赠送、永久免费模型、限时活动快讯。
>
> 🌐 线上地址：**[https://igetoken.com](https://igetoken.com)** · [RSS 订阅](https://igetoken.com/rss.xml)

## 这是什么

AI 时代人人都有"Token 焦虑"：各家大模型平台的免费额度散落在不同角落，规则各异、变动频繁。iGetToken 把它们收集到一起，**只收录官方正规渠道**，每条信息标注最后核实日期，配套保姆级教程——从"怎么领"到"怎么用"，让 AI 调用零成本起步。

我们不提供 API 中转、不做 Token 转售，只做信息的搬运工与质检员。

## 内容板块

| 板块 | 说明 |
|------|------|
| **免费资源库** | 国内大厂 / 海外平台 / 聚合工具三大分类，每个平台一页：额度明细、领取步骤、调用示例、坑点提醒 |
| **活动快讯** | 限时活动、注册福利、价格变动的及时速报，每条可溯源到官方公告，过期条目归档保留，支持 RSS 订阅 |
| **保姆级教程** | 从领取 API Key、配置客户端到 Python 调用、平台选型的完整上手路径 |
| **避坑指南** | 免费网页版 ≠ API Token、额度类型与有效期、远离劣质中转站、Key 安全守则 |

### 已收录平台

**国内**：智谱AI（BigModel）· 硅基流动 · 阿里云百炼 · 月之暗面 Kimi · 腾讯混元 · WorkBuddy
**海外**：Google Gemini · Groq
**聚合与工具**：OpenRouter · OpenCode（Zen 网关）

持续收录中，欢迎通过[联系邮箱](mailto:igetoken@outlook.com)推荐或纠错。

## 技术栈

- [Astro](https://astro.build) — 纯静态生成，构建产物即整站
- [Tailwind CSS](https://tailwindcss.com) — 样式
- [Cloudflare Pages](https://pages.cloudflare.com) — 全球 CDN 托管，git push 自动部署
- 数据即文件：平台与快讯数据以 JSON 维护，本仓库即开放数据源

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 构建到 dist/
```

## 免责声明

本站仅聚合各平台官方公开的新人福利、免费额度与活动信息，所有内容仅供参考，具体规则与时效以各官方页面为准。本站不提供 API 中转或 Token 转售服务，不索要用户的 API Key，不收集对话数据。请保护好您的个人隐私与数据安全。

---

© 2026 iGetToken · 你的免费 AI 额度导航
