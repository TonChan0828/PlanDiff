import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/(app)/onboarding/actions", () => ({
  completeOnboardingAction: vi.fn(),
}));

import { completeOnboardingAction } from "@/app/(app)/onboarding/actions";
import { OnboardingSteps } from "@/components/onboarding-steps";

const completeOnboardingActionMock = vi.mocked(completeOnboardingAction);

// 仕様書: docs/specs/P4-1_オンボーディング.md S1・S2・S3・S4

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingSteps", () => {
  it("S1: ステップ1では「次へ」「スキップ」が表示され「戻る」は表示されない", () => {
    render(<OnboardingSteps />);

    expect(screen.getByText("予定を立てる")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次へ" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "スキップ" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "戻る" }),
    ).not.toBeInTheDocument();
  });

  it("S2: 「次へ」を2回押すとステップ3になり「はじめる」が表示される。「戻る」で戻れる", async () => {
    const user = userEvent.setup();
    render(<OnboardingSteps />);

    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText("タイマーで記録する")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText("ギャップを見る")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "はじめる" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "次へ" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect(screen.getByText("タイマーで記録する")).toBeInTheDocument();
  });

  it("S3: ステップ3の「はじめる」を押すとcompleteOnboardingActionが呼ばれる", async () => {
    const user = userEvent.setup();
    render(<OnboardingSteps />);

    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(completeOnboardingActionMock).toHaveBeenCalled();
  });

  it("S4: 「スキップ」を押すとcompleteOnboardingActionが呼ばれる", async () => {
    const user = userEvent.setup();
    render(<OnboardingSteps />);

    await user.click(screen.getByRole("button", { name: "スキップ" }));

    expect(completeOnboardingActionMock).toHaveBeenCalled();
  });
});
