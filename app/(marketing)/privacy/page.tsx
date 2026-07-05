import type { Metadata } from "next";
import {
  LegalArticle,
  LegalLink,
  type LegalSection,
} from "@/components/legal-article";

export const metadata: Metadata = {
  title: "プライバシーポリシー | PlanDiff",
};

const OPERATOR_NAME = "Sho Takasaki";
const ESTABLISHED_DATE = "2026年7月6日";

const CONTACT_EMAIL = "showsphere1028@gmail.com";
const GOOGLE_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";
const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

const SECTIONS: LegalSection[] = [
  {
    heading: "1. 事業者情報",
    body: (
      <>
        <p>
          本プライバシーポリシーは、{OPERATOR_NAME}
          (以下「運営者」)が提供する「PlanDiff」(以下「本サービス」)における利用者情報の取り扱いを定めるものです。
        </p>
        <p>
          運営者: {OPERATOR_NAME}
          <br />
          連絡先: {CONTACT_EMAIL}
        </p>
      </>
    ),
  },
  {
    heading: "2. 取得する情報",
    body: (
      <>
        <p>本サービスは、以下の情報を取得します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Googleアカウント情報(メールアドレス、氏名、プロフィール画像)</li>
          <li>
            Googleカレンダーのデータ(プライマリカレンダーの予定のタイトルおよび開始・終了日時)。取得には読み取り専用スコープ(calendar.events.readonly)のみを使用し、カレンダーへの書き込みは行いません
          </li>
          <li>
            利用者が本サービス内で記録した実績データ(作業タイトル、開始・終了日時)
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. 利用目的",
    body: (
      <p>
        取得した情報は、予定と実績を同一タイムライン上に表示し、計画と実績のギャップを分析するという本サービスの機能提供のためにのみ利用します。広告配信の目的では利用しません。
      </p>
    ),
  },
  {
    heading: "4. Google Limited Use への準拠",
    body: (
      <>
        <p>
          PlanDiff による Google API から受領した情報の使用は、Limited Use
          の要件を含む{" "}
          <LegalLink href={GOOGLE_POLICY_URL}>
            Google API Services User Data Policy
          </LegalLink>{" "}
          に準拠します。
        </p>
        <p lang="en">
          PlanDiff&apos;s use and transfer to any other app of information
          received from Google APIs will adhere to the{" "}
          <LegalLink href={GOOGLE_POLICY_URL}>
            Google API Services User Data Policy
          </LegalLink>
          , including the Limited Use requirements.
        </p>
      </>
    ),
  },
  {
    heading: "5. データの保存",
    body: (
      <p>
        取得した情報は
        Supabase(PostgreSQL)に保存します。Googleカレンダーのデータは表示のためのキャッシュとして保存します。Google
        の認可トークンは、サーバーのみがアクセスできる形で保管し、クライアント(ブラウザ)には渡しません。
      </p>
    ),
  },
  {
    heading: "6. 第三者提供",
    body: <p>法令に基づく場合を除き、利用者の情報を第三者に提供しません。</p>,
  },
  {
    heading: "7. データの削除",
    body: (
      <p>
        アカウントおよび全データの削除機能を設定画面から提供予定です。提供までの間は、上記連絡先へご依頼いただければ削除に対応します。また、
        <LegalLink href={GOOGLE_PERMISSIONS_URL}>
          Google アカウントの権限設定ページ
        </LegalLink>
        から、本サービスとの連携をいつでも解除できます。
      </p>
    ),
  },
  {
    heading: "8. Cookie",
    body: (
      <p>
        本サービスは、ログインセッションの管理のためにのみ Cookie
        を使用します。広告・トラッキングを目的とした Cookie は使用しません。
      </p>
    ),
  },
  {
    heading: "9. 改定",
    body: (
      <p>
        本ポリシーを改定する場合は、本ページで告知します。重要な変更を行う場合は、アプリ内での通知等の適切な方法でお知らせします。
      </p>
    ),
  },
  {
    heading: "10. 制定日・お問い合わせ先",
    body: (
      <p>
        制定日: {ESTABLISHED_DATE}
        <br />
        お問い合わせ先: {CONTACT_EMAIL}
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return <LegalArticle title="プライバシーポリシー" sections={SECTIONS} />;
}
