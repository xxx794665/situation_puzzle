/* ============================================================
 * 深海汤屋 · 汤库母本反向重建
 * ------------------------------------------------------------
 * 背景：母本 data/library/library.data.js 被 .gitignore 挡在
 * 仓库外，新环境没有它，构建管线（tools/build_worker_data.js）
 * 就跑不起来。而进仓库的产物 js/library.public.js 的字段映射
 * 是全量的（见 build_worker_data.js 的 libPublic 映射），
 * 可以无损长回母本。
 *
 * 用法：node tools/rebuild_master_from_public.js
 * 产出：data/library/library.data.js
 * 验证：跑完后执行 node tools/build_worker_data.js --check，
 *       幂等通过即证明 round-trip 无损（见 docs/adr/0003）。
 *
 * 实现说明：public 文件是机器生成的固定形态
 *   var SOUP_LIBRARY = [...]; var SOUP_LIB_CATS = [...]; ...
 * 因此用纯 JSON 切片解析，不做任何动态代码执行。
 * ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_FILE = path.join(ROOT, "js", "library.public.js");
const OUT_DIR = path.join(ROOT, "data", "library");
const OUT_FILE = path.join(OUT_DIR, "library.data.js");

if (!fs.existsSync(PUBLIC_FILE)) {
  console.error("✗ 找不到 js/library.public.js");
  process.exit(1);
}

const text = fs.readFileSync(PUBLIC_FILE, "utf8");

/* 从机器生成的形态里切出 JSON 数组文本再解析，不执行脚本。
 * 文件形态：var X = [单行 JSON];(\r?)\n 下一个 var 声明 —— 数组本体不含换行，
 * 所以「下一个换行后的 var」就是本声明的结尾。 */
function sliceVar(src, varName) {
  const head = "var " + varName + " = ";
  const start = src.indexOf(head);
  if (start === -1) throw new Error("找不到 " + head);
  const from = start + head.length;
  let nl = src.indexOf("\nvar ", from);
  if (nl === -1) nl = src.length;
  const seg = src.slice(from, nl).replace(/[\s;]+$/, "");
  return JSON.parse(seg);
}

const list = sliceVar(text, "SOUP_LIBRARY");
const cats = sliceVar(text, "SOUP_LIB_CATS");
if (!Array.isArray(list) || !list.length) {
  console.error("✗ 没解析出 SOUP_LIBRARY 数组");
  process.exit(1);
}

/* 母本格式 = build_worker_data.js 期望的加载形态：
 * var SOUP_LIBRARY = [...];
 * var SOUP_LIB_CATS = [...];（可选，构建侧有 || [] 兜底，但带上） */
const banner = `/* 深海汤屋 · 汤库母本（本地文件，不进仓库）
 * 由 tools/rebuild_master_from_public.js 于 ${new Date().toISOString().slice(0, 10)} 从 js/library.public.js 无损重建。
 * 上游链路：母本 --build_worker_data.js--> public / worker data；改题请改本文件或走 tools/admin.html 补丁。
 * 共 ${list.length} 题，受控题材词表 ${Array.isArray(cats) ? cats.length : 0} 个。 */
`;
const body = banner +
  "var SOUP_LIBRARY = " + JSON.stringify(list) + ";\n" +
  "var SOUP_LIB_CATS = " + JSON.stringify(cats) + ";\n" +
  "if (typeof module !== \"undefined\" && module.exports) {\n" +
  "  module.exports = { SOUP_LIBRARY: SOUP_LIBRARY, SOUP_LIB_CATS: SOUP_LIB_CATS };\n" +
  "}\n";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, body, "utf8");
console.log("✓ 重建母本", path.relative(ROOT, OUT_FILE), "|", list.length, "题 |", (body.length / 1024).toFixed(1), "KB");

/* 自检：id 全部唯一 */
const libIds = list.map((p) => p.id);
const uniq = new Set(libIds);
if (uniq.size !== libIds.length) {
  console.error("✗ 重建后发现重复 id：" + (libIds.length - uniq.size) + " 个");
  process.exit(1);
}
console.log("✓ 自检：", uniq.size, "个 id 全部唯一");
