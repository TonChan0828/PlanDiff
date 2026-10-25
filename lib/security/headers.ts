// S-5: request-specific policy; never trust a browser-supplied nonce.
export function buildContentSecurityPolicy(
  nonce: string,
  development: boolean,
): string {
  const connections = ["'self'"];
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    const url = new URL(configured);
    connections.push(url.origin, url.origin.replace(/^http/, "ws"));
  }
  if (development) connections.push("ws://localhost:*", "ws://127.0.0.1:*");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "worker-src 'self'",
    `connect-src ${connections.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(!development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function needsSessionRefresh(pathname: string): boolean {
  return ![
    "/",
    "/pricing",
    "/privacy",
    "/terms",
    "/api/pro-interest",
    "/api/monitoring/errors",
    "/api/cron/stale-timers",
    "/api/cron/security-health",
  ].includes(pathname);
}
