import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// P13-1 の純粋関数。DB・ブラウザ・環境変数に依存しない(テストしやすさのため)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

/** 停止し忘れとみなす経過時間。SQLに直書きせず必ずここを参照する */
export const STALE_TIMER_THRESHOLD_HOURS = 12;

/** 同種の通知を積み上げないためのタグ */
export const STALE_TIMER_TAG = "stale-timer";

/** 通知タップ時の遷移先。停止導線があるのは計測画面 */
export const STALE_TIMER_URL = "/track";

/**
 * TZが不正だったときのフォールバック。UTCにすると主要ユーザー(JST)に対して
 * 9時間ずれた文面が出るため、混乱の小さい Asia/Tokyo を選ぶ
 */
export const FALLBACK_TIMEZONE = "Asia/Tokyo";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type StaleTimerPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

/**
 * 「これ以前に開始した計測は停止し忘れとみなす」時刻を返す。
 * 呼び出し側は `start_at <= staleThresholdAt(now)` で判定する(境界を含める)
 */
export function staleThresholdAt(now: Date): Date {
  return new Date(now.getTime() - STALE_TIMER_THRESHOLD_HOURS * HOUR_MS);
}

/** 経過時間を「13時間20分」形式にする。24時間を超えても日数に丸めない */
export function formatElapsed(startAt: Date, now: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((now.getTime() - startAt.getTime()) / MINUTE_MS),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}時間${minutes}分`;
}

/** IANAタイムゾーン名として使えなければフォールバックを返す */
export function resolveTimezone(timezone: string): string {
  try {
    // 不正な値なら RangeError を投げる
    new Intl.DateTimeFormat("ja-JP", { timeZone: timezone });
    return timezone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Push本文を組み立てる。表示時刻は購読端末のTZへ変換する */
export function buildStaleTimerPayload(input: {
  entryTitle: string;
  startAt: Date;
  now: Date;
  timezone: string;
}): StaleTimerPayload {
  const timezone = resolveTimezone(input.timezone);
  const startedAt = format(new TZDate(input.startAt, timezone), "M月d日 HH:mm");
  const title = input.entryTitle.trim() || M.untitledEntry;

  return {
    title: M.staleTimerTitle,
    body: M.staleTimerBody(
      title,
      startedAt,
      formatElapsed(input.startAt, input.now),
    ),
    tag: STALE_TIMER_TAG,
    url: STALE_TIMER_URL,
  };
}
