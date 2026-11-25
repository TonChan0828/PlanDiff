import { beforeEach, describe, expect, it, vi } from "vitest";

// 仕様書: docs/specs/G-113_共有ServerActionを画面のルートから独立させる.md A1〜A4
// 移動で挙動が変わっていないことを固定する特性テスト。再検証するパスは Action ごとに違う
// (disableRuleLearning は /calendar のみ、setRulePause は /summary も)ため、表に持たせる。

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/calendar/app-events", () => ({
  createAppEvent: vi.fn(),
  updateAppEvent: vi.fn(),
  deleteAppEvent: vi.fn(),
}));
vi.mock("@/lib/calendar/recurring", () => ({
  createRecurringRule: vi.fn(),
  updateRecurringRule: vi.fn(),
  deleteRecurringRule: vi.fn(),
  deleteRecurringOccurrence: vi.fn(),
}));
vi.mock("@/lib/calendar/rule-pausing", () => ({ setRulePause: vi.fn() }));
vi.mock("@/lib/calendar/rule-learning", () => ({
  disableRuleLearning: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as appEvents from "@/lib/calendar/app-events";
import {
  createAppEventAction,
  createRecurringRuleAction,
  deleteAppEventAction,
  deleteRecurringOccurrenceAction,
  deleteRecurringRuleAction,
  disableRuleLearningAction,
  setRulePauseAction,
  updateAppEventAction,
  updateRecurringRuleAction,
} from "@/lib/calendar/actions";
import * as recurring from "@/lib/calendar/recurring";
import * as ruleLearning from "@/lib/calendar/rule-learning";
import * as rulePausing from "@/lib/calendar/rule-pausing";
import { createClient } from "@/lib/supabase/server";

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

const eventInput = {
  title: "予定",
  startAt: "2026-11-24T00:00:00.000Z",
  endAt: "2026-11-24T01:00:00.000Z",
};
const ruleInput = {
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-11-01",
  endsOn: null,
} as const;

const DEFAULT_PATHS = ["/calendar", "/track"];

const CASES = [
  {
    name: "createAppEventAction",
    call: () => createAppEventAction(eventInput),
    fn: () => appEvents.createAppEvent,
    args: [eventInput],
    paths: DEFAULT_PATHS,
  },
  {
    name: "updateAppEventAction",
    call: () => updateAppEventAction("e1", eventInput),
    fn: () => appEvents.updateAppEvent,
    args: ["e1", eventInput],
    paths: DEFAULT_PATHS,
  },
  {
    name: "deleteAppEventAction",
    call: () => deleteAppEventAction("e1"),
    fn: () => appEvents.deleteAppEvent,
    args: ["e1"],
    paths: DEFAULT_PATHS,
  },
  {
    name: "createRecurringRuleAction",
    call: () => createRecurringRuleAction(ruleInput),
    fn: () => recurring.createRecurringRule,
    args: [ruleInput],
    paths: DEFAULT_PATHS,
  },
  {
    name: "updateRecurringRuleAction",
    call: () => updateRecurringRuleAction("r1", ruleInput),
    fn: () => recurring.updateRecurringRule,
    args: ["r1", ruleInput],
    paths: DEFAULT_PATHS,
  },
  {
    name: "deleteRecurringRuleAction",
    call: () => deleteRecurringRuleAction("r1"),
    fn: () => recurring.deleteRecurringRule,
    args: ["r1"],
    paths: DEFAULT_PATHS,
  },
  {
    name: "deleteRecurringOccurrenceAction",
    call: () => deleteRecurringOccurrenceAction("rec:r1:2026-11-24"),
    fn: () => recurring.deleteRecurringOccurrence,
    args: ["rec:r1:2026-11-24"],
    paths: DEFAULT_PATHS,
  },
  {
    name: "disableRuleLearningAction",
    call: () => disableRuleLearningAction("r1"),
    fn: () => ruleLearning.disableRuleLearning,
    args: ["r1"],
    paths: ["/calendar"],
  },
  {
    name: "setRulePauseAction",
    call: () => setRulePauseAction("r1", "pause" as never),
    fn: () => rulePausing.setRulePause,
    args: ["r1", "pause"],
    paths: ["/calendar", "/track", "/summary"],
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser({ id: "u1" });
});

describe.each(CASES)("$name(G-113)", ({ call, fn, args, paths }) => {
  it("A1: 未ログインなら /login へリダイレクトし、ロジック層を呼ばない", async () => {
    mockUser(null);

    await expect(call()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(fn()).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("A4: 成功したら結果を返し、引数をそのまま渡し、決まったパスだけを再検証する", async () => {
    vi.mocked(fn()).mockResolvedValue({ ok: true } as never);

    const result = await call();

    expect(result).toEqual({ ok: true });
    expect(fn()).toHaveBeenCalledWith(expect.anything(), ...args);
    expect(vi.mocked(revalidatePath).mock.calls.map(([p]) => p)).toEqual(paths);
  });

  it("A3: 失敗したら再検証しない", async () => {
    vi.mocked(fn()).mockResolvedValue({ ok: false } as never);

    const result = await call();

    expect(result).toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
