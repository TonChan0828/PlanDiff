import { NextResponse } from "next/server";
import { isClientErrorEvent } from "@/lib/monitoring/events";

const MAX_BODY_BYTES = 1024;
const MAX_REPORTS_PER_MINUTE = 60;
const bucket = { minute: -1, count: 0 };

type BodyResult =
  { kind: "ok"; text: string } | { kind: "too-large" } | { kind: "invalid" };

function response(status: number): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request: Request): Promise<BodyResult> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "invalid" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      kind: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { kind: "invalid" };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return response(403);
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") return response(415);
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (!Number.isInteger(contentLength) || contentLength < 0)
      return response(400);
    if (contentLength > MAX_BODY_BYTES) return response(413);
  }
  const body = await readBoundedBody(request);
  if (body.kind === "too-large") return response(413);
  if (body.kind === "invalid") return response(400);
  let report: unknown;
  try {
    report = JSON.parse(body.text);
  } catch {
    return response(400);
  }
  if (!isClientErrorEvent(report)) return response(400);
  const minute = Math.floor(Date.now() / 60_000);
  if (bucket.minute !== minute) {
    bucket.minute = minute;
    bucket.count = 0;
  }
  bucket.count += 1;
  if (bucket.count > MAX_REPORTS_PER_MINUTE) return response(429);
  console.error(JSON.stringify(report));
  return response(204);
}
