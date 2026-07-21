import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DateTimeStepper } from "@/components/date-time-stepper";
import { expectDateTimeStepperValue } from "../helpers/date-time-stepper";

// 仕様: docs/specs/P5-6_日時セグメント編集.md #テストシナリオ(コンポーネント S13〜S30)

// value を state で保持する制御ラッパー。実利用と同じく onChange→再レンダーを再現し、
// セグメントを跨ぐ数字入力(桁の自動送り)を正しく検証できるようにする。
function renderStepper(overrides?: {
  value?: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
}) {
  const spy = overrides?.onChange ?? vi.fn();
  let latest = overrides?.value ?? "2026-07-20T10:00";

  function Wrapper() {
    const [v, setV] = useState(latest);
    return (
      <DateTimeStepper
        label="開始時刻"
        value={v}
        disabled={overrides?.disabled}
        onChange={(next) => {
          latest = next;
          setV(next);
          spy(next);
        }}
      />
    );
  }

  const utils = render(<Wrapper />);
  return { onChange: spy, getValue: () => latest, ...utils };
}

const seg = (name: string) => screen.getByRole("spinbutton", { name });

function typeDigits(digits: string) {
  for (const d of digits) {
    fireEvent.keyDown(document.activeElement as Element, { key: d });
  }
}

describe("DateTimeStepper (P5-6)", () => {
  it("S13: 時にフォーカスしArrowRightで分へ移動する", () => {
    renderStepper();
    const hour = seg("開始時刻の時");
    hour.focus();
    fireEvent.keyDown(hour, { key: "ArrowRight" });
    expect(document.activeElement).toBe(seg("開始時刻の分"));
  });

  it("S14: 分にフォーカスしArrowLeftで時へ移動する", () => {
    renderStepper();
    const minute = seg("開始時刻の分");
    minute.focus();
    fireEvent.keyDown(minute, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(seg("開始時刻の時"));
  });

  it("S15: 年でArrowLeftを押しても年のまま(先頭で止まる)", () => {
    renderStepper();
    const year = seg("開始時刻の年");
    year.focus();
    fireEvent.keyDown(year, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(year);
  });

  it("S16: 分でArrowRightを押しても分のまま(末尾で止まる)", () => {
    renderStepper();
    const minute = seg("開始時刻の分");
    minute.focus();
    fireEvent.keyDown(minute, { key: "ArrowRight" });
    expect(document.activeElement).toBe(minute);
  });

  it("S17: 年からArrowRight連打で年→月→日→時→分の順に移動する", () => {
    renderStepper();
    seg("開始時刻の年").focus();
    const order = [
      "開始時刻の月",
      "開始時刻の日",
      "開始時刻の時",
      "開始時刻の分",
    ];
    for (const name of order) {
      fireEvent.keyDown(document.activeElement as Element, {
        key: "ArrowRight",
      });
      expect(document.activeElement).toBe(seg(name));
    }
  });

  it("S18: 分59でArrowUpすると時も+1する(桁跨ぎ)", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:59" });
    const minute = seg("開始時刻の分");
    minute.focus();
    fireEvent.keyDown(minute, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("2026-07-20T11:00");
  });

  it("S19: 分00でArrowDownすると時も-1する", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:00" });
    const minute = seg("開始時刻の分");
    minute.focus();
    fireEvent.keyDown(minute, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("2026-07-20T09:59");
  });

  it("S20: 7/31の日でArrowUpすると8/1になる(日→月跨ぎ)", () => {
    const { onChange } = renderStepper({ value: "2026-07-31T10:00" });
    const day = seg("開始時刻の日");
    day.focus();
    fireEvent.keyDown(day, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("2026-08-01T10:00");
  });

  it("S21: 時にフォーカスし 0 9 3 0 と打つと自動送りで 09:30 になる", () => {
    const { getValue } = renderStepper({ value: "2026-07-20T10:00" });
    seg("開始時刻の時").focus();
    typeDigits("0930");
    expect(getValue()).toBe("2026-07-20T09:30");
    expect(document.activeElement).toBe(seg("開始時刻の分"));
  });

  it("S22: 月に 0 3 と打つと月=03を確定し日へ自動送りする", () => {
    const { getValue } = renderStepper({ value: "2026-07-20T10:00" });
    seg("開始時刻の月").focus();
    typeDigits("03");
    expect(getValue()).toBe("2026-03-20T10:00");
    expect(document.activeElement).toBe(seg("開始時刻の日"));
  });

  it("S23: 時に 7 を打つと1桁で確定・自動送りする", () => {
    const { getValue } = renderStepper({ value: "2026-07-20T10:00" });
    seg("開始時刻の時").focus();
    typeDigits("7");
    expect(getValue()).toBe("2026-07-20T07:00");
    expect(document.activeElement).toBe(seg("開始時刻の分"));
  });

  it("S24: 共有▲ボタンはフォーカス中セグメント(既定=分)に作用する", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:00" });
    fireEvent.click(
      screen.getByRole("button", { name: "開始時刻の分を1進める" }),
    );
    expect(onChange).toHaveBeenCalledWith("2026-07-20T10:01");
  });

  it("S25: カレンダーボタンで隠しdate入力のshowPickerを呼ぶ", () => {
    const showPicker = vi.fn();
    // jsdomにshowPickerが無いためプロトタイプへ差し込む
    (
      HTMLInputElement.prototype as unknown as { showPicker: () => void }
    ).showPicker = showPicker;
    renderStepper({ value: "2026-07-20T10:00" });
    fireEvent.click(
      screen.getByRole("button", { name: "開始時刻をカレンダーで選ぶ" }),
    );
    expect(showPicker).toHaveBeenCalled();
    delete (
      HTMLInputElement.prototype as unknown as { showPicker?: () => void }
    ).showPicker;
  });

  it("S26: 隠しdate入力を変更すると日付だけ差し替わり時分は維持される", () => {
    const { onChange } = renderStepper({ value: "2026-07-20T10:30" });
    fireEvent.change(screen.getByLabelText("開始時刻の日付"), {
      target: { value: "2026-09-01" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-09-01T10:30");
  });

  it("S27: 値が空のときセグメント・共有▲▼はdisabled、カレンダーは有効", () => {
    renderStepper({ value: "" });
    expect(seg("開始時刻の年")).toBeDisabled();
    expect(seg("開始時刻の分")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "開始時刻の分を1進める" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "開始時刻をカレンダーで選ぶ" }),
    ).toBeEnabled();
  });

  it("S28: 空のときカレンダーで日付を選ぶと00:00で確定する", () => {
    const { onChange } = renderStepper({ value: "" });
    fireEvent.change(screen.getByLabelText("開始時刻の日付"), {
      target: { value: "2026-07-20" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-07-20T00:00");
  });

  it("S29: disabledで全体が無効化される", () => {
    renderStepper({ value: "2026-07-20T10:30", disabled: true });
    expect(seg("開始時刻の年")).toBeDisabled();
    expect(seg("開始時刻の時")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "開始時刻をカレンダーで選ぶ" }),
    ).toBeDisabled();
  });

  it("S30: 年月日時分がラベル付きspinbuttonとして取得でき表示が一致する(a11y)", () => {
    renderStepper({ value: "2026-07-20T10:30" });
    expect(seg("開始時刻の年")).toHaveValue("2026");
    expect(seg("開始時刻の月")).toHaveValue("07");
    expect(seg("開始時刻の日")).toHaveValue("20");
    expect(seg("開始時刻の時")).toHaveValue("10");
    expect(seg("開始時刻の分")).toHaveValue("30");
    expectDateTimeStepperValue("開始時刻", "2026-07-20T10:30");
  });
});
