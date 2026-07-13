import { ERROR_PAGE_MESSAGES } from "@/lib/errors/messages";

// (app)配下の遷移中に即時表示されるスケルトン(P4-5)。アプリシェル(AppBar・下部タブ)は
// layoutが保持するため、コンテンツ領域のみを模したプレースホルダーを描く
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label={ERROR_PAGE_MESSAGES.loading.label}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="bg-ink/8 h-8 w-32 animate-pulse rounded-lg" />
      <div className="bg-ink/8 h-28 w-full animate-pulse rounded-2xl" />
      <div className="flex flex-col gap-2">
        <div className="bg-ink/8 h-14 w-full animate-pulse rounded-xl" />
        <div className="bg-ink/8 h-14 w-full animate-pulse rounded-xl" />
        <div className="bg-ink/8 h-14 w-full animate-pulse rounded-xl" />
      </div>
    </main>
  );
}
