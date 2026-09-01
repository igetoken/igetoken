# AGENTS.md — iGetToken 项目规则

面向 AI 编码助手的持久化指令。本文件提交入仓库；**本地私有文档在 `docs/`（已 gitignore），不要读取后提交或外泄其内容**。

## 项目速览

- iGetToken：免费大模型额度导航站（资源库 + 活动快讯 + 教程 + 避坑指南）
- 线上：https://igetoken.com · 仓库：github.com/igetoken/igetoken · 部署：Cloudflare Pages（git push 自动构建，1-2 分钟上线）
- 技术栈：Astro 5 + Tailwind 4 纯静态，无后端；Node 22
- 数据即内容：`src/data/models.json`（平台→offers 两级）、`src/data/deals.json`（活动快讯）是站点核心，页面只是渲染器
- 构建命令：`npm run build`（产物 `dist/`）· 改动任何文件后必须本地 build 通过才能 commit/push

## 内容红线（不可违反）

1. **只收录官方正规渠道**：每条信息必须能溯源到官方页面（`source` 字段必填）；社区爆料回官方源核实后才可写入
2. **不做** 纯倒卖、无免费价值的中转、Token 转售、批量注册、逆向接口相关内容；**允许收录**提供稳定且可溯源免费额度的聚合/路由平台（如 OpenRouter、OpenCode、TokenRouter），其免费额度须标注"以官方为准"与最后核实日
3. 额度类信息必须带 `last_verified`（平台）或 `date`（快讯）与"以官方为准"提示；失效条目改 `status: "ended"` 归档，**永不删除**
4. 区分"API Token 额度"与"产品内积分/订阅额度"（如 WorkBuddy Credits 不可导出），文案必须明确标注
5. 快讯 `reward`、`eligibility`、`deadline` 为必填语义项；未知截止写"未知，建议尽快领取"，不得留空或编造日期

### 收录判定 SOP：API Token 额度 vs 产品内积分（红线 #4 可执行化）
完整版见 `docs/收录判定SOP.md`。每次评估新资源都走此流程，三向分流：
- **能 API Key 在站外调用** → **API Token 额度** → 主线（models.json / deals.json）
- **不能导出（仅产品内 Web/App 消耗、无 API Key）** → **产品内积分/订阅额度** → 平行专栏（perks.json / /perks/，卡片强标「不可导出为 API」，不进 /models/ 与首页头条）
- **既无 API 又违规/无价值/不可溯源** → **不收录**（出局存档，标注理由）
> 关键：产品内积分 ≠ 不收录；真正不收录的是纯倒卖/无价值中转/转售/批量注册/逆向接口（红线 #2）与无价值/不可溯源类。聚合/路由平台（OpenRouter/OpenCode/TokenRouter）能提供稳定可溯源免费额度且可 API 调用 → 主线（`category=aggregator`）。

## 数据文件修改规则（重要）

1. **修改任何 JSON 后、commit 前，必须先校验**：
   ```bash
   node -e "require('./src/data/deals.json')"
   node -e "require('./src/data/models.json')"
   ```
2. 编辑 JSON 优先整条复制既有条目改字段，避免 old_string 局部替换匹配错条目（历史上发生过覆盖数据事故）
3. 快讯新增条目插在数组**开头**；`id` 格式 `YYYY-MM-平台-关键词`，全站唯一
4. 平台 offers 的 `type` 取值：permanent/signup/daily/credit/referral；快讯 `type`：limited_time/signup_bonus/price_change/new_model/referral/verify_bonus/task_reward
5. 更新平台额度时必须同步更新该平台的 `last_verified`；首页"内容最后核实"自动取全站最大值，勿写死日期

## 已知坑（按场景）

### Astro / 构建
- 模板表达式内**禁用 `<` 比较符与组件混用**（编译器歧义报 Fragment 错误）——判断逻辑全部放 frontmatter，模板只引用布尔值
- 组件顶层 `new Date()` 是构建时间（SSG 固化）——页脚版本号依赖此特性，勿"修复"
- Tailwind prose 会给行内代码加装饰引号，已在 global.css 关闭，勿重复处理
- `npm run build` 不做类型检查，改 TS 类型后需自查或跑 `astro check`

### 本地验证
- 无头 Edge 截图本地页面可用；`--dump-dom` 不可靠；外站截图常失败（讯飞、MiniMax Design 实测可成功，见下方 Git / 推送小节的具体命令）

### 部署 / Cloudflare
- `*.pages.dev` 国内直连不可用，正式入口是自定义域名，勿用 pages.dev 判断可访问性
- Pages 会把 `.html` 308 重定向到无扩展名地址——任何"验证文件"类需求**一律用 meta/标签验证**，不用文件验证
- Cloudflare 默认开启 "Block AI Bots" 和"托管 robots.txt"（会屏蔽 GPTBot/Bytespider 等）——本站策略为全开放，**两处开关必须保持关闭**（换账号/新增站点时复查 `https://igetoken.com/robots.txt` 应零 Disallow）

### Git / 推送
- `git push` 报 `Failed to connect to github.com port 443 ... Couldn't connect to server`，但 `Test-NetConnection github.com -Port 443` 却是通的 → 是 HTTP/2 连接被卡，用 `git -c http.version=HTTP/1.1 push origin main` 即可，无需改全局配置或代理
- 外站页面（如 SPA 动态渲染的活动横幅）`web_fetch` 抓不到内容时，用无头 Edge 截图：`msedge.exe --headless --disable-gpu --window-size=1400,1800 --virtual-time-budget=30000 --screenshot="<路径>.png" "<URL>"`（`--headless=new` 不生成截图文件）

### 搜索引擎
- 百度不收索引型 sitemap（勿提交 sitemap-index.xml），实体文件是 `sitemap-0.xml`；无备案站点提交配额为 0 属正常，不处理
- 百度文件验证会因 308 失败——已改用 meta 标签验证（Base.astro 内 `baidu-site-verification`）

## 发布流程

改 `src/data/*.json` 或 MDX → 校验 JSON → 本地 build → commit → push → 1-2 分钟自动上线。手机 GitHub 网页编辑同样适用。发布后用 `curl` 验证线上页面 200。

## 运营待办同步（必须执行）

**每次任务开始时**：先读 `docs/运营待办清单.md` 对齐当前状态；**每次任务完成后**：更新该清单（勾选完成项、补充新增待办、有日期的快讯过期维护填入"待办（有日期）"分区）。该清单是进行中/待办事项的唯一权威来源，不要让状态只存在于对话中。

## 本地文档指引（勿提交）

`docs/` 下为私有文档：网站规划.md（蓝图与决策记录）、部署清单.md（部署手册）、从规划到上线-知识文档.md（全流程复盘）、运营待办清单.md（任务状态唯一权威来源）、渠道投放记录.md（分发数据）、各平台发布稿件。修改规划/规范时更新对应文档并保持 AGENTS.md 与其一致。
