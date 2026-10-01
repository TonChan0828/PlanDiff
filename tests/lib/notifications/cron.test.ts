import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  listStaleEntries: vi.fn(),
  listPushSubscriptions: vi.fn(),
  markStaleNotified: vi.fn(),
  deletePushSubscriptionById: vi.fn(),
  sendStaleTimerPush: vi.fn(),
}));
vi.mock("@/lib/notifications/store", () => mocks);
vi.mock("@/lib/notifications/push", () => mocks);
import { GET } from "@/app/api/cron/stale-timers/route";
const request = () =>
  new Request("http://localhost/api/cron/stale-timers", {
    headers: { authorization: "Bearer secret" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = "secret";
  mocks.listStaleEntries.mockResolvedValue([
    {
      id: "entry",
      userId: "user",
      title: "private title",
      startAt: new Date(2026, 8, 29, 8),
    },
  ]);
  mocks.listPushSubscriptions.mockResolvedValue([
    { id: "sub", timezone: "Asia/Tokyo" },
  ]);
  mocks.sendStaleTimerPush.mockResolvedValue({ ok: true });
});
describe("N11: cronの障害応答", () => {
  it("対象取得障害なら503を返す", async () => {
    mocks.listStaleEntries.mockRejectedValue(new Error("DB unavailable"));
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(mocks.sendStaleTimerPush).not.toHaveBeenCalled();
  });
  it.each(["listPushSubscriptions", "markStaleNotified"] as const)(
    "%s失敗を通知成功に含めない",
    async (operation) => {
      mocks[operation].mockRejectedValue(new Error("DB unavailable"));
      const result = await GET(request());
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ notified: 0, failed: 1 });
    },
  );
  it("失効購読削除失敗をremovedに含めない", async () => {
    mocks.sendStaleTimerPush.mockResolvedValue({ ok: false, expired: true });
    mocks.deletePushSubscriptionById.mockRejectedValue(
      new Error("DB unavailable"),
    );
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ removed: 0, failed: 1 });
  });
});
