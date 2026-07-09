"use client";

import { useState } from "react";
import { isValidEmail, isValidPassword } from "@/lib/auth/validation";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "pending" | "success";

// Supabaseの設定によっては、既に登録済みのメールでのsignUpがエラーとして
// 返ってくる場合がある。アカウント存在を推測させないため、この場合も
// 通常成功時と同一の案内画面を表示する(仕様書 S4)。
function isAlreadyRegisteredError(message: string): boolean {
  return /already registered|already exists/i.test(message);
}

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (!isValidPassword(password)) {
      setError(M.passwordTooShort);
      return;
    }
    setError(null);
    setStatus("pending");

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (signUpError && !isAlreadyRegisteredError(signUpError.message)) {
      setStatus("idle");
      setError(M.signupGenericError);
      return;
    }
    setStatus("success");
  };

  if (status === "success") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{M.signupSuccessHeading}</h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {M.signupSuccessDescription}
        </p>
      </div>
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
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{M.passwordLabel}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={status === "pending"}
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "pending"}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {M.signupButton}
      </button>
    </form>
  );
}
