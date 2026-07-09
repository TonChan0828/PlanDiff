// メール/パスワード認証UIの文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const AUTH_MESSAGES = {
  emailLabel: "メールアドレス",
  passwordLabel: "パスワード",
  newPasswordLabel: "新しいパスワード",
  invalidEmail: "メールアドレスの形式が正しくありません",
  passwordTooShort: "パスワードは8文字以上で入力してください",

  signupHeading: "アカウント作成",
  signupDescription: "メールアドレスとパスワードでPlanDiffを始めましょう。",
  signupButton: "アカウントを作成",
  signupSuccessHeading: "確認メールを送信しました",
  signupSuccessDescription:
    "ご入力のメールアドレス宛に確認メールをお送りしました。メール内のリンクをクリックしてアカウントを有効化してください。",
  signupGenericError:
    "アカウントを作成できませんでした。時間をおいてもう一度お試しください",
  signupHaveAccount: "すでにアカウントをお持ちの方はこちら",

  loginHeading: "ログイン",
  loginDescription: "メールアドレスとパスワードでログインしてください。",
  loginButton: "ログイン",
  invalidCredentials: "メールアドレスまたはパスワードが正しくありません",
  loginGenericError:
    "ログインに失敗しました。時間をおいてもう一度お試しください",
  emailNotConfirmed:
    "メールアドレスの確認が完了していません。確認メールをご確認ください",
  resendConfirmation: "確認メールを再送する",
  resendConfirmationSuccess: "確認メールを再送しました",
  resendConfirmationError: "確認メールを再送できませんでした",
  confirmFailedLogin:
    "確認リンクの有効期限が切れています。再度サインアップするか、ログインしてから確認メールを再送してください",
  noAccountYet: "アカウントをお持ちでない方はこちら",
  forgotPasswordLink: "パスワードをお忘れの方はこちら",
  resetPasswordSuccess:
    "パスワードを再設定しました。新しいパスワードでログインしてください",

  forgotPasswordHeading: "パスワード再設定",
  forgotPasswordDescription:
    "登録済みのメールアドレスを入力してください。パスワード再設定用のメールをお送りします。",
  forgotPasswordButton: "再設定メールを送る",
  forgotPasswordSuccess:
    "ご入力のメールアドレスが登録されている場合、パスワード再設定用のメールをお送りしました",
  forgotPasswordExpiredLink:
    "リンクの有効期限が切れています。もう一度パスワード再設定をお試しください",
  backToForgotPassword: "パスワード再設定へ戻る",

  resetPasswordHeading: "新しいパスワードの設定",
  resetPasswordDescription: "新しいパスワードを入力してください。",
  resetPasswordButton: "パスワードを更新",
  resetPasswordGenericError:
    "パスワードを更新できませんでした。時間をおいてもう一度お試しください",
  resetPasswordExpiredHeading: "リンクの有効期限が切れています",
  resetPasswordExpiredDescription:
    "パスワード再設定用のリンクの有効期限が切れているか、既に使用されています。もう一度パスワード再設定をお試しください。",
} as const;
