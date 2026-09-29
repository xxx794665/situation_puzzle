# 项目结构

2026-09-29 建档。每次结构变化必须更新本文件（规则见根目录 `CLAUDE.md`）。

## 目录树

```
深海汤屋/
├── index.html              # 唯一页面：首页 / 单人对局 / 随机模式 / 汤库 / 多人房 五屏切换
├── style.css               # 全部样式（三列→单列响应式、手机 LITE 档见 README）
├── sw.js                   # Service Worker（HTML/CSS/JS network-first，图片字体 cache-first）
├── manifest.webmanifest    # PWA 清单
├── CLAUDE.md               # 代理工作规则（每次改动必读必守）
├── CONTEXT.md              # 领域词汇表（唯一口径）
├── js/
│   ├── config.js           # 前端配置（未成年模式密码等，可手改）
│   ├── data.js             # 精品层前 20 题（源文件，可直接改）
│   ├── data-more.js        # 精品层后 80 题（app.js 首屏后异步并入）
│   ├── library.public.js   # 汤库 1942 题【构建产物，勿手改；按需加载不进首屏】
│   ├── engine.js           # 判定内核：抽题/风味筛选/近期抽取记录/星级/猜底四级
│   ├── ai.js               # 浏览器侧 AI 汤主（Key 只存本机）
│   ├── audio.js            # Web Audio 程序化 BGM + 音效
│   ├── fx.js               # Canvas 雨夜特效（含手机 LITE 档）
│   ├── transition.js       # GSAP 黑幕转场（三级降级）
│   ├── icons.js            # 全站 SVG 图标库（零 emoji）
│   ├── net.js              # 联机客户端（1.5s 增量轮询，rev 游标）
│   ├── room-ui.js          # 多人房间界面（选汤/聊天/轮次/私密猜底）
│   └── app.js              # 单人主逻辑（首页/随机模式/汤库/存档/未成年模式）
├── assets/                 # 背景图、标题字体子集、PWA 图标、og 图、本地化 GSAP
├── worker/                 # Cloudflare Workers + Durable Objects（服务端）
│   ├── wrangler.toml
│   └── src/
│       ├── index.js        # 路由与 CORS、建房限流
│       ├── room.js         # 房间状态机（未成年模式房规、轮次、私密猜底、放弃投票）
│       ├── engine.js       # 服务端判定副本（与 js/engine.js 同口径双改）
│       ├── ai.js           # 上游模型调用
│       └── *.data.js       # 部署时生成【勿手改，不进仓库】
├── data/library/           # 汤库母本（本地，不进仓库；缺失时见下节重建）
├── tools/                  # 构建/清洗/体检/打标脚本与证据链（按 <主题>_<日期>/ 归档）
│   └── admin.html          # 题目维护界面（本地用，改标签→导出补丁→脚本回写）
└── docs/                   # PROJECT.md（本文件）/ TASKS.md（任务索引）/ adr/ / 方案文档
```

脚本加载顺序（`index.html`，全部 `defer`）：`gsap → config.js → data.js → data-more.js → engine → ai → audio → fx → transition → icons → net → room-ui → app`。汤库 `library.public.js`（~2MB）2026-09-29 起不在此列：由 `app.js` 的 `ensureSoupLib` 按需加载（首屏后空闲预载，随机/汤库入口未就绪先等）。

## 数据管线

```
源头（两类，都是"母本"层）
  js/data.js + js/data-more.js        精品层 100 题（仓库内，手改源文件）
  data/library/library.data.js        汤库 1942 题母本（本地，被 .gitignore 挡住）
        │
        │  node tools/build_worker_data.js
        ▼
产物（勿手改，改题改标签一律回到源头再重跑构建）
  js/library.public.js                前端汤库（含汤底，明文开源是既定策略）
  worker/src/puzzles.data.js          服务端精品层
  worker/src/library.data.js          服务端汤库
```

- 幂等自检：`node tools/build_worker_data.js --check`。
- **母本缺失时的重建**：本仓库不含 `data/library/library.data.js`。新环境用 `node tools/rebuild_master_from_public.js` 从 `js/library.public.js` 无损重建（public 含全部字段，round-trip 后 `--check` 应通过）。
- **改汤库标签的正规路径**：本地开 `tools/admin.html`（需本地 HTTP）复核/修改 → 导出补丁 JSON → `node tools/apply_flavor_patch.js <补丁文件>` 套回母本并自动重跑构建。
- 证据链惯例：批量判定/体检的中间产物放 `tools/<主题>_<日期>/`，判定表（含理由）与复核记录进仓库留档。

## 模块职责速查

| 模块 | 职责 |
|---|---|
| `js/engine.js` | 抽题与过滤的唯一入口：风味筛选（flavor）、近期抽取记录、题材/难度池、猜底四级判定、星级 |
| `js/app.js` | 单人流程：五屏切换、随机模式/汤库 UI、存档、备忘录、未成年模式开关与首访提示 |
| `js/room-ui.js` | 多人房：房主选汤（含风味筛选/随机一锅）、建房未成年模式配置、聊天、轮次 UI |
| `js/net.js` | 与 Worker 的 HTTP 通信；固定本机身份（`soupnet.v1`） |
| `worker/src/room.js` | 房间状态机：minorMode 房规存房间状态，选汤拦截在服务端 |
| `js/config.js` | 少量可调配置，当前仅未成年模式关闭密码 |

## localStorage 键清单

| 键 | 用途 | 读写模块 |
|---|---|---|
| `deepsea_soup_v1` | 单人存档（当前题/进度/星级） | app.js |
| `deepsea_soup_library_v1` | 汤库浏览进度 | app.js |
| `deepsea_soup_solved_v1` | 已熬出汤底标记（绿勾） | app.js |
| `soup.memo.v1` | 备忘录 | app.js |
| `deepsea_soup_ai_v1` | AI 汤主配置（Key 只存本机） | ai.js |
| `soupnet.v1` | 联机固定身份 | net.js |
| `soup:track` / `soup:lightning` | 音乐曲目 / 特效开关 | audio.js / fx.js |
| `soup.minor.v1` | 未成年模式状态与首访提示状态 | app.js |
| `soup.recent.v1` | 近期抽取记录（滚动 50 题） | engine.js |

## 联机架构

Cloudflare Workers + Durable Objects（SQLite 持久化），前端 1.5 秒 HTTP 增量轮询（非 WebSocket）：快照带 `rev` 游标，无变化回 `unchanged`；断线重连靠本机固定身份。建房参数含 `minorMode`（房主配置，房规优先于成员本地设置）；服务端在房间 minorMode 开启时拦截红汤/黄汤题目的 `choose` 动作。Worker 部署仅由用户手动执行。

## 按改动类型的入口指引

- **改界面/交互**：`index.html` + `js/app.js`（单人）或 `js/room-ui.js`（房间）+ `style.css`；缺图标补 `js/icons.js`。
- **改判定逻辑**：`js/engine.js` 与 `worker/src/engine.js` 是同一口径的两份副本，必须双改。
- **改精品题**：直接编辑 `js/data.js` / `js/data-more.js`（每行一题的紧凑 JSON）。
- **改汤库题/标签**：走 `tools/admin.html` → 补丁 → `apply_flavor_patch.js`；或直接改母本后重跑构建。
- **加配置项**：`js/config.js`（可手改层），并在本文件模块表登记。
