// window.matchMedia のテスト用スタブ。jsdomは matchMedia を実装していないため、
// lib/ui/use-is-desktop.ts の `(min-width: 1024px)` 判定をテストで制御するために使う。
// MediaQueryList はモジュールスコープでキャッシュされる(P6-3由来)ため、.matches を
// getter にして「一度だけ作られたオブジェクトでも後から真偽を切り替えられる」ようにしている。

let currentMatches = true;

export function mockDesktopMatchMedia(matches = true) {
  currentMatches = matches;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return currentMatches;
      },
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export function setMockDesktopMatches(matches: boolean) {
  currentMatches = matches;
}

// 既存テストの多くは DateTimeStepper のセグメント入力(デスクトップ版)を前提に
// tests/helpers/date-time-stepper.ts を通じて操作している。このヘルパーを import した
// 時点でデスクトップ既定をインストールしておく(各テストファイルの無改修を維持するため)。
mockDesktopMatchMedia(true);
