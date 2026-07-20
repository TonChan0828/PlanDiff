import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";

import { AppEventPanel } from "@/components/app-event-panel";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { changeDateTimeStepper } from "../helpers/date-time-stepper";

// 仕様書: docs/specs/P5-1_定期予定.md S11 / S12 / S13
// 時刻入力はP5-5でDateTimeStepperに置換(docs/specs/P5-5)
// createモード限定の繰り返し予定UI(onSaveRecurringが渡されたときのみ表示)

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

// 2026-07-08(水)
const START_ISO = new Date(2026, 6, 8, 9, 0).toISOString();
const END_ISO = new Date(2026, 6, 8, 10, 0).toISOString();

function renderCreatePanel(overrides?: {
  onSave?: (values: unknown) => void;
  onSaveRecurring?: (values: unknown) => void;
}) {
  const onSave = overrides?.onSave ?? vi.fn();
  const onSaveRecurring = overrides?.onSaveRecurring ?? vi.fn();
  render(
    <AppEventPanel
      mode="create"
      initial={{ title: "", startAt: START_ISO, endAt: END_ISO }}
      onSave={onSave}
      onSaveRecurring={onSaveRecurring}
      onClose={vi.fn()}
      pending={false}
      error={null}
    />,
  );
  return { onSave, onSaveRecurring };
}

describe("繰り返しUIの表示(S11)", () => {
  it("S11: 「毎週」を選択すると曜日チップと終了日入力が表示され、初期選択は開始日時の曜日になる", async () => {
    const user = userEvent.setup();
    renderCreatePanel();

    await user.selectOptions(
      screen.getByLabelText(M.recurrenceField),
      "weekly",
    );

    expect(screen.getByLabelText(M.recurrenceEndDateField)).toBeInTheDocument();
    // 2026-07-08は水曜日(weekday=3)
    const wedButton = screen.getByRole("button", {
      name: M.weekdayAriaLabel("水"),
    });
    expect(wedButton).toHaveAttribute("aria-pressed", "true");
    const monButton = screen.getByRole("button", {
      name: M.weekdayAriaLabel("月"),
    });
    expect(monButton).toHaveAttribute("aria-pressed", "false");
  });

  it("繰り返し「なし」(既定)では曜日チップ・終了日は表示されない", () => {
    renderCreatePanel();
    expect(
      screen.queryByLabelText(M.recurrenceEndDateField),
    ).not.toBeInTheDocument();
  });
});

describe("繰り返しUIのバリデーション(S12)", () => {
  it("S12: 毎週で曜日をすべて解除して保存すると、アクションを呼ばずフォーム内エラーになる", async () => {
    const user = userEvent.setup();
    const { onSave, onSaveRecurring } = renderCreatePanel();

    await user.type(screen.getByLabelText(M.eventTitleField), "朝会");
    await user.selectOptions(
      screen.getByLabelText(M.recurrenceField),
      "weekly",
    );
    // 初期選択されている曜日(水)を解除して0件にする
    await user.click(
      screen.getByRole("button", { name: M.weekdayAriaLabel("水") }),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveRecurring).not.toHaveBeenCalled();
    expect(screen.getByText(M.recurrenceWeekdaysRequired)).toBeInTheDocument();
  });
});

describe("繰り返しUIの正常系(S13関連: パネル単体)", () => {
  it("P5-5 S26: 開始時刻を分ステッパーで00分から1戻すと、onSaveRecurringのstartTimeが時-1で渡る", async () => {
    const user = userEvent.setup();
    const { onSaveRecurring } = renderCreatePanel();

    await user.type(screen.getByLabelText(M.eventTitleField), "朝会");
    await user.click(
      screen.getByRole("button", { name: "開始時刻の分を1戻す" }),
    );
    await user.selectOptions(screen.getByLabelText(M.recurrenceField), "daily");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: "08:59" }),
    );
  });

  it("毎日を選択して保存すると、onSaveRecurringがpattern='daily'・startsOn・時刻・端末TZで呼ばれる", async () => {
    const user = userEvent.setup();
    const { onSave, onSaveRecurring } = renderCreatePanel();

    await user.type(screen.getByLabelText(M.eventTitleField), "朝会");
    await user.selectOptions(screen.getByLabelText(M.recurrenceField), "daily");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveRecurring).toHaveBeenCalledWith({
      title: "朝会",
      pattern: "daily",
      weekdays: null,
      startTime: "09:00",
      endTime: "10:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startsOn: "2026-07-08",
      endsOn: null,
    });
  });

  it("終了日を指定して保存すると、onSaveRecurringにendsOnが渡る", async () => {
    const user = userEvent.setup();
    const { onSaveRecurring } = renderCreatePanel();

    await user.type(screen.getByLabelText(M.eventTitleField), "朝会");
    await user.selectOptions(screen.getByLabelText(M.recurrenceField), "daily");
    fireEvent.change(screen.getByLabelText(M.recurrenceEndDateField), {
      target: { value: "2026-08-01" },
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ endsOn: "2026-08-01" }),
    );
  });

  it("開始と終了が別日だとフォーム内エラーになりonSaveRecurringは呼ばれない", async () => {
    const user = userEvent.setup();
    const { onSaveRecurring } = renderCreatePanel();

    await user.type(screen.getByLabelText(M.eventTitleField), "朝会");
    await user.selectOptions(screen.getByLabelText(M.recurrenceField), "daily");
    changeDateTimeStepper(
      M.eventEndField,
      format(new Date(2026, 6, 9, 10, 0), DATETIME_LOCAL_FORMAT),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveRecurring).not.toHaveBeenCalled();
    expect(screen.getByText(M.recurrenceSameDayRequired)).toBeInTheDocument();
  });
});

describe("editモードでは繰り返しUIを表示しない", () => {
  it("mode='edit'ではonSaveRecurringを渡していても繰り返しセレクトは表示されない", () => {
    render(
      <AppEventPanel
        mode="edit"
        initial={{ title: "設計作業", startAt: START_ISO, endAt: END_ISO }}
        onSave={vi.fn()}
        onSaveRecurring={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    expect(screen.queryByLabelText(M.recurrenceField)).not.toBeInTheDocument();
  });
});
