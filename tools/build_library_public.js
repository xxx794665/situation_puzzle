/* ============================================================
 * 深海汤屋 · 瘦身版题库构建（发布用）
 * ------------------------------------------------------------
 * 产出 js/library.public.js —— 汤库层的「汤面元数据」，
 * **绝对不含 truth 字段**。原 js/library.data.js（含全部汤底）
 * 移出发布目录，改放 data/Library/ 当源码/离线备份。
 *
 * 正经的构建入口是 tools/build_worker_data.js（一次产出服务端题库
 * + 前端瘦身题库，保证两份永不走样）。这个脚本是它的薄封装，
 * 方便只想单独重建前端瘦身档时用。
 *
 * 用法：node tools/build_library_public.js
 *       node tools/build_library_public.js --check
 * ============================================================ */

const path = require("path");

/* 源：优先 data/Library/library.data.js，回落 js/library.data.js */
const ROOT = path.resolve(__dirname, "..");
const fs = require("fs");
const LIB_SRC_FILE = [
  path.join(ROOT, "data", "Library", "library.data.js"),
  path.join(ROOT, "js", "library.data.js")
].find((f) => fs.existsSync(f));

if (!LIB_SRC_FILE) {
  console.error("✗ 找不到汤库源码：data/Library/library.data.js 或 js/library.data.js");
  process.exit(1);
}

/* 转发给统一构建脚本，保持「一份源、一处逻辑」。
   历史 --public-only 分支在现行 build_worker_data.js 里本就等价于全量构建
   （该脚本从不识别 --public-only），因此直接 require 转发，不再起子进程；
   --check 由 build_worker_data.js 自己从 process.argv 读取。 */
require("./build_worker_data.js");