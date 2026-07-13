import type { Metadata } from "next";
import Link from "next/link";

// LP(D-3 / P4-3)。「予定 vs 実績のギャップ」を主語にし、自動計測ツールと
// 誤解されない訴求にする(要件定義書 §リスク)。凍結中のGoogle連携は「準備中」と表記。
// オーバーレイ図は画像ではなくトークン準拠のCSSで描く(ダーク追随・メンテ容易)

export const metadata: Metadata = {
  title: "PlanDiff — 予定と実績のズレを可視化するタイムトラッキング",
  description:
    "予定とタイムトラッキングの実績をひとつのタイムラインに重ねて、計画と現実のズレをdiffのように読む。ソフトウェアエンジニアのための見積もり改善ツールです。",
};

const HERO_TITLE = ["見積もりが、", "当たるようになる。"] as const;
const HERO_SUB =
  "PlanDiffは、予定とタイムトラッキングの実績をひとつのタイムラインに重ねて、計画と現実のズレをdiffのように読むツールです。ソフトウェアエンジニアの「読み違い」を、数字に変えます。";
const CTA_SIGNUP = "無料で始める";
const CTA_LOGIN = "ログイン";
const SECTION_FEATURES = "予定 vs 実績。ズレが見える。";
const SECTION_STEPS = "使い方は3ステップ";
const BOTTOM_TITLE = "今日のズレから、始めよう。";
const BETA_NOTES = [
  "現在ベータ版・無料でご利用いただけます",
  "Googleカレンダー連携は準備中です",
] as const;
const BETA_PRICING_LINK = "料金(Pro近日公開)を見る";

const FEATURES = [
  {
    title: "重ねて、ズレを見る",
    body: "予定は薄く、実績は濃く、同じタイムラインに。開始の遅れや超過は斜線と「+17分」の表記で、色が読めなくてもわかります。",
    glyph: "hatch",
  },
  {
    title: "ワンタップで記録",
    body: "予定をタップしてタイマー開始、もう一度タップで停止。割り込み作業もタイトルひとつで記録。自動計測ではないので、意図した時間だけが残ります。",
    glyph: "timer",
  },
  {
    title: "ズレをdiffで読む",
    body: "今日・今週の計画と実績を集計して、ズレを「+0:55」の符号付きで。自分の見積もりの癖が、数字になって残ります。",
    glyph: "diff",
  },
] as const;

const STEPS = [
  {
    title: "予定を置く",
    body: "アプリ内でタイトルと時間だけ。計画に気負いはいりません。",
  },
  {
    title: "タイマーで記録する",
    body: "予定をタップして開始。ずれた開始時刻は計測中でも直せます。",
  },
  {
    title: "ズレを読む",
    body: "サマリーで計画と実績の差分を振り返り、次の見積もりに活かします。",
  },
] as const;

const HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--hatch) 0px, var(--hatch) 4px, transparent 4px, transparent 8px)",
} as const;

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="PlanDiff"
      className={`font-extrabold tracking-tight ${className}`}
    >
      <span aria-hidden="true" className="wordmark-plan">
        Plan
      </span>
      <span aria-hidden="true" className="text-brand">
        Diff
      </span>
    </span>
  );
}

function CtaButtons({ center = false }: { center?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-2.5 ${center ? "justify-center" : ""}`}>
      <Link
        href="/signup"
        className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-12 items-center rounded-xl px-6 text-[15px] font-bold transition-colors"
      >
        {CTA_SIGNUP}
      </Link>
      <Link
        href="/login"
        className="border-line hover:bg-ink/5 inline-flex min-h-12 items-center rounded-xl border px-5 text-[15px] font-semibold transition-colors"
      >
        {CTA_LOGIN}
      </Link>
    </div>
  );
}

// オーバーレイのイラスト(装飾)。実アプリの日ビューを簡略化して描く
function OverlayIllustration() {
  return (
    <div
      aria-hidden="true"
      className="border-line bg-surface w-full max-w-sm rounded-2xl border py-3.5 pr-3.5 pl-11"
    >
      <div
        className="border-line/70 relative h-[300px] border-l"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--grid-hour) 0 1px, transparent 1px 100px)," +
            "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 25px)," +
            "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 25px)",
        }}
      >
        {[
          [0, "9:00"],
          [100, "10:00"],
          [200, "11:00"],
          [300, "12:00"],
        ].map(([top, label]) => (
          <span
            key={label}
            className="text-ink-muted absolute -left-9 w-8 -translate-y-1/2 text-right font-mono text-[10px] tabular-nums"
            style={{ top: `${top}px` }}
          >
            {label}
          </span>
        ))}
        {/* 計画: API設計 9:30〜11:00 */}
        <div
          className="border-plan-border bg-plan-fill text-plan-text absolute left-[2%] w-1/2 overflow-hidden rounded-lg border px-2 py-1 text-[11px] leading-snug"
          style={{ top: "50px", height: "150px" }}
        >
          <span className="block font-bold">API設計</span>
          <span className="block font-mono text-[10px] opacity-85">
            9:30〜11:00
          </span>
        </div>
        {/* 遅延ハッチ 9:30〜9:47 */}
        <div
          className="border-interrupt/70 absolute right-0 w-[42%] border-x"
          style={{ top: "50px", height: "28px", ...HATCH_STYLE }}
        />
        {/* 実績 9:47〜11:25 */}
        <div
          className="bg-brand absolute right-0 w-[42%] overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-snug text-white"
          style={{ top: "78px", height: "164px" }}
        >
          <span className="block font-bold">API設計</span>
          <span className="block font-mono text-[10px] font-extrabold text-white/90">
            +17分 遅れ
          </span>
          <span className="block font-mono text-[10px] font-extrabold text-white/90">
            +25分 超過
          </span>
          <span className="block font-mono text-[10px] opacity-85">
            9:47〜11:25
          </span>
        </div>
        {/* 超過ハッチ 11:00〜11:25 */}
        <div
          className="border-interrupt/70 absolute right-0 w-[42%] border-x"
          style={{ top: "200px", height: "42px", ...HATCH_STYLE }}
        />
        {/* 現在時刻 */}
        <div
          className="border-danger absolute right-0 left-0 border-t-2"
          style={{ top: "262px" }}
        >
          <span className="bg-danger absolute top-0 left-0.5 -translate-y-1/2 rounded px-1 py-px font-mono text-[9px] leading-tight font-bold text-white tabular-nums">
            11:37
          </span>
        </div>
      </div>
    </div>
  );
}

const FEATURE_GLYPHS = {
  hatch: (
    <span
      aria-hidden="true"
      className="border-interrupt/60 mb-3 inline-flex h-10 w-10 rounded-xl border"
      style={HATCH_STYLE}
    />
  ),
  timer: (
    <span
      aria-hidden="true"
      className="border-line mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="text-brand h-6 w-6"
      >
        <circle cx="12" cy="13.5" r="7" />
        <path d="M12 13.5V9.5M10 3h4" />
      </svg>
    </span>
  ),
  diff: (
    <span
      aria-hidden="true"
      className="border-line text-brand mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-xl font-extrabold"
    >
      ±
    </span>
  ),
} as const;

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-line flex items-center justify-between border-b px-5 py-3.5 sm:px-8">
        <Wordmark className="text-xl" />
        <Link
          href="/login"
          className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold transition-colors"
        >
          {CTA_LOGIN}
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-9 px-6 pt-12 pb-10 sm:pt-16">
        <div className="min-w-[17rem] flex-1 basis-80">
          <h1 className="text-[clamp(1.9rem,4.6vw,2.6rem)] leading-snug font-extrabold tracking-tight text-balance">
            {HERO_TITLE[0]}
            <br />
            {HERO_TITLE[1]}
          </h1>
          <p className="text-ink-muted mt-4 mb-6 max-w-lg text-[15px]">
            {HERO_SUB}
          </p>
          <CtaButtons />
        </div>
        <OverlayIllustration />
      </section>

      <h2 className="mt-8 mb-5 text-center text-xl font-extrabold tracking-tight">
        {SECTION_FEATURES}
      </h2>
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-3.5 px-6 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="border-line bg-surface rounded-2xl border p-5"
          >
            {FEATURE_GLYPHS[feature.glyph]}
            <h3 className="mb-1.5 text-[15px] font-bold">{feature.title}</h3>
            <p className="text-ink-muted text-[13px]">{feature.body}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 mb-5 text-center text-xl font-extrabold tracking-tight">
        {SECTION_STEPS}
      </h2>
      {/* 実際の操作手順(順序に意味がある)ため番号を付す */}
      <ol className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 px-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="border-plan-border bg-plan-fill text-brand mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-extrabold"
            >
              {index + 1}
            </span>
            <span>
              <h3 className="text-sm font-bold">{step.title}</h3>
              <p className="text-ink-muted text-[12.5px]">{step.body}</p>
            </span>
          </li>
        ))}
      </ol>

      <div className="border-line text-ink-muted mx-auto mt-11 flex w-full max-w-4xl flex-wrap justify-center gap-x-5 gap-y-1.5 border-y px-6 py-4 text-[13px]">
        {BETA_NOTES.map((note) => (
          <span key={note}>{note}</span>
        ))}
        <Link
          href="/pricing"
          className="text-brand inline-flex items-center font-semibold underline-offset-4 hover:underline"
        >
          {BETA_PRICING_LINK}
        </Link>
      </div>

      <section className="px-6 pt-11 pb-6 text-center">
        <p className="mb-6 text-[clamp(1.4rem,3.4vw,1.9rem)] font-extrabold tracking-tight text-balance">
          {BOTTOM_TITLE}
        </p>
        <CtaButtons center />
      </section>
    </div>
  );
}
