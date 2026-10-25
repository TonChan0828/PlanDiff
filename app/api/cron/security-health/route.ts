import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** S-5: authenticated probe suitable for an uptime monitor; no identifying data. */
export async function GET(request: Request): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  try {
    const { data, error } = await createAdminClient().rpc(
      "analytics_security_health",
    );
    const ok = !error && data === true;
    if (!ok) console.error("security.analytics_health_failed");
    return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers });
  } catch {
    console.error("security.analytics_health_failed");
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
