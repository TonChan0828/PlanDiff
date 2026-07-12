import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { BRAND_COLOR, DARK_BACKGROUND_COLOR } from "@/lib/pwa/theme";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PlanDiff",
  description:
    "Googleカレンダーの予定とタイムトラッキングの実績を重ね、計画と現実のギャップを可視化するツール",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PlanDiff",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_COLOR },
    { media: "(prefers-color-scheme: dark)", color: DARK_BACKGROUND_COLOR },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // data-themeは描画前スクリプト(D-1e)が付与するため、サーバーHTMLとの差分を許容する
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* テーマ初期化(D-1e): 描画前にlocalStorageの選択をdata-themeへ反映(FOUC防止) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
