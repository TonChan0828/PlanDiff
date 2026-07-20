import { expect } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

// DateTimeStepper(P5-5)の値を、既存テストの datetime-local 前提コードから
// 差し替えるための共通ヘルパー。value は "yyyy-MM-dd'T'HH:mm" 形式または ""。

export function changeDateTimeStepper(label: string, value: string) {
  if (!value) {
    fireEvent.change(screen.getByLabelText(`${label}の日付`), {
      target: { value: "" },
    });
    return;
  }
  const [date, time] = value.split("T") as [string, string];
  const [hour, minute] = time.split(":") as [string, string];

  fireEvent.change(screen.getByLabelText(`${label}の日付`), {
    target: { value: date },
  });

  const hourInput = screen.getByLabelText(`${label}の時`);
  fireEvent.change(hourInput, { target: { value: hour } });
  fireEvent.blur(hourInput);

  const minuteInput = screen.getByLabelText(`${label}の分`);
  fireEvent.change(minuteInput, { target: { value: minute } });
  fireEvent.blur(minuteInput);
}

export function expectDateTimeStepperValue(label: string, value: string) {
  if (!value) {
    expect(screen.getByLabelText(`${label}の日付`)).toHaveValue("");
    return;
  }
  const [date, time] = value.split("T") as [string, string];
  const [hour, minute] = time.split(":") as [string, string];
  expect(screen.getByLabelText(`${label}の日付`)).toHaveValue(date);
  expect(screen.getByLabelText(`${label}の時`)).toHaveValue(hour);
  expect(screen.getByLabelText(`${label}の分`)).toHaveValue(minute);
}
