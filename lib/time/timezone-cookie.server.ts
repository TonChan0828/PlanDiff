import { cookies } from "next/headers";
import {
  isValidTimezoneValue,
  TIMEZONE_COOKIE_NAME,
} from "@/lib/time/timezone-cookie";

// Server Component専用。next/headers に依存するためクライアントからはimportしない(P8-3)。

/** Cookieに保存されたIANAタイムゾーンを読む。未設定・不正な形式は null */
export async function readTimezoneCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(TIMEZONE_COOKIE_NAME)?.value;
  if (!value || !isValidTimezoneValue(value)) {
    return null;
  }
  return value;
}
