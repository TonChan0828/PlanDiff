interface LogoMarkProps {
  className?: string;
}

// D-5ロゴマーク「枠とはみ出し」。予定=アウトラインの枠、実績=塗りブロックが右下へはみ出す
// (ワードマークの Plan=アウトライン / Diff=塗り と同じ文法)。
// 色はcurrentColorを継承する。利用側でtext-brand等を指定する
export function LogoMark({ className = "" }: LogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <rect
        x="3.1"
        y="3.1"
        width="12.8"
        height="12.8"
        rx="3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeOpacity="0.55"
      />
      <rect x="9" y="9" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}
