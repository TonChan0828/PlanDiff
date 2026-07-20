import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEntryPanel } from "@/components/edit-entry-panel";
import {
  changeDateTimeStepper,
  expectDateTimeStepperValue,
} from "../helpers/date-time-stepper";

// 仕様書: docs/specs/P2-4_実績の手動編集.md S2〜S9
// 時刻入力はP5-5でDateTimeStepperに置換(docs/specs/P5-5)

function isoAt(hour: number, minute = 0): string {
  return new Date(2026, 6, 8, hour, minute).toISOString();
}

const entry = {
  id: "entry-1",
  title: "設計レビュー",
  startAt: isoAt(10, 0),
  endAt: isoAt(11, 30),
};

describe("EditEntryPanel", () => {
  it("S2: エントリの初期値がタイトル・開始/終了の入力欄に反映される", () => {
    render(
      <EditEntryPanel
        entry={entry}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText("タイトル")).toHaveValue("設計レビュー");
    expectDateTimeStepperValue("開始時刻", "2026-07-08T10:00");
    expectDateTimeStepperValue("終了時刻", "2026-07-08T11:30");
  });

  it("S3: タイトルの前後空白はトリムされ、開始/終了はUTCのISOでonSaveが呼ばれる", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    const titleInput = screen.getByLabelText("タイトル");
    await user.clear(titleInput);
    await user.type(titleInput, "  読書  ");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      title: "読書",
      startAt: entry.startAt,
      endAt: entry.endAt,
    });
  });

  it("S4: 終了時刻が開始時刻より前だと保存できずエラーが表示される", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    changeDateTimeStepper("終了時刻", "2026-07-08T09:00");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText("終了時刻は開始時刻以降にしてください"),
    ).toBeInTheDocument();
  });

  it("S5: 終了時刻が開始時刻と同じ場合は保存できる", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    changeDateTimeStepper("終了時刻", "2026-07-08T10:00");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      title: entry.title,
      startAt: entry.startAt,
      endAt: entry.startAt,
    });
  });

  it("S6: 開始・終了が未入力だと保存できずエラーが表示される", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    changeDateTimeStepper("開始時刻", "");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText("開始・終了時刻を入力してください"),
    ).toBeInTheDocument();
  });

  it("S7: 削除ボタンで確認表示に切り替わり、キャンセルで戻る。削除するでonDeleteが呼ばれる", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "削除" }));
    expect(screen.getByText("この実績を削除しますか?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "削除" }));
    await user.click(screen.getByRole("button", { name: "削除する" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("S8: pending中は保存・削除関連のボタンがすべて無効化される", () => {
    render(
      <EditEntryPanel
        entry={entry}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={true}
        error={null}
      />,
    );

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDisabled();
  });

  it("P5-5 S24: 開始時刻の00分で分ステッパーを1戻すと時も-1し、保存でUTC ISOに反映される", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditEntryPanel
        entry={entry}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "開始時刻の分を1戻す" }),
    );

    expectDateTimeStepperValue("開始時刻", "2026-07-08T09:59");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      title: entry.title,
      startAt: new Date(2026, 6, 8, 9, 59).toISOString(),
      endAt: entry.endAt,
    });
  });

  it("S9: errorが設定されているとエラーメッセージが表示される", () => {
    render(
      <EditEntryPanel
        entry={entry}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error="実績を更新できませんでした"
      />,
    );

    expect(screen.getByText("実績を更新できませんでした")).toBeInTheDocument();
  });
});
