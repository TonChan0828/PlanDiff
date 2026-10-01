"use client";

import { useCallback, useEffect, useState } from "react";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

const SUBSCRIBE_ENDPOINT = "/api/notifications/subscribe";

type Status =
  | "loading"
  | "unsupported"
  | "iosNeedsHomeScreen"
  | "blocked"
  | "checkFailed"
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

function isIosLikeWithoutHomeScreen(): boolean {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !standalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function NotificationSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      setError(null);
      if (!isPushSupported()) {
        setStatus(
          isIosLikeWithoutHomeScreen() ? "iosNeedsHomeScreen" : "unsupported",
        );
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (!subscription) {
          setStatus("disabled");
          return;
        }

        let response: Response;
        try {
          response = await fetch(SUBSCRIBE_ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "check",
              endpoint: subscription.endpoint,
            }),
          });
        } catch {
          if (!cancelled) setStatus("checkFailed");
          return;
        }
        if (!response.ok) {
          if (!cancelled) setStatus("checkFailed");
          return;
        }

        let result: { enabled?: unknown };
        try {
          result = (await response.json()) as { enabled?: unknown };
        } catch {
          if (!cancelled) setStatus("checkFailed");
          return;
        }
        if (cancelled) return;
        if (result.enabled === true) {
          setStatus("enabled");
          return;
        }

        // The browser may retain a subscription from a different account. It is
        // not active until this authenticated user's server row also exists.
        const removed = await subscription.unsubscribe();
        if (!cancelled) setStatus(removed ? "disabled" : "checkFailed");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    };

    void detect();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let subscription: PushSubscription | null = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      subscription = await registration.pushManager.subscribe({
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
        await subscription.unsubscribe().catch(() => false);
        setStatus("disabled");
        setError(
          response.status === 429 ? M.subscriptionLimit : M.enableFailed,
        );
        return;
      }
      setStatus("enabled");
    } catch {
      // Permission denial is handled above. A subscribe or network failure is a
      // recoverable setup error, and a locally-created subscription is rolled back.
      if (subscription) await subscription.unsubscribe().catch(() => false);
      setStatus("disabled");
      setError(M.enableFailed);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleDisable = useCallback(async () => {
    if (busy) return;
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
  }, [busy]);

  if (status === "loading") return null;

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
      {status === "checkFailed" ? (
        <>
          <p role="alert" className="text-danger text-sm">
            {M.checkFailed}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setRetry((value) => value + 1);
            }}
            disabled={busy}
            className="border-line hover:bg-ink/5 rounded-control inline-flex min-h-11 w-fit items-center justify-center border px-4 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {M.retryButton}
          </button>
        </>
      ) : null}

      {status === "enabled" ? (
        <>
          <p className="text-sm font-medium">{M.enabledOnThisDevice}</p>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="border-line hover:bg-ink/5 rounded-control inline-flex min-h-11 w-fit items-center justify-center border px-4 text-sm font-medium transition-colors disabled:opacity-50"
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
            className="bg-brand text-brand-ink hover:bg-brand/90 rounded-control inline-flex min-h-11 w-fit items-center justify-center px-6 text-sm font-medium transition-colors disabled:opacity-50"
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
