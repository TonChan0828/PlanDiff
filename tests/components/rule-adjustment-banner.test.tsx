import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RuleAdjustmentBanner } from "@/components/rule-adjustment-banner";
import type { RuleAdjustmentNotice } from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/P10-1_提案経由予定の学習補正.md T23〜T24

const NOTICE: RuleAdjustmentNotice = {
  ruleId: "rule-1",
  title: "朝会",
  timezone: "Asia/Tokyo",
  previousStartTime: "09:00",
  previousEndTime: "09:30",
  newStartTime: "09:15",
  newEndTime: "10:00",
};

describe("RuleAdjustmentBanner(T23)", () => {
  it("T23: 調整が発生した回 When 描画 Then タイトル・旧値→新値が表示される", () => {
    render(<RuleAdjustmentBanner notices={[NOTICE]} />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("朝会");
    expect(banner).toHaveTextContent("09:00→09:15");
    expect(banner).toHaveTextContent("30分→45分");
  });
});

describe("RuleAdjustmentBanner(T24)", () => {
  it("T24: 調整が発生しなかった回(notices空) Then お知らせ帯は表示されない", () => {
    const { container } = render(<RuleAdjustmentBanner notices={[]} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
