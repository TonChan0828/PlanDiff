import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { mockDesktopMatchMedia } from "../../helpers/match-media";

// 仕様: docs/specs/P9-1_時刻編集のモバイル最適化.md #テストシナリオ(use-is-desktop S1〜S4)
//
// lib/ui/use-is-desktop.ts はモジュールスコープで MediaQueryList をキャッシュする(P6-3由来)。
// テスト間でキャッシュが残ると window.matchMedia の再設定が反映されなくなるため、
// 各テストの直前で vi.resetModules() + 動的 import により毎回フレッシュな
// モジュールインスタンスを使う(tests/lib/supabase/admin.test.ts と同じパターン)。

beforeEach(() => {
  vi.resetModules();
});

async function importUseIsDesktop() {
  const mod = await import("@/lib/ui/use-is-desktop");
  return mod.useIsDesktop;
}

describe("useIsDesktop (P9-1)", () => {
  it("S1: matchMedia(min-width: 1024px).matches が true のとき true を返す", async () => {
    mockDesktopMatchMedia(true);
    const useIsDesktop = await importUseIsDesktop();
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("S2: matchMedia(min-width: 1024px).matches が false のとき false を返す", async () => {
    mockDesktopMatchMedia(false);
    const useIsDesktop = await importUseIsDesktop();
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("S3: window.matchMedia が存在しない環境では false を返す", async () => {
    const original = window.matchMedia;
    // @ts-expect-error テスト用にjsdomの未実装状態(undefined)を再現する
    delete window.matchMedia;
    const useIsDesktop = await importUseIsDesktop();
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
    window.matchMedia = original;
  });

  it("S4: 再レンダーしても window.matchMedia の呼び出し回数が増えない", async () => {
    const calls: string[] = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => {
        calls.push(query);
        return {
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MediaQueryList;
      },
    });

    const useIsDesktop = await importUseIsDesktop();
    const { rerender } = renderHook(() => useIsDesktop());
    const afterFirst = calls.length;
    rerender();
    expect(calls.length).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(0);
  });
});
