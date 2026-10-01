import { beforeEach, describe, expect, it, vi } from "vitest";
const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));
import {
  listStaleEntries,
  listPushSubscriptions,
  markStaleNotified,
  deletePushSubscriptionById,
} from "@/lib/notifications/store";

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    is: vi.fn(),
    lte: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    then: (resolve: (value: unknown) => void) =>
      Promise.resolve(result).then(resolve),
  };
  for (const method of [
    builder.select,
    builder.is,
    builder.lte,
    builder.gt,
    builder.order,
    builder.limit,
    builder.eq,
    builder.update,
    builder.delete,
  ])
    method.mockReturnValue(builder);
  return builder;
}
beforeEach(() => {
  from.mockReset();
});

describe("通知ストア", () => {
  it("N10: 1,001件の候補をid順に全件取得する", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: String(i).padStart(4, "0"),
      user_id: `user-${i}`,
      title: "作業",
      start_at: new Date(2026, 8, 29, 8).toISOString(),
    }));
    const first = query({ data: rows.slice(0, 1000), error: null });
    const second = query({ data: rows.slice(1000), error: null });
    from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const result = await listStaleEntries(new Date(2026, 8, 30, 8));
    expect(result).toHaveLength(1001);
    expect(new Set(result.map((row) => row.id)).size).toBe(1001);
    expect(first.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(second.gt).toHaveBeenCalledWith("id", "0999");
  });
  it.each(["list", "subscriptions", "mark", "delete"])(
    "N11: %sのDB障害を成功扱いしない",
    async (operation) => {
      from.mockReturnValue(query({ data: null, error: { code: "08006" } }));
      const pending =
        operation === "list"
          ? listStaleEntries(new Date())
          : operation === "subscriptions"
            ? listPushSubscriptions("user")
            : operation === "mark"
              ? markStaleNotified("id", new Date())
              : deletePushSubscriptionById("id");
      await expect(pending).rejects.toThrow();
    },
  );
});
