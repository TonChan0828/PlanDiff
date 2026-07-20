import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DateTimeStepper } from "@/components/date-time-stepper";
import { expectDateTimeStepperValue } from "../helpers/date-time-stepper";

// 仕様: docs/specs/P5-5_時刻ステッパー入力.md #テストシナリオ(S15〜S23)

function renderStepper(overrides?: {
  value?: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
}) {
  const onChange = overrides?.onChange ?? vi.fn();
  const utils = render(
    <DateTimeStepper
      label="開始時刻"
      value={overrides?.value ?? "2026-07-20T10:00"}
      onChange={onChange}
      disabled={overrides?.disabled}
    />,
  );
  return { onChange, ...utils };
}

describe("DateTimeStepper", () => {
  it("S15: 00分で下ボタンを押すと時も-1する(本要望の中心シナリオ)", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:00" });

    fireEvent.click(
      screen.getByRole("button", { name: "開始時刻の分を1戻す" }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-07-20T09:59");
  });

  it("S16: 59分で上ボタンを押すと時も+1する", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:59" });

    fireEvent.click(
      screen.getByRole("button", { name: "開始時刻の分を1進める" }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-07-20T11:00");
  });

  it("S17: 分の入力にフォーカスしArrowDownを押すとボタンと同じ桁跨ぎ処理が走る", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:00" });

    const minuteInput = screen.getByLabelText("開始時刻の分");
    fireEvent.keyDown(minuteInput, { key: "ArrowDown" });

    expect(onChange).toHaveBeenCalledWith("2026-07-20T09:59");
  });

  it("S18: 時に直接入力してblurすると確定する(桁は跨がない)", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:30" });

    const hourInput = screen.getByLabelText("開始時刻の時");
    fireEvent.change(hourInput, { target: { value: "7" } });
    fireEvent.blur(hourInput);

    expect(onChange).toHaveBeenCalledWith("2026-07-20T07:30");
  });

  it("S19: 時に不正な値を入力してblurするとonChangeは呼ばれず表示が復元する(異常系)", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:30" });

    const hourInput = screen.getByLabelText("開始時刻の時");
    fireEvent.change(hourInput, { target: { value: "abc" } });
    fireEvent.blur(hourInput);

    expect(onChange).not.toHaveBeenCalled();
    expect(hourInput).toHaveValue("10");
  });

  it("S20: 値が空のとき時・分の入力とボタンがdisabledになる(境界値・未入力)", () => {
    renderStepper({ value: "" });

    expect(screen.getByLabelText("開始時刻の時")).toBeDisabled();
    expect(screen.getByLabelText("開始時刻の分")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "開始時刻の時を1進める" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "開始時刻の分を1戻す" }),
    ).toBeDisabled();
  });

  it("S21: 値が空のとき日付を入力すると00:00で確定する(直近の有効値がない場合のデフォルト)", () => {
    const { onChange } = renderStepper({ value: "" });

    fireEvent.change(screen.getByLabelText("開始時刻の日付"), {
      target: { value: "2026-07-20" },
    });

    expect(onChange).toHaveBeenCalledWith("2026-07-20T00:00");
  });

  it("S22: 日付をクリアすると全体が空になる", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:30" });

    fireEvent.change(screen.getByLabelText("開始時刻の日付"), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("S23: 時・分の入力はラベル付きspinbuttonとして取得できる(a11y)", () => {
    renderStepper({ value: "2026-07-20T10:30" });

    expect(
      screen.getByRole("spinbutton", { name: "開始時刻の時" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "開始時刻の分" }),
    ).toBeInTheDocument();
  });

  it("disabledプロパティで全体が無効化される", () => {
    renderStepper({ value: "2026-07-20T10:30", disabled: true });

    expect(screen.getByLabelText("開始時刻の日付")).toBeDisabled();
    expect(screen.getByLabelText("開始時刻の時")).toBeDisabled();
    expect(screen.getByLabelText("開始時刻の分")).toBeDisabled();
  });

  it("ヘルパーで日付・時・分の表示値を検証できる", () => {
    renderStepper({ value: "2026-07-20T10:30" });
    expectDateTimeStepperValue("開始時刻", "2026-07-20T10:30");
  });
});
