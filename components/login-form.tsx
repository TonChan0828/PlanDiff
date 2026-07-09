"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "pending";

function isEmailNotConfirmedError(message: string): boolean {
  return /email not confirmed/i.test(message);
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendStatus, setResendStatus] = useState<
    "idle" | "pending" | "sent" | "error"
  >("idle");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") {
      return;
    }
    setError(null);
    setEmailNotConfirmed(false);
    setResendStatus("idle");
    setStatus("pending");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setStatus("idle");
      if (isEmailNotConfirmedError(signInError.message)) {
        setEmailNotConfirmed(true);
        setError(M.emailNotConfirmed);
      } else {
        setError(M.invalidCredentials);
      }
      return;
    }

    router.push("/calendar");
    router.refresh();
  };

  const handleResend = async () => {
    setResendStatus("pending");
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setResendStatus(resendError ? "error" : "sent");
  };

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
          autoComplete="current-password"
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
      {emailNotConfirmed && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resendStatus === "pending"}
          className="text-left text-sm font-medium text-zinc-700 underline disabled:opacity-50 dark:text-zinc-300"
        >
          {M.resendConfirmation}
        </button>
      )}
      {resendStatus === "sent" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {M.resendConfirmationSuccess}
        </p>
      )}
      {resendStatus === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {M.resendConfirmationError}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "pending"}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {M.loginButton}
      </button>
    </form>
  );
}
