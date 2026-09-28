# 0003 · 汤库母本从 public 产物反向重建

构建管线要求母本 `data/library/library.data.js`（被 .gitignore 挡住）存在才能重跑 `tools/build_worker_data.js`，但新环境（含 2026-09-29 这次）本机没有母本，只有进仓库的产物 `js/library.public.js`。

决定写 `tools/rebuild_master_from_public.js`：从 public 无损重建母本（public 的字段映射是全量的，round-trip 后 `--check` 幂等通过）。「public 是产物、勿手改」的纪律不变——改题仍回母本再构建；只是母本可以从产物随时长回来，管线不再因母本缺失而死锁。副作用：master 里若曾有 public 映射会丢弃的私有字段（如构建注释历史），重建后即不存在——2026-09-29 核对过当前 public 与母本字段一一对应，无损失。
