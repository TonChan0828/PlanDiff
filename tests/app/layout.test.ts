import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import { metadata, viewport } from "@/app/layout";

// 仕様書: docs/specs/P3-3_PWA対応.md S3

describe("app/layout.tsx のPWA関連メタデータ", () => {
  it("S3: viewportのthemeColorがlight/darkそれぞれ仕様通りの値で定義されている", () => {
    const themeColor = viewport.themeColor;
    expect(Array.isArray(themeColor)).toBe(true);

    const entries = themeColor as { media?: string; color?: string }[];
    const light = entries.find(
      (entry) => entry.media === "(prefers-color-scheme: light)",
    );
    const dark = entries.find(
      (entry) => entry.media === "(prefers-color-scheme: dark)",
    );

    expect(light?.color).toBe("#0284c7");
    expect(dark?.color).toBe("#0a0a0a");
  });

  it("appleWebAppでスタンドアロン表示用のメタデータが設定されている", () => {
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      statusBarStyle: "default",
      title: "PlanDiff",
    });
  });
});
