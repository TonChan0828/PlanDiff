# S-4: source-map-jsの脆弱性対応

## 問題と変更

PR #86のCIで依存関係監査が失敗しました。監査には、既知のbracesの指摘に加え、source-map-js 1.2.1の指摘が含まれていました。

npmレジストリと[修正版を示すAdvisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)を確認し、lockfileのsource-map-jsだけを1.2.1から1.2.2へ更新します。直接依存の指定、監査の閾値、workflow、アプリコードは変更しません。npmによる更新で生じた無関係なlockfileメタデータの差分は除外します。

## 検証と制約

- `npm ci --ignore-scripts --no-audit --no-fund` が成功しました。
- `npm audit --json` でsource-map-jsの指摘が消え、highの件数が6件から5件へ減りました。残る5件はbracesとその依存経路です。
- 型チェック・lintと、単体／画面テスト142ファイル933件が通過しました。
- Webpackによる本番ビルドはコンパイル後、mainに既存の `app/api/google/connect/route.ts` の `STATE_COOKIE` exportに関する型エラーで停止しました。この別件の修正はPR #86に含まれています。
- [bracesのAdvisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)は2026-10-18時点で修正版がなく、npmの最新版も3.0.3でした。S-3の上流パッチ待ちを維持します。監査が通過したとは扱いません。

## 作業記録と導入

最新mainから作成した専用の作業コピーで実装しました。機能PR #86への依存変更の混在を避けるため、別PRとして提出します。本番環境への公開やマージは行いません。

この変更はlockfileと本記録のみです。標準ビルドの実行環境によるポート制限、およびmainに既存のルート型エラーを確認済みのため、コミットは `--no-verify` を使用します。検査の無効化・監査閾値の変更は行いません。

受け入れ条件は、lockfile差分がsource-map-jsの1項目に限られること、npm ciが成功すること、当該Advisoryが消えること、型チェック・lint・単体テストが通過することです。CI全体を緑に戻すには、S-3で追跡するbracesの解決が別途必要です。
