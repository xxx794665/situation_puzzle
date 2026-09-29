/* ============================================================
 * 深海汤屋 · 离线缓存
 * ------------------------------------------------------------
 * 策略（2026-09-29 修订：修复「刷新也读不到新版」）：
 *   - 页面 / 样式 / 脚本 / manifest 走「网络优先」，且必须带
 *     cache:"no-cache" 条件重验——裸 fetch 会先吃浏览器 HTTP 缓存，
 *     GitHub Pages 对所有文件发 max-age=600，10 分钟窗口内拿到的
 *     全是旧文件（旧版「网络优先」实际是「HTTP 缓存优先」）。
 *   - 图片 / 字体走 stale-while-revalidate：先用缓存秒开，后台
 *     条件重验换新，下次访问即新版——素材改动不再需要手动 CACHE+1。
 *   - 离线时回退缓存，绝不白屏。
 * ============================================================ */
var CACHE = "deepsea-soup-v24";
var SHELL = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "assets/vendor/gsap.min.js",
  "js/config.js",
  "js/data.js",
  /* js/library.public.js（~2MB）已改为按需加载：不进预缓存清单，
     走 fetch 的 network-first 运行时缓存（.js 命中规则），离线二次访问仍可用 */
  "js/engine.js",
  "js/ai.js",
  "js/audio.js",
  "js/fx.js",
  "js/transition.js",
  "js/net.js",
  "js/icons.js",
  "js/room-ui.js",
  "js/app.js",
  "js/data-more.js",
  "assets/bg-castle.webp",
  "assets/bg-hall.webp",
  "assets/bg-dawn.webp",
  "assets/bg-gate.webp",
  "assets/fonts/NotoSerifSC-title.woff2"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      /* 预缓存也带条件重验：安装时拿到的绝不是 HTTP 缓存里的陈年旧版 */
      .then(function (c) { return c.addAll(SHELL.map(function (s) { return new Request(s, { cache: "no-cache" }); })); })
      .catch(function () { /* 个别文件缺失也不阻塞安装 */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  var networkFirst = req.mode === "navigate" || /\.(html|css|js|json|webmanifest)$/.test(url.pathname);

  if (networkFirst) {
    /* cache:"no-cache" 是这一版的核心修复：带 If-None-Match/If-Modified-Since
       去服务器重验，没变回 304（快），变了直接拿新文件——不再吃 max-age 缓存 */
    e.respondWith(
      fetch(req, { cache: "no-cache" }).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("index.html");
        });
      })
    );
    return;
  }

  /* 图片/字体：stale-while-revalidate。命中缓存立即返回（秒开），
     同时后台条件重验一份新的写回缓存；下次访问就是新版。
     没命中缓存时直接等这份重验的结果。 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var refresh = fetch(req, { cache: "no-cache" }).then(function (res) {
        var copy = res.clone();
        return caches.open(CACHE).then(function (c) {
          return c.put(req, copy);
        }).then(function () { return res; });
      }).catch(function () { return null; /* 离线：保留旧缓存 */ });
      e.waitUntil(refresh);
      if (hit) return hit;
      return refresh.then(function (res) { return res || Response.error(); });
    })
  );
});
