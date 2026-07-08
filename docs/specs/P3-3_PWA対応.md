# 仕様書: P3-3 PWA対応

- ステータス: 承認済み(2026-07-08)
- 関連: docs/要件定義書.md FR-09 / docs/指示資料(該当資料なし。README以外未配置)

## 目的

モバイルブラウザからホーム画面に追加でき、インストール後もタイマー操作・当日のギャップ確認(ギャップサマリー)が完結するようにする。既存のカレンダー/タイマー/サマリー画面(P2-1〜P3-2)はすでにモバイルファーストで実装済みのため、本仕様はインストール可能にするためのメタデータ・アイコン整備が中心であり、新規の画面・操作は追加しない。

## 仕様

### 1. Web App Manifest(新規: `app/manifest.ts`)

Next.jsのファイル規約([参考](../../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md))に従い、`MetadataRoute.Manifest`を返す関数を実装する。`app/manifest.ts`を置くだけでNext.jsが`<link rel="manifest">`を自動的に`<head>`へ挿入するため、`app/layout.tsx`側の追加設定は不要。

```ts
{
  name: "PlanDiff",
  short_name: "PlanDiff",
  description: "Googleカレンダーの予定とタイムトラッキングの実績を重ね、計画と現実のギャップを可視化するツール",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0284c7", // sky-600。オーバーレイ表示(P3-1)で使用しているブランドカラーに合わせる
  icons: [
    { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}
```

### 2. アイコン生成

デザイン素材が未用意のため、`next/og`の`ImageResponse`でブランドカラー(sky-600背景+白文字「P」)のアイコンをビルド時生成する(承認時にデザインの簡易さについて確認)。

- `app/icon-192/route.tsx`: 192x192のPNGを返すRoute Handler。`export const size = { width: 192, height: 192 }`
- `app/icon-512/route.tsx`: 512x512のPNGを返すRoute Handler。maskable用途を考慮し、文字は安全領域(中央80%程度)に収める
- `app/apple-icon.tsx`: iOS向けアイコン(Next.jsのファイル規約により自動で`<link rel="apple-touch-icon">`が挿入される)。180x180、`ImageResponse`で生成

manifestの`icons[].src`は上記Route Handlerのパスを直接参照する(生成画像を`public/`に事前配置する運用はしない。ブランドカラーを変更した際に1箇所の修正で済ませるため)。

### 3. viewport / metadata(`app/layout.tsx`を変更)

```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0284c7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }, // globals.cssのdark背景色に合わせる
  ],
};
```

既存の`metadata`に`appleWebApp: { capable: true, statusBarStyle: "default", title: "PlanDiff" }`を追加し、iOS Safariでホーム画面に追加した際にブラウザUIなしのスタンドアロン表示になるようにする。

## スコープ外

- Service Worker・オフラインキャッシュ(要件定義書に明記のオフライン要件は`synced_events`テーブルによるAPIキャッシュのみで、静的アセットのオフライン配信は求められていない。将来必要になれば別仕様として起票する)
- プッシュ通知(v2以降。要件定義書 §4.2)
- スプラッシュスクリーン専用画像などiOSの追加最適化(`apple-icon`のみで許容する)
- インストール導線のUI(「ホーム画面に追加してください」といったアプリ内バナー等)。ブラウザ標準のインストールプロンプトに委ねる

## テストシナリオ

### 単体

- S1 [単体]: Given `app/manifest.ts`を呼び出す, When 実行, Then `name`/`short_name`/`start_url: "/"`/`display: "standalone"`/`theme_color: "#0284c7"`が仕様通り返る
- S2 [単体]: Given manifestの`icons`配列, When 検証, Then 192x192(purpose: any)と512x512(purpose: any および maskable)のエントリがそれぞれ`type: "image/png"`で含まれる
- S3 [単体]: Given `app/layout.tsx`の`viewport`エクスポート, When 検証, Then `prefers-color-scheme: light`用と`dark`用の`themeColor`がそれぞれ仕様通りの値で定義されている
- S4 [単体・境界値]: Given `app/icon-192/route.tsx`・`app/icon-512/route.tsx`の`GET`が返すPNGの実バイト(PNG仕様のIHDRチャンクから幅・高さを読み取る), When 検証, Then それぞれ実際の画像サイズが`192x192`/`512x512`とmanifestの`sizes`宣言に厳密に一致する(`icon-192`/`icon-512`はNext.jsの`icon`/`apple-icon`ファイル規約ではなく手動参照のカスタムルートのため、宣言値と生成物がズレるとブラウザがインストール不可と判定する。実バイトを見ることで「定数だけ合わせて中身がズレる」回帰を防ぐ)
- S5 [単体]: Given `app/apple-icon.tsx`の`size`/`contentType`エクスポート, When 検証, Then `{width:180,height:180}`/`"image/png"`である

### 結合

- S6 [結合]: Given `app/icon-192/route.tsx`・`app/icon-512/route.tsx`のRoute Handler(`GET`), When 実際に呼び出す, Then それぞれ`Content-Type: image/png`のレスポンスが200相当で返る(manifestが参照するアイコンURLが実際に解決できることの確認。参照切れによるインストール不可を防ぐ)
- S7 [結合・異常系]: Given manifestの`icons[].src`一覧, When 各srcに対応するRoute Handlerの存在を突き合わせる, Then すべてのsrcに対応する実装ファイルが存在する(片方だけ実装してmanifestの参照が壊れる回帰を防ぐ)

### 手動疎通(自動テスト対象外)

- M1: Chrome DevTools(モバイルエミュレーション、375px)でLighthouseのPWAインストール可能性チェックが通ることを確認
- M2: 実機(Android Chrome または iOS Safari)でホーム画面に追加し、スタンドアロン表示でカレンダー/タイマー操作・サマリー確認が問題なく完結することを確認
