import { ImageResponse } from "next/og";

import { BRAND_COLOR } from "./theme";

// D-5ロゴマーク「枠とはみ出し」を群青背景+白描画で生成する。
// 予定=アウトラインの枠、実績=塗りブロック(components/logo-mark.tsxと同じ形状)。
// マークは64%サイズで中央配置し、maskableアイコンの安全領域(中央80%程度)に収める
export function generateAppIcon(sizePx: number) {
  const markPx = Math.round(sizePx * 0.64);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_COLOR,
      }}
    >
      <svg width={markPx} height={markPx} viewBox="0 0 24 24" fill="none">
        <rect
          x="3.1"
          y="3.1"
          width="12.8"
          height="12.8"
          rx="3"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeOpacity="0.55"
        />
        <rect x="9" y="9" width="12" height="12" rx="3" fill="#ffffff" />
      </svg>
    </div>,
    { width: sizePx, height: sizePx },
  );
}
