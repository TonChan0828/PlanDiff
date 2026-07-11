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
    <section className="flex flex-col gap-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
      <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
        {M.dangerSectionHeading}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {M.deleteAccountDescription}
      </p>
      <form action={deleteAccountAction} className="flex flex-col gap-3">
        <label
          htmlFor={inputId}
          className="text-sm text-zinc-600 dark:text-zinc-400"
        >
          {M.deleteAccountConfirmLabel}
        </label>
        <input
          id={inputId}
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
          className="min-h-11 w-full max-w-sm rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={!canDelete}
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-red-600 px-6 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {M.deleteAccountButton}
        </button>
      </form>
    </section>
  );
}
