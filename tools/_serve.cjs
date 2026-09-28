/* 临时本地静态服务器（冒烟测试用）：node tools/_serve.cjs [端口] */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const PORT = Number(process.argv[2]) || 8931;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(PORT, "127.0.0.1", function () {
  console.log("serving http://127.0.0.1:" + PORT);
});
