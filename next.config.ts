import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
  experimental: {
    // barrel importによるバンドル肥大を防ぐ(P6-3)。
    // date-fns は lib/ui/ja-locale.ts への差し替えと併用、
    // lucide-react はアイコンの named import が多数あるため。
    // @supabase/supabase-js は tree-shaking しにくく認証4ページ限定のため対象外。
    optimizePackageImports: ["date-fns", "lucide-react"],
  },
};

export default nextConfig;
