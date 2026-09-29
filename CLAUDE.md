# 深海汤屋 · 代理工作规则

海龟汤（水平思考谜题）推理小游戏：纯静态、无框架、无构建。完整玩法与技术说明见 `README.md`，领域词汇见 `CONTEXT.md`，结构梳理见 `docs/PROJECT.md`。

## 硬性规则（每次改动必须遵守）

1. **功能更新完成后必须同步更新文档**（顺序不限）：
   - 在 `docs/TASKS.md` 顶部追加本次任务记录（日期 / 需求 / 改动文件 / 结果）；
   - 更新 `README.md` 中受影响的段落（题数、机制说明、项目结构图、已知限制）；
   - 出现新领域词汇或词义变化 → 更新 `CONTEXT.md`；项目结构变化 → 更新 `docs/PROJECT.md`；
   - 出现「难逆转 + 后人会困惑 + 真实取舍」的决策 → 在 `docs/adr/` 追加一条（编号递增，短段落即可）。
2. **生成物勿手改**：`js/library.public.js`、`worker/src/*.data.js` 由构建产出。改汤库走母本（见 `docs/PROJECT.md` 数据管线一节）；精品层 `js/data.js` / `js/data-more.js` 是源文件可直接改。
3. **代码风格**：ES5 IIFE，挂在 `window.SoupXxx`；无打包步骤；全站零 emoji（图标一律用 `js/icons.js` 的 SVG）；判定词只有「是 / 不是 / 部分正确 / 与此无关」四种口径，浏览器侧与 Worker 侧同步改。
4. **改任何 js/css 后**，把 `sw.js` 的 `CACHE` 版本号 +1（命名 `deepsea-soup-vNN`）。
5. **提交前自检**：`node tools/build_worker_data.js --check`（题库产物幂等）；改了题库相关逻辑时另跑 `node tools/check_site_guard.js`。

## 常用命令

```bash
python -m http.server 8080          # 本地打开 → http://localhost:8080
node tools/build_worker_data.js     # 重建题库产物（public + worker data）
cd worker && npx wrangler deploy    # 部署 Worker（仅用户手动执行）
```

## 机制速查（细节见 PROJECT.md）

- **两层题库**：精品层 100（带关键词表，可离线判定）+ 汤库 1942（无关键词，须 AI 汤主判定）。
- **风味标签 `flavor`**：本格/变格（互斥必选其一）、清汤/红汤（互斥必选其一）、王八汤 / 黄汤 / 语言梗（可选叠加）。与题材 `cats` 分开存放。标签是过滤控制手段，不是内容描述。
- **未成年模式**：挡红汤 + 黄汤，隐藏不可解；开启免密、关闭需密码（密码在 `js/config.js`，公开可见属预期）；首次游玩前一次性提示；多人房房主建房配置、房规优先。
- **语言梗**：谜底依赖特定语言文字/发音/拼写/符号的题，默认全链路隐藏、不进抽取池，勾选才出现。
- **近期抽取记录**：localStorage 滚动存最近抽到的题（上限 50），随机抽取优先避开；单人各随机入口与多人房「随机一锅」（以房主本地记录为准）都读写。
- **纯离线模式**：没配好 AI 汤主时，精品层由关键词汤主本地判定照常可玩（与 Worker 未配 AI 口径一致）；须 AI 判定的汤库题从随机抽取 / 筛选 / 房主选汤全链路隐藏（含「继续上一锅」与汤库档预载）。欢迎页有常驻提示，`SoupAI.onChange` 实时联动。
