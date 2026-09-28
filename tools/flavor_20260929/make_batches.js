/* ============================================================
 * 深海汤屋 · 七风味标签批量判定 · 分批器
 * ------------------------------------------------------------
 * 把精品层 100 + 汤库 1942 切成每批 100 题的 JSONL 批文件，
 * 供多路判定子代理逐批读题、写判定（tools/flavor_20260929/out/）。
 *
 * 批文件每行：{"id","title","surface","truth","layer"}
 * 只带判标签需要的三样文本，不带 keywords/clues 等噪音。
 *
 * 用法：node tools/flavor_20260929/make_batches.js
 * 产出：tools/flavor_20260929/in/batch_NN.jsonl（in/ 不进仓库，可随时重建）
 * ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = __dirname;
const IN_DIR = path.join(DIR, "in");

function loadPuzzles(relPath) {
  /* data.js：var PUZZLES = [ … ]; data-more.js：var PUZZLES_MORE = [ … ]
   * 两文件都是「[ 换行、每行一题、换行 ];」收尾的多行数组 */
  const text = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const head = relPath.indexOf("data-more") !== -1 ? "var PUZZLES_MORE = " : "var PUZZLES = ";
  const start = text.indexOf(head);
  if (start === -1) throw new Error("不支持的源文件形态：" + relPath);
  const from = start + head.length;
  const end = text.indexOf("\n];", from);
  return JSON.parse(text.slice(from, end + 2));
}

function sliceLibrary(text) {
  const head = "var SOUP_LIBRARY = ";
  const start = text.indexOf(head);
  if (start === -1) throw new Error("找不到 SOUP_LIBRARY");
  const from = start + head.length;
  const nl = text.indexOf("\nvar ", from);
  return JSON.parse(text.slice(from, nl === -1 ? text.length : nl).replace(/[\s;]+$/, ""));
}

const core = [].concat(loadPuzzles("js/data.js"), loadPuzzles("js/data-more.js"));
const lib = sliceLibrary(fs.readFileSync(path.join(ROOT, "data", "library", "library.data.js"), "utf8"));
console.log("精品层", core.length, "题，汤库", lib.length, "题");

const items = [].concat(
  core.map((p) => ({ id: p.id, title: p.title, surface: p.surface, truth: p.truth, layer: "core" })),
  lib.map((p) => ({ id: p.id, title: p.dispTitle || p.title, surface: p.surface, truth: p.truth, layer: "lib" }))
);

const SIZE = 100;
fs.rmSync(IN_DIR, { recursive: true, force: true });
fs.mkdirSync(IN_DIR, { recursive: true });
let n = 0;
for (let i = 0; i < items.length; i += SIZE) {
  const chunk = items.slice(i, i + SIZE);
  const name = "batch_" + String(n).padStart(2, "0") + ".jsonl";
  fs.writeFileSync(path.join(IN_DIR, name), chunk.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf8");
  n++;
}
console.log("✓ 产出", n, "个批文件 →", path.relative(ROOT, IN_DIR));
