import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NotificationSettings } from "@/components/notification-settings";
import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S12〜S18

type SetupOptions = {
  supported?: boolean;
  permission?: NotificationPermission;
  existingSubscription?: boolean;
  standalone?: boolean;
  userAgent?: string;
  /** requestPermission が "denied" を返す(許可ダイアログ自体で拒否される)経路 */
  permissionDenied?: boolean;
  /** 許可は下りるが pushManager.subscribe() 自体が失敗する経路(VAPID鍵不整合等) */
  subscribeFails?: boolean;
};

const subscribe = vi.fn();
const getSubscription = vi.fn();
const unsubscribe = vi.fn();
const requestPermission = vi.fn();
// fetch はテストから呼び出し引数・順序を検査したいので、専用のモックを使い回す
// (setup() のたびに vi.fn() を作り直すと前のテストの呼び出し履歴と混ざらない代わりに、
// テスト内で参照する変数が用意できなくなるため)
const fetchMock = vi.fn();

function setup(options: SetupOptions = {}) {
  const {
    supported = true,
    permission = "default",
    existingSubscription = false,
    standalone = true,
    userAgent = "Mozilla/5.0 (Macintosh)",
    permissionDenied = false,
    subscribeFails = false,
  } = options;

  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("standalone") ? standalone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });

  if (!supported) {
    // PushManager も serviceWorker も無い環境を作る
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    return;
  }

  const fakeSubscription = {
    endpoint: "https://push.example.com/a",
    unsubscribe: unsubscribe.mockResolvedValue(true),
    toJSON: () => ({
      endpoint: "https://push.example.com/a",
      keys: { p256dh: "p256dh", auth: "auth" },
    }),
  };

  getSubscription.mockResolvedValue(
    existingSubscription ? fakeSubscription : null,
  );
  subscribe.mockImplementation(() =>
    subscribeFails
      ? Promise.reject(new Error("subscribe failed"))
      : Promise.resolve(fakeSubscription),
  );
  requestPermission.mockResolvedValue(
    permissionDenied ? "denied" : ("granted" as NotificationPermission),
  );

  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      register: vi
        .fn()
        .mockResolvedValue({ pushManager: { subscribe, getSubscription } }),
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
    },
    configurable: true,
  });
  vi.stubGlobal("Notification", { permission, requestPermission });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // navigator.serviceWorker は defineProperty で足しているため
  // unstubAllGlobals では消えない。次のテストへ漏らさないよう明示的に消す
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Reflect.deleteProperty(window, "PushManager");
});

describe("NotificationSettings(S12〜S18)", () => {
  it("S12: PushManager非対応かつ非standaloneならホーム画面追加を案内する", async () => {
    setup({
      supported: false,
      standalone: false,
      userAgent: "Mozilla/5.0 (iPhone)",
    });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.iosNeedsHomeScreen)).toBeInTheDocument();
  });

  it("S13: 未許可なら「通知を有効にする」ボタンが出る", async () => {
    setup({ permission: "default" });

    render(<NotificationSettings />);

    expect(
      await screen.findByRole("button", { name: M.enableButton }),
    ).toBeInTheDocument();
  });

  it("S14: ブロック済みなら案内が出て、有効化ボタンは出ない", async () => {
    setup({ permission: "denied" });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: M.enableButton }),
    ).not.toBeInTheDocument();
  });

  it("S15: 既存購読ありなら「この端末で有効」と解除ボタンが出る", async () => {
    setup({ permission: "granted", existingSubscription: true });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.enabledOnThisDevice)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M.disableButton }),
    ).toBeInTheDocument();
  });

  it("S16: 有効化で requestPermission → subscribe → POST の順に呼ばれ、正しい引数が渡る", async () => {
    setup({ permission: "default" });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/subscribe",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // 呼び出し順序そのものを検証する(toHaveBeenCalled の並記では逆順でも通ってしまう)
    const permissionOrder = requestPermission.mock.invocationCallOrder[0]!;
    const subscribeOrder = subscribe.mock.invocationCallOrder[0]!;
    const fetchOrder = fetchMock.mock.invocationCallOrder[0]!;
    expect(permissionOrder).toBeLessThan(subscribeOrder);
    expect(subscribeOrder).toBeLessThan(fetchOrder);

    // subscribe に渡すオプション(VAPID鍵の変換結果を含む)を検証する
    const subscribeArgs = subscribe.mock.calls[0]![0] as {
      userVisibleOnly: boolean;
      applicationServerKey: unknown;
    };
    expect(subscribeArgs.userVisibleOnly).toBe(true);
    expect(subscribeArgs.applicationServerKey).toBeInstanceOf(Uint8Array);

    // fetch の body(購読情報とタイムゾーン)を検証する
    const requestInit = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      timezone: string;
    };
    expect(body.endpoint).toBe("https://push.example.com/a");
    expect(body.keys).toEqual({ p256dh: "p256dh", auth: "auth" });
    expect(typeof body.timezone).toBe("string");
  });

  it("S17: 許可ダイアログで拒否されたらブロック案内に切り替わる", async () => {
    setup({ permission: "default", permissionDenied: true });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
  });

  it("許可は下りたがsubscribe自体が失敗したらブロック案内に切り替わる", async () => {
    setup({ permission: "default", subscribeFails: true });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalled();
    });
    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
  });

  it("無効にするとDELETEが呼ばれ、unsubscribeされて未設定表示に戻る", async () => {
    setup({ permission: "granted", existingSubscription: true });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.disableButton }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/subscribe",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(unsubscribe).toHaveBeenCalled();
    });
    expect(await screen.findByText(M.notEnabled)).toBeInTheDocument();
  });

  it("DELETEが失敗したらエラーを表示し、unsubscribeせず有効のままにする", async () => {
    setup({ permission: "granted", existingSubscription: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.disableButton }),
    );

    expect(await screen.findByText(M.disableFailed)).toBeInTheDocument();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByText(M.enabledOnThisDevice)).toBeInTheDocument();
  });

  it("S18: POSTが失敗したら日本語のエラーが表示される", async () => {
    setup({ permission: "default" });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    expect(await screen.findByText(M.enableFailed)).toBeInTheDocument();
  });
});
