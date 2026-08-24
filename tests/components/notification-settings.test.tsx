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
  subscribeRejects?: boolean;
};

const subscribe = vi.fn();
const getSubscription = vi.fn();
const unsubscribe = vi.fn();
const requestPermission = vi.fn();

function setup(options: SetupOptions = {}) {
  const {
    supported = true,
    permission = "default",
    existingSubscription = false,
    standalone = true,
    userAgent = "Mozilla/5.0 (Macintosh)",
    subscribeRejects = false,
  } = options;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
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
    subscribeRejects
      ? Promise.reject(new Error("denied"))
      : Promise.resolve(fakeSubscription),
  );
  requestPermission.mockResolvedValue(
    subscribeRejects ? "denied" : ("granted" as NotificationPermission),
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

  it("S16: 有効化で requestPermission → subscribe → POST の順に呼ばれる", async () => {
    setup({ permission: "default" });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        "/api/notifications/subscribe",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("S17: 許可を拒否されたらブロック案内に切り替わる", async () => {
    setup({ permission: "default", subscribeRejects: true });

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
  });

  it("S18: POSTが失敗したら日本語のエラーが表示される", async () => {
    setup({ permission: "default" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    render(<NotificationSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: M.enableButton }),
    );

    expect(await screen.findByText(M.enableFailed)).toBeInTheDocument();
  });
});
