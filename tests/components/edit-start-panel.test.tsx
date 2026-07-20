import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";

import { EditStartPanel } from "@/components/edit-start-panel";
import {
  changeDateTimeStepper,
  expectDateTimeStepperValue,
} from "../helpers/date-time-stepper";

// 仕様書: docs/specs/D-4_計測ヒーローと開始時刻変更.md S3・S4・S5
// 時刻入力はP5-5でDateTimeStepperに置換(docs/specs/P5-5)

const NOW = new Date(2026, 6, 7, 10, 0, 0);
const START = new Date(2026, 6, 7, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPanel(overrides?: {
  onSave?: (startAtIso: string) => void;
  pending?: boolean;
  error?: string | null;
}) {
  return render(
    <EditStartPanel
      initialStartAt={START.toISOString()}
      onSave={overrides?.onSave ?? (() => {})}
      onClose={() => {}}
      pending={overrides?.pending ?? false}
      error={overrides?.error ?? null}
    />,
  );
}

describe("EditStartPanel(S3〜S5)", () => {
  it("S2/S5: 初期値は現在の開始時刻。有効な過去時刻で保存するとISOでonSaveが呼ばれる", () => {
    const onSave = vi.fn();
    renderPanel({ onSave });

    expectDateTimeStepperValue("開始時刻", format(START, "yyyy-MM-dd'T'HH:mm"));

    const newStart = new Date(2026, 6, 7, 8, 30, 0);
    changeDateTimeStepper("開始時刻", format(newStart, "yyyy-MM-dd'T'HH:mm"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(newStart.toISOString());
  });

  it("S3: 未来時刻ではエラーが表示され、onSaveは呼ばれない(異常系)", () => {
    const onSave = vi.fn();
    renderPanel({ onSave });

    const future = new Date(2026, 6, 7, 11, 0, 0);
    changeDateTimeStepper("開始時刻", format(future, "yyyy-MM-dd'T'HH:mm"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      screen.getByText("開始時刻は現在より後にできません"),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("S4: 空欄ではエラーが表示され、onSaveは呼ばれない(境界値)", () => {
    const onSave = vi.fn();
    renderPanel({ onSave });

    changeDateTimeStepper("開始時刻", "");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("開始時刻を入力してください")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("S5: 失敗エラー(props)が表示され、pending中は保存ボタンが無効になる", () => {
    renderPanel({ pending: true, error: "開始時刻を変更できませんでした" });

    expect(
      screen.getByText("開始時刻を変更できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("P5-5 S15: 00分の分ステッパーで下ボタンを押すと時も-1する", () => {
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "開始時刻の分を1戻す" }),
    );

    expectDateTimeStepperValue(
      "開始時刻",
      format(new Date(2026, 6, 7, 8, 59, 0), "yyyy-MM-dd'T'HH:mm"),
    );
  });
});
