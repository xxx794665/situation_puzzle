/* ============================================================
 * 深海汤屋 · AI 透明代理的出站执行器
 * ------------------------------------------------------------
 * 只接收已经过 publicUrlViolation 白名单校验的公网 URL
 * （校验在 worker/src/index.js 的 /api/ai-proxy 路由里完成，
 * 只放行 http/https 公网地址，拒绝环回/私网/链路本地/保留地址）。
 * 透传 POST，带超时控制，上游状态码与正文原样返回给调用方。
 * ============================================================ */

export async function proxyFetch(upstream, headers, payload, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 40000);
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers,
      body: payload,
      signal: ctrl.signal
    });
    /* 下行截断 ≤1MB：上游异常吐超长正文也不至于撑爆 Worker */
    const text = (await res.text()).slice(0, 1048576);
    return {
      status: res.status,
      text: text,
      contentType: res.headers.get("content-type")
    };
  } finally {
    clearTimeout(timer);
  }
}
