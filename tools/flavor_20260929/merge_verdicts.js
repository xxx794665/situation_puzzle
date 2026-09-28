/* ============================================================
 * 深海汤屋 · 七风味判定合并与校验
 * ------------------------------------------------------------
 * 1. 读 in/batch_NN.jsonl（输入题单）与 out/batch_NN.jsonl（判定）
 * 2. 校验：全覆盖、无重复、互斥约束（恰好一个本格/变格 + 一个清汤/红汤）
 * 3. 善终口径复核标记（2026-09-29 用户裁定：自然死亡/善终不算红汤）：
 *    红汤且理由只涉自然死亡/背景性已故、无任何暴力恐怖词 → 记入 fix_flags，
 *    供复核代理按新口径重判；out_fix/batch_NN.jsonl 若存在则覆盖基础判定。
 * 4. 产出 flavor_verdicts.json（id → {flavor, reason, batch}）+ 校验报告。
 *
 * 用法：node tools/flavor_20260929/merge_verdicts.js
 * ============================================================ */

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const IN = path.join(DIR, "in");
const OUT = path.join(DIR, "out");
const FIX = path.join(DIR, "out_fix");

/* 自然死亡相关词 */
const NATURAL_RE = /自然死|善终|老死|寿终|病故|病死|已故|去世|亡故|离世|走了|过世|亡妻|亡夫|亡父|亡母|亡友|亲人亡故|追悼|葬礼|遗/;
/* 暴力 / 恐怖 / 非自然死亡词：出现其一就不算「仅自然死亡」 */
const VIOLENCE_RE = /杀|自杀|自尽|血|尸|毒|勒|掐|坠|摔|撞|虐待|肢解|恐怖|惊吓|诡异|细思恐极|凶|砍|埋|溺|冻死|饿死|爆炸|枪|刀|分食|上吊|跳楼|跳车|跳下|刺|捅|绞|窒息|闷死|噎死|噎|烧死|电死|困死|饿|濒死|一氧化碳|煤气/;

function readJsonl(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  const bad = [];
  lines.forEach((l, i) => {
    try { out.push(JSON.parse(l)); } catch (e) { bad.push(i + 1); }
  });
  return { items: out, badLines: bad };
}

/* ---------- 汇总输入与判定 ---------- */
const inFiles = fs.readdirSync(IN).filter((f) => /^batch_\d+\.jsonl$/.test(f)).sort();
const outFiles = fs.readdirSync(OUT).filter((f) => /^batch_\d+\.jsonl$/.test(f)).sort();

const verdicts = {};   /* id → { flavor, reason, batch } */
const problems = [];
let totalIn = 0;

inFiles.forEach((f) => {
  const batch = f.replace(".jsonl", "");
  const input = readJsonl(path.join(IN, f)).items;
  totalIn += input.length;
  const outFile = path.join(OUT, f);
  if (!fs.existsSync(outFile)) {
    problems.push(batch + ": 缺判定文件");
    return;
  }
  const res = readJsonl(outFile);
  if (res.badLines.length) problems.push(batch + ": 判定文件第 " + res.badLines.join(",") + " 行不是合法 JSON");
  if (res.items.length !== input.length) {
    problems.push(batch + ": 判定 " + res.items.length + " 行 ≠ 输入 " + input.length + " 行");
  }

  const inIds = input.map((p) => p.id);
  const outIds = res.items.map((v) => v.id);
  inIds.forEach((id, i) => {
    if (outIds[i] !== id) problems.push(batch + ": 第 " + (i + 1) + " 行 id 不对齐（输入 " + id + " vs 判定 " + outIds[i] + "）");
  });

  res.items.forEach((v) => {
    if (verdicts[v.id]) problems.push(batch + ": id 重复判定 " + v.id);
    const fl = Array.isArray(v.flavor) ? v.flavor : [];
    const style = fl.filter((t) => t === "本格" || t === "变格");
    const tone = fl.filter((t) => t === "清汤" || t === "红汤");
    const extras = fl.filter((t) => ["王八汤", "黄汤", "语言梗"].indexOf(t) !== -1);
    if (style.length !== 1 || tone.length !== 1) {
      problems.push(batch + ": " + v.id + " 互斥约束不成立 " + JSON.stringify(fl));
    }
    if (style.length + tone.length + extras.length !== fl.length) {
      problems.push(batch + ": " + v.id + " 含未知标签 " + JSON.stringify(fl));
    }
    verdicts[v.id] = { flavor: fl, reason: String(v.reason || ""), batch: batch };
  });
});

/* ---------- 善终口径复核标记 ---------- */
const fixFlags = {};
Object.keys(verdicts).forEach((id) => {
  const v = verdicts[id];
  if (v.flavor.indexOf("红汤") === -1) return;
  const r = v.reason || "";
  if (NATURAL_RE.test(r) && !VIOLENCE_RE.test(r)) {
    (fixFlags[v.batch] = fixFlags[v.batch] || []).push(id);
  }
});

/* ---------- 应用复核覆盖 ----------
 * out_fix 文件行支持两种格式：
 *   {"id","tone":"清汤"|"红汤","reason"} —— 只改清汤/红汤轴（善终复核用）
 *   {"id","flavor":[...],"reason"}       —— 整组替换（维护补丁式） */
let fixed = 0;
if (fs.existsSync(FIX)) {
  fs.readdirSync(FIX).filter((f) => /^batch_\d+\.jsonl$/.test(f)).forEach((f) => {
    readJsonl(path.join(FIX, f)).items.forEach((v) => {
      const base = verdicts[v.id];
      if (!base) return;
      if (v.tone === "清汤" || v.tone === "红汤") {
        const fl = base.flavor.map((t) => (t === "清汤" || t === "红汤") ? v.tone : t);
        verdicts[v.id] = { flavor: fl, reason: String(v.reason || base.reason) + "（复核改判）", batch: base.batch };
        fixed++;
      } else if (Array.isArray(v.flavor)) {
        verdicts[v.id] = { flavor: v.flavor, reason: String(v.reason || "") + "（复核改判）", batch: f.replace(".jsonl", "") };
        fixed++;
      }
    });
  });
}

/* ---------- 写盘 ---------- */
const result = {
  generatedAt: new Date().toISOString(),
  totalInput: totalIn,
  totalVerdicts: Object.keys(verdicts).length,
  covered: totalIn === Object.keys(verdicts).length,
  recheckedApplied: fixed,
  problems: problems,
  fixFlags: fixFlags,
  verdicts: verdicts
};
fs.writeFileSync(path.join(DIR, "flavor_verdicts.json"), JSON.stringify(result, null, 1), "utf8");

/* 统计 */
const counts = {};
Object.keys(verdicts).forEach((id) => {
  verdicts[id].flavor.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
});

console.log("输入题数:", totalIn, "| 判定数:", Object.keys(verdicts).length, "| 覆盖:", result.covered ? "✓" : "✗");
console.log("标签计数:", JSON.stringify(counts));
console.log("复核覆盖（out_fix 已应用）:", fixed, "条");
console.log("待复核（善终口径疑似的红汤）:", Object.keys(fixFlags).length ? JSON.stringify(fixFlags) : "无");
if (problems.length) {
  console.log("✗ 校验问题 " + problems.length + " 条：");
  problems.slice(0, 30).forEach((p) => console.log("  -", p));
  if (problems.length > 30) console.log("  …（其余 " + (problems.length - 30) + " 条见 flavor_verdicts.json）");
  process.exit(2);
}
console.log("✓ 合并完成 → flavor_verdicts.json");
