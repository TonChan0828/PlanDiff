import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendStaleTimerPush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/push", () => ({ sendStaleTimerPush }));

import { GET } from "@/app/api/cron/stale-timers/route";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S3・S4・S24〜S31
// R-1: 日時はローカルTZで構築する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const CRON_SECRET = "test-cron-secret";

/** GET /api/cron/stale-timers のレスポンス契約。ブリーフで定められた形状 */
type CronSummary = {
  candidates: number;
  notified: number;
  failed: number;
  removed: number;
};

function cronRequest(secret: string | null): Request {
  return new Request("http://localhost/api/cron/stale-timers", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

/** 現在時刻から hoursAgo 時間前に開始した実行中タイマーを作る */
async function seedRunningEntry(
  userId: string,
  hoursAgo: number,
  title = "設計レビュー",
): Promise<string> {
  const startAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const { data, error } = await admin
    .from("time_entries")
    .insert({ user_id: userId, title, start_at: startAt.toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function seedSubscription(
  userId: string,
  endpoint: string,
): Promise<string> {
  const { data, error } = await admin
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      endpoint,
      p256dh_key: "p256dh",
      auth_key: "auth",
      timezone: "Asia/Tokyo",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "cronA");
  userB = await createTestUser(admin, "cronB");
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  sendStaleTimerPush.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await admin.from("time_entries").delete().in("user_id", [userA.id, userB.id]);
  await admin
    .from("push_subscriptions")
    .delete()
    .in("user_id", [userA.id, userB.id]);
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

describe("認証(S24〜S26)", () => {
  it("S24: Authorization ヘッダなしは401", async () => {
    const response = await GET(cronRequest(null));
    expect(response.status).toBe(401);
  });

  it("S25: 誤ったsecretは401", async () => {
    const response = await GET(cronRequest("wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("S26: CRON_SECRET 未設定なら、検証なしにフォールバックせず401", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(cronRequest(CRON_SECRET));
    expect(response.status).toBe(401);
  });
});

describe("検知と送信(S3・S4・S27〜S31)", () => {
  it("S27: 対象があれば送信され、stale_notified_at が更新される", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");

    const response = await GET(cronRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(sendStaleTimerPush).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as CronSummary;
    expect(body.candidates).toBe(1);
    expect(body.notified).toBe(1);
    expect(body.failed).toBe(0);
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).not.toBeNull();
  });

  // 追加テスト(ブリーフ外・実装者判断): 仕様書シナリオ1「経過ちょうど12時間00分の計測が
  // 対象になる」は listStaleEntries の .lte()(境界を含む)に依存する。
  // seedRunningEntry は Date.now() 基準、cron は自身の new Date() 基準のため、素朴に
  // 呼ぶだけでは両者の間に数ミリ秒〜数百ミリ秒のズレが生じ、.lte でも .lt でも
  // 通ってしまいうる(境界の証明にならない)。
  // vi.useFakeTimers + setSystemTime でシステム時刻を固定し、seed時のstart_atと
  // cron内部のnowをミリ秒まで一致させることで、.lte を守る唯一の砦にする。
  it("S1: 経過ちょうど12時間の計測も対象に含まれる(lte境界)", async () => {
    const fixedNow = new Date(2026, 7, 24, 9, 0, 0, 0); // ローカルTZで構築(R-1)
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    let entryId: string;
    let response: Response;
    try {
      entryId = await seedRunningEntry(userA.id, 12);
      await seedSubscription(userA.id, "https://push.example.com/a");

      response = await GET(cronRequest(CRON_SECRET));
    } finally {
      vi.useRealTimers();
    }

    expect(response.status).toBe(200);
    expect(sendStaleTimerPush).toHaveBeenCalledTimes(1);
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).not.toBeNull();
  });

  it("S3: end_at が入っている計測は対象外", async () => {
    const startAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() - 60 * 60 * 1000);
    await admin.from("time_entries").insert({
      user_id: userA.id,
      title: "完了済み",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    });
    await seedSubscription(userA.id, "https://push.example.com/a");

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S4: stale_notified_at が入っている計測は対象外", async () => {
    const startAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    await admin.from("time_entries").insert({
      user_id: userA.id,
      title: "通知済み",
      start_at: startAt.toISOString(),
      stale_notified_at: new Date().toISOString(),
    });
    await seedSubscription(userA.id, "https://push.example.com/a");

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S28: 対象がなければ200で送信0件", async () => {
    await seedRunningEntry(userA.id, 3);
    await seedSubscription(userA.id, "https://push.example.com/a");

    const response = await GET(cronRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S29: 購読が0件のユーザーは stale_notified_at が更新されない", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);

    const response = await GET(cronRequest(CRON_SECRET));

    const body = (await response.json()) as CronSummary;
    expect(body.candidates).toBe(1);
    expect(body.notified).toBe(0);
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).toBeNull();
  });

  it("S30: 410を返した購読は push_subscriptions から削除される", async () => {
    await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");
    sendStaleTimerPush.mockResolvedValue({ ok: false, expired: true });

    const response = await GET(cronRequest(CRON_SECRET));

    const body = (await response.json()) as CronSummary;
    expect(body.removed).toBe(1);
    const { data } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userA.id);
    expect(data).toHaveLength(0);
  });

  it("S31: 1つの購読が失敗しても同一ユーザーの他の購読への送信は続く", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");
    await seedSubscription(userA.id, "https://push.example.com/b");
    sendStaleTimerPush
      .mockResolvedValueOnce({ ok: false, expired: false })
      .mockResolvedValueOnce({ ok: true });

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).toHaveBeenCalledTimes(2);
    // 1件でも成功していればマークする
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).not.toBeNull();
  });
});
