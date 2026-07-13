import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProInterestButton,
  PRO_INTEREST_STORAGE_KEY,
} from "@/components/pro-interest-button";

// 仕様書: docs/specs/P4-4_料金ページ.md S2〜S6
// 「Proに興味あり」ボタンの送信・連打防止・失敗時・再訪問・view送信

const BUTTON_LABEL = "Proに興味あり";
const THANKS_TEXT = "興味を受け付けました。ありがとうございます!";
const ERROR_TEXT = "送信に失敗しました。時間をおいてもう一度お試しください";

const fetchMock = vi.fn();

function fetchBodies(): { event: string }[] {
  return fetchMock.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  );
}

function clickCalls(): number {
  return fetchBodies().filter((body) => body.event === "click").length;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProInterestButton", () => {
  it("S2: クリックでclickイベントが1回POSTされ、成功後はお礼の完了表示になりフラグが保存される", async () => {
    const user = userEvent.setup();
    render(<ProInterestButton />);

    await user.click(screen.getByRole("button", { name: BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByText(THANKS_TEXT)).toBeInTheDocument();
    });
    expect(clickCalls()).toBe(1);
    const [url, init] = fetchMock.mock.calls.find(
      ([, i]) =>
        JSON.parse((i as RequestInit).body as string).event === "click",
    )!;
    expect(url).toBe("/api/pro-interest");
    expect((init as RequestInit).method).toBe("POST");
    expect(
      window.localStorage.getItem(PRO_INTEREST_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("S3: 送信中の再クリックでは追加のPOSTが発生しない(連打防止)", async () => {
    // viewは即成功、clickは未解決のままにする
    let resolveClick: (value: Response) => void = () => {};
    fetchMock.mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.event === "click") {
        return new Promise<Response>((resolve) => {
          resolveClick = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const user = userEvent.setup();
    render(<ProInterestButton />);

    const button = screen.getByRole("button", { name: BUTTON_LABEL });
    await user.click(button);
    await user.click(button);
    expect(clickCalls()).toBe(1);

    resolveClick(new Response(null, { status: 204 }));
    await waitFor(() => {
      expect(screen.getByText(THANKS_TEXT)).toBeInTheDocument();
    });
  });

  it("S4: POSTが失敗したら日本語エラーを表示し、ボタンは再度押せる状態に戻る", async () => {
    fetchMock.mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.event === "click") {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const user = userEvent.setup();
    render(<ProInterestButton />);

    await user.click(screen.getByRole("button", { name: BUTTON_LABEL }));

    expect(await screen.findByText(ERROR_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BUTTON_LABEL })).toBeEnabled();
    expect(window.localStorage.getItem(PRO_INTEREST_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText(THANKS_TEXT)).not.toBeInTheDocument();
  });

  it("S5: 興味ありフラグが保存済みなら最初から完了表示になり、clickのPOSTは発生しない", async () => {
    window.localStorage.setItem(PRO_INTEREST_STORAGE_KEY, "1");
    render(<ProInterestButton />);

    expect(screen.getByText(THANKS_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: BUTTON_LABEL }),
    ).not.toBeInTheDocument();
    // viewの送信完了を待ってからclickが0件であることを確認する
    await waitFor(() => {
      expect(fetchBodies().some((body) => body.event === "view")).toBe(true);
    });
    expect(clickCalls()).toBe(0);
  });

  it("S6: マウント時にviewイベントが1回POSTされ、失敗してもエラーUIは表示されない", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<ProInterestButton />);

    await waitFor(() => {
      expect(
        fetchBodies().filter((body) => body.event === "view"),
      ).toHaveLength(1);
    });
    expect(screen.queryByText(ERROR_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: BUTTON_LABEL })).toBeEnabled();
  });
});
