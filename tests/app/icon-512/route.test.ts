// @vitest-environment node
// next/ogのImageResponse(Sharp)はjsdomのVMコンテキストだとcross-realmで動かないため。
import { describe, expect, it } from "vitest";

import { GET } from "@/app/icon-512/route";
import { readPngSize } from "../../stubs/png";

// 仕様書: docs/specs/P3-3_PWA対応.md S4(境界値), S6(結合) / docs/specs/D-5_ロゴ作成.md S6

describe("GET /icon-512", () => {
  it("S4, S6: image/pngで200、実際の画像サイズが512x512(manifestのsizes宣言と一致)", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const buffer = await response.arrayBuffer();
    expect(readPngSize(buffer)).toEqual({ width: 512, height: 512 });
  });
});
