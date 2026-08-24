// P13-1: 本リポジトリ初の Service Worker。Push受信のみを担当する。
// オフラインキャッシュは実装しない(P3-3 の判断を維持)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §2

// この文言は lib/notifications/messages.ts の staleTimerFallbackBody と重複している
// (sw.jsは静的配信の素のJSでTSをimportできないため)。変更するときは両方直すこと
const FALLBACK_TITLE = "計測しっぱなしかもしれません";
const FALLBACK_BODY = "計測しっぱなしの記録があります";
const DEFAULT_URL = "/track";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // ペイロードが壊れていても無音にはしない(汎用文言で必ず出す)
    payload = {};
  }

  const title = payload.title || FALLBACK_TITLE;
  const options = {
    body: payload.body || FALLBACK_BODY,
    tag: payload.tag || "stale-timer",
    icon: "/icon-192",
    badge: "/icon-192",
    data: { url: payload.url || DEFAULT_URL },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || DEFAULT_URL;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // 既に開いている PlanDiff があればそれを使う(二重起動を避ける)
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        for (const client of clientList) {
          if ("navigate" in client && "focus" in client) {
            return client
              .navigate(targetUrl)
              .then((navigated) => (navigated ? navigated.focus() : undefined));
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
