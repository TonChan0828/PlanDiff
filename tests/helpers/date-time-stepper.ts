import { expect } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

// DateTimeStepper(P5-6=統合セグメント入力)をテストから操作/検証するための共有ヘルパー。
// value は "yyyy-MM-dd'T'HH:mm" 形式または ""。
// 日付は隠しネイティブ date 入力(`${label}の日付`)で設定し、時・分はセグメントへ数字入力する。

function typeInto(name: string, digits: string) {
  const el = screen.getByRole("spinbutton", { name });
  el.focus();
  for (const d of digits) {
    fireEvent.keyDown(document.activeElement as Element, { key: d });
  }
}

export function changeDateTimeStepper(label: string, value: string) {
  if (!value) {
    fireEvent.change(screen.getByLabelText(`${label}の日付`), {
      target: { value: "" },
    });
    return;
  }
  const [date, time] = value.split("T") as [string, string];
  const [hour, minute] = time.split(":") as [string, string];

  // 日付(年月日)は隠しネイティブ入力でまとめて設定(時分は維持される)
  fireEvent.change(screen.getByLabelText(`${label}の日付`), {
    target: { value: date },
  });

  // 時・分はセグメントへ数字入力(自動送りで確定)
  typeInto(`${label}の時`, hour);
  typeInto(`${label}の分`, minute);
}

export function expectDateTimeStepperValue(label: string, value: string) {
  if (!value) {
    expect(screen.getByLabelText(`${label}の日付`)).toHaveValue("");
    return;
  }
  const [date, time] = value.split("T") as [string, string];
  const [year, month, day] = date.split("-") as [string, string, string];
  const [hour, minute] = time.split(":") as [string, string];
  expect(screen.getByRole("spinbutton", { name: `${label}の年` })).toHaveValue(
    year,
  );
  expect(screen.getByRole("spinbutton", { name: `${label}の月` })).toHaveValue(
    month,
  );
  expect(screen.getByRole("spinbutton", { name: `${label}の日` })).toHaveValue(
    day,
  );
  expect(screen.getByRole("spinbutton", { name: `${label}の時` })).toHaveValue(
    hour,
  );
  expect(screen.getByRole("spinbutton", { name: `${label}の分` })).toHaveValue(
    minute,
  );
}
