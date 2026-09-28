/* ============================================================
 * 深海汤屋 · 风味判定回写题库
 * ------------------------------------------------------------
 * 读 tools/flavor_20260929/flavor_verdicts.json（merge_verdicts.js 产物），
 * 把 flavor 写进：
 *   1. js/data.js + js/data-more.js     精品层（源文件，逐行补字段）
 *   2. data/library/library.data.js     汤库母本（本地文件）
 * 然后由调用方重跑 node tools/build_worker_data.js 同步产物。
 *
 * 用法：node tools/flavor_20260929/apply_flavor_tags.js [--force]
 *   --force：即使覆盖率不满也写（调试用，默认必须 2042 全覆盖）
 *
 * 安全说明：本脚本为本地构建工具，不接受外部输入的路径；
 * 所有写入目标都经 safeJoin 限制在仓库根目录内（边界校验）。
 * ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = __dirname;

/* 根目录边界校验：任何写入目标都必须落在 ROOT 内（Mimosa 建议的安全写法） */
function safeJoin() {
  const t = path.resolve.apply(path, [ROOT].concat([].slice.call(arguments)));
  if (t !== ROOT && t.indexOf(ROOT + path.sep) !== 0) {
    throw new Error("路径越界：" + t);
  }
  return t;
}

const VERDICTS_FILE = safeJoin("tools", "flavor_20260929", "flavor_verdicts.json");

const data = JSON.parse(fs.readFileSync(VERDICTS_FILE, "utf8"));
const verdicts = data.verdicts || {};
console.log("判定表：", data.totalVerdicts, "条（生成于", data.generatedAt, "，复核已应用", data.recheckedApplied, "条）");

/* 母本题单（与 in/ 汇总一致） */
function loadInIds() {
  const IN = safeJoin("tools", "flavor_20260929", "in");
  const ids = [];
  fs.readdirSync(IN).filter((f) => /^batch_\d+\.jsonl$/.test(f)).sort().forEach((f) => {
    fs.readFileSync(path.join(IN, f), "utf8").split("\n").filter(Boolean).forEach((l) => {
      ids.push(JSON.parse(l).id);
    });
  });
  return ids;
}
const allIds = loadInIds();
const missing = allIds.filter((id) => !verdicts[id]);
if (missing.length && process.argv.indexOf("--force") === -1) {
  console.error("✗ 还有 " + missing.length + " 题没有判定：" + missing.slice(0, 5).join(", ") + " … 先跑完判定与复核");
  process.exit(1);
}
if (missing.length) console.warn("⚠ --force 模式：" + missing.length + " 题无判定将跳过");

let patched = 0;

/* ---------- 精品层：逐行解析，给带 id 的行补 flavor ---------- */
function patchCoreFile(rel) {
  const file = safeJoin(rel);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(\{.*\})(,?)\s*$/);
    if (!m) continue;
    let obj;
    try { obj = JSON.parse(m[2]); } catch (e) { continue; }
    if (!obj.id || !verdicts[obj.id]) continue;
    obj.flavor = verdicts[obj.id].flavor.slice();
    lines[i] = m[1] + JSON.stringify(obj) + m[3];
    n++;
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  console.log("✓", rel, "补 flavor", n, "题");
  patched += n;
}
patchCoreFile("js/data.js");
patchCoreFile("js/data-more.js");

/* ---------- 汤库母本：整表重写 ---------- */
function sliceVar(src, varName) {
  const head = "var " + varName + " = ";
  const start = src.indexOf(head);
  if (start === -1) throw new Error("找不到 " + head);
  const from = start + head.length;
  /* 本声明到下一个顶层语句（var / if）之间就是那个单行 JSON 数组 */
  const anchors = ["\nvar ", "\nif "].map((a) => src.indexOf(a, from)).filter((i) => i !== -1);
  const nl = anchors.length ? Math.min.apply(null, anchors) : src.length;
  return JSON.parse(src.slice(from, nl).replace(/[\s;]+$/, ""));
}

const MASTER = safeJoin("data", "library", "library.data.js");
if (!fs.existsSync(MASTER)) {
  console.error("✗ 找不到汤库母本，先跑 node tools/rebuild_master_from_public.js");
  process.exit(1);
}
const masterText = fs.readFileSync(MASTER, "utf8");
const list = sliceVar(masterText, "SOUP_LIBRARY");
const cats = sliceVar(masterText, "SOUP_LIB_CATS");
let libN = 0;
list.forEach((p) => {
  if (verdicts[p.id]) {
    p.flavor = verdicts[p.id].flavor.slice();
    libN++;
  } else if (!p.flavor) {
    p.flavor = [];
  }
});
const banner = masterText.slice(0, masterText.indexOf("var SOUP_LIBRARY"))
  .replace(/由 tools\/[^\n]*\n/, "由 tools/flavor_20260929/apply_flavor_tags.js 于 " + new Date().toISOString().slice(0, 10) + " 补 flavor。\n");
const body = banner +
  "var SOUP_LIBRARY = " + JSON.stringify(list) + ";\n" +
  "var SOUP_LIB_CATS = " + JSON.stringify(cats) + ";\n" +
  "if (typeof module !== \"undefined\" && module.exports) {\n" +
  "  module.exports = { SOUP_LIBRARY: SOUP_LIBRARY, SOUP_LIB_CATS: SOUP_LIB_CATS };\n" +
  "}\n";
fs.writeFileSync(MASTER, body, "utf8");
console.log("✓ data/library/library.data.js 补 flavor", libN, "题");
patched += libN;

console.log("✓ 共回写", patched, "题。下一步：node tools/build_worker_data.js && node tools/build_worker_data.js --check");
