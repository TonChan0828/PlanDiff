This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CI

`main` へマージするには、最新の `main` を取り込んだプルリクエストで次の GitHub Actions ジョブがすべて成功する必要があります。

- `check` はワークフローの構文、依存関係の脆弱性、コード整形、型、ESLint、単体テスト、本番用ビルドを確認します。
- `Integration and migration tests (local Supabase)` は使い捨てのデータベースに全マイグレーションを適用し、結合テストを実行します。
- `Mobile browser tests (local Supabase)` は本番用ビルドでモバイルブラウザーの操作を検証します。

ジョブ名は [GitHub のマージ条件](https://github.com/TonChan0828/PlanDiff/rules) と一致させます。本番データベースのマイグレーション履歴は、マージ後に別のワークフローで確認します。[本番デプロイの運用手順](docs/運用/P17-2_本番migration適用前デプロイゲート.md)

## データベース型

`lib/supabase/database.types.ts` は、マイグレーションを適用したローカルデータベースから生成します(自動生成。手で編集しません)。マイグレーションを追加・変更したら、ローカルの Supabase を起動して `supabase db reset --local` のあと `npm run db:types` を実行し、差分を同じ PR に含めます。CI は同じ手順で再生成し、コミット済みの型とずれていれば失敗します。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
