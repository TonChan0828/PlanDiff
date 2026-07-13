"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PRICING_MESSAGES as M } from "@/lib/pricing/messages";

// 「Proに興味あり」ボタン(仕様書P4-4c S2〜S6)。
// マウント時にviewイベントも送信する(料金ページは静的化されるため
// サーバー側では閲覧を記録できない)。クリック済みフラグはlocalStorageに保存し、
// SSRとの不一致を避けるためuseSyncExternalStoreで購読する(theme-selectorと同じパターン)

export const PRO_INTEREST_STORAGE_KEY = "plandiff:pro-interest-clicked";
const CLICKED_CHANGE_EVENT = "plandiff:pro-interest-change";

function readStoredClicked(): boolean {
  try {
    return localStorage.getItem(PRO_INTEREST_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function subscribeClicked(onChange: () => void): () => void {
  window.addEventListener(CLICKED_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CLICKED_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function markClicked(): void {
  try {
    localStorage.setItem(PRO_INTEREST_STORAGE_KEY, "1");
  } catch {
    // 保存できなくても完了表示は継続する(再訪問時にボタンへ戻るだけ)
  }
  window.dispatchEvent(new Event(CLICKED_CHANGE_EVENT));
}

async function postProInterest(event: "view" | "click"): Promise<boolean> {
  try {
    const response = await fetch("/api/pro-interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function ProInterestButton() {
  const clicked = useSyncExternalStore(
    subscribeClicked,
    readStoredClicked,
    () => false,
  );
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const viewSent = useRef(false);

  useEffect(() => {
    // viewは計測目的のため失敗は無視する(エラーUIを出さない)。
    // StrictModeの二重実行で二重計上しないようrefでガードする
    if (!viewSent.current) {
      viewSent.current = true;
      void postProInterest("view");
    }
  }, []);

  const handleClick = async () => {
    setSending(true);
    setErrorMessage(null);
    const recorded = await postProInterest("click");
    setSending(false);
    if (!recorded) {
      setErrorMessage(M.interestError);
      return;
    }
    markClicked();
  };

  if (clicked) {
    return (
      <p
        role="status"
        className="border-plan-border bg-plan-fill text-brand inline-flex min-h-12 items-center rounded-xl border px-5 text-sm font-bold"
      >
        {M.interestThanks}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={sending}
        className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-12 w-fit items-center rounded-xl px-6 text-[15px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {M.interestButton}
      </button>
      {errorMessage !== null && (
        <p role="alert" className="text-danger text-sm">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
