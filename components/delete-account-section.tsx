"use client";

import { useId, useState } from "react";
import { deleteAccountAction } from "@/app/(app)/settings/actions";
import { SETTINGS_MESSAGES as M } from "@/lib/settings/messages";

// データ全削除の誤操作防止(仕様書P4-2 S3/S10)。
// 確認欄に「削除」と正確に入力するまで削除ボタンを無効化する
export function DeleteAccountSection() {
  const [confirmText, setConfirmText] = useState("");
  const inputId = useId();
  const canDelete = confirmText === M.deleteAccountConfirmPhrase;

  return (
    <section className="border-danger/40 bg-surface flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-danger text-base font-semibold">
        {M.dangerSectionHeading}
      </h2>
      <p className="text-ink-muted text-sm">{M.deleteAccountDescription}</p>
      <form action={deleteAccountAction} className="flex flex-col gap-3">
        <label htmlFor={inputId} className="text-ink-muted text-sm">
          {M.deleteAccountConfirmLabel}
        </label>
        <input
          id={inputId}
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
          className="border-line bg-surface min-h-11 w-full max-w-sm rounded-lg border px-3 text-sm"
        />
        <button
          type="submit"
          disabled={!canDelete}
          className="bg-danger hover:bg-danger/90 inline-flex min-h-11 w-fit items-center justify-center rounded-lg px-6 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {M.deleteAccountButton}
        </button>
      </form>
    </section>
  );
}
