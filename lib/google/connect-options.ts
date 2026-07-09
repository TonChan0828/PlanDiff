// Google Calendar連携(任意)のOAuth2認可URL生成(単体テスト対象: S15)
// Supabase Authを経由しない独立したOAuth2フロー(仕様書P1-3の設計判断)

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export interface BuildGoogleAuthorizationUrlInput {
  origin: string;
  state: string;
  clientId: string;
}

export function buildGoogleAuthorizationUrl({
  origin,
  state,
  clientId,
}: BuildGoogleAuthorizationUrlInput): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}
