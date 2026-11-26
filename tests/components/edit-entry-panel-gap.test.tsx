import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditEntryPanel } from "@/components/edit-entry-panel";

// 仕様書: docs/specs/G-98_実績編集の予定との差分表示.md E6〜E8
// 日時はローカルTZで組み立てる(R-1)。入力欄はローカル時刻を表示する

const at = (hour: number, minute = 0, second = 0) =>
  new Date(2026, 6, 7, hour, minute, second).toISOString();

const PLAN = { googleEventId: "g-1", startAt: at(9), endAt: at(10) };

function renderPanel({
  startAt = at(9, 8),
  endAt = at(10, 14),
  siblings = [] as { id: string; startAt: string; endAt: string }[],
  linked = true,
} = {}) {
  render(
    <EditEntryPanel
      entry={{ id: "a", title: "設計", startAt, endAt }}
      planContext={
        linked
          ? {
              plan: PLAN,
              actuals: [
                { id: "a", googleEventId: "g-1", startAt, endAt },
                ...siblings.map((s) => ({ ...s, googleEventId: "g-1" })),
              ],
            }
          : undefined
      }
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      pending={false}
      error={null}
    />,
  );
}

const diffBox = () => screen.getByRole("group", { name: "予定とのズレ" });

describe("実績の編集フォームの予定とのズレ(G-98)", () => {
  it("E6: 予定の時刻と、開始・所要の差を表示する", () => {
    renderPanel();

    const box = within(diffBox());
    expect(box.getByText("予定 09:00〜10:00(1時間)")).toBeInTheDocument();
    expect(box.getByText("開始 +8分 遅れ")).toBeInTheDocument();
    expect(box.getByText("所要 +6分 超過")).toBeInTheDocument();
    expect(box.queryByText(/件の合計/)).not.toBeInTheDocument();
  });

  it("E6: 早い開始・不足・予定どおりを文言で区別する", () => {
    renderPanel({ startAt: at(8, 55), endAt: at(9, 55) });

    const box = within(diffBox());
    expect(box.getByText("開始 5分 早い")).toBeInTheDocument();
    expect(box.getByText("所要 予定どおり")).toBeInTheDocument();
  });

  // jsdom ではモバイル向けのネイティブ日時入力(P9-1)が描画される
  const changeEnd = (value: string) =>
    fireEvent.change(screen.getByLabelText("終了時刻"), { target: { value } });

  it("E7: 終了時刻を変えると、所要の差がその場で更新される", () => {
    renderPanel();

    changeEnd("2026-07-07T10:30");

    expect(within(diffBox()).getByText("所要 +22分 超過")).toBeInTheDocument();
  });

  it("E7: 終了が開始より前、または未入力になったら、差の行を出さない", () => {
    renderPanel();

    for (const value of ["2026-07-07T09:00", ""]) {
      changeEnd(value);

      const box = within(diffBox());
      expect(box.getByText("予定 09:00〜10:00(1時間)")).toBeInTheDocument();
      expect(box.queryByText(/^開始 /)).not.toBeInTheDocument();
      expect(box.queryByText(/^所要 /)).not.toBeInTheDocument();
    }
  });

  it("E8: 同じ予定の実績が複数あれば、合計の件数を添える", () => {
    renderPanel({
      startAt: at(9, 30),
      endAt: at(10),
      siblings: [{ id: "b", startAt: at(9), endAt: at(9, 30) }],
    });

    const box = within(diffBox());
    expect(box.getByText("同じ予定の実績 2件の合計")).toBeInTheDocument();
    expect(box.getByText("開始 予定どおり")).toBeInTheDocument();
    expect(box.getByText("所要 予定どおり")).toBeInTheDocument();
  });

  it("E8: 予定に紐づかない実績では、ズレの欄を出さない", () => {
    renderPanel({ linked: false });

    expect(
      screen.queryByRole("group", { name: "予定とのズレ" }),
    ).not.toBeInTheDocument();
  });

  it("未編集のときは秒を含む元の値で計算し、サマリーの値と一致させる", () => {
    // 入力欄は分までなので、分に丸めた値で計算すると所要が 66 分になる。元の値では 65 分(+5分)
    renderPanel({ startAt: at(9, 8, 30), endAt: at(10, 14, 10) });

    expect(within(diffBox()).getByText("所要 +5分 超過")).toBeInTheDocument();
  });
});
