/* ============================================================
 * 深海汤屋 · Worker 出站 URL 硬校验（SSRF 防护）
 * ------------------------------------------------------------
 * AI 汤主允许用户自填上游 baseUrl（BYO endpoint），因此 Worker 在
 * 发起任何上游 fetch 前必须校验目标：只放行 http/https 的公网地址，
 * 拒绝环回 / 私网 / 链路本地 / 保留地址，防内网探测与云元数据探查。
 * 返回 null 表示合法，否则返回拒绝原因（可直接给用户看）。
 * ============================================================ */

export function publicUrlViolation(u) {
  var parsed;
  try {
    parsed = new URL(String(u || "").trim());
  } catch (e) {
    return "URL 无法解析";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "只支持 http/https";
  }
  if (parsed.username || parsed.password) {
    return "URL 里不要带账号密码（请填在 Key 输入框）";
  }
  var host = (parsed.hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return "缺少主机名";
  if (host === "localhost" || host.indexOf("localhost") !== -1 ||
      host.slice(-6) === ".local" || host.slice(-9) === ".internal" ||
      host.slice(-8) === ".intranet" || host.slice(-4) === ".lan" ||
      host.slice(-5) === ".home" || host.slice(-5) === ".arpa") {
    return "不允许本机 / 内网主机名";
  }
  /* 字面 IPv4：拒绝环回 / 私网 / 链路本地 / 保留段 */
  var v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    ? host.split(".").map(Number)
    : null;
  if (v4) {
    if (v4[0] === 0) return "不允许私网 / 保留 IP";
    if (v4[0] === 10) return "不允许私网 / 保留 IP";
    if (v4[0] === 127) return "不允许私网 / 保留 IP";
    if (v4[0] === 169 && v4[1] === 254) return "不允许私网 / 保留 IP";
    if (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) return "不允许私网 / 保留 IP";
    if (v4[0] === 192 && v4[1] === 168) return "不允许私网 / 保留 IP";
    if (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) return "不允许私网 / 保留 IP";
    if (v4[0] === 192 && v4[1] === 0) return "不允许私网 / 保留 IP";
    if (v4[0] === 198 && v4[1] >= 18 && v4[1] <= 19) return "不允许私网 / 保留 IP";
    if (v4[0] >= 224) return "不允许私网 / 保留 IP";
  }
  /* 字面 IPv6：拒绝未指定 / 环回 / ULA / 链路本地 / 组播 */
  var v6 = host.charAt(0) === "[" ? host.slice(1, host.length - 1) : "";
  if (v6) {
    var p6 = v6.toLowerCase();
    var head2 = p6.slice(0, 2);
    if (p6 === "::" || p6 === "::1" || head2 === "fc" || head2 === "fd" ||
        head2 === "fe" || head2 === "ff") {
      return "不允许私网 / 保留 IPv6";
    }
  }
  return null;
}
