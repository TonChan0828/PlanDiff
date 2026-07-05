// Google OAuth 認可オプション(単体テスト対象: S1)
// access_type=offline + prompt=consent は provider_refresh_token 取得の必須条件(CLAUDE.mdハマりどころ)

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

export function buildGoogleSignInOptions(siteOrigin: string) {
  return {
    provider: "google" as const,
    options: {
      redirectTo: `${siteOrigin}/auth/callback`,
      scopes: GOOGLE_CALENDAR_READONLY_SCOPE,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  };
}
