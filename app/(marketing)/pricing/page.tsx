import type { Metadata } from "next";
import Link from "next/link";
import { ProInterestButton } from "@/components/pro-interest-button";
import {
  FREE_FEATURES,
  PRICING_MESSAGES as M,
  PRO_FEATURES,
} from "@/lib/pricing/messages";

// 料金ページ(P4-4)。課金は実装せず「Pro近日公開」で課金意欲を観測する
// (要件定義書§10・§13)。価格は未決のため表示しない

export const metadata: Metadata = {
  title: "料金 | PlanDiff",
  description:
    "PlanDiffはベータ期間中、すべての機能を無料で利用できます。Proプランは近日公開予定です。",
};

function FeatureList({ features }: { features: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-2 text-[13.5px]">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2">
          <span aria-hidden="true" className="text-brand font-bold">
            ✓
          </span>
          {feature}
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-10 pb-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{M.heading}</h1>
      <p className="text-ink-muted mt-2 text-[15px]">{M.subCopy}</p>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="border-line bg-surface rounded-2xl border p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            {M.freeName}
            <span className="border-line text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-semibold">
              {M.freeBadge}
            </span>
          </h2>
          <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
            {M.freePrice}
            <span className="text-ink-muted ml-2 text-sm font-semibold">
              {M.freePriceNote}
            </span>
          </p>
          <FeatureList features={FREE_FEATURES} />
        </section>

        <section className="border-plan-border bg-surface rounded-2xl border-2 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            {M.proName}
            <span className="bg-plan-fill text-brand rounded-full px-2.5 py-0.5 text-xs font-bold">
              {M.proBadge}
            </span>
          </h2>
          <p className="text-brand mt-2 text-xl font-extrabold">
            {M.proPriceNote}
          </p>
          <p className="text-ink-muted mt-1 text-[12.5px]">
            {M.proPlannedNote}
          </p>
          <FeatureList features={PRO_FEATURES} />
          <div className="mt-5 flex flex-col gap-1.5">
            <ProInterestButton />
            <p className="text-ink-muted text-[11.5px]">{M.interestHint}</p>
          </div>
        </section>
      </div>

      <section className="px-2 pt-10 pb-4 text-center">
        <p className="mb-5 text-lg font-extrabold tracking-tight text-balance">
          {M.ctaTitle}
        </p>
        <Link
          href="/signup"
          className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-12 items-center rounded-xl px-6 text-[15px] font-bold transition-colors"
        >
          {M.ctaSignup}
        </Link>
      </section>
    </div>
  );
}
