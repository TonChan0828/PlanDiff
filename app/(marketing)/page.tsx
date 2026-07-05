const APP_NAME = "PlanDiff";
const TAGLINE =
  "Googleカレンダーの予定とタイムトラッキングの実績をひとつのタイムラインに重ね、計画と現実のギャップを可視化するツールです。";
const STATUS_NOTE = "現在ベータ版を開発中です。";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        {TAGLINE}
      </p>
      <p className="text-sm text-zinc-500">{STATUS_NOTE}</p>
    </div>
  );
}
