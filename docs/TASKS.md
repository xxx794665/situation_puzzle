# 任务索引

倒序排列（最新在最上）。每次功能更新完成后必须在此追加一条（规则见根目录 `CLAUDE.md`）。

格式：`日期 ｜ 需求 ｜ 主要改动 ｜ 结果与证据`

---

## 2026-09-29 ｜ 风味标签 + 未成年模式 + 语言梗 + 近期抽取 + 文档底座 + 维护界面

**需求**（三轮 grilling 共识，设计树见会话记录）：
1. 项目结构梳理落文档，并建立「每次功能更新自动更新文档」规则；
2. 语言强相关谜面默认禁用（不删除，打「语言梗」标签）；
3. 七风味标签体系（本格/变格、清汤/红汤、王八汤/黄汤/语言梗），新建游戏三处入口可手动筛选，AND 语义；
4. 未成年模式（挡红汤+黄汤，隐藏不可解；开启免密、关闭需密码；首访游玩前一次性提示；多人房房规优先）；
5. 近期抽取记录（localStorage 滚动 50 题，单人随机入口 + 多人房随机一锅以房主记录为准）。

**主要改动**：新增 `CLAUDE.md`、`CONTEXT.md`、`docs/PROJECT.md`、本文件、`docs/adr/0001~0004`；`tools/rebuild_master_from_public.js`（母本重建）；`tools/flavor_20260929/`（全量七标签判定表与复核记录）；`tools/flavor_20260929/apply_flavor_tags.js`（判定回写母本+精品层）；`js/config.js`（未成年模式密码）；`js/engine.js`、`js/app.js`、`js/room-ui.js`、`js/net.js`、`index.html`、`style.css`（风味筛选、未成年模式、近期抽取）；`worker/src/room.js`、`worker/src/index.js`、`tools/build_worker_data.js`（flavor 进服务端题库 + 房规拦截）；`tools/admin.html` + `tools/apply_flavor_patch.js`（题目维护界面）。

**结果与证据**：
- 全库 2042 题（精品 100 + 汤库 1942）flavor 全覆盖，构建幂等自检、site-guard、汤底污染回归全过。
- 标签分布（善终复核后）：本格 1859 / 变格 183；清汤 1295 / 红汤 747；王八汤 296、语言梗 112、黄汤 14。
- 判定流程：21 批 × 判定子代理（逐题带理由）→ merge 校验（全覆盖 + 互斥约束 + id 对齐，batch_01 因 id 抄写错误整批重判、batch_15 单字符笔误按位修回）→ 善终口径定向复核（70 题疑似，50 改判清汤 / 20 维持红汤）→ 回写 → 重建。判定表、复核记录与规则见 `tools/flavor_20260929/`（RULES.md / out/ / out_fix/ / flavor_verdicts.json）。
- 浏览器冒烟（IAB）：首访提示→免密开启→密码门（错密码拒、对密码关）；风味 chips 渲染与 AND 筛选；近期抽取记录避开（500 抽 0 命中）+ 池空兜底；语言梗默认隐藏（1830 = 1942 − 112）；admin.html 加载 2042 题可编辑可导出。
- Worker 端代码就绪未部署：建房 `minorMode`、快照下发、`choose` 服务端拦截（MINOR_BLOCKED）。
- 新增本地工具：`tools/_serve.cjs`（Node 静态服务器，替代本机不可用的 python http.server）。
