import type { MetadataRoute } from "next";

import { BRAND_COLOR } from "@/lib/pwa/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlanDiff",
    short_name: "PlanDiff",
    description:
      "Googleカレンダーの予定とタイムトラッキングの実績を重ね、計画と現実のギャップを可視化するツール",
    start_url: "/",
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
