"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidPassword } from "@/lib/auth/validation";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "pending";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") {
      return;
    }
    if (!isValidPassword(password)) {
      setError(M.passwordTooShort);
      return;
    }
    setError(null);
    setStatus("pending");

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      setStatus("idle");
      setError(M.resetPasswordGenericError);
      return;
    }

    // リカバリーセッションのままだとログイン画面が即座に/calendarへリダイレクトし
    // 成功メッセージが表示できないため、明示的にサインアウトしてから遷移する
    await supabase.auth.signOut();
    router.push("/login?reset=success");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span>{M.newPasswordLabel}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={status === "pending"}
          className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "pending"}
        className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-bold transition-colors disabled:opacity-50"
      >
        {M.resetPasswordButton}
      </button>
    </form>
  );
}
