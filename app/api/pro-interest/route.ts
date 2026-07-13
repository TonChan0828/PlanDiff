import { NextResponse } from "next/server";
import {
  recordProInterestEvent,
  type ProInterestEventType,
} from "@/lib/supabase/admin";
import { PRO_INTEREST_API_ERRORS } from "@/lib/pricing/messages";

// P4-4b: 料金ページの閲覧(view)/「Proに興味あり」クリック(click)を記録する。
// 認証不要(未ログイン訪問者も計測対象)。個人情報は一切保存しない

function isProInterestEventType(value: unknown): value is ProInterestEventType {
  return value === "view" || value === "click";
}

export async function POST(request: Request): Promise<NextResponse> {
  let event: unknown;
  try {
    const body = (await request.json()) as { event?: unknown } | null;
    event = body?.event;
  } catch {
    return NextResponse.json(
      { error: PRO_INTEREST_API_ERRORS.invalidRequest },
      { status: 400 },
    );
  }
  if (!isProInterestEventType(event)) {
    return NextResponse.json(
      { error: PRO_INTEREST_API_ERRORS.invalidRequest },
      { status: 400 },
    );
  }

  const recorded = await recordProInterestEvent(event);
  if (!recorded) {
    return NextResponse.json(
      { error: PRO_INTEREST_API_ERRORS.recordFailed },
      { status: 500 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
