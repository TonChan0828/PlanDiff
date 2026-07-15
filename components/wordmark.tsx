interface WordmarkProps {
  className?: string;
  display?: boolean;
}

export function Wordmark({ className = "", display = false }: WordmarkProps) {
  return (
    <span
      aria-label="PlanDiff"
      className={`font-extrabold tracking-tight ${className}`}
    >
      <span
        aria-hidden="true"
        className={display ? "wordmark-plan" : "text-ink"}
      >
        Plan
      </span>
      <span aria-hidden="true" className="text-brand">
        Diff
      </span>
    </span>
  );
}
