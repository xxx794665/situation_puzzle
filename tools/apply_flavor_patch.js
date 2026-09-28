/* ============================================================
 * 深海汤屋 · 题目维护补丁回写
 * ------------------------------------------------------------
 * 把 tools/admin.html 导出的补丁 JSON 套回题库源文件：
 *   - 精品层 id（非 lib_ 前缀）→ js/data.js / js/data-more.js
 *   - 汤库 id（lib_ 前缀）    → data/library/library.data.js
 * 可同时改 flavor 与 cats（字段存在才改；补丁里字段缺省就不动）。
 * 回写后需重跑 node tools/build_worker_data.js 同步产物。
 *
 * 用法：node tools/apply_flavor_patch.js
 *   自动寻找 tools/ 下最新的 flavor_patch_*.json（按修改时间）。
 *   不接受命令行路径参数——本地工具，路径全部是硬编码相对路径。
 * ============================================================ */

const fs = require("fs");
const path = require("path");

/* 所有读写都从仓库根用硬编码相对路径完成（Mimosa 安全建议：
   不做任何动态路径解析，杜绝 ../ 越界） */
process.chdir(path.dirname(__dirname));

/* 自动挑最新的补丁文件：目录固定 tools/，文件名固定匹配 flavor_patch_*.json */
const candidates = fs.readdirSync("tools")
  .filter((f) => /^flavor_patch_[\w.-]*\.json$/.test(f))
  .map((f) => ({ name: f, mtime: fs.statSync("tools/" + f).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!candidates.length) {
  console.error("✗ tools/ 下没有 flavor_patch_*.json。先在 tools/admin.html 里导出补丁，把文件放进 tools/ 再跑本脚本。");
  process.exit(1);
}
console.log("套用补丁：tools/" + candidates[0].name);
if (candidates.length > 1) {
  console.log("（另有 " + (candidates.length - 1) + " 个更早的补丁被忽略）");
}

const patch = JSON.parse(fs.readFileSync("tools/" + candidates[0].name, "utf8"));
const patches = patch.patches || {};
const ids = Object.keys(patches);
if (!ids.length) {
  console.log("补丁为空，无事可做");
  process.exit(0);
}
console.log("补丁包含", ids.length, "题（生成于", patch.generatedAt || "未知", "）");

const AX_STYLE = ["本格", "变格"];
const AX_TONE = ["清汤", "红汤"];
const KNOWN = ["本格", "变格", "清汤", "红汤", "王八汤", "黄汤", "语言梗"];

/* 校验 flavor 完整性（丢了必选轴的补丁直接拒绝） */
const broken = ids.filter((id) => {
  const f = patches[id].flavor;
  if (!f) return false; /* 只改 cats 的补丁合法 */
  const style = f.filter((t) => AX_STYLE.indexOf(t) !== -1).length;
  const tone = f.filter((t) => AX_TONE.indexOf(t) !== -1).length;
  const unknown = f.filter((t) => KNOWN.indexOf(t) === -1).length;
  return style !== 1 || tone !== 1 || unknown > 0;
});
if (broken.length) {
  console.error("✗ 以下题的 flavor 缺必选互斥项或含未知标签，拒绝套用：" + broken.slice(0, 5).join(", "));
  process.exit(1);
}

function sliceVar(src, varName) {
  const head = "var " + varName + " = ";
  const start = src.indexOf(head);
  if (start === -1) throw new Error("找不到 " + head);
  const from = start + head.length;
  let nl = src.indexOf("\nvar ", from);
  if (nl === -1) nl = src.length;
  return JSON.parse(src.slice(from, nl).replace(/[\s;]+$/, ""));
}

function applyPatch(p, fields) {
  let touched = false;
  if (fields.flavor) { p.flavor = fields.flavor.slice(); touched = true; }
  if (fields.cats) { p.cats = fields.cats.slice(); touched = true; }
  return touched;
}

/* ---------- 精品层逐行补丁 ---------- */
let coreN = 0;
["js/data.js", "js/data-more.js"].forEach((rel) => {
  const lines = fs.readFileSync(rel, "utf8").split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(\{.*\})(,?)\s*$/);
    if (!m) continue;
    let obj;
    try { obj = JSON.parse(m[2]); } catch (e) { continue; }
    if (!obj.id || !patches[obj.id]) continue;
    if (applyPatch(obj, patches[obj.id])) {
      lines[i] = m[1] + JSON.stringify(obj) + m[3];
      n++;
      coreN++;
    }
  }
  if (n) fs.writeFileSync(rel, lines.join("\n"), "utf8");
});
console.log("✓ 精品层改动", coreN, "题");

/* ---------- 汤库母本 ---------- */
const MASTER = "data/library/library.data.js";
if (!fs.existsSync(MASTER)) {
  console.error("✗ 找不到汤库母本（data/library/library.data.js），先跑 node tools/rebuild_master_from_public.js");
  process.exit(1);
}
const masterText = fs.readFileSync(MASTER, "utf8");
const list = sliceVar(masterText, "SOUP_LIBRARY");
const cats = sliceVar(masterText, "SOUP_LIB_CATS");
let libN = 0;
const index = {};
list.forEach((p) => { index[p.id] = p; });
ids.forEach((id) => {
  const p = index[id];
  if (p && applyPatch(p, patches[id])) libN++;
});
if (libN) {
  const banner = masterText.slice(0, masterText.indexOf("var SOUP_LIBRARY"))
    .replace(/由 tools\/[^\n]*\n/, "由 tools/apply_flavor_patch.js 于 " + new Date().toISOString().slice(0, 10) + " 套用维护补丁。\n");
  const body = banner +
    "var SOUP_LIBRARY = " + JSON.stringify(list) + ";\n" +
    "var SOUP_LIB_CATS = " + JSON.stringify(cats) + ";\n" +
    "if (typeof module !== \"undefined\" && module.exports) {\n" +
    "  module.exports = { SOUP_LIBRARY: SOUP_LIBRARY, SOUP_LIB_CATS: SOUP_LIB_CATS };\n" +
    "}\n";
  fs.writeFileSync(MASTER, body, "utf8");
}
console.log("✓ 汤库改动", libN, "题");

const miss = ids.filter((id) => !index[id] && id.indexOf("lib_") === 0).length;
if (miss) console.warn("⚠ " + miss + " 个 lib_ id 在母本里没找到（题可能已被删），已跳过");
console.log("完成。下一步：node tools/build_worker_data.js && node tools/build_worker_data.js --check");
