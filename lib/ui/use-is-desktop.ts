import { useSyncExternalStore } from "react";

// デスクトップ判定の共有フック(P9-1)。元々 components/calendar-context-panel.tsx に
// 個別実装されていたものを切り出し、components/date-time-stepper.tsx と共有する。
// useSyncExternalStore の getSnapshot はレンダーごとに呼ばれるため、毎回
// window.matchMedia() で MediaQueryList を作り直さないようキャッシュする(P6-3由来)。
const DESKTOP_QUERY = "(min-width: 1024px)";
let desktopMedia: MediaQueryList | null = null;

function getDesktopMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) {
    return null;
  }
  desktopMedia ??= window.matchMedia(DESKTOP_QUERY);
  return desktopMedia;
}

function subscribeDesktop(callback: () => void) {
  const media = getDesktopMedia();
  if (!media) {
    return () => {};
  }
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return Boolean(getDesktopMedia()?.matches);
}

function getServerSnapshot() {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getServerSnapshot,
  );
}
