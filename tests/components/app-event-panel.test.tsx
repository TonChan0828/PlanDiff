import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";

import { AppEventPanel } from "@/components/app-event-panel";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { changeDateTimeStepper } from "../helpers/date-time-stepper";

// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S2 / S3 / S6
// 時刻入力はP5-5でDateTimeStepperに置換(docs/specs/P5-5)

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

const START_ISO = new Date(2026, 6, 10, 10, 0).toISOString();
const END_ISO = new Date(2026, 6, 10, 11, 0).toISOString();

function localValue(iso: string): string {
  return format(new Date(iso), DATETIME_LOCAL_FORMAT);
}

function renderPanel(overrides?: {
  mode?: "create" | "edit";
  title?: string;
  onSave?: (values: unknown) => void;
  onDelete?: () => void;
}) {
  const onSave = overrides?.onSave ?? vi.fn();
  const onDelete = overrides?.onDelete ?? vi.fn();
  render(
    <AppEventPanel
      mode={overrides?.mode ?? "create"}
      initial={{
        title: overrides?.title ?? "",
        startAt: START_ISO,
        endAt: END_ISO,
      }}
      onSave={onSave}
      onDelete={overrides?.mode === "edit" ? onDelete : undefined}
      onClose={vi.fn()}
      pending={false}
      error={null}
    />,
  );
  return { onSave, onDelete };
}

describe("AppEventPanel のバリデーション(S2/S3)", () => {
  it("S2: タイトルが空白のみの場合は onSave を呼ばずフォーム内エラーを表示する", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel({ title: "" });

    await user.type(screen.getByLabelText(M.eventTitleField), "   ");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(M.eventTitleRequired)).toBeInTheDocument();
  });

  it("S3(境界値): 終了=開始はエラー、終了=開始+1分なら onSave が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel({ title: "設計作業" });

    // 終了=開始(同時刻)→ エラー
    changeDateTimeStepper(M.eventEndField, localValue(START_ISO));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(M.eventInvalidRange)).toBeInTheDocument();

    // 終了=開始+1分 → 送信される(UTCのISOで渡る)
    const oneMinuteLater = new Date(new Date(START_ISO).getTime() + 60_000);
    changeDateTimeStepper(
      M.eventEndField,
      format(oneMinuteLater, DATETIME_LOCAL_FORMAT),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledWith({
      title: "設計作業",
      startAt: START_ISO,
      endAt: oneMinuteLater.toISOString(),
    });
  });
});

describe("AppEventPanel の削除(S6)", () => {
  it("S6: 削除は確認ステップを挟み、確定で onDelete が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderPanel({ mode: "edit", title: "設計作業" });

    await user.click(screen.getByRole("button", { name: "削除" }));
    expect(screen.getByText(M.eventDeleteConfirm)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: M.eventDeleteConfirmYes }),
    );
    expect(onDelete).toHaveBeenCalled();
  });
});
