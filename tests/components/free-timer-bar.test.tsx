import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FreeTimerBar } from "@/components/free-timer-bar";

// 仕様書: docs/specs/P2-3_フリータイマー.md S1〜S4

describe("FreeTimerBar", () => {
  it("S1: タイトルを入力して開始ボタンをタップすると、トリムされたタイトルでonStartが呼ばれる", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<FreeTimerBar onStart={onStart} pending={false} />);

    await user.type(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
      "読書",
    );
    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(onStart).toHaveBeenCalledWith("読書");
  });

  it("S2: タイトル未入力(空欄)のまま開始すると、空文字でonStartが呼ばれる", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<FreeTimerBar onStart={onStart} pending={false} />);

    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(onStart).toHaveBeenCalledWith("");
  });

  it("S3: タイトル前後の空白はトリムされてonStartが呼ばれる", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<FreeTimerBar onStart={onStart} pending={false} />);

    await user.type(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
      "  読書  ",
    );
    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(onStart).toHaveBeenCalledWith("読書");
  });

  it("S4: pending中は入力欄と開始ボタンが無効化される", () => {
    render(<FreeTimerBar onStart={vi.fn()} pending={true} />);

    expect(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    ).toBeDisabled();
  });
});
