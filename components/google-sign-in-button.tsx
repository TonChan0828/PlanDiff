"use client";

import { useState } from "react";
import { buildGoogleSignInOptions } from "@/lib/supabase/auth-options";
import { createClient } from "@/lib/supabase/browser";

const SIGN_IN_FAILED_MESSAGE =
  "ログインを開始できませんでした。時間をおいてもう一度お試しください";

export function GoogleSignInButton({ label }: { label: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth(
      buildGoogleSignInOptions(window.location.origin),
    );
    if (error) {
      setErrorMessage(SIGN_IN_FAILED_MESSAGE);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {label}
      </button>
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
