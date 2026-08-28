# iGetToken

> 你的免费 AI 密钥导航 —— 收集全网正规渠道的大模型免费 Token：导航 + 攻略 + 活动快讯。

纯静态站点（Astro + Tailwind CSS），部署在 Cloudflare Pages，构建产物即整站。

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://localhost:4321
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
```

## 内容维护（日常操作全在这里）

所有内容更新 = 改文件 → git commit → push，Cloudflare Pages 会自动构建上线（约 1-2 分钟）。手机上登 GitHub 网页版同样能操作。

### 发布一条活动快讯

编辑 `src/data/deals.json`，在最上面（数组开头）加一条：

```json
{
  "id": "2026-09-xx-platform-slug",          // 格式：日期-平台-关键词，全站唯一
  "date": "2026-09-01",                       // 发布日期
  "platform_slug": "zhipu",                   // 对应 models.json 里的 slug；平台未收录则留 ""
  "platform_name": "智谱AI（BigModel）",       // 展示名称
  "title": "一句话说清活动",
  "type": "limited_time",                     // limited_time | signup_bonus | price_change | new_model | referral | verify_bonus
  "reward": "具体奖励内容",
  "eligibility": "参与门槛（新人专享？需实名？）",
  "deadline": "2026-09-30",                   // 没有就 null；未知写 "未知，建议尽快领取"
  "howto": ["步骤1", "步骤2"],
  "summary": "一两句补充说明",
  "source": "https://官方公告链接",            // 必填！只发可溯源到官方的信息
  "status": "active"                          // active | ended
}
```

活动结束：把 `status` 改为 `"ended"`，**不要删除**（归档保留 SEO 与历史）。

### 新增/更新一个平台

编辑 `src/data/models.json`，字段结构参考已有条目（slug、category、offers、steps、pitfalls、api_base、example_model、last_verified 等）。更新额度时**必须同步更新 `last_verified` 日期**。截图等资料放 `src/assets/platforms/{slug}/`。

### 写一篇教程

在 `src/content/tutorials/` 新建 `.mdx` 文件，头部格式：

```yaml
---
title: 教程标题
description: 一句话描述（用于列表和 SEO）
pubDate: 2026-09-01
tags: [新手入门]
---
```

图片放 `src/assets/tutorials/{文件名同名目录}/`，正文里相对路径引用。

## 目录结构

```
src/
├── content/tutorials/    # 教程 MDX
├── data/                 # models.json（平台）+ deals.json（快讯）—— 站点的"数据库"
├── assets/               # 截图/配图（构建时压缩）
├── layouts/Base.astro    # 全局骨架（SEO + Header + Footer）
├── components/           # 7 个复用组件
├── lib/                  # 类型 + 数据读取/排序工具
├── styles/global.css     # Tailwind 入口
└── pages/                # 路由即目录
```

## 部署

Cloudflare Pages 绑定 Git 仓库：

- 构建命令：`npm run build`
- 输出目录：`dist`

## 红线（务必遵守）

只收录官方正规渠道，每条信息可溯源；不做 API 中转、不做 Token 转售、不收录逆向/批量注册等灰色渠道。
