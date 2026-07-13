"use client";

import { useState } from "react";
import { isValidEmail } from "@/lib/auth/validation";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "pending" | "success";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") {
      return;
    }
    if (!isValidEmail(email)) {
      setError(M.invalidEmail);
      return;
    }
    setError(null);
    setStatus("pending");

    const supabase = createClient();
    // 存在有無に関わらず同一の成功メッセージを表示する(アカウント存在の推測を防ぐ)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm-recovery`,
    });
    setStatus("success");
  };

  if (status === "success") {
    return (
      <p className="text-ink-muted text-sm leading-relaxed">
        {M.forgotPasswordSuccess}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span>{M.emailLabel}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
        {M.forgotPasswordButton}
      </button>
    </form>
  );
}
