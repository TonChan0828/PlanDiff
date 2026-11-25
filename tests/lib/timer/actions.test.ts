import { beforeEach, describe, expect, it, vi } from "vitest";

// 仕様書: docs/specs/G-113_共有ServerActionを画面のルートから独立させる.md A1〜A3・A5
// 移動で挙動が変わっていないことを固定する特性テスト。service はモックし、
// 「認証 → service → 成功時のみ再検証」の流れだけを検証する。

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/timer/service", () => ({
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  updateTimeEntry: vi.fn(),
  updateRunningStart: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
  updateRunningStartAction,
  updateTimeEntryAction,
} from "@/lib/timer/actions";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/timer/service";

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

const startInput = { title: "作業", googleEventId: null };
const updateInput = {
  title: "作業",
  startAt: "2026-11-24T00:00:00.000Z",
  endAt: "2026-11-24T01:00:00.000Z",
};

// 各 Action の呼び出し方と、呼ばれるべき service を表にする
const CASES = [
  {
    name: "startTimerAction",
    call: () => startTimerAction(startInput),
    fn: () => service.startTimer,
    args: [startInput],
  },
  {
    name: "stopTimerAction",
    call: () => stopTimerAction(),
    fn: () => service.stopTimer,
    args: [],
  },
  {
    name: "updateTimeEntryAction",
    call: () => updateTimeEntryAction("e1", updateInput),
    fn: () => service.updateTimeEntry,
    args: ["e1", updateInput],
  },
  {
    name: "updateRunningStartAction",
    call: () => updateRunningStartAction("2026-11-24T00:00:00.000Z"),
    fn: () => service.updateRunningStart,
    args: ["2026-11-24T00:00:00.000Z"],
  },
  {
    name: "deleteTimeEntryAction",
    call: () => deleteTimeEntryAction("e1"),
    fn: () => service.deleteTimeEntry,
    args: ["e1"],
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser({ id: "u1" });
});

describe.each(CASES)("$name(G-113)", ({ call, fn, args }) => {
  it("A1: 未ログインなら /login へリダイレクトし、service を呼ばない", async () => {
    mockUser(null);

    await expect(call()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(fn()).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("A2/A5: 成功したら service の結果を返し、引数をそのまま渡し、カレンダーと計測を再検証する", async () => {
    vi.mocked(fn()).mockResolvedValue({ ok: true });

    const result = await call();

    expect(result).toEqual({ ok: true });
    expect(fn()).toHaveBeenCalledWith(expect.anything(), ...args);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).toHaveBeenCalledWith("/track");
  });

  it("A3: 失敗したら再検証しない", async () => {
    vi.mocked(fn()).mockResolvedValue({ ok: false });

    const result = await call();

    expect(result).toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
