/* ============================================================
 * 深海汤屋 · Durable Object 内部 RPC 统一入口
 * ------------------------------------------------------------
 * Cloudflare 的 DO 调用机制只有 stub.fetch() 一种（官方 API）。
 * 这里的 stub 是命名空间绑定（env.ROOM.get(id)）返回的对象，
 * 流量不出网络边界，不存在 SSRF 面。
 * 【约束】workerd 的 Request 构造器只收绝对 URL（相对路径同步抛
 * "Invalid URL"，发生在本函数被调用之前，调用方的 .catch 接不住）；
 * 字符串走 stub.fetch 的也在这里统一补 https://do 假主机兜底，
 * DO fetch 只解析 path+query，假主机名不出网。
 * 统一收口便于日志、超时与未来重试策略只改一处。
 * ============================================================ */

export function doRpc(stub, url, init) {
  if (typeof url === "string" && !/^https?:\/\//i.test(url)) {
    url = "https://do" + (url.charAt(0) === "/" ? url : "/" + url);
  }
  return stub.fetch(url, init);
}
