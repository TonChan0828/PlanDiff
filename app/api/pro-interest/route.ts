import { NextResponse } from "next/server";
import { recordProInterestEvent } from "@/lib/supabase/admin";
import { PRO_INTEREST_API_ERRORS as M } from "@/lib/pricing/messages";
import {
  allowedRequestOrigin,
  proInterestSourceKey,
  readBoundedJson,
} from "@/lib/security/request";

const NO_STORE = { "Cache-Control": "no-store" };
function failure(status: number) {
  return NextResponse.json(
    { error: status === 503 ? M.recordFailed : M.invalidRequest },
    { status, headers: NO_STORE },
  );
}
export async function POST(request: Request): Promise<NextResponse> {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.APP_ORIGIN &&
    !(process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL)
  )
    return failure(503);
  if (!allowedRequestOrigin(request)) return failure(403);
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    return failure(415);
  const body = await readBoundedJson(request, 1024);
  if (!body.ok) return failure(body.status);
  const value = body.value;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).join(",") !== "event"
  )
    return failure(400);
  const event = (value as Record<string, unknown>).event;
  if (event !== "view" && event !== "click") return failure(400);
  const sourceKey = proInterestSourceKey(request);
  if (!sourceKey) return failure(503);
  const result = await recordProInterestEvent(event, sourceKey);
  if (!result.ok) return failure(503);
  if (!result.allowed)
    return NextResponse.json(
      { error: M.rateLimited },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(result.retryAfter) },
      },
    );
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
