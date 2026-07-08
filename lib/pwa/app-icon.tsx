import { ImageResponse } from "next/og";

import { BRAND_COLOR } from "./theme";

// ブランドカラー背景+白文字「P」のシンプルなアイコンを生成する。
// 中央に収まる文字サイズにし、maskableアイコンの安全領域(中央80%程度)を確保する。
export function generateAppIcon(sizePx: number) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_COLOR,
        color: "#ffffff",
        fontSize: Math.round(sizePx * 0.5),
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      P
    </div>,
    { width: sizePx, height: sizePx },
  );
}
