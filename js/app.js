/* ============================================================
 * 深海汤屋 · 主逻辑
 * ============================================================ */
"use strict";

/* 必须接收 root（= window）：文件里 root.SoupRoom / root.SoupApp 都靠它。
   之前签名漏了参数、正文却照用 root，导致 IIFE 尾部直接抛
   ReferenceError: root is not defined —— window.SoupApp 从未挂上窗口，
   点「密码看汤底」拿不到题目而无声失败，单人对局后半段渲染也整段中断。 */
(function (root) {
  var E = window.SoupEngine;
  var FX = window.SoupFx;
  var AU = window.SoupAudio;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* 图标助手（js/icons.js，2026-09-26 去 emoji）：顶栏按钮等一律用同风格线性 SVG */
  function ic(name, cls) {
    return (typeof root.SoupIcon === "function") ? root.SoupIcon(name, cls) : "";
  }
  function icRaw(name) {
    return (root.SoupIcon && root.SoupIcon.raw) ? root.SoupIcon.raw(name) : "";
  }

  /* 汤库题不在 PUZZLES 里：给查题函数包一层（引擎语义不变，PUZZLES 仍优先） */
  var ENGINE_getPuzzle = E.getPuzzle;
  E.getPuzzle = function (id) {
    return ENGINE_getPuzzle.call(E, id) || libPuzzle(id);
  };

  /* 触摸端判定：触屏设备载入题目时不自动弹软键盘（iPad 这类宽屏触控机也会中招） */
  function isTouch() {
    try {
      if (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
      if ("ontouchstart" in window && (navigator.maxTouchPoints || 0) > 0) return true;
    } catch (e) { /* 忽略 */ }
    return false;
  }

  var STORE_KEY = "deepsea_soup_v1";

  /* 汤库存档：独立 key，绝不碰精品层的 deepsea_soup_v1 */
  var LIB_KEY = "deepsea_soup_library_v1";
  var LIB_PAGE_SIZE = 30;

  /* 已熬出汤底：本机记录，不同步任何人。
     主人点汤卡上的小绿勾手动标记 / 取消；熬出汤底时也会自动打勾。 */
  var SOLVED_KEY = "deepsea_soup_solved_v1";

  function solvedSet() {
    try {
      var raw = localStorage.getItem(SOLVED_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      if (obj && typeof obj === "object") return obj;
    } catch (e) { /* 隐私模式：忽略 */ }
    return {};
  }

  function isSolved(id) {
    return !!(id && solvedSet()[id]);
  }

  function markSolved(id, on) {
    if (!id) return;
    var obj = solvedSet();
    if (on) obj[id] = 1;
    else delete obj[id];
    try { localStorage.setItem(SOLVED_KEY, JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
  }

  function toggleSolved(id) {
    var next = !isSolved(id);
    markSolved(id, next);
    return next;
  }

  /* ---------------- 未成年模式（ADR 0004） ----------------
   * 挡红汤 + 黄汤，被挡标签隐藏不可解。开启免密；关闭需输入
   * js/config.js 里的 MINOR_MODE_PASSWORD。首次进站在游玩前
   * 弹一次性提示（soup.minor.v1.prompted 记录已提示过）。
   * 生效时机：只影响下一次抽题 / 选汤，当前锅不中断。 */
  var MINOR_KEY = "soup.minor.v1";

  function minorStore() {
    try {
      var raw = localStorage.getItem(MINOR_KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === "object") return v;
    } catch (e) { /* 隐私模式：忽略 */ }
    return {};
  }

  function minorSave(v) {
    try { localStorage.setItem(MINOR_KEY, JSON.stringify(v)); } catch (e) { /* 忽略 */ }
  }

  function minorOn() {
    return !!minorStore().on;
  }

  function setMinor(on, opts) {
    var v = minorStore();
    v.on = !!on;
    v.prompted = true;
    minorSave(v);
    if (on) {
      /* 清掉已选中的被挡标签，避免「chip 隐藏但选中值还在」的死筛选 */
      if (state.randTone === "红汤" || state.randTone === "黄汤") state.randTone = "";
      if (libState.tone === "红汤" || libState.tone === "黄汤") libState.tone = "";
      state.randOpt = minorVisibleOpt(state.randOpt);
      libState.opt = minorVisibleOpt(libState.opt);
    }
    if (!opts || !opts.silent) {
      toast(on ? "未成年模式已开启：红汤与黄汤已隐藏" : "未成年模式已关闭");
      renderMinorToggle();
      renderRandom();
      renderLibraryFilters();
      renderLibrary();
    }
  }

  /* 未成年模式下的风味筛选项（隐藏被挡标签，选中的被挡标签一并清掉） */
  function minorVisibleOpt(opt) {
    var blocked = E.MINOR_BLOCKED;
    return (opt || []).filter(function (t) { return blocked.indexOf(t) === -1; });
  }

  /* 风味筛选当前选择 → 引擎 sel 对象 */
  function flavorSel(style, tone, opt) {
    return { style: style || "", tone: tone || "", optional: minorOn() ? minorVisibleOpt(opt) : (opt || []) };
  }

  /* ---------------- 未成年模式 UI ---------------- */

  function minorPassword() {
    var cfg = root.SoupConfig || {};
    return String(cfg.MINOR_MODE_PASSWORD || "");
  }

  function renderMinorToggle() {
    var btn = $("#btn-minor");
    if (!btn) return;
    var on = minorOn();
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("on", on);
    var txt = $("#minor-toggle-text");
    if (txt) txt.textContent = on ? "未成年模式 · 已开启" : "未成年模式";
    var note = $("#minor-note");
    if (note) note.textContent = on ? "红汤与黄汤已隐藏（关闭需密码）" : "开启后隐藏红汤与黄汤";
  }

  /* 弹层内容按需拼装：首访提示（游玩之前）或关闭时的密码门 */
  function minorModal(opts) {
    var wrap = $("#modal-minor");
    if (!wrap) { if (opts && opts.onClose) opts.onClose(); return; }
    var sub = $("#minor-modal-sub");
    var pw = $("#minor-pw-input");
    var fb = $("#minor-modal-feedback");
    var acts = $("#minor-modal-actions");
    if (!sub || !acts) return;
    fb.textContent = "";
    sub.innerHTML = opts.sub || "";
    pw.classList.toggle("hidden", !opts.password);
    pw.value = "";
    acts.innerHTML = (opts.actions || []).map(function (a) {
      return '<button type="button" class="btn ' + (a.primary ? "primary" : "ghost") + '" data-ma="' + a.key + '">' + esc(a.label) + "</button>";
    }).join("");
    $$("#minor-modal-actions [data-ma]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.dataset.ma;
        var act = (opts.actions || []).filter(function (a) { return a.key === key; })[0];
        if (!act) return;
        if (act.needsPw) {
          if (pw.value === minorPassword()) {
            wrap.classList.add("hidden");
            act.onClick();
          } else {
            fb.textContent = "密码不对。密码在 js/config.js 里，忘了可以翻开看。";
          }
          return;
        }
        wrap.classList.add("hidden");
        act.onClick();
      });
    });
    wrap.classList.remove("hidden");
    if (opts.password && pw) setTimeout(function () { pw.focus(); }, 60);
    sfx("ui");
  }

  /* 首访（无提示状态变量）在游玩之前问一次要不要开启 */
  function maybeMinorPrompt() {
    var v = minorStore();
    if (v.prompted) return;
    minorModal({
      sub: "这里的部分谜题含恐怖、死亡或成人内容。<br />如果这锅汤是给未成年人熬的，建议开启过滤——<b>红汤与黄汤将被隐藏</b>，之后随时可以在这里关闭。",
      actions: [
        { key: "on", label: "开启过滤", primary: true, onClick: function () { setMinor(true); } },
        { key: "off", label: "暂不开启", onClick: function () { setMinor(false, { silent: true }); } }
      ]
    });
  }

  function toggleMinorFromIntro() {
    if (!minorOn()) {
      setMinor(true);
      return;
    }
    minorModal({
      sub: "关闭后，红汤与黄汤题将重新出现在抽题与汤库里。",
      password: true,
      actions: [
        { key: "cancel", label: "先不动", onClick: function () {} },
        { key: "off", label: "输入密码并关闭", primary: true, needsPw: true, onClick: function () { setMinor(false); } }
      ]
    });
  }

  /* 场景 → 背景图 / 特效场景 / 曲目 */
  var BG = {
    menu: "assets/bg-castle.webp",
    game: "assets/bg-hall.webp",
    hall: "assets/bg-hall.webp",
    win: "assets/bg-dawn.webp",
    sad: "assets/bg-gate.webp"
  };
  var TRACK_OF = { menu: "menu", game: "game", hall: "game", win: "win", sad: "sad" };

  var state = {
    pid: null,
    revealed: [],
    asked: {},
    hintsUsed: 0,
    qCount: 0,
    done: false,
    randCat: "全部",
    randDiff: 0,
    randStyle: "",
    randTone: "",
    randOpt: [],
    history: [],
    aiBusy: false,
    sound: true,
    music: true,
    playing: true,
    fx: true,
    volume: 0.6
  };

  var progress = loadProgress();

  /* ---------------- 汤库（汤库层 + 精品层合并） ----------------
   * 汤库里现在同时包含两层：
   *   · 汤库层（lib_*，来自 js/library.public.js）
   *   · 精品层（项目最初那 100 道，来自 js/data.js + data-more.js）
   * 精品题不在 LIB 里，所以每次渲染时按需合并；
   * 用两层长度当签名做缓存，data-more.js 异步拉回来后会自然重建。 */
  var CORE_SRC = "精品汤";
  var mergedCache = null;
  var mergedSig = "";

  function coreAsLib(p) {
    return {
      id: p.id,
      dispTitle: p.title || p.id,
      surface: p.surface || "",
      cats: p.cats || [],
      flavor: p.flavor || [],
      difficulty: p.difficulty,
      src: CORE_SRC,
      lang: "zh",
      mode: "truth",
      hasTruth: !!p.truth,
      truthSource: p.truthSource || "original",
      truth: p.truth || "",
      layer: "core"
    };
  }

  /* 汤库列表的数据源：汤库层 + 精品层 */
  function mergedLib() {
    var core = (typeof PUZZLES !== "undefined" && PUZZLES && PUZZLES.length) ? PUZZLES : [];
    var lib = soupLib();
    var sig = lib.length + "|" + core.length;
    if (mergedCache && mergedSig === sig) return mergedCache;
    var out = lib.slice();
    for (var i = 0; i < core.length; i++) {
      if (core[i] && core[i].id) out.push(coreAsLib(core[i]));
    }
    mergedCache = out;
    mergedSig = sig;
    return out;
  }

  /* 汤库 1942 题约 2MB，是移动端首载最大的单项（2026-09-29 起按需加载）：
     首屏不加载；页面 load 后空闲预载；随机/汤库入口未就绪时先等再抽。
     读数一律走 soupLib()（实时读全局），绝不缓存空数组。 */
  function soupLib() {
    return (window.SOUP_LIBRARY && window.SOUP_LIBRARY.length) ? window.SOUP_LIBRARY : [];
  }

  var libLoadPromise = null;
  function ensureSoupLib() {
    if (window.SOUP_LIBRARY && window.SOUP_LIBRARY.length) return Promise.resolve();
    if (!libLoadPromise) {
      libLoadPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "js/library.public.js";
        s.onload = function () { resolve(); };
        s.onerror = function () { libLoadPromise = null; reject(new Error("LIB_LOAD_FAIL")); };
        (document.body || document.head).appendChild(s);
      });
    }
    return libLoadPromise;
  }

  function preloadSoupLib() {
    setTimeout(function () {
      /* 纯离线联动：没配 AI 时库题不可玩，2MB 汤库档不必拉；
         之后配好 AI 会由 AI.onChange 补载 */
      if (!aiOn()) return;
      var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1); };
      idle(function () { ensureSoupLib().catch(function () { /* 失败由各入口的等待兜底 */ }); });
    }, 2000);
  }
  if (document.readyState === "complete") preloadSoupLib();
  else window.addEventListener("load", preloadSoupLib);

  var libState = {
    page: 1,
    kw: "",
    cat: "全部",
    difficulty: 0,
    src: "全部",
    hasTruth: false,
    en: false,
    style: "",
    tone: "",
    opt: []
  };

  function libPuzzle(id) {
    if (!id) return null;
    var lib = soupLib();
    for (var i = 0; i < lib.length; i++) {
      if (lib[i].id === id) return lib[i];
    }
    return null;
  }

  function isLibPid(id) {
    return typeof id === "string" && id.indexOf("lib_") === 0;
  }

  function isLib(p) {
    return !!(p && isLibPid(p.id));
  }

  /* 库层进度：坏档回落空对象，绝不白屏 */
  function libProgress() {
    try {
      var raw = localStorage.getItem(LIB_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      if (obj && typeof obj === "object") {
        if (!("session" in obj)) obj.session = null;
        return obj;
      }
    } catch (e) { /* 隐私模式等：忽略 */ }
    return { session: null };
  }

  function saveLibProgress(obj) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(obj || libProgress())); }
    catch (e) { /* 忽略 */ }
  }

  /* 两层存档各自持有「进行中的对局」快照：库层优先显示库层的 */
  function currentSession() {
    var a = progress.session;
    var b = libProgress().session;
    if (a && a.pid) return a;
    if (b && b.pid) return b;
    return null;
  }

  /* 库层没有预设线索：只有 AI 汤主能对战 */
  function setAskEnabled(on) {
    ["#q-input", "#btn-ask", "#btn-guess"].forEach(function (s) {
      var el = $(s);
      if (el) el.disabled = !on;
    });
  }

  /* ---------------- 存档 ---------------- */

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      if (obj && typeof obj === "object") {
        if (!("session" in obj)) obj.session = null;
        return obj;
      }
    } catch (e) { /* 隐私模式等：忽略 */ }
    return { session: null, sound: true, music: true, playing: true, fx: true, volume: 0.6 };
  }

  function saveProgress() {
    try {
      progress.sound = state.sound;
      progress.music = state.music;
      progress.playing = state.playing;
      progress.fx = state.fx;
      progress.volume = state.volume;
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (e) { /* 忽略 */ }
  }

  /* 进行中的对局快照：刷新 / 误关标签页 / 手机后台被杀，都能接着熬 */
  function saveSession() {
    var snap = null;
    if (state.pid && !state.done) {
      snap = {
        pid: state.pid,
        revealed: state.revealed.slice(),
        asked: state.asked,
        hintsUsed: state.hintsUsed,
        qCount: state.qCount,
        history: state.history.slice(-20)
      };
    }
    /* 库题快照写进 LIB_KEY，精品题快照写进 deepsea_soup_v1 */
    if (isLibPid(state.pid)) {
      var lp = libProgress();
      lp.session = snap;
      saveLibProgress(lp);
      return;
    }
    progress.session = snap;
    saveProgress();
  }

  /* 纯离线模式提示（欢迎页）：本机没配 AI 汤主时常驻，配上即隐。
     文案在 index.html，这里只管显隐（init 与 AI.onChange 各刷一次） */
  function paintIntroOffline() {
    var el = $("#intro-offline");
    if (el) el.classList.toggle("hidden", aiOn());
  }

  /* 首屏「继续上一锅」：有快照才显示，点一下回到那口锅 */
  function paintResume() {
    var b = $("#btn-resume");
    if (!b) return;
    var s = currentSession();
    var p = s && s.pid ? E.getPuzzle(s.pid) : null;
    /* 纯离线联动：库局没有 AI 问不下去，按钮直接藏 */
    b.classList.toggle("hidden", !p || (isLib(p) && !aiOn()));
    if (p) b.textContent = "继续上一锅：" + (p.dispTitle || p.title);
  }

  function resumeSession() {
    var s = currentSession();
    var p = s && s.pid ? E.getPuzzle(s.pid) : null;
    if (!p) { toast("没有可以接着熬的锅"); paintResume(); return; }
    loadPuzzle(p.id, true);
  }

  /* ---------------- 小工具 ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* 房间层复用同一个 toast，避免两套提示条 */
  if (window.SoupToastBridge) window.SoupToastBridge(toast);

  var VERDICT_TEXT = { yes: "是", no: "不是", partial: "部分正确", irr: "与此无关" };

  /* ---------------- 场景切换：背景 + 特效 + 音乐 ---------------- */

  var bgTop = "a";
  var bgCurrent = "";

  function setBg(url) {
    if (!url || url === bgCurrent) return;
    bgCurrent = url;
    var next = bgTop === "a" ? "b" : "a";
    var show = document.getElementById("bg-" + next);
    var hide = document.getElementById("bg-" + bgTop);
    if (!show || !hide) return;
    show.style.backgroundImage = 'url("' + url + '")';
    show.classList.add("on");
    hide.classList.remove("on");
    bgTop = next;
  }

  function setScene(name) {
    if (FX) FX.setScene(name);
    setBg(BG[name] || BG.menu);
    if (AU) AU.start(TRACK_OF[name] || "menu");
  }

  /* 转场：黑幕盖屏 → 在全黑那一瞬换内容 → 黑幕拉开。
     按「exit / swap / enter」三段严格分开，不再一边盖黑一边换景。
     没装 GSAP 时自动退回 Web Animations；后台标签页冻结 ticker 也有兜底收幕。 */
  function sceneWipe(cb) {
    var T = root.SoupTransition;
    if (!T || (FX && FX.reduced)) {
      var f0 = $("#scene-fade");
      if (f0) { f0.classList.remove("on"); f0.style.opacity = "0"; f0.style.visibility = "hidden"; }
      cb();
      return;
    }
    T.play({ onSwap: cb });
  }

  /* ---------------- 音效 ---------------- */

  function sfx(name) {
    if (!state.sound || !AU) return;
    AU.sfx(name);
  }

  /* ---------------- 音乐台 ---------------- */

  function paintMusic() {
    var bm = $("#btn-music");
    if (bm) {
      bm.innerHTML = ic("music") + (state.music ? " 音乐" : " 静音");
      bm.setAttribute("aria-pressed", state.music ? "true" : "false");
    }
    var bp = $("#btn-play");
    if (bp) {
      bp.innerHTML = (state.playing ? icRaw("pause") : icRaw("play")) + (state.playing ? " 暂停" : " 播放");
      bp.setAttribute("aria-pressed", state.playing ? "true" : "false");
    }
    var dp = $("#dock-play");
    if (dp) {
      dp.innerHTML = state.playing ? icRaw("pause") : icRaw("play");
      dp.setAttribute("aria-pressed", state.playing ? "true" : "false");
    }
    var dm = $("#dock-mute");
    if (dm) {
      dm.innerHTML = state.music ? icRaw("volume") : icRaw("mute");
      dm.setAttribute("aria-pressed", state.music ? "true" : "false");
    }
    var v = $("#vol");
    if (v && Number(v.value) !== Math.round(state.volume * 100)) v.value = String(Math.round(state.volume * 100));
    var dock = $("#music-dock");
    if (dock) dock.classList.toggle("dim", !state.music || !state.playing);
  }

  function applyAudioSettings() {
    if (!AU) return;
    AU.setVolume(state.volume);
    AU.setMusicOn(state.music);
    AU.setSfxOn(state.sound);
    AU.setPlaying(state.playing);
    paintMusic();
  }

  /* ---------------- 氛围特效开关 ---------------- */

  function applyFxSettings() {
    var on = !!state.fx;
    document.body.classList.toggle("fx-off", !on);
    if (FX && FX.setEnabled) FX.setEnabled(on);
    else if (FX) { if (on) FX.resume(); else FX.pause(); }
    paintFx();
  }

  function paintFx() {
    var bf = $("#btn-fx");
    if (!bf) return;
    bf.innerHTML = ic("spark") + (state.fx ? " 特效" : " 特效关");
    bf.setAttribute("aria-pressed", state.fx ? "true" : "false");
  }

  function toggleFx() {
    state.fx = !state.fx;
    applyFxSettings();
    saveProgress();
    sfx("ui");
    toast(state.fx ? "氛围特效已打开" : "氛围特效已关闭（雨幕 / 闪电 / 抖动都停了）");
  }

  function toggleMusic() {
    state.music = !state.music;
    if (AU) { AU.setMusicOn(state.music); if (state.music) AU.setPlaying(state.playing); }
    paintMusic();
    saveProgress();
    sfx("ui");
    toast(state.music ? "音乐已打开" : "音乐已静音");
  }

  function togglePlay() {
    state.playing = !state.playing;
    if (AU) AU.setPlaying(state.playing);
    paintMusic();
    saveProgress();
    sfx("ui");
    toast(state.playing ? "音乐继续" : "音乐已暂停（音效照常）");
  }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    if (AU) AU.setVolume(state.volume);
    saveProgress();
  }

  /* ---------------- 文字演出 ---------------- */

  var typeTimer = null;
  function typeSurface(text) {
    var el = $("#p-surface");
    if (!el) return;
    clearInterval(typeTimer);
    if (FX && FX.reduced) { el.classList.remove("typing"); el.textContent = text; return; }
    el.classList.add("typing");
    el.textContent = "";
    var i = 0;
    typeTimer = setInterval(function () {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typeTimer);
        el.textContent = text;
        el.classList.remove("typing");
      }
    }, 22);
  }

  /* ---------------- 渲染：题库分片 ---------------- */

  /* 题库分片：首屏渲染完成后把剩下的题异步拉回来，并入同一个 PUZZLES 数组 */
  function loadMorePuzzles() {
    if (window.__soupMoreLoaded) return;
    window.__soupMoreLoaded = true;
    var s = document.createElement("script");
    s.src = "js/data-more.js";
    s.async = true;
    s.onload = function () {
      renderQaLog();
      renderRandom();
      paintResume();
      /* data-more.js 拉回来后，精品层从 20 → 100 道；
         得把汤库筛选器 + 汤库列表也重画一遍，不然在汤库里搜不到后面这 80 道 */
      renderLibraryFilters();
      renderLibrary();
      toast("汤架已备齐：共 " + PUZZLES.length + " 道汤");
    };
    s.onerror = function () {
      /* 分片没拉到就先用已经有的题，至少不影响玩 */
      PUZZLES_TOTAL = PUZZLES.length;
      renderQaLog();
      toast("汤库只加载了一部分，刷新页面再试试");
    };
    document.head.appendChild(s);
  }

  /* ============================================================
   * 左侧「问答记录」区
   * ------------------------------------------------------------
   * 原「汤单」列表已整体迁入汤库（screen-library）。
   * 左侧现在只做一件事：把本局的问答历史滚动展示出来。
   * 数据源就是 state.history（{q, a} 数组），与 #log 同源同序。
   * ============================================================ */

  /* 从回答开头认出四种判定，好让左栏和实时记录用同一套颜色 */
  function qaTone(text) {
    var s = String(text || "").replace(/^\s+/, "");
    if (s.indexOf("与此无关") === 0) return "irr";
    if (s.indexOf("部分正确") === 0) return "partial";
    if (s.indexOf("不是") === 0) return "no";
    if (s.indexOf("是") === 0) return "yes";
    return "";
  }

  /* 本局问答记录：state.history 里每一条 {q, a} 渲染成一组 Q/A */
  function renderQaLog() {
    var box = $("#qa-log");
    if (!box) return;
    var hist = state.history || [];
    var badge = $("#qa-count");
    if (badge) badge.textContent = hist.length + " 问";

    /* 重建 DOM 前记住玩家/自动滚动看到哪了，重建后原位接上，不再拍回顶部 */
    var keepTop = box.scrollTop;
    if (!hist.length) {
      box.innerHTML = '<p class="empty">还没有提问。<br />打开一道汤，向汤主问出第一句吧。</p>';
      return;
    }
    box.innerHTML = hist.map(function (item, idx) {
      var tone = qaTone(item.a);
      return '<div class="qa-item' + (tone ? " " + tone : "") + '">' +
        '<div class="qa-q"><span class="qa-k">Q' + (idx + 1) + "</span>" + esc(item.q) + "</div>" +
        '<div class="qa-a">' +
          (tone
            ? '<span class="qa-k verdict ' + tone + '">' + esc(VERDICT_TEXT[tone]) + "</span>"
            : '<span class="qa-k">A</span>') +
          esc(item.a) + "</div>" +
        "</div>";
    }).join("");
    box.scrollTop = keepTop;
    /* 单人局和多人房一样：自动慢滚循环，手动一碰先让位 4 秒 */
    if (root.SoupRoom && root.SoupRoom.watchQaScroll) root.SoupRoom.watchQaScroll();
    if (root.SoupRoom && root.SoupRoom.ensureQaScroll) root.SoupRoom.ensureQaScroll();
  }

  function clearQaLog() {
    var box = $("#qa-log");
    if (box) box.innerHTML = '<p class="empty">还没有提问。<br />打开一道汤，向汤主问出第一句吧。</p>';
    var badge = $("#qa-count");
    if (badge) badge.textContent = "0 问";
  }

  /* ---------------- 渲染：对局 ---------------- */

  function renderStats() {
    var p = E.getPuzzle(state.pid);
    if (!p) return;
    /* 单人局也挂上自动慢滚，和多人房同一套：自己循环滚，玩家也能手动翻 */
    if (root.SoupRoom && root.SoupRoom.ensureQaScroll) root.SoupRoom.ensureQaScroll();
    var s = state;
    /* 第⑥条：线索 / 提示 / 探索度统计已全部下线，只留提问计数 */
    set("#s-q", s.qCount);
  }

  function set(sel, val) {
    var el = $(sel);
    if (el) el.textContent = val;
  }

  /* ---- 第⑫条：判定词去重（与 room-ui.js 的 qaStrip 同一口径） ----
   * 带特效的判定标签已经提在行首，正文开头重复的那一遍判定词在渲染前剥掉；
   * 只剥独立开头的判定词+标点，不改动注入给 AI 的任何提示词。 */
  var QA_BOUND = /^[\s。.!！?？~～、，,：:;；\-—…]/;
  var QA_WORDS = ["不是", "并非", "非也", "不对", "否", "部分正确", "部分", "有些", "一半", "接近", "差不多", "擦边", "与此无关", "不相关", "没关系", "无关", "跑题", "题外", "超出范围", "是的", "是"];
  function qaStrip(label, text) {
    var t = String(text == null ? "" : text).replace(/^\s+/, "");
    var box = t.match(/^【\s*([^】]{1,10})\s*】\s*/);
    if (box) t = t.slice(box[0].length);
    var cands = [];
    var L = String(label == null ? "" : label).replace(/[。.!！]+$/, "").trim();
    if (L) cands.push(L);
    cands = cands.concat(QA_WORDS, ["推理", "汤主"]);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c || t.indexOf(c) !== 0) continue;
      var after = t.slice(c.length);
      if (after && !QA_BOUND.test(after)) continue;
      return after.replace(/^[\s。.!！?？~～、，,：:;；\-—…]+/, "");
    }
    return t;
  }

  function addLine(side, tone, html, meta) {
    var log = $("#log");
    if (!log) return null;
    var wrap = document.createElement("div");
    wrap.className = "line " + side + (tone ? " " + tone : "");
    wrap.innerHTML = '<span class="say">' + html + "</span>" +
      (meta ? '<span class="tone">' + esc(meta) + "</span>" : "");
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function clearLog() {
    var log = $("#log");
    if (log) log.innerHTML = "";
  }

  function sysLine(text) {
    addLine("host", "sys", esc(text));
  }

  function loadPuzzle(id, restore) {
    var p = E.getPuzzle(id);
    if (!p) return;
    var lib = isLib(p);
    /* 进汤保留黑幕转场：sceneWipe 先盖黑 → 换内容 → 淡出。
       之前「一直黑」的根因是面板入场动画从透明起步，与黑幕叠加；
       面板动画已移除，这里可以安全恢复氛围转场。 */
    sceneWipe(function () {
      leaveRoomScreen();
      /* 两层各自持有「进行中的对局」：库题只认 LIB_KEY，绝不串档 */
      var snap = restore ? (lib ? libProgress().session : progress.session) : null;
      if (snap && snap.pid !== id) snap = null;
      state.pid = id;
      state.revealed = snap && snap.revealed ? snap.revealed.slice() : [];
      state.asked = snap && snap.asked ? snap.asked : {};
      state.hintsUsed = snap ? (snap.hintsUsed || 0) : 0;
      state.qCount = snap ? (snap.qCount || 0) : 0;
      state.done = false;
      state.history = snap && snap.history ? snap.history.slice() : [];
      state.aiBusy = false;

      $("#screen-intro").classList.add("hidden");
      var rs = $("#screen-random");
      if (rs) rs.classList.add("hidden");
      var sl = $("#screen-library");
      if (sl) sl.classList.add("hidden");
      var gs = $("#screen-game");
      gs.classList.remove("hidden");
      gs.style.animation = "none";
      gs.style.opacity = "1";
      gs.style.visibility = "visible";
      setScene("game");
      /* 第⑪条：进单人对局后刷新右栏备忘录显隐
         （leaveRoomScreen 时 screen-game 还没显示，那个时机太早） */
      if (window.SoupRoom && window.SoupRoom.syncChat) window.SoupRoom.syncChat();

      if (lib) {
        /* 库层：标题用 dispTitle（永远非空），来源代替大类标签 */
        set("#p-title", p.dispTitle || p.title || "无题");
        /* 汤面只留题目和火候，题材 / 来源标签不上汤面 */
        var ltag = $("#p-tag");
        if (ltag) { ltag.textContent = ""; ltag.classList.add("hidden"); }
        var lcats = $("#p-cats");
        if (lcats) { lcats.innerHTML = ""; lcats.classList.add("hidden"); }
        set("#p-diff", libDiffDots(p.difficulty) + " 难度");
        var lorig = $("#p-orig");
        if (lorig) lorig.classList.add("hidden");
      } else {
        set("#p-title", p.title);
        /* 汤面只留题目和火候，题材标签不上汤面 */
        var ptag = $("#p-tag");
        if (ptag) { ptag.textContent = ""; ptag.classList.add("hidden"); }
        var pcats = $("#p-cats");
        if (pcats) { pcats.innerHTML = ""; pcats.classList.add("hidden"); }
        set("#p-diff", new Array(p.difficulty + 1).join("●") + new Array(3 - p.difficulty + 1).join("○") + " 难度");
      }
      /* 风味标签上汤面 meta 行（未成年模式下不显示被挡标签） */
      var pflavor = $("#p-flavor");
      if (pflavor) {
        var fs = E.flavorOf(p).filter(function (t) {
          return !(minorOn() && E.MINOR_BLOCKED.indexOf(t) !== -1);
        });
        pflavor.innerHTML = fs.map(function (t) {
          return '<span class="pz-cat fb-' + t + '">' + esc(t) + "</span>";
        }).join("");
        pflavor.classList.toggle("hidden", !fs.length);
      }
      typeSurface(p.surface);

      clearLog();
      if (lib) {
        sysLine("（这一锅来自「" + p.src + "」）");
        if (p.mode === "surface") {
          /* 只有汤面：五个交互按钮全禁用，明确告知，绝不让 AI 瞎编 */
          setAskEnabled(false);
          sysLine("这锅只有汤面，汤底还在熬。");
          renderTip("这锅只有汤面，汤底还在熬——先看看就好。");
        } else {
          setAskEnabled(true);
          if (p.truthSource === "ai") {
            sysLine("（注意：这一锅的汤底是 AI 根据汤面编的，不是原题答案）");
          }
          sysLine(snap
            ? "（你回到灶台前，锅里还温着）接着上一锅继续。"
            : "（锅盖揭开，热气涌上来）汤主问你：这一锅，你看出了什么？");
          renderTip(aiOn()
            ? "AI 汤主已经读过这一锅的汤面汤底，用你自己的话问就好。"
            : "这一锅要 AI 汤主才能问——点上方「AI 汤主」配好模型。");
        }
      } else {
        setAskEnabled(true);
        sysLine(snap
          ? "（你回到灶台前，锅里还温着）接着上一锅继续。"
          : "（锅盖揭开，热气涌上来）汤主问你：这一锅，你看出了什么？");
        renderTip(aiOn()
          ? "AI 汤主已经读过这一锅的汤面汤底，用你自己的话问就好。"
          : "随便问点什么吧。关键词越准，汤主掀开的那一层越厚。");
      }
      renderClues();
      renderStats();
      renderQaLog();
      paintAiBar();

      var input = $("#q-input");
      if (input) {
        input.value = "";
        if (!lib || p.mode === "truth") {
          if (!isTouch() && window.innerWidth > 860) input.focus();
        }
      }
      saveSession();
      paintResume();
      sfx("page");
    });
  }

  function renderTip() {
    /* 第⑦条：「汤主的话」独立框已下线，文案并入对话流与状态提示；保留空壳防旧调用 */
  }

  function renderClues() {
    var box = $("#clue-list");
    var p = E.getPuzzle(state.pid);
    if (!box || !p) return;
    if (isLib(p)) {
      box.innerHTML = '<p class="empty">汤库这一锅没有预设线索板——线索得靠 AI 汤主一句句问出来。</p>';
      var lbadge = $("#clue-badge");
      if (lbadge) lbadge.textContent = "—";
      return;
    }
    if (!state.revealed.length) {
      box.innerHTML = '<p class="empty">还没有挖到线索。<br />先问几个「是 / 不是」都能答的问题吧。</p>';
      return;
    }
    var items = state.revealed.slice().sort(function (a, b) { return a - b; }).map(function (i) {
      var c = p.clues[i];
      var label = VERDICT_TEXT[c.type] || "线索";
      return '<div class="clue ' + esc(c.type) + '">' +
        '<span class="clue-k">线索 ' + (i + 1) + " · " + esc(label) + "</span>" +
        esc(E.stripLead(c.text)) + "</div>";
    });
    var left = p.clues.length - state.revealed.length;
    if (left > 0) {
      items.push('<div class="clue empty-card">还有 ' + left + " 条线索还藏在锅里，继续挖。</div>");
    }
    box.innerHTML = items.join("");
  }

  /* ---------------- 提问 ---------------- */

  function submitQuestion() {
    var input = $("#q-input");
    if (!input) return;
    var raw = input.value.trim();
    if (!raw) { toast("先写点什么，汤主才听得见呀"); return; }
    if (state.done) { toast("这一锅已经端上桌了，先去揭汤底吧"); return; }

    var p = E.getPuzzle(state.pid);
    if (!p) return;

    /* 汤库层没有关键词汤主：必须走 AI，否则不给问 */
    if (isLib(p) && !aiOn()) {
      toast("汤库这一锅要 AI 汤主才能问——点上方「AI 汤主」配好模型");
      return;
    }

    /* 防呆：单人玩库题时，前端必须真的拿到汤底，否则绝不让 AI 空底瞎编。
       现在 index.html 加载的是含 truth 的完整档，正常不会触发；
       一旦触发（换了瘦身档 / 数据没加载上），宁可明说也不放幻觉。 */
    if (isLib(p) && p.mode !== "surface" && !String(p.truth || "").trim()) {
      toast("这锅的汤底还没加载上，先别问——刷新一下页面试试");
      return;
    }

    var key = E.normalize(raw);

    addLine("me", "", esc(raw), "你的提问");
    sfx("paper");

    if (state.asked[key]) {
      addLine("host", "sys", esc("这个问题刚才问过了，汤主不重复回答。"));
      input.value = "";
      return;
    }
    state.qCount++;

    /* 库题没有预设线索：跳过关键词匹配，直接交给 AI 汤主理解 */
    var res = isLib(p) ? { kind: "none" } : E.ask(p, raw, state.revealed);

    if (aiOn() && res.kind !== "meta") {
      /* AI 模式：认领哪条线索由模型理解后决定（用自己的话也能挖到线索）；
         它认不出来时才退回关键词的判定，保证进度不会白费。
         ⚠ 记账必须等 AI 真正答上才算数：掉线时这一笔要回滚，玩家可以重问 */
      askAi(p, raw, res, key);
    } else if (aiOn()) {
      /* meta（寒暄/超范围）也走 AI，不再外显关键词硬回复 */
      state.asked[key] = 1;
      askAi(p, raw, res, null);
    } else {
      /* 纯离线：精品层走关键词汤主——与 Worker 未配 AI 的口径一致（规格 #14），
         题库自带判定词、回复与线索，完全本地判定。
         库层没有关键词表，已在上面拦掉，走不到这里。 */
      pushReveal(res);
      renderKeywordAnswer(res);
    }

    state.asked[key] = 1;
    input.value = "";
    renderStats();
    saveSession();
    renderTip(aiOn()
      ? "AI 汤主的小提醒：不用凑关键词，把「为什么」「是不是有人」「那是什么」串成一句人话问它。"
      : "汤主的小提醒：把「为什么」「是不是有人」「那是什么」串起来问，比只问一个词有效得多。");
  }

  /* 线索板记账：AI 模式下提前记，关键词模式由 renderKeywordAnswer 顺手记 */
  function pushReveal(res) {
    if (res.kind === "clue" && state.revealed.indexOf(res.index) === -1) state.revealed.push(res.index);
  }

  /* 关键词汤主的原始答话：没配 AI 时走这里，AI 掉线时也回退到这里 */
  function renderKeywordAnswer(res, alreadyBooked) {
    /* 第⑥条：线索板下线——clue / again 只按判定上屏，不再入账弹提示 */
    if (res.kind === "clue") {
      var tone = res.verdict;
      var line = addLine("host", tone,
        (res.flavor ? esc(res.flavor) + "<br />" : "") +
        '<b class="verdict ' + esc(tone) + '">' + esc(VERDICT_TEXT[tone] || "答") + "</b> " + esc(qaStrip(VERDICT_TEXT[tone], res.reply)));
      sfx(tone === "partial" ? "partial" : tone);
      if (FX && line) {
        FX.burstAt(line, {
          count: tone === "yes" ? 26 : 18,
          colors: tone === "yes" ? ["#68cf9a", "#a8ecc6", "#f6cf90"]
            : tone === "no" ? ["#e0705e", "#ffb3a3", "#e2a44f"]
              : ["#e8c45c", "#ffe9c4", "#e2a44f"]
        });
      }
    } else if (res.kind === "again") {
      addLine("host", "sys", esc("这个问题刚才问过啦：") + esc(qaStrip("", res.reply)));
    } else if (res.kind === "meta") {
      addLine("host", "sys", esc(res.reply));
      sfx("irr");
    } else if (res.kind === "none") {
      /* 汤库题不走关键词汤主：能走到这里，只可能是 AI 没接上 */
      addLine("host", "sys", esc(res.reply || "汤主这一句没接上，再问一次试试。"));
      sfx("irr");
    } else {
      var l2 = addLine("host", "irr",
        (res.flavor ? esc(res.flavor) + "<br />" : "") +
        '<b class="verdict irr">与此无关</b> ' + esc(qaStrip("与此无关", E.stripLead(res.reply))));
      sfx("irr");
      if (FX && l2) FX.burstAt(l2, { count: 8, power: 0.5, colors: ["#8b8177", "#6f6459"] });
    }
  }

  /* ---------------- AI 汤主 ---------------- */

  var AI = window.SoupAI;

  function aiOn() {
    return !!(AI && AI.isReady());
  }

  function paintAiBar(note, tone) {
    var bar = $("#ai-bar");
    var txt = $("#ai-bar-text");
    var link = $("#btn-ai-bar");
    var btn = $("#btn-ai");
    if (!bar || !txt) return;
    var on = aiOn();
    bar.classList.toggle("on", on);
    /* 警示与「是否启用」是两件事：AI 开着但这一句掉线了，也要提醒 */
    bar.classList.toggle("warn", !!note && /warn/.test(String(tone || "")));
    if (note) txt.textContent = note;
    else txt.textContent = on ? ("AI 汤主在值班 · " + AI.config().model) : "关键词汤主在值班";
    txt.className = note && tone ? tone : "";
    if (link) link.textContent = on ? "调整 AI 设置" : "换成 AI 汤主";
    if (btn) {
      btn.innerHTML = ic("robot") + (on ? " AI 汤主 · 开" : " AI 汤主");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* 把已挖到的线索原文整理给模型，避免它和线索板打架 */
  function revealedTexts(p) {
    if (!p || !p.clues || !p.clues.length) return [];
    return state.revealed.slice().sort(function (a, b) { return a - b; }).map(function (i) {
      return (i + 1) + ". " + E.stripLead(p.clues[i].text);
    });
  }

  /* AI 认领线索 → 入账（返回是否真的新增了一条） */
  function claimClue(p, n) {
    /* 库层没有线索表：AI 认领编号一律忽略（AI 那边也已被要求只填 0） */
    if (!p || !p.clues || !p.clues.length) return false;
    var idx = parseInt(n, 10);
    if (!isFinite(idx) || idx <= 0 || idx > p.clues.length) return false;
    idx -= 1;
    if (state.revealed.indexOf(idx) !== -1) return false;
    state.revealed.push(idx);
    renderClues();
    renderStats();
    saveSession();
    toast("挖到新线索：" + E.stripLead(p.clues[idx].text).slice(0, 14) + "…");
    return true;
  }

  function askAi(p, raw, res, bookKey) {
    if (state.aiBusy) {
      addLine("host", "sys", esc("汤主还在想上一句，稍等一下下。"));
      if (bookKey) delete state.asked[bookKey];
      return;
    }
    state.aiBusy = true;
    var booked = false;
    var commit = function () {
      if (bookKey && !booked) { state.asked[bookKey] = 1; booked = true; }
    };

    var line = addLine("host", "pending", '<b class="verdict irr">…</b> 汤主正在琢磨这句话', "AI");
    var ctx = {
      revealed: revealedTexts(p),
      taken: state.revealed.map(function (i) { return i + 1; }),
      history: state.history.slice(-6)
    };
    if (res.kind === "clue") ctx.hintClue = { n: res.index + 1, type: res.verdict, text: E.stripLead(res.clue.text) };
    else if (res.kind === "again") ctx.hintClue = { n: res.index + 1, type: res.verdict, text: E.stripLead(res.reply) };

    var asked = raw;
    var fallback = res;

    AI.ask(p, asked, ctx).then(function (out) {
      state.aiBusy = false;
      if (line && line.parentNode) line.parentNode.removeChild(line);
      if (state.pid !== p.id || state.done) return;
      state.history.push({ q: asked, a: out.reply });
      /* 单①：这里必须马上刷新左栏。原来只 push 不 render，
         导致左栏一直不动，直到猜底/换汤等别的动作才把攒下的问答一股脑吐出来。 */
      renderQaLog();
      var tone = out.verdict;
      /* 第⑥条：线索入账与弹.toast 已全部下线，这里只上屏判定 */
      var el = addLine("host", tone,
        '<b class="verdict ' + esc(tone) + '">' + esc(VERDICT_TEXT[tone] || "答") + "</b> " + esc(qaStrip(VERDICT_TEXT[tone], E.stripLead(out.reply))),
        "AI · " + esc(out.model || ""));
      sfx(tone === "partial" ? "partial" : tone);
      if (FX && el) {
        FX.burstAt(el, {
          count: tone === "yes" ? 26 : 14,
          colors: tone === "yes" ? ["#68cf9a", "#a8ecc6", "#f6cf90"]
            : tone === "no" ? ["#e0705e", "#ffb3a3", "#e2a44f"]
              : ["#e8c45c", "#ffe9c4", "#e2a44f"]
        });
      }
      /* 线索板与 AI 判定不一致时，以题库为准，并且不把新线索算给玩家 */
      if (res.kind === "clue" && tone !== res.verdict && state.revealed.indexOf(res.index) !== -1 && out.clue === 0) {
        state.revealed = state.revealed.filter(function (x) { return x !== res.index; });
        renderClues();
        renderStats();
      }
      paintAiBar();
    }, function (err) {
      state.aiBusy = false;
      if (line && line.parentNode) line.parentNode.removeChild(line);
      if (state.pid !== p.id) return;
      var why = AI.describeError(err);
      /* 掉线：本项目不接关键词汤主，绝不外显死板回复。
         这一笔记账要回滚、这一问不消耗次数，玩家可以原样重问 */
      if (bookKey) delete state.asked[bookKey];
      state.qCount = Math.max(0, state.qCount - 1);
      paintAiBar("AI 没接上（" + why + "）。", "ai-warn");
      addLine("host", "sys", esc("AI 汤主掉线了，请重新提问一次。"));
      sfx("irr");
      renderStats();
      toast("AI 掉线了：" + why);
    });
  }

  /* 「问问 AI」：让模型基于已挖线索补一句方向 */
  function askAiHint() {
    var p = E.getPuzzle(state.pid);
    if (!p || state.done) return;
    if (!aiOn()) { toast("先点上方的 AI 汤主配好模型，才能问它"); openAiModal(); return; }
    /* 提示记账只留一处：先走题库提示，再补一句 AI 方向，避免两套逻辑漂移 */
    var before = state.hintsUsed;
    useHint();
    if (state.hintsUsed === before) return;   /* 提示已经给完了 */
    AI.ask(p, "我有点卡住了，能不能给我一点方向？只要一句，别告诉我答案。", {
      revealed: revealedTexts(p),
      history: state.history.slice(-6)
    }).then(function (out) {
      addLine("host", "hint", '<b>AI 汤主</b> · ' + esc(E.stripLead(out.reply)), "AI · 方向");
      sfx("hint");
    }, function () { /* 掉线就只用题库提示，不打扰玩家 */ });
  }

  /* ---------------- AI 设置面板 ---------------- */

  function paintAiModal(status, tone) {
    if (!AI) return;
    fillProviderOptions();
    var cfg = AI.config();
    var sel = $("#ai-provider");
    if (sel && !sel.options.length) {
      sel.innerHTML = AI.PROVIDERS.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.label) + "</option>";
      }).join("");
    }
    if (sel) sel.value = cfg.provider;
    var pre = AI.providerOf(cfg.provider);
    var note = $("#ai-provider-note");
    if (note) {
      note.textContent = pre.note || "";
      /* 「需本地运行」这类预设必须显眼：公网访客选了必然连不上 */
      note.className = "ai-note" + (pre.local ? " ai-warn" : "");
    }
    var bu = $("#ai-baseurl");
    if (bu && document.activeElement !== bu) bu.value = cfg.baseUrl;
    var md = $("#ai-model");
    if (md && document.activeElement !== md) md.value = cfg.model;
    var kk = $("#ai-key");
    if (kk && document.activeElement !== kk) kk.value = cfg.apiKey;
    var en = $("#ai-enabled");
    if (en) {
      en.classList.toggle("on", cfg.enabled);
      en.setAttribute("aria-pressed", cfg.enabled ? "true" : "false");
      en.textContent = cfg.enabled ? "已启用 AI 汤主" : "启用 AI 汤主";
    }
    var st = $("#ai-status");
    if (st) {
      st.className = "ai-note" + (tone ? " " + tone : "");
      st.textContent = status || (AI.isReady(cfg)
        ? "已就绪 · " + pre.label + " / " + cfg.model + " · Key " + AI.maskKey(cfg.apiKey)
        : "还没填全（需要接口地址、模型和 Key 三样）。");
    }
  }

  /* 服务商下拉：一进页面就填好，不用等打开面板 */
  function fillProviderOptions() {
    var sel = $("#ai-provider");
    if (!sel || !AI || sel.options.length) return;
    sel.innerHTML = AI.PROVIDERS.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.label) + "</option>";
    }).join("");
  }

  function openAiModal() {
    paintAiModal();
    var warn = $("#ai-warn");
    if (warn) warn.textContent = "";
    openModal("#modal-ai", "#ai-provider");
    sfx("ui");
  }

  function readAiForm() {
    var sel = $("#ai-provider");
    var bu = $("#ai-baseurl");
    var md = $("#ai-model");
    var kk = $("#ai-key");
    return {
      provider: sel ? sel.value : "deepseek",
      baseUrl: bu ? bu.value.trim() : "",
      model: md ? md.value.trim() : "",
      apiKey: kk ? kk.value.trim() : ""
    };
  }

  function saveAiForm(forceOn) {
    var patch = readAiForm();
    if (typeof forceOn === "boolean") patch.enabled = forceOn;
    var cfg = AI.setConfig(patch);
    paintAiModal();
    paintAiBar();
    return cfg;
  }

  function testAi() {
    var st = $("#ai-status");
    var patch = readAiForm();
    patch.enabled = true;
    AI.setConfig(patch);
    if (st) { st.className = "ai-note"; st.textContent = "正在连接 " + patch.model + " …"; }
    AI.test().then(function (r) {
      paintAiModal(r.message, r.ok ? "ai-ok" : "ai-bad");
      paintAiBar();
      if (r.ok) sfx("yes"); else sfx("lose");
    });
  }

  function clearAi() {
    AI.save(AI.defaults());
    paintAiModal("配置已清空，回到关键词汤主。", "");
    paintAiBar();
    toast("AI 配置已清空");
  }

  function bindAiModal() {
    if (!AI) return;

    /* 配置一变（含外部直接 save）就刷新状态条，避免界面和实际不一致；
       纯离线联动：AI 配好/清空会改变库层可见性——配好就补载汤库重画，
       清空则立刻把库题从列表与抽取里撤下 */
    AI.onChange(function () {
      paintAiBar();
      paintIntroOffline();
      paintResume();
      if (aiOn()) {
        ensureSoupLib().catch(function () { /* 加载失败由各入口的等待兜底 */ }).then(function () {
          renderLibraryFilters();
          renderLibrary();
        });
      } else {
        renderLibraryFilters();
        renderLibrary();
      }
    });
    fillProviderOptions();

    var sel = $("#ai-provider");
    if (sel) sel.addEventListener("change", function () {
      var pre = AI.providerOf(sel.value);
      var bu = $("#ai-baseurl");
      var md = $("#ai-model");
      if (bu) bu.value = pre.baseUrl;
      if (md) md.value = pre.model;
      /* 立刻落盘，否则后面的回填会把刚切好的地址又改回旧服务商 */
      AI.setConfig({ provider: sel.value, baseUrl: pre.baseUrl, model: pre.model });
      paintAiModal("已切到 " + pre.label + "，地址和模型已自动填好。", "");
      sfx("ui");
    });

    var en = $("#ai-enabled");
    if (en) en.addEventListener("click", function () {
      var on = en.getAttribute("aria-pressed") !== "true";
      saveAiForm(on);
      paintAiModal(on ? "已启用。记得填全三样再保存。" : "已关闭，回到关键词汤主。", "");
      sfx("ui");
    });

    var rev = $("#ai-reveal");
    if (rev) rev.addEventListener("click", function () {
      var kk = $("#ai-key");
      var show = rev.getAttribute("aria-pressed") !== "true";
      if (kk) kk.type = show ? "text" : "password";
      rev.setAttribute("aria-pressed", show ? "true" : "false");
      rev.classList.toggle("on", show);
      rev.textContent = show ? "隐藏 Key" : "显示 Key";
      sfx("ui");
    });

    var testBtn = $("#btn-ai-test");
    if (testBtn) testBtn.addEventListener("click", testAi);

    var clearBtn = $("#btn-ai-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearAi);

    var cancel = $("#btn-ai-cancel");
    if (cancel) cancel.addEventListener("click", function () { closeModal("#modal-ai"); });

    var saveBtn = $("#btn-ai-save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var cfg = saveAiForm(true);
      if (!AI.isReady(cfg)) {
        paintAiModal("还差一点：接口地址、模型、Key 都要填。", "ai-bad");
        sfx("lose");
        return;
      }
      paintAiModal("已保存并启用 · " + cfg.model, "ai-ok");
      paintAiBar();
      sfx("yes");
      toast("AI 汤主已上线");
      closeModal("#modal-ai");
    });

    var entry = $("#btn-ai");
    if (entry) entry.addEventListener("click", openAiModal);

    var barLink = $("#btn-ai-bar");
    if (barLink) barLink.addEventListener("click", openAiModal);

    var quick = $("#btn-ai-quick");
    void quick;   /* 第⑥条：「问问 AI」已随提示机制下线 */
  }

  /* 第⑥条：线索与提示机制已整体下线，useHint 只留空壳防旧调用 */
  function useHint() { /* no-op */ }

  /* 第⑪条：单人右栏备忘录——尺寸/位置完全沿用房间聊天框，只是换了个名字。
     内容存在 localStorage，刷新不丢；进多人房时由 room-ui 藏起来让位给聊天框。 */
  function initSoloMemo() {
    var box = $("#solo-memo");
    var ta = $("#solo-memo-text");
    if (!box || !ta) return;
    var KEY = "soup.memo.v1";
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) ta.value = saved;
    } catch (e) { /* 隐私模式 */ }
    var tm = 0;
    ta.addEventListener("input", function () {
      clearTimeout(tm);
      tm = setTimeout(function () {
        try { localStorage.setItem(KEY, ta.value); } catch (e) { /* 忽略 */ }
      }, 400);
    });
    var tg = $("#btn-solo-memo-toggle");
    if (tg) tg.addEventListener("click", function () {
      var open = !box.classList.contains("collapsed");
      box.classList.toggle("collapsed", open);
      tg.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  /* ---------------- 猜汤底 ---------------- */

  var lastFocus = null;

  /* 双端适配：弹窗打开时收起浮动音乐台，小屏才不会被挡住 */
  function syncModalClass() {
    var open = $$(".modal-wrap").filter(function (m) { return !m.classList.contains("hidden"); });
    document.body.classList.toggle("modal-open", open.length > 0);
  }

  function openModal(sel, focusSel) {
    lastFocus = document.activeElement;
    var m = $(sel);
    if (!m) return;
    m.classList.remove("hidden");
    syncModalClass();
    var f = focusSel ? $(focusSel) : null;
    if (f) setTimeout(function () { f.focus(); }, 30);
  }

  function closeModal(sel) {
    var m = $(sel);
    if (m) m.classList.add("hidden");
    syncModalClass();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { } }
  }

  function openGuess() {
    if (!state.pid || state.done) return;
    var fb = $("#guess-feedback");
    if (fb) { fb.textContent = ""; fb.className = "guess-feedback"; }
    var gi = $("#guess-input");
    if (gi) gi.value = "";
    openModal("#modal-guess", "#guess-input");
    sfx("ui");
  }

  function submitGuess() {
    var p = E.getPuzzle(state.pid);
    var gi = $("#guess-input");
    var fb = $("#guess-feedback");
    if (!p || !gi || !fb) return;
    var text = gi.value.trim();
    if (!text) { fb.textContent = "先写下你的推理，再交给汤主。"; fb.className = "guess-feedback no"; return; }

    /* 库层没有预设答案词，只能让 AI 汤主来判定 */
    if (isLib(p) && !aiOn()) {
      fb.textContent = "汤库这一锅没有预设答案词，得先配好 AI 汤主。";
      fb.className = "guess-feedback no";
      return;
    }

    addLine("me", "", esc(text), "我的推理");
    sfx("paper");
    state.qCount++;

    /* 关键词判定：AI 在值班时只作内部参考不上屏（判定由 AI 负责）；
       纯离线时它就是正式汤主，直接上屏 */
    var j = E.judgeGuess(p, text);

    if (aiOn()) {
      /* 只显示「正在判断」，不让同步的关键词结果抢跑误导玩家 */
      fb.textContent = "AI 汤主正在判断你的推理…";
      fb.className = "guess-feedback";
      var pend = addLine("host", "pending", '<b class="verdict irr">…</b> AI 汤主正在判断你的推理', "AI");
      var book = function (lvl, note) {
        fb.textContent = note;
        fb.className = "guess-feedback " + (lvl === "solved" ? "ok" : (lvl === "close" || lvl === "vague") ? "close" : "no");
      };

      AI.judgeGuess(p, text).then(function (out) {
        if (pend && pend.parentNode) pend.parentNode.removeChild(pend);
        if (state.pid !== p.id || state.done) return;
        book(out.level, out.note);
        state.history.push({ q: "【推理】" + text, a: out.note });
        renderQaLog();   /* 单①：推理入账后同样立刻刷新左栏 */
        if (out.level === "solved") {
          var ln = addLine("host", "yes", '<b class="verdict yes">对了</b> ' + esc(qaStrip("对了", out.note)), "AI 判定");
          sfx("win");
          if (FX) {
            /* 说破瞬间弹窗马上要盖上来：庆祝改画在前景层，不再被遮罩糊掉 */
            if (ln) FX.burstFrontAt(ln, { count: 90, power: 1.4, colors: ["#ffd166", "#f6cf90", "#68cf9a", "#ffe9c4", "#ff8f6e"] });
            FX.burstFront(window.innerWidth / 2, window.innerHeight * 0.34, { count: 150, power: 1.8 });
          }
          setTimeout(function () { finish(); }, 520);
        } else {
          addLine("host", out.level === "close" ? "partial" : "irr", esc(qaStrip(out.level === "close" ? "部分正确" : "", out.note)), "AI 判定");
          sfx(out.level === "close" ? "partial" : "lose");
          renderStats();
        }
        paintAiBar();
      }, function (err) {
        if (pend && pend.parentNode) pend.parentNode.removeChild(pend);
        if (state.pid !== p.id || state.done) return;
        var why = AI.describeError(err);
        /* 掉线：不显示任何关键词判定，只提示重试，也不计入历史 */
        state.qCount = Math.max(0, state.qCount - 1);
        fb.textContent = "AI 汤主掉线了，请重新提交推理。";
        fb.className = "guess-feedback no";
        paintAiBar("AI 没接上（" + why + "）。", "ai-warn");
        toast("AI 掉线了：" + why);
        renderStats();
      });
      return;
    }

    /* 纯离线：精品层走关键词判定（与 Worker 未配 AI 口径一致）——j 已在上面算好。
       库层没有预设答案词，已在上面拦掉，走不到这里。 */
    var lvl = j.level;
    var kwNote = j.note;
    fb.textContent = kwNote;
    fb.className = "guess-feedback " + (lvl === "solved" ? "ok" : (lvl === "close" || lvl === "vague") ? "close" : "no");
    state.history.push({ q: "【推理】" + text, a: kwNote });
    renderQaLog();
    if (lvl === "solved") {
      var kwLn = addLine("host", "yes", '<b class="verdict yes">对了</b> ' + esc(qaStrip("对了", kwNote)), "关键词汤主");
      sfx("win");
      if (FX) {
        if (kwLn) FX.burstFrontAt(kwLn, { count: 90, power: 1.4, colors: ["#ffd166", "#f6cf90", "#68cf9a", "#ffe9c4", "#ff8f6e"] });
        FX.burstFront(window.innerWidth / 2, window.innerHeight * 0.34, { count: 150, power: 1.8 });
      }
      setTimeout(function () { finish(); }, 520);
    } else {
      addLine("host", lvl === "close" ? "partial" : "irr", esc(qaStrip(lvl === "close" ? "部分正确" : "", kwNote)), "关键词汤主");
      sfx(lvl === "close" ? "partial" : "lose");
      renderStats();
    }
  }

  function finish(fallbackStars) {
    var p = E.getPuzzle(state.pid);
    if (!p) return;
    var lib = isLib(p);
    state.done = true;
    /* 熬出汤底（不管星级）：本地打上「已熬出汤底」绿勾 */
    markSolved(p.id, true);
    /* 两层快照各清各的，绝不互删 */
    if (lib) {
      var lp = libProgress();
      lp.session = null;
      saveLibProgress(lp);
    } else {
      progress.session = null;
    }
    closeModal("#modal-guess");

    /* 阶段 1：跨局存档已砍。星级只做本锅的当场结算，不写回任何存档 */
    var st = typeof fallbackStars === "number" ? fallbackStars : E.stars(p, state.qCount, state.hintsUsed);

    /* 1 星（提示用光 / 熬太久）走「汤凉了」的灰调场景：sad 与 bg-gate 不再是死资源 */
    setScene(st <= 1 ? "sad" : "win");
    sfx("reveal");
    if (FX) {
      FX.surge(5);
      FX.burstFront(window.innerWidth / 2, window.innerHeight * 0.3, { count: 160, power: 1.8 });
    }

    set("#end-stars", new Array(st + 1).join("★") + new Array(4 - st).join("☆"));
    set("#end-note", "提问 " + state.qCount + " 次 · " + E.starNote(st));

    /* 汤底：库层的汤底只在服务端，凭「已揭晓的房号」取；精品层仍走本地。
       取不到（掉线 / 未揭晓）就老实说不显示，绝不瞎编。 */
    var meta =
      '<p style="margin:0;color:#a97b38;font-size:12.5px;letter-spacing:.1em;">汤底（真相）' +
      (p.truth && p.truthSource === "recovered" ? " · 已补底" : "") +
      "</p>";
    var body = p.truth
      ? meta + '<p style="margin:0">' + esc(p.truth) + "</p>"
      : meta + '<p style="margin:0;color:#8a8a8a">（这一锅的汤底还在熬…）</p>';
    $("#end-truth").innerHTML = body;

    /* 库题：异步向服务端要汤底，拿到再补上 */
    if (isLib(p)) fetchLibTruth(p).then(function (t) {
      if (!t || state.pid !== p.id) return;
      var el = $("#end-truth");
      if (el) el.innerHTML = meta + '<p style="margin:0">' + esc(t) + "</p>";
    });

    openModal("#modal-end", "#btn-next");
    renderStats();
    renderQaLog();
    paintResume();
    renderTip("这锅熬完了。换一道汤，试试不同的味道？");
  }

  /* 汤底只在服务端：库题向 Worker 要，要不到就返回空串（不报错、不瞎编） */
  function fetchLibTruth(p) {
    if (!p || !isLib(p)) return Promise.resolve("");
    var net = window.SoupNet;
    if (!net || !net.libTruth) return Promise.resolve("");
    /* 先试库层自己的单人房；没有就试多人房号（多人房里熬完也算揭晓） */
    var codes = [];
    try {
      var ls = localStorage.getItem(LIB_KEY);
      var o = ls ? JSON.parse(ls) : null;
      if (o && o.roomCode) codes.push(o.roomCode);
    } catch (e) { /* 忽略 */ }
    if (state.roomCode) codes.push(state.roomCode);
    if (net.me && net.me.roomCode) codes.push(net.me.roomCode);
    if (!codes.length) return Promise.resolve("");

    var i = 0;
    function attempt() {
      if (i >= codes.length) return Promise.resolve("");
      var c = codes[i++];
      return net.libTruth(c, p.id).then(function (t) {
        return t ? t : attempt();
      });
    }
    return attempt().catch(function () { return ""; });
  }

  function nextPuzzle() {
    /* 库题继续从库里抽，精品题继续从精品层抽。
       「下一锅」也是随机抽取：同样走未成年模式 + 近期抽取记录（Q15/Q18）。
       纯离线联动：本机没配 AI 时库层不可玩，库局「下一锅」退回精品层。 */
    var lib = isLibPid(state.pid) && aiOn();
    if (lib && !soupLib().length) {
      toast("正在开汤库…");
      return ensureSoupLib().catch(function () { }).then(nextPuzzle);
    }
    var sel = flavorSel("", "", []);
    var ex = E.recentExcludes();
    var nxt = lib
      ? E.drawFromLibrary(soupLib(), { hasTruth: true, flavor: sel, minor: minorOn() }, ex)
      : E.drawFrom(E.pool({ flavor: sel, minor: minorOn() }), ex);
    if (nxt) E.recordRecent(nxt.id);
    closeModal("#modal-end");
    if (nxt) loadPuzzle(nxt.id);
  }

  function backToList() {
    closeModal("#modal-end");
    if (root.SoupRoom && root.SoupRoom.stopQaScroll) root.SoupRoom.stopQaScroll();
    sceneWipe(function () {
      $("#screen-game").classList.add("hidden");
      $("#screen-random").classList.add("hidden");
      var sl = $("#screen-library");
      if (sl) sl.classList.add("hidden");
      $("#screen-intro").classList.remove("hidden");
      state.pid = null;
      setScene("menu");
      renderQaLog();
      paintResume();
      var l = $("#btn-start");
      if (l) l.focus();
    });
  }

  /* ---------------- 随机模式 ---------------- */

  var RAND_DIFFS = [
    { v: 0, label: "不限" },
    { v: 1, label: "● 清淡" },
    { v: 2, label: "●● 适中" },
    { v: 3, label: "●●● 浓郁" }
  ];

  function randOpts() {
    return {
      cat: state.randCat,
      difficulty: state.randDiff,
      flavor: flavorSel(state.randStyle, state.randTone, state.randOpt),
      minor: minorOn()
    };
  }

  /* 阶段 1：跨局「最近抽过」记录已砍，随机抽题不再排除历史
     —— 2026-09-29 又请回来了：近 50 题滚动记录（soup.recent.v1），
     单人三个随机入口互相避开，池子筛空自动放宽（见 engine.js）。 */

  function renderRandom() {
    var dbox = $("#rand-diff");
    if (dbox) {
      dbox.innerHTML = RAND_DIFFS.map(function (d) {
        return '<button type="button" class="chip diff' + (d.v === state.randDiff ? " on" : "") +
          '" data-diff="' + d.v + '" aria-pressed="' + (d.v === state.randDiff ? "true" : "false") + '">' + esc(d.label) + "</button>";
      }).join("");
      $$(".chip", dbox).forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.randDiff = Number(btn.dataset.diff) || 0;
          sfx("ui");
          renderRandom();
        });
      });
    }

    var cbox = $("#rand-cats");
    if (cbox) {
      var cats = ["全部"].concat(E.allCats(PUZZLES));
      cbox.innerHTML = cats.map(function (c) {
        return '<button type="button" class="chip cat' + (c === state.randCat ? " on" : "") +
          '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("");
      $$(".chip", cbox).forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.randCat = btn.dataset.cat;
          sfx("ui");
          renderRandom();
        });
      });
    }

    renderFlavorChips($("#rand-flavor"), {
      style: state.randStyle,
      tone: state.randTone,
      optional: state.randOpt
    }, function (next) {
      state.randStyle = next.style;
      state.randTone = next.tone;
      state.randOpt = next.optional;
      renderRandom();
    });

    var total = E.poolSize({ cat: state.randCat, difficulty: state.randDiff, flavor: randOpts().flavor, minor: minorOn() });
    var poolEl = $("#rand-pool");
    if (poolEl) {
      poolEl.textContent = total === 0
        ? "这个条件下暂时没有汤，换个题材或火候试试"
        : total + " 道可选";
    }
    var go = $("#btn-rand-go");
    if (go) go.disabled = total === 0;
  }

  /* ---------------- 风味筛选 chips（随机模式 / 汤库共用） ----------------
   * 两组互斥项（本格/变格、清汤/红汤）做成单选，三个可选项做开关；
   * AND 语义，不选 = 不限。未成年模式下红汤 / 黄汤 chip 不渲染（隐藏不可解）。
   * onChange(sel) 回传 { style, tone, optional }。 */
  function renderFlavorChips(box, sel, onChange) {
    if (!box) return;
    var minor = minorOn();
    var html = "";
    E.FLAVOR_AXES.forEach(function (axis, ai) {
      if (ai > 0) html += '<span class="flavor-sep" aria-hidden="true"></span>';
      axis.forEach(function (v) {
        if (minor && E.MINOR_BLOCKED.indexOf(v) !== -1) return;
        var slot = ai === 0 ? "style" : "tone";
        var on = sel[slot] === v;
        html += '<button type="button" class="chip flavor f-' + v + (on ? " on" : "") +
          '" data-axis="' + slot + '" data-val="' + esc(v) + '"' +
          ' aria-pressed="' + (on ? "true" : "false") + '">' + esc(v) + "</button>";
      });
    });
    var anyOpt = E.FLAVOR_OPTIONAL.filter(function (v) {
      return !(minor && E.MINOR_BLOCKED.indexOf(v) !== -1);
    });
    if (anyOpt.length) html += '<span class="flavor-sep" aria-hidden="true"></span>';
    E.FLAVOR_OPTIONAL.forEach(function (v) {
      if (minor && E.MINOR_BLOCKED.indexOf(v) !== -1) return;
      var on = (sel.optional || []).indexOf(v) !== -1;
      html += '<button type="button" class="chip flavor f-' + v + (on ? " on" : "") +
        '" data-axis="optional" data-val="' + esc(v) + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '">' + esc(v) + "</button>";
    });
    box.innerHTML = html;
    $$(".chip.flavor", box).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var axis = btn.dataset.axis;
        var v = btn.dataset.val;
        if (axis === "style") sel.style = (sel.style === v ? "" : v);
        else if (axis === "tone") sel.tone = (sel.tone === v ? "" : v);
        else {
          var i = (sel.optional = sel.optional || []).indexOf(v);
          if (i === -1) sel.optional.push(v);
          else sel.optional.splice(i, 1);
        }
        sfx("ui");
        onChange(sel);
      });
    });
  }

  /* 从「多人汤屋」切走时：收起房间面板 + 停掉房间轮询 + 藏右下角聊天，
     免得房间界面 / 聊天框和汤库、随机模式、单人对局叠在一起 */
  function leaveRoomScreen() {
    var sr = $("#screen-room");
    if (sr && !sr.classList.contains("hidden")) {
      if (window.SoupRoom && window.SoupRoom.leaveScreen) window.SoupRoom.leaveScreen();
      else sr.classList.add("hidden");
    }
    document.body.classList.remove("room-mode");
    if (window.SoupRoom && window.SoupRoom.syncChat) window.SoupRoom.syncChat();
    /* 汤主的话跟看回来：回到右栏线索板下面 */
    if (window.SoupRoom && window.SoupRoom.syncTip) window.SoupRoom.syncTip();
  }

  function openRandom() {
    setScene("menu");
    leaveRoomScreen();
    $("#screen-intro").classList.add("hidden");
    $("#screen-game").classList.add("hidden");
    $("#screen-random").classList.remove("hidden");
    renderRandom();
    sfx("ui");
  }

  function backFromRandom() {
    $("#screen-random").classList.add("hidden");
    $("#screen-intro").classList.remove("hidden");
    setScene("menu");
    renderQaLog();
    sfx("ui");
  }

  function drawRandom() {
    var p = E.randomFrom(randOpts(), E.recentExcludes());
    if (!p) { toast("这个条件下暂时没有可抽的汤，放宽一点试试"); return; }
    E.recordRecent(p.id);
    toast("抽到：" + p.title);
    loadPuzzle(p.id);
  }

  /* 首页/顶栏「随机一题」：精品 + 汤库全部可抽，不再只在精品 100 里转。
     库题走本地真汤底。按体量加权：库大就更容易抽到库题，但精品至少占 1/6。
     未成年模式与风味筛选（默认不限）在这里同样生效；近期抽过的题优先避开。
     无筛选的随机入口不选语言梗题（默认禁用，见 ADR 0002）。
     纯离线联动：库题没有关键词表、判定必须走 AI 汤主，本机没配 AI 时
     整层不进抽取池，连 2MB 的汤库档都不必拉。 */
  function randomAnywhere() {
    /* 按体量加权要拿全库体量：汤库还没加载就先等（加载失败则退回精品层） */
    if (aiOn() && !soupLib().length) {
      return ensureSoupLib().catch(function () { }).then(function () { return randomAnywhere(); });
    }
    var sel = flavorSel("", "", []);
    var minor = minorOn();
    var ex = E.recentExcludes();
    var libList = aiOn() ? soupLib() : [];
    var corePool = E.pool({ flavor: sel, minor: minor });
    var libAvail = libList.length ? E.drawFromLibrary(libList, { hasTruth: true, flavor: sel, minor: minor }, ex) : null;
    var coreAvail = corePool.length ? E.drawFrom(corePool, ex) : null;
    var libWeight = libList.length;
    var coreWeight = corePool.length ? Math.max(corePool.length, Math.ceil(libWeight / 5)) : 0;
    var total = libWeight + coreWeight;
    if (total <= 0) return coreAvail || libAvail;
    var roll = Math.random() * total;
    if (roll < libWeight) return libAvail || coreAvail;
    return coreAvail || libAvail;
  }

  /* ---------------- 汤库模式 ---------------- */

  var LIB_DIFFS = [
    { v: 0, label: "不限" },
    { v: 1, label: "● 清淡" },
    { v: 2, label: "●● 适中" },
    { v: 3, label: "●●● 浓郁" }
  ];

  /* 库层难度：只有 1/2/3，没有 par */
  function libDiffDots(d) {
    var n = Number(d);
    if (!isFinite(n) || n < 1 || n > 3) n = 2;
    return new Array(n + 1).join("●") + new Array(4 - n).join("○");
  }

  /* 来源短名：github:owner/repo → owner，免得筛选条被长串撑爆 */
  function libShortSrc(s) {
    var v = String(s || "");
    if (!v) return "未知";
    if (v.indexOf("github:") === 0) return v.slice(7).split("/")[0] || v;
    return v;
  }

  function libraryFiltered() {
    var list = E.searchLibrary(mergedLib(), libState.kw);
    /* 纯离线联动：lib_* 没有关键词表、判定必须走 AI 汤主，本机没配 AI 就不查出；
       精品层条目（coreAsLib，id 无 lib_ 前缀）自带完整汤底，保留 */
    if (!aiOn()) list = list.filter(function (p) { return !isLib(p); });
    return E.libraryPool(list, {
      cat: libState.cat,
      difficulty: libState.difficulty,
      src: libState.src,
      hasTruth: libState.hasTruth,
      lang: libState.en ? "en" : "",
      flavor: flavorSel(libState.style, libState.tone, libState.opt),
      minor: minorOn()
    });
  }

  /* 汤库卡片上的风味徽章（紧凑一行，语言梗为虚线边框样式） */
  function flavorBadges(p) {
    var f = E.flavorOf(p);
    if (!f.length) return "";
    var minor = minorOn();
    var parts = f.map(function (t) {
      if (minor && E.MINOR_BLOCKED.indexOf(t) !== -1) return "";
      return '<span class="fbadge fb-' + t + '">' + esc(t) + "</span>";
    });
    return parts.join("") ? '<div class="fbadges">' + parts.join("") + "</div>" : "";
  }

  function libSrcList() {
    var seen = {}, out = [];
    mergedLib().forEach(function (p) {
      if (p && p.src && !seen[p.src]) { seen[p.src] = 1; out.push(p.src); }
    });
    out.sort();
    return out;
  }

  function renderLibraryFilters() {
    var cbox = $("#lib-cat");
    if (cbox) {
      var cats = ["全部"].concat(E.libraryCats(mergedLib()));
      cbox.innerHTML = cats.map(function (c) {
        return '<button type="button" class="chip cat' + (c === libState.cat ? " on" : "") +
          '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("");
      $$(".chip", cbox).forEach(function (btn) {
        btn.addEventListener("click", function () {
          libState.cat = btn.dataset.cat;
          libState.page = 1;
          sfx("ui");
          renderLibraryFilters();
          renderLibrary();
        });
      });
    }

    var dbox = $("#lib-diff");
    if (dbox) {
      dbox.innerHTML = LIB_DIFFS.map(function (d) {
        return '<button type="button" class="chip diff' + (d.v === libState.difficulty ? " on" : "") +
          '" data-diff="' + d.v + '" aria-pressed="' + (d.v === libState.difficulty ? "true" : "false") + '">' +
          esc(d.label) + "</button>";
      }).join("");
      $$(".chip", dbox).forEach(function (btn) {
        btn.addEventListener("click", function () {
          libState.difficulty = Number(btn.dataset.diff) || 0;
          libState.page = 1;
          sfx("ui");
          renderLibraryFilters();
          renderLibrary();
        });
      });
    }

    var sbox = $("#lib-src");
    if (sbox) {
      var srcs = ["全部"].concat(libSrcList());
      sbox.innerHTML = srcs.map(function (s) {
        return '<button type="button" class="chip' + (s === libState.src ? " on" : "") +
          '" data-src="' + esc(s) + '" title="' + esc(s) + '">' + esc(libShortSrc(s)) + "</button>";
      }).join("");
      $$(".chip", sbox).forEach(function (btn) {
        btn.addEventListener("click", function () {
          libState.src = btn.dataset.src;
          libState.page = 1;
          sfx("ui");
          renderLibraryFilters();
          renderLibrary();
        });
      });
    }

    renderFlavorChips($("#lib-flavor"), {
      style: libState.style,
      tone: libState.tone,
      optional: libState.opt
    }, function (next) {
      libState.style = next.style;
      libState.tone = next.tone;
      libState.opt = next.optional;
      libState.page = 1;
      renderLibraryFilters();
      renderLibrary();
    });
  }

  /* 分页渲染：1374 条全量 innerHTML 会把移动端拖卡，必须切片 */
  function renderLibrary() {
    var box = $("#lib-list");
    if (!box) return;
    var list = libraryFiltered();
    var show = list.slice(0, libState.page * LIB_PAGE_SIZE);

    if (!list.length) {
      box.innerHTML = '<p class="pz-empty">这个组合下暂时没有汤。<br />换个题材或来源试试。</p>';
    } else {
      box.innerHTML = show.map(function (p) {
        var solv = isSolved(p.id);
        return '<button type="button" role="listitem" class="pz-card lib-card' + (solv ? " solved" : "") +
          '" data-lib-id="' + esc(p.id) +
          '" aria-label="' + esc(p.dispTitle) + '，难度' + p.difficulty + '">' +
          /* 绿勾：点一下把这个汤标成「已熬出汤底」/ 再点取消；不影响进汤 */
          '<span class="pz-check' + (solv ? " on" : "") + '" data-check="' + esc(p.id) + '" role="checkbox" ' +
          'aria-checked="' + (solv ? "true" : "false") + '" title="标记为已熬出汤底">' + (solv ? ic("check") : "") + "</span>" +
          '<div class="pz-title">' + esc(p.dispTitle) + "</div>" +
          '<div class="pz-meta"><span class="pz-diff" aria-hidden="true">' + libDiffDots(p.difficulty) + "</span>" +
          "<span>" + esc(libShortSrc(p.src)) + "</span>" +
          (p.truthSource === "recovered" ? '<span class="lib-notruth">已补底</span>' : "") +
          "</div>" +
          '<div class="pz-cats">' + (p.cats || []).map(function (c) {
            return '<span class="pz-cat">' + esc(c) + "</span>";
          }).join("") + "</div>" +
          flavorBadges(p) +
          "</button>";
      }).join("");
      /* 小绿勾：拦截冒泡，只做标记，不进汤 */
      $$(".pz-check", box).forEach(function (ck) {
        ck.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var id = ck.getAttribute("data-check");
          var on = toggleSolved(id);
          ck.classList.toggle("on", on);
          ck.innerHTML = on ? ic("check") : "";
          ck.setAttribute("aria-checked", on ? "true" : "false");
          var card = ck.closest ? ck.closest(".pz-card") : null;
          if (card) card.classList.toggle("solved", on);
          sfx(on ? "ui" : "ui");
          toast(on ? "已标记：这道汤你熬出过汤底" : "已取消标记");
        });
      });
      $$(".pz-card", box).forEach(function (card) {
        card.addEventListener("click", function () { loadPuzzle(card.dataset.libId); });
      });
    }

    var badge = $("#lib-count");
    if (badge) badge.textContent = show.length + " / " + list.length;
    /* 纯离线联动：库题整层隐藏时给一句说明，免得「1942 道去哪了」 */
    var off = $("#lib-offline-note");
    if (off) off.classList.toggle("hidden", aiOn());
    var more = $("#btn-lib-more");
    if (more) more.classList.toggle("hidden", show.length >= list.length);
  }

  function openLibrary() {
    if (aiOn() && !soupLib().length) {
      toast("正在开汤库…");
      return ensureSoupLib().catch(function () { }).then(openLibrary);
    }
    setScene("menu");
    leaveRoomScreen();
    $("#screen-intro").classList.add("hidden");
    $("#screen-game").classList.add("hidden");
    var r = $("#screen-random");
    if (r) r.classList.add("hidden");
    $("#screen-library").classList.remove("hidden");
    renderLibraryFilters();
    renderLibrary();
    sfx("ui");
  }

  function backFromLibrary() {
    $("#screen-library").classList.add("hidden");
    $("#screen-intro").classList.remove("hidden");
    setScene("menu");
    renderQaLog();
    sfx("ui");
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    /* ---------------- 顶栏吸顶（2026-09-29 重影修复） ----------------
       大顶栏已是普通文档流（style.css 同步改），随页面自然滚走；
       吸顶导航 = 覆盖式紧凑条（.topbar-compact，fixed 不占布局流）。
       旧版在同一根 sticky 顶栏上 display:none 品牌行：移动端一次切换
       整页内容瞬移 200px+，滚动被拉回阈值附近再反向切换——边界处两种
       布局交替抽搐（重影）。覆盖层方案从机制上消灭这个布局位移。 */
    var topbarEl = $(".topbar");
    var compactBar = null;
    var tbH = 90;
    var lastStuck = false;
    /* 面板开合统一入口：buildCompactBar 里赋值；updateStuck 收条时也要用 */
    var compactSetOpen = function () {};

    function buildCompactBar() {
      if (!topbarEl || compactBar) return;
      compactBar = document.createElement("header");
      compactBar.className = "topbar-compact";
      compactBar.setAttribute("aria-label", "吸顶导航");

      /* 左上：APP 名（移动端收拢横条的主体；桌面隐藏） */
      var brand = document.createElement("div");
      brand.className = "tc-brand";
      brand.innerHTML = ic("pot") + '<span class="tc-brand-name">深海汤屋</span>';

      /* 右上：配置钮（移动端展开/收起导航面板；桌面隐藏） */
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn ghost tc-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "展开导航");
      toggle.innerHTML = ic("sliders");

      /* 导航按钮：克隆自大顶栏（跳过音乐台——吸顶态本来就不显示它）。
         克隆体不带 id，点击转发给原按钮，原有绑定/音效/状态逻辑原样生效；
         桌面=平铺一行（与旧版吸顶条一致），移动端=折叠进 .tc-nav 面板 */
      var nav = document.createElement("nav");
      nav.className = "tc-nav";
      var actions = topbarEl.querySelector(".top-actions");
      var kids = actions ? actions.children : [];
      for (var i = 0; i < kids.length; i++) {
        var src = kids[i];
        if (!src.classList.contains("btn") || !src.id) continue;
        var b = src.cloneNode(true);
        b.removeAttribute("id");
        b.dataset.act = src.id;
        nav.appendChild(b);
      }
      compactBar.appendChild(brand);
      compactBar.appendChild(toggle);
      compactBar.appendChild(nav);
      document.body.appendChild(compactBar);

      compactSetOpen = function (on) {
        compactBar.classList.toggle("tc-open", !!on);
        toggle.setAttribute("aria-expanded", on ? "true" : "false");
        toggle.setAttribute("aria-label", on ? "收起导航" : "展开导航");
        toggle.innerHTML = ic(on ? "close" : "sliders");
      };

      toggle.addEventListener("click", function () {
        compactSetOpen(!compactBar.classList.contains("tc-open"));
        sfx("ui");
      });

      compactBar.addEventListener("click", function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-act]") : null;
        if (!t || !t.dataset.act) return;
        var real = document.getElementById(t.dataset.act);
        if (real) real.click();
        compactSetOpen(false); /* 点完导航项顺手收起面板 */
      });
      /* 点面板外任意处收起（toggle 自身在条内，closest 会放行） */
      document.addEventListener("click", function (ev) {
        if (!compactBar.classList.contains("tc-open")) return;
        if (ev.target && ev.target.closest && ev.target.closest(".topbar-compact")) return;
        compactSetOpen(false);
      });

      syncCompact();
      /* 原按钮的文案/按压态变化（AI 汤主开关、音乐/音效/特效切换）同步到紧凑条；
         只观察大顶栏子树，syncCompact 写的是紧凑条，不会自触发成死循环 */
      if (typeof MutationObserver === "function") {
        new MutationObserver(syncCompact).observe(topbarEl, {
          subtree: true, attributes: true, attributeFilter: ["aria-pressed", "class", "style"]
        });
      }
    }

    function syncCompact() {
      if (!compactBar || !topbarEl) return;
      var navEl = compactBar.querySelector(".tc-nav");
      if (!navEl) return;
      var src = topbarEl.querySelectorAll(".top-actions > .btn[id]");
      var dst = navEl.children;
      for (var i = 0; i < src.length && i < dst.length; i++) {
        if (dst[i].dataset.act !== src[i].id) continue;
        if (dst[i].innerHTML !== src[i].innerHTML) dst[i].innerHTML = src[i].innerHTML;
        var p = src[i].getAttribute("aria-pressed");
        if (p == null) dst[i].removeAttribute("aria-pressed");
        else dst[i].setAttribute("aria-pressed", p);
      }
    }

    function measureTopbar() {
      if (topbarEl && topbarEl.offsetHeight) tbH = topbarEl.offsetHeight;
    }

    function updateStuck() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      /* 迟滞：滚过大顶栏大半（距顶 32px）才亮出紧凑条；回滚到 48px 内才收起。
         旧版单阈值 >12 没有布局位移护航，边界处来回报销；现在即便反复跨越，
         紧凑条也是覆盖层，页面内容纹丝不动。 */
      var s = lastStuck ? y > tbH - 48 : y > tbH - 32;
      if (s !== lastStuck) {
        lastStuck = s;
        document.body.classList.toggle("topbar-stuck", s);
        /* 吸顶条退场时，展开中的导航面板一并收起 */
        if (!s) compactSetOpen(false);
      }
    }

    buildCompactBar();
    measureTopbar();
    window.addEventListener("resize", measureTopbar);
    window.addEventListener("scroll", updateStuck, false);
    updateStuck();

    var startBtn = $("#btn-start");
    if (startBtn) startBtn.addEventListener("click", function () {
      /* 「从第一题开始」按顺序取第一锅符合当前口径（未成年模式）的精品题 */
      var first = PUZZLES[0];
      var sel = flavorSel("", "", []);
      for (var i = 0; i < PUZZLES.length; i++) {
        if (E.matchFlavor(PUZZLES[i], sel, minorOn())) { first = PUZZLES[i]; break; }
      }
      loadPuzzle(first.id);
    });

    var resumeBtn = $("#btn-resume");
    if (resumeBtn) resumeBtn.addEventListener("click", resumeSession);

    var randBtn = $("#btn-start-random");
    if (randBtn) randBtn.addEventListener("click", function () {
      var r = randomAnywhere();
      if (r) { E.recordRecent(r.id); loadPuzzle(r.id); }
    });

    var topRand = $("#btn-random");
    if (topRand) topRand.addEventListener("click", function () {
      var r = randomAnywhere();
      if (r) { E.recordRecent(r.id); loadPuzzle(r.id); toast("随机一锅：" + (r.dispTitle || r.title)); }
    });

    /* 随机模式：按题材 / 火候 / 是否熬过 抽题 */
    var rmBtn = $("#btn-random-mode");
    if (rmBtn) rmBtn.addEventListener("click", openRandom);

    /* 未成年模式：首页开关（开启免密 / 关闭走密码门，ADR 0004） */
    var minorBtn = $("#btn-minor");
    if (minorBtn) minorBtn.addEventListener("click", toggleMinorFromIntro);

    var rGo = $("#btn-rand-go");
    if (rGo) rGo.addEventListener("click", drawRandom);

    var rBack = $("#btn-rand-back");
    if (rBack) rBack.addEventListener("click", backFromRandom);

    /* 汤库模式：浏览 / 搜索 / 筛选 / 分页 */
    var libBtn = $("#btn-library");
    if (libBtn) libBtn.addEventListener("click", openLibrary);

    /* 中区问答记录：清空本局记录（汤库入口由顶栏「汤库」统一提供） */
    var qaClear = $("#btn-qa-clear");
    if (qaClear) qaClear.addEventListener("click", function () {
      state.history = [];
      clearQaLog();
      sfx("ui");
      toast("本局问答记录已清空");
    });

    var libBack = $("#btn-lib-back");
    if (libBack) libBack.addEventListener("click", backFromLibrary);

    var libMore = $("#btn-lib-more");
    if (libMore) libMore.addEventListener("click", function () {
      libState.page++;
      sfx("ui");
      renderLibrary();
    });

    /* 搜索防抖 200ms：1521 条逐键全量过滤会卡手 */
    var libSearch = $("#lib-search");
    if (libSearch) {
      var libTimer = null;
      libSearch.addEventListener("input", function () {
        clearTimeout(libTimer);
        libTimer = setTimeout(function () {
          libState.kw = libSearch.value.trim();
          libState.page = 1;
          renderLibrary();
        }, 200);
      });
    }

    var libTruth = $("#lib-truth-only");
    if (libTruth) libTruth.addEventListener("click", function () {
      libState.hasTruth = !libState.hasTruth;
      libState.page = 1;
      libTruth.classList.toggle("on", libState.hasTruth);
      libTruth.setAttribute("aria-pressed", libState.hasTruth ? "true" : "false");
      sfx("ui");
      renderLibrary();
    });

    var libEn = $("#lib-en");
    if (libEn) libEn.addEventListener("click", function () {
      libState.en = !libState.en;
      libState.page = 1;
      libEn.classList.toggle("on", libState.en);
      libEn.setAttribute("aria-pressed", libState.en ? "true" : "false");
      sfx("ui");
      renderLibrary();
    });

    /* 音效开关 */
    var snd = $("#btn-sound");
    if (snd) {
      var paintSnd = function () {
        snd.innerHTML = (state.sound ? ic("volume") : ic("mute")) + (state.sound ? " 音效" : " 静音");
        snd.setAttribute("aria-pressed", state.sound ? "true" : "false");
      };
      paintSnd();
      snd.addEventListener("click", function () {
        state.sound = !state.sound;
        if (AU) AU.setSfxOn(state.sound);
        paintSnd(); saveProgress();
        if (state.sound) sfx("pick");
      });
    }

    /* 音乐开 / 关 */
    var bm = $("#btn-music");
    if (bm) bm.addEventListener("click", toggleMusic);
    var dm = $("#dock-mute");
    if (dm) dm.addEventListener("click", toggleMusic);

    /* 氛围特效开 / 关 */
    var bfx = $("#btn-fx");
    if (bfx) bfx.addEventListener("click", toggleFx);

    /* 播放 / 暂停 */
    var bp = $("#btn-play");
    if (bp) bp.addEventListener("click", togglePlay);
    var dp = $("#dock-play");
    if (dp) dp.addEventListener("click", togglePlay);

    /* 音量 */
    var vol = $("#vol");
    if (vol) vol.addEventListener("input", function () { setVolume(Number(vol.value) / 100); });

    /* 快捷键：M 静音音乐 / 空格在非输入状态暂停音乐 */
    document.addEventListener("keydown", function (ev) {
      var t = ev.target;
      var typing = t && t.closest && t.closest("input,textarea,select,[contenteditable]");
      if (typing) return;
      if (ev.key === "m" || ev.key === "M") { ev.preventDefault(); toggleMusic(); }
      else if (ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); togglePlay(); }
    });

    var wipe = $("#btn-wipe");
    if (wipe) wipe.addEventListener("click", function () {
      if (!window.confirm("清空本局进度与音量偏好？这一步不可撤销。")) return;
      progress = { session: null, sound: state.sound, music: state.music, playing: state.playing, fx: state.fx, volume: state.volume };
      state.history = [];
      saveProgress();
      clearQaLog();
      renderStats();
      sfx("lose");
      toast("存档已清空，重新开锅");
    });

    var askBtn = $("#btn-ask");
    if (askBtn) askBtn.addEventListener("click", submitQuestion);

    var input = $("#q-input");
    if (input) input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); submitQuestion(); }
    });

    /* 第⑥条：提示 / 问问 AI 已下线；第⑪条：右栏换成单人备忘录 */
    initSoloMemo();

    bindAiModal();
    paintIntroOffline();

    var guessBtn = $("#btn-guess");
    if (guessBtn) guessBtn.addEventListener("click", openGuess);

    var unlockBtn = $("#btn-unlock");
    if (unlockBtn) unlockBtn.addEventListener("click", function () {
      /* 第⑥条：单人端「放弃」= 确认后直接上汤底（旧密码权区下线） */
      if (root.SoupRoom && root.SoupRoom.doGiveupSolo) root.SoupRoom.doGiveupSolo();
    });

    var gCancel = $("#btn-guess-cancel");
    if (gCancel) gCancel.addEventListener("click", function () { closeModal("#modal-guess"); });

    var gSubmit = $("#btn-guess-submit");
    if (gSubmit) gSubmit.addEventListener("click", submitGuess);

    var gi = $("#guess-input");
    if (gi) gi.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); submitGuess(); }
    });

    var replay = $("#btn-replay");
    if (replay) replay.addEventListener("click", function () { closeModal("#modal-end"); loadPuzzle(state.pid); });

    var next = $("#btn-next");
    if (next) next.addEventListener("click", nextPuzzle);

    var back = $("#btn-back");
    if (back) back.addEventListener("click", backToList);

    $$(".modal-wrap").forEach(function (wrap) {
      wrap.addEventListener("click", function (ev) {
        if (ev.target === wrap) {
          if (wrap.id === "modal-guess") closeModal("#modal-guess");
          else if (wrap.id === "modal-end") closeModal("#modal-end");
          else if (wrap.id === "modal-ai") closeModal("#modal-ai");
        }
      });
    });

    function openModals() {
      return $$(".modal-wrap").filter(function (m) { return !m.classList.contains("hidden"); });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var open = openModals();
      if (open.length) {
        var last = open[open.length - 1];
        if (last.id === "modal-guess") closeModal("#modal-guess");
        else if (last.id === "modal-end") closeModal("#modal-end");
        else if (last.id === "modal-ai") closeModal("#modal-ai");
      }
    });

    /* 弹窗内 Tab 焦点陷阱，避免焦点跑到背后的页面上 */
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Tab") return;
      var open = openModals();
      if (!open.length) return;
      var focusables = $$("button, textarea, input, select, a[href]", open[open.length - 1]).filter(function (el) {
        return !el.disabled && el.tabIndex !== -1;
      });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });

    /* 首次交互解锁音频上下文 */
    var unlock = function () {
      if (AU) AU.unlock();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    /* 双端适配：手机软键盘弹出时，收起浮动音乐台、给对话区让位
       判定要严：只在「宽度没变 + 焦点在输入框 + 高度院降」时才算键盘，
       否则换屏 / 旋转 / 拖窗口都会被误判（横屏手机最容易中招） */
    (function watchKeyboard() {
      var vv = window.visualViewport;
      var baseW = window.innerWidth;
      var baseH = window.innerHeight;
      var editable = function () {
        var a = document.activeElement;
        return !!(a && a.closest && a.closest("input,textarea,select,[contenteditable]"));
      };
      var apply = function () {
        var w = window.innerWidth;
        var h = vv ? vv.height : window.innerHeight;
        /* 宽度变了 = 旋转 / 换屏，不是键盘：重置基准，不弹 kb-open */
        if (Math.abs(w - baseW) > 24) { baseW = w; baseH = h; }
        else if (h > baseH) { baseH = h; }
        var open = editable() && (baseH - h) > 140;
        document.body.classList.toggle("kb-open", open);
        /* 第①条：把软键盘高度写进 --kbh，聊天框打字时整体抬到键盘上方，
           而不是被 .kb-open 规则连输入框一起藏掉（旧版失焦死循环的根源） */
        try {
          document.documentElement.style.setProperty("--kbh", (open ? Math.max(0, Math.round(baseH - h)) : 0) + "px");
        } catch (e) { /* 忽略 */ }
        if (open) {
          var log = $("#log");
          if (log) log.scrollTop = log.scrollHeight;
        }
      };
      window.addEventListener("resize", apply);
      window.addEventListener("orientationchange", function () {
        /* 旋转后基准完全重算，避免拿旧高度去比 */
        baseW = window.innerWidth;
        baseH = vv ? vv.height : window.innerHeight;
        apply();
      });
      document.addEventListener("focusin", apply);
      document.addEventListener("focusout", function () { setTimeout(apply, 60); });
      if (vv) {
        vv.addEventListener("resize", apply);
        vv.addEventListener("scroll", apply);
      }
      apply();
    })();

    /* 打雷时轻微震动，增强临场感（关掉「特效」时不动） */
    window.addEventListener("soup:lightning", function () {
      if (!state.fx) return;
      if (FX && FX.reduced) return;
      var lay = document.querySelector(".layout");
      if (!lay) return;
      lay.classList.remove("thunder-shake");
      void lay.offsetWidth;
      lay.classList.add("thunder-shake");
      setTimeout(function () { lay.classList.remove("thunder-shake"); }, 480);
    });

    /* 曲目名同步到音乐台 */
    window.addEventListener("soup:track", function (ev) {
      var el = $("#dock-track");
      if (el && ev.detail && ev.detail.label) el.textContent = ev.detail.label;
    });

    window.addEventListener("pagehide", saveProgress);
    document.addEventListener("visibilitychange", function () { if (document.hidden) saveProgress(); });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    if (!E || !PUZZLES.length) {
      toast("题库加载失败，请刷新页面");
      return;
    }

    state.sound = progress.sound !== false;
    state.music = progress.music !== false;
    state.playing = progress.playing !== false;
    state.fx = progress.fx !== false;
    /* 手机端省电档（2026-09-27）：新访客没存过偏好时，触屏设备默认关氛围特效。
       老玩家的既有选择（开或关）一律保留，不替主人做主。 */
    if (progress.fx === undefined) {
      try {
        var mqcFx = window.matchMedia && window.matchMedia("(pointer: coarse)");
        if (mqcFx && mqcFx.matches) state.fx = false;
      } catch (e) { /* 忽略 */ }
    }
    state.volume = typeof progress.volume === "number" ? progress.volume : 0.6;

    if (FX) FX.init();
    applyAudioSettings();
    applyFxSettings();

    renderQaLog();
    renderRandom();
    renderMinorToggle();
    paintAiBar();
    paintResume();
    bind();
    setScene("menu");
    /* 未成年模式首访提示：在游玩之前问一次（Q15），答完记状态不再打扰 */
    maybeMinorPrompt();

    /* 预热：只拉首屏要用的两张背景，其余等切场景时按需加载（少下 600KB+） */
    ["menu", "game"].forEach(function (k) {
      var im = new Image();
      im.src = BG[k];
    });
    if (AU) AU.preload(["menu", "game"]);

    loadMorePuzzles();

    /* 刷新后如果还在房间里，直接接回去（房间层负责判断，找不到就静默放弃） */
    if (window.SoupRoom && window.SoupRoom.resume) window.SoupRoom.resume();

    /* 离线缓存：二次访问秒开。只在 https 下注册，本地调试不吃旧文件。
       updateViaCache:"none"：sw.js 自身的更新检查绕过 HTTP 缓存——
       GitHub Pages 给所有文件发 max-age=600，不设这个的话新 SW 要
       等满 10 分钟才被发现（2026-09-29 缓存修复的另一半）。 */
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      /* 页面是否已被旧 SW 控制：controllerchange 的首次触发是 claim，不算更新 */
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () { /* 注册失败不影响玩 */ });
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hadController) { hadController = true; return; } /* 首次接管：正常 */
        /* 新版本 SW 在本页开着的时候激活了：自动刷新一次让新代码立刻生效。
           只按页面生命周期防一次循环（刷新后新 SW 已是控制者，不会再触发） */
        location.reload();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.SoupApp = {
    pid: function () { return state.pid; },
    /* 「已熬出汤底」标记：供多人选汤面板复用同一份本地记录 */
    isSolved: isSolved,
    toggleSolved: toggleSolved,
    /* 未成年模式：供房间层读本地状态（进房提示用，房规优先见 room-ui） */
    minorOn: minorOn
  };
})(window);
