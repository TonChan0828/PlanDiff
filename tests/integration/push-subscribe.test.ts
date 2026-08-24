import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { DELETE, POST } from "@/app/api/notifications/subscribe/route";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S19〜S23

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

function mockLoggedInUser(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  endpoint: "https://push.example.com/endpoint-a",
  keys: { p256dh: "p256dh-a", auth: "auth-a" },
  timezone: "Asia/Tokyo",
};

beforeAll(async () => {
  userA = await createTestUser(admin, "通知A");
  userB = await createTestUser(admin, "通知B");
});

afterEach(async () => {
  await admin
    .from("push_subscriptions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  vi.clearAllMocks();
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

describe("POST /api/notifications/subscribe(S19〜S22)", () => {
  it("S19: 未認証は401", async () => {
    mockLoggedInUser(null);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(401);
  });

  it("S20: 正常なPOSTは204を返し、行が1件作られる", async () => {
    mockLoggedInUser(userA.id);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(204);
    const { data } = await admin
      .from("push_subscriptions")
      .select("user_id, endpoint, timezone")
      .eq("user_id", userA.id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.endpoint).toBe(validBody.endpoint);
    expect(data?.[0]?.timezone).toBe("Asia/Tokyo");
  });

  it("S21: 同一endpointの再POSTはupsertになり、行が増えずtimezoneが更新される", async () => {
    mockLoggedInUser(userA.id);
    await POST(jsonRequest(validBody));

    const response = await POST(
      jsonRequest({ ...validBody, timezone: "America/New_York" }),
    );

    expect(response.status).toBe(204);
    const { data } = await admin
      .from("push_subscriptions")
      .select("timezone")
      .eq("endpoint", validBody.endpoint);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.timezone).toBe("America/New_York");
  });

  it("S22: keys.p256dh が欠けていれば400", async () => {
    mockLoggedInUser(userA.id);

    const response = await POST(
      jsonRequest({
        endpoint: validBody.endpoint,
        keys: { auth: "auth-a" },
        timezone: "Asia/Tokyo",
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/notifications/subscribe(S23)", () => {
  it("S23: 本人の購読だけを削除し、他ユーザーの行は残す", async () => {
    mockLoggedInUser(userA.id);
    await POST(jsonRequest(validBody));
    mockLoggedInUser(userB.id);
    await POST(
      jsonRequest({
        ...validBody,
        endpoint: "https://push.example.com/endpoint-b",
      }),
    );

    mockLoggedInUser(userA.id);
    const response = await DELETE(
      new Request("http://localhost/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: validBody.endpoint }),
      }),
    );

    expect(response.status).toBe(204);
    const { data } = await admin.from("push_subscriptions").select("user_id");
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(userB.id);
  });
});
