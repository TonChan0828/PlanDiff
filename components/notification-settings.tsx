"use client";

import { useCallback, useEffect, useState } from "react";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// P13-1: 設定画面の通知セクション。ブラウザの購読状態が唯一の真実で、
// サーバーには問い合わせない(push_subscriptions はクライアントから読めない)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §3

const SUBSCRIBE_ENDPOINT = "/api/notifications/subscribe";

type Status =
  | "loading"
  | "unsupported"
  | "iosNeedsHomeScreen"
  | "blocked"
  | "enabled"
  | "disabled";

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/** 案内文を出し分けるためだけの補助判定。機能検出を優先し、これは文言選択にしか使わない */
function isIosLikeWithoutHomeScreen(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  // matchMedia 自体が無い環境(jsdomの既定環境など)でも落ちないようにする
  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !standalone;
}

/** base64url の VAPID公開鍵を Uint8Array に変換する(Push API の要求形式) */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function NotificationSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      if (!isPushSupported()) {
        const next = isIosLikeWithoutHomeScreen()
          ? "iosNeedsHomeScreen"
          : "unsupported";
        if (!cancelled) setStatus(next);
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(subscription ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    };

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        ),
      });
      const json = subscription.toJSON();
      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        setError(M.enableFailed);
        return;
      }
      setStatus("enabled");
    } catch {
      // 許可ダイアログでの拒否・subscribe の失敗はどちらもここに来る。
      // ユーザーから見れば「有効にできなかった」で同じなのでブロック案内に寄せる
      setStatus("blocked");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(SUBSCRIBE_ENDPOINT, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) {
          // サーバー側の購読行が残ったまま。ここで unsubscribe() すると
          // ブラウザ側の手がかりが消え、二度と解除できなくなるので実行しない
          setError(M.disableFailed);
          return;
        }
        await subscription.unsubscribe();
      }
      setStatus("disabled");
    } catch {
      setError(M.disableFailed);
    } finally {
      setBusy(false);
    }
  }, []);

  if (status === "loading") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">{M.description}</p>

      {status === "unsupported" ? (
        <p className="text-ink-muted text-sm">{M.unsupported}</p>
      ) : null}
      {status === "iosNeedsHomeScreen" ? (
        <p className="text-ink-muted text-sm">{M.iosNeedsHomeScreen}</p>
      ) : null}
      {status === "blocked" ? (
        <p className="text-ink-muted text-sm">{M.blocked}</p>
      ) : null}

      {status === "enabled" ? (
        <>
          <p className="text-sm font-medium">{M.enabledOnThisDevice}</p>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 w-fit items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {M.disableButton}
          </button>
        </>
      ) : null}

      {status === "disabled" ? (
        <>
          <p className="text-ink-muted text-sm">{M.notEnabled}</p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 w-fit items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {M.enableButton}
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
