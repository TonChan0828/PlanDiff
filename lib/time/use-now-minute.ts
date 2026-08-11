"use client";

import { useSyncExternalStore } from "react";

// 分単位の現在時刻を配信する共有ストア(P8-1)。
// カレンダーの「今日」と現在時刻ラインを時間経過に追従させるために使う。
// lib/timer/use-now-seconds.ts と同じ useSyncExternalStore パターンだが、
// - ストアはモジュールスコープに1つ(購読コンポーネントごとにタイマーを張らない)
// - 分境界にアラインした setTimeout 連鎖で駆動する(固定間隔だと0時の検知が最大60秒遅れる)
// - visibilitychange / focus / pageshow でも再計算する
//   (バックグラウンドタブのタイマースロットリングと、PWAのプロセスサスペンドからの復帰に対応)
// の3点が異なる。秒精度が要る実行中タイマーは useNowSeconds を使い続ける。

const MINUTE_MS = 60_000;
// 分境界ちょうどに発火するとタイマー精度の誤差で同じ分を再計算しうるため、わずかに後ろへずらす
const BOUNDARY_MARGIN_MS = 50;

const listeners = new Set<() => void>();
let snapshot = floorToMinute(Date.now());
let timeoutId: ReturnType<typeof setTimeout> | null = null;

function floorToMinute(timestamp: number): number {
  return Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
}

/** 現在時刻を読み直し、分が変わっていたときだけ購読者に通知する */
function syncSnapshot(): void {
  const next = floorToMinute(Date.now());
  if (next === snapshot) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function handleTick(): void {
  syncSnapshot();
  scheduleNextTick();
}

function scheduleNextTick(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
  }
  const untilBoundary = MINUTE_MS - (Date.now() % MINUTE_MS);
  timeoutId = setTimeout(handleTick, untilBoundary + BOUNDARY_MARGIN_MS);
}

/**
 * 購読者がいない間は snapshot が古いまま止まるため、読み出し時に現在時刻から作り直す。
 * これをしないと、マウント直後の初回レンダーだけ古い値を返し、
 * 購読開始後の訂正が「時刻が変わった」ように見えてしまう。
 * 購読中は tick / イベント経由でのみ更新するので、同一レンダー内で値が揺れることはない。
 */
function getSnapshot(): number {
  if (listeners.size === 0) {
    snapshot = floorToMinute(Date.now());
  }
  return snapshot;
}

function start(): void {
  // 購読が途切れている間に進んだ時刻を取り込んでから走り出す
  snapshot = floorToMinute(Date.now());
  scheduleNextTick();
  document.addEventListener("visibilitychange", syncSnapshot);
  window.addEventListener("focus", syncSnapshot);
  window.addEventListener("pageshow", syncSnapshot);
}

function stop(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  document.removeEventListener("visibilitychange", syncSnapshot);
  window.removeEventListener("focus", syncSnapshot);
  window.removeEventListener("pageshow", syncSnapshot);
}

function subscribe(onChange: () => void): () => void {
  if (listeners.size === 0) {
    start();
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      stop();
    }
  };
}

/**
 * 分に丸めた現在時刻(epoch ms)。SSR時は null。
 *
 * Date ではなくプリミティブを返すのは、useSyncExternalStore が
 * 参照の変化で無限ループになるのを避けるため。
 * サーバースナップショットを null にすることで、SSR(サーバーTZ)と
 * クライアントTZの不一致による表示ズレを防ぐ。
 */
export function useNowMinuteMs(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
