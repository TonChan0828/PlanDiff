import { LogoMark } from "@/components/logo-mark";

interface WordmarkProps {
  className?: string;
  display?: boolean;
  withMark?: boolean;
}

export function Wordmark({
  className = "",
  display = false,
  withMark = false,
}: WordmarkProps) {
  return (
    <span
      aria-label="PlanDiff"
      className={`font-extrabold tracking-tight ${
        withMark ? "inline-flex items-center gap-1.5" : ""
      } ${className}`}
    >
      {withMark ? (
        <LogoMark className="text-brand h-[1.1em] w-[1.1em]" />
      ) : null}
      <span aria-hidden="true">
        <span className={display ? "wordmark-plan" : "text-ink"}>Plan</span>
        <span className="text-brand">Diff</span>
      </span>
    </span>
  );
}
