import type { Metadata } from "next";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export const metadata: Metadata = {
  title: "カレンダー連携の再認可 | PlanDiff",
};

const HEADING = "カレンダー連携の再認可";
const DESCRIPTION =
  "カレンダーを読み取るための許可が完了していません。予定を表示するには、以下のボタンからカレンダー連携をやり直してください。";
const RETRY_LABEL = "カレンダー連携をやり直す";

export default function ReauthorizePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{HEADING}</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {DESCRIPTION}
        </p>
      </div>
      <div className="max-w-xs">
        <GoogleSignInButton label={RETRY_LABEL} />
      </div>
    </main>
  );
}
