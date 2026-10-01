import { beforeEach, describe, expect, it, vi } from "vitest";

const deletePushSubscriptionForUser = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const cookies = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
const getCookie = vi.hoisted(() => vi.fn());
const deleteCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/store", () => ({ deletePushSubscriptionForUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));

import { signOutAction } from "@/app/(app)/actions";
import { DEVICE_SUBSCRIPTION_COOKIE } from "@/lib/notifications/device-cookie";

function setup(
  options: { userId?: string | null; subscriptionId?: string } = {},
) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: options.userId === null ? null : { id: options.userId ?? "user-1" },
    },
  });
  createClient.mockResolvedValue({ auth: { signOut, getUser } });
  getCookie.mockReturnValue(
    options.subscriptionId ? { value: options.subscriptionId } : undefined,
  );
  cookies.mockResolvedValue({ get: getCookie, delete: deleteCookie });
  return { signOut, getUser };
}

beforeEach(() => {
  vi.clearAllMocks();
  deletePushSubscriptionForUser.mockResolvedValue(undefined);
});

describe("signOutAction device subscription cleanup", () => {
  it("N8: logout deletes only this device row scoped to the signed-in user before signing out", async () => {
    const { signOut } = setup({ subscriptionId: "sub-device-a" });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(deletePushSubscriptionForUser).toHaveBeenCalledWith(
      "sub-device-a",
      "user-1",
    );
    expect(
      deletePushSubscriptionForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(signOut.mock.invocationCallOrder[0]!);
    expect(deleteCookie).toHaveBeenCalledWith(DEVICE_SUBSCRIPTION_COOKIE);
  });

  it("N9: DB removal failure keeps the session and cookie so logout can be retried", async () => {
    const { signOut } = setup({ subscriptionId: "sub-device-a" });
    deletePushSubscriptionForUser.mockRejectedValue(
      new Error("database details must not escape"),
    );
    await expect(signOutAction()).rejects.toThrow(
      "NEXT_REDIRECT:/settings?error=notification_logout_failed",
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("N8: a missing device cookie does not prevent logout", async () => {
    const { signOut } = setup();
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(deletePushSubscriptionForUser).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
