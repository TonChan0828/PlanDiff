// P4-1: /calendar でのオンボーディングへのリダイレクト要否を判定する純粋関数。
// profile取得に失敗した場合(null)はリダイレクトさせない(コア画面を止めない)

export interface OnboardingProfile {
  onboarded_at: string | null;
}

export function shouldRedirectToOnboarding(
  profile: OnboardingProfile | null,
): boolean {
  return profile !== null && profile.onboarded_at === null;
}
