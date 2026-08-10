# 仕様書: P3-3 PWA対応

- ステータス: **完了(2026-08-10)**。承認2026-07-08 → 2026-08-10改訂(M2の実機確認で起動先の不具合が判明。§1を修正、PR #59)→ M2-a 実機確認合格
  - M2-b/c(1時間後・数日後の再起動)は時間経過が必要なため経過観察。再発時に別項目として起票する
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
  id: "/",                // 2026-08-10追加
  start_url: "/calendar", // 2026-08-10変更(当初は "/")
  scope: "/",             // 2026-08-10追加
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

#### `start_url` / `id` / `scope` の根拠(2026-08-10改訂)

当初は `start_url: "/"` としていたが、M2の実機確認(iPhone)で**ホーム画面から起動するたびにログインを求められる**という報告が上がった。調査の結果、セッションは失われておらず、`/` が指すマーケティングLP(`app/(marketing)/page.tsx`)が認証状態を一切見ないページであることが原因だった。LPはログイン済みでも「無料で始める / ログイン」のCTAを出すため、起動のたびにログイン画面のように見えていた。

- **`start_url: "/calendar"`**: 起動先を認証必須グループ配下にする。ログイン後のリダイレクト先(`app/(marketing)/login/page.tsx`、`components/login-form.tsx`)と揃えた。未ログインなら `app/(app)/layout.tsx` が `/login` へ送るため、初回インストール時や実際にセッションが切れたときの挙動も正しい。
  - 副次効果として、`proxy.ts` の matcher が `/` を除外している(P6-1)ぶんの穴も塞げる。LPしか開かない運用ではサーバー側のセッションリフレッシュが一度も走らず、iOS SafariのITPが `document.cookie` 由来のcookieを7日で失効させるため、放置すると実際にログインが切れる。認証必須ページを起動先にすれば毎回 `proxy.ts` の `getUser()` が `Set-Cookie` を打ち直す
- **`id: "/"`**: manifestの `id` は既定値が `start_url`。明示しないと `start_url` の変更でChromeが別アプリと認識し、既存インストールが更新されず二重登録になる。現行値で固定する
- **`scope: "/"`**: 既定 scope は `start_url` のディレクトリ。ログアウト先の `/login` などがscope外に落ちて外部ブラウザで開かれる事故を防ぐため、ルートを明示する

**運用上の注意**: iOSは既にホーム画面へ追加済みのアプリのmanifestを更新しない。この変更を本番へ反映した後、既存の利用者はアイコンを一度削除してから追加し直す必要がある。

なお、代案として「LPでログイン済みを判定して `/calendar` へリダイレクトする」も検討したが、`/` が動的レンダリングになり、LPを静的配信のまま保つP6-1の判断(`proxy.ts` のコメント参照)に反するため採用しない。訪問者全員にSupabase Authへの往復を課すコストに見合わない。

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

- S1 [単体]: Given `app/manifest.ts`を呼び出す, When 実行, Then `name`/`short_name`/`start_url: "/calendar"`/`display: "standalone"`/`theme_color`が仕様通り返る(2026-08-10改訂: `start_url` を `"/"` から変更。`"/"` に戻すと起動のたびにLPのログインCTAが出る回帰になるため、このアサーションで固定する)
- S2 [単体]: Given manifestの`icons`配列, When 検証, Then 192x192(purpose: any)と512x512(purpose: any および maskable)のエントリがそれぞれ`type: "image/png"`で含まれる
- S3 [単体]: Given `app/layout.tsx`の`viewport`エクスポート, When 検証, Then `prefers-color-scheme: light`用と`dark`用の`themeColor`がそれぞれ仕様通りの値で定義されている
- S4 [単体・境界値]: Given `app/icon-192/route.tsx`・`app/icon-512/route.tsx`の`GET`が返すPNGの実バイト(PNG仕様のIHDRチャンクから幅・高さを読み取る), When 検証, Then それぞれ実際の画像サイズが`192x192`/`512x512`とmanifestの`sizes`宣言に厳密に一致する(`icon-192`/`icon-512`はNext.jsの`icon`/`apple-icon`ファイル規約ではなく手動参照のカスタムルートのため、宣言値と生成物がズレるとブラウザがインストール不可と判定する。実バイトを見ることで「定数だけ合わせて中身がズレる」回帰を防ぐ)
- S5 [単体]: Given `app/apple-icon.tsx`の`size`/`contentType`エクスポート, When 検証, Then `{width:180,height:180}`/`"image/png"`である
- S8 [単体]: Given `app/manifest.ts`を呼び出す, When 実行, Then `id: "/"` と `scope: "/"` が明示されている(2026-08-10追加。`id` 未指定だと `start_url` 変更で既存インストールが別アプリ扱いになる)
- S9 [単体・境界値]: Given manifestの`start_url`と`scope`, When 突き合わせる, Then `start_url` が `scope` を前方一致で満たす(起動先がscope外に出るとPWAとして起動せず外部ブラウザで開かれるため)

### 結合

- S6 [結合]: Given `app/icon-192/route.tsx`・`app/icon-512/route.tsx`のRoute Handler(`GET`), When 実際に呼び出す, Then それぞれ`Content-Type: image/png`のレスポンスが200相当で返る(manifestが参照するアイコンURLが実際に解決できることの確認。参照切れによるインストール不可を防ぐ)
- S7 [結合・異常系]: Given manifestの`icons[].src`一覧, When 各srcに対応するRoute Handlerの存在を突き合わせる, Then すべてのsrcに対応する実装ファイルが存在する(片方だけ実装してmanifestの参照が壊れる回帰を防ぐ)

### 手動疎通(自動テスト対象外)

- M1: Chrome DevTools(モバイルエミュレーション、375px)でLighthouseのPWAインストール可能性チェックが通ることを確認
- M2: 実機(Android Chrome または iOS Safari)でホーム画面に追加し、スタンドアロン表示でカレンダー/タイマー操作・サマリー確認が問題なく完結することを確認
  - M2-a(2026-08-10追加): **既存のホーム画面アイコンを削除してから追加し直し**、起動時にLPを経由せず `/calendar` が直接開くこと(ログインを求められないこと)。iOSは追加済みアプリのmanifestを更新しないため、再追加が必須
  - M2-b(2026-08-10追加): 1時間以上(`jwt_expiry = 3600`)放置してから再起動しても、ログインを求められないこと(access token期限切れ後に `proxy.ts` のリフレッシュが効いていることの確認)
  - M2-c(2026-08-10追加): 数日空けて再起動してもログイン状態が維持されていること(iOS ITPの7日上限に触れていないことの確認)
