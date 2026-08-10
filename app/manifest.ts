import type { MetadataRoute } from "next";

import { BRAND_COLOR } from "@/lib/pwa/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlanDiff",
    short_name: "PlanDiff",
    description:
      "Googleカレンダーの予定とタイムトラッキングの実績を重ね、計画と現実のギャップを可視化するツール",
    // id の既定値は start_url。start_url を変えたときに Chrome が別アプリと
    // 認識して二重インストールになるのを防ぐため、現行値("/")で固定する
    id: "/",
    // 起動先はアプリ本体にする。"/" (LP) にすると、LPは認証状態を見ないため
    // ログイン済みでも起動のたびに「ログイン」CTAが出てしまう(2026-08-10の実機で発生)。
    // 未ログインなら (app)/layout.tsx が /login へ送るため、初回インストール時も正しい
    start_url: "/calendar",
    // 既定 scope は start_url のディレクトリ。ログアウト先の /login などが
    // scope 外に落ちて外部ブラウザで開かれるのを防ぐため、ルートを明示する
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: BRAND_COLOR,
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
