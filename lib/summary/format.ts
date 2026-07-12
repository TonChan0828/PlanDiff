// 分数を「3時間15分」形式の日本語表示に変換する(P3-2)。

export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}分`;
  }
  if (remainder === 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${remainder}分`;
}

/** ズレの合計時間を符号付きで表示する(例: "+1時間15分" / "-30分" / "0分") */
export function formatSignedDurationMinutes(totalMinutes: number): string {
  const sign = totalMinutes > 0 ? "+" : totalMinutes < 0 ? "-" : "";
  return `${sign}${formatDurationMinutes(Math.abs(totalMinutes))}`;
}

/** 分数を「H:MM」の時計形式にする(D-3。例: 245 → "4:05") */
export function formatClockMinutes(totalMinutes: number): string {
  const minutes = Math.round(Math.abs(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
}

/** ズレを符号付きの時計形式にする(D-3。例: "+0:55" / "-1:10" / "±0:00") */
export function formatSignedClockMinutes(totalMinutes: number): string {
  const sign = totalMinutes > 0 ? "+" : totalMinutes < 0 ? "-" : "±";
  return `${sign}${formatClockMinutes(totalMinutes)}`;
}

/** ズレ%を符号付きで表示する(例: "+50%" / "-50%" / "0%") */
export function formatSignedPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent}%`;
}
