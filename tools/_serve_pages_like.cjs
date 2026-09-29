/* ============================================================
 * 模拟 GitHub Pages 响应头的静态服务器（测 Service Worker 用）
 * ------------------------------------------------------------
 * GitHub Pages 对所有文件发 Cache-Control: max-age=600，
 * tools/_serve.cjs 不发缓存头，复现不了「刷新读到旧文件」。
 * 差异点：sw.js 单独发 no-cache（对应线上修复的 updateViaCache:"none"，
 * 否则本地新旧 SW 切换要干等 10 分钟）。
 * 用法：node tools/_serve_pages_like.cjs [端口，默认 8932]
 * ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const PORT = Number(process.argv[2]) || 8932;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream" };
    if (p === "/sw.js") headers["cache-control"] = "no-cache";
    else headers["cache-control"] = "max-age=600";
    res.writeHead(200, headers);
    res.end(buf);
  });
}).listen(PORT, "127.0.0.1", function () {
  console.log("serving (pages-like headers) http://127.0.0.1:" + PORT);
});
