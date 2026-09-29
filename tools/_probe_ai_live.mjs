/* ============================================================
 * 实弹探针：用真实第三方 AI 配置跑通「AI 汤主」全链路
 * ------------------------------------------------------------
 * 用法（凭据全走环境变量，本文件不含任何 Key）：
 *   AI_BASE=https://hyper.charm.land/v1 AI_MODEL=glm-5.3-flash \
 *   AI_KEY=sk-xxx node tools/_probe_ai_live.mjs
 *
 * 覆盖：
 *   A. js/ai.js 真实管线：SoupAI.ask() 五连问（含复合提问 / 无关题 / 线索认领）
 *   B. SoupAI.judgeGuess() 猜底判定
 *   C. 大 max_tokens 接受度（对齐上游 max_output_tokens 上限）
 * 输出每一步的判定 / 回复 / 耗时，出错走 describeError 的用户口径文案。
 * ============================================================ */

/* js/ai.js 在加载时读取 root.SoupEngine（只用于 truthOverlap 的剧透比对）。
   Node 下没有它，给个与 js/engine.js 同口径的最小 normalize 兜底。 */
globalThis.SoupEngine = {
  normalize: function (t) { return String(t == null ? "" : t).toLowerCase().replace(/[，。！？、：；「」『』""''（）()\s]/g, ""); }
};

const SoupAI = (await import("../js/ai.js")).default ?? (await import("../js/ai.js"));

const BASE = process.env.AI_BASE || "https://hyper.charm.land/v1";
const MODEL = process.env.AI_MODEL || "glm-5.3-flash";
const KEY = process.env.AI_KEY || "";

if (!KEY) { console.error("缺少 AI_KEY 环境变量"); process.exit(1); }

SoupAI.save({
  enabled: true,
  provider: "custom",
  baseUrl: BASE,
  model: MODEL,
  apiKey: KEY,
  timeoutMs: 90000,
  /* maxTokens 不显式传：走 js/ai.js 的 DEFAULTS（当前 4000），探针顺带回归默认值 */
  temperature: 0.4
});

/* 经典海龟汤的等价测试题（非仓库题库，避免泄露任何上线汤底） */
const puzzle = {
  id: "probe-classic",
  surface: "一个男人在海边餐厅点了一碗海龟汤，喝了一口就开枪自杀了。为什么？",
  truth: "男人多年前遭遇海难，同船幸存者谎称用海龟熬了汤给他喝，其实是死难同伴的肉。今天他喝到真正的海龟汤，发现味道和记忆里的完全不同，瞬间明白当年喝的是什么，绝望之下自杀。",
  truthKeywords: ["海难", "沉船", "同船", "同伴", "人肉", "尸", "肉", "味道", "不一样", "真相", "回忆", "当年"],
  clues: [
    { type: "partial", text: "他以前喝过「同样的汤」，但那碗其实不是海龟做的。" },
    { type: "yes", text: "味道是关键：这碗汤和他记忆里的味道对不上。" },
    { type: "no", text: "餐厅和他没有任何恩怨，汤里也没有毒。" },
    { type: "irr", text: "天气、海况、他的经济状况都与本案无关。" }
  ]
};

const qs = [
  "他以前喝过类似的汤吗？",
  "这碗汤是用海龟做的吗？",
  "他是正常成年男人吗？身体有没有什么异常？",
  "今天北京天气怎么样？",
  "汤里被人下毒了吗？"
];

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`\n[${label}] ✓ ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    console.log("  ", JSON.stringify(r));
  } catch (e) {
    console.log(`\n[${label}] ✗ ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    console.log("  ", SoupAI.describeError(e), `(code=${e && e.code})`);
  }
}

console.log("=== A. SoupAI.ask() 全链路（直连，Node fetch）===");
console.log("cfg:", BASE, MODEL, "maxTokens=", SoupAI.config().maxTokens);
for (const q of qs) {
  await timed("ask: " + q, () => SoupAI.ask(puzzle, q, { revealed: [], taken: [], history: [] }));
}

console.log("\n=== B. SoupAI.judgeGuess() 猜底判定 ===");
await timed("guess: 完整真相", () => SoupAI.judgeGuess(puzzle,
  "他当年海难时喝的汤是同伴用死人肉做的假海龟汤，今天喝到真海龟汤发现味道不一样，明白了真相就自杀了"));
await timed("guess: 只对一半", () => SoupAI.judgeGuess(puzzle,
  "汤的味道和他记忆里不一样，让他想起了过去的一件事"));

console.log("\n=== C. 大 max_tokens 接受度（raw fetch，max_tokens=32768）===");
const t0 = Date.now();
const res = await fetch(BASE.replace(/\/+$/, "") + "/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
  body: JSON.stringify({
    model: MODEL, temperature: 0.4, max_tokens: 32768,
    messages: [{ role: "user", content: "用一句话回答：天空为什么是蓝色的？" }]
  })
});
const rawText = await res.text();
let j = null;
try { j = JSON.parse(rawText); } catch (e) { j = null; }
console.log(`HTTP ${res.status} ${((Date.now() - t0) / 1000).toFixed(2)}s finish_reason=${j && j.choices ? j.choices[0].finish_reason : "?"} completion_tokens=${j && j.usage ? j.usage.completion_tokens : "?"}`);
console.log("content:", j && j.choices ? (j.choices[0].message || {}).content : rawText.slice(0, 300));
