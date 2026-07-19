// @vitest-environment node
// next/ogのImageResponse(Sharp)はjsdomのVMコンテキストだとcross-realmで動かないため。
import { describe, expect, it } from "vitest";

import { generateAppIcon } from "@/lib/pwa/app-icon";
import { readPngSize } from "../../stubs/png";

// 仕様書: docs/specs/D-5_ロゴ作成.md S8

describe("generateAppIcon", () => {
  it("S8: 最小適用サイズ(192)でもエラーなくPNGが生成される", async () => {
    const response = await generateAppIcon(192);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const buffer = await response.arrayBuffer();
    expect(readPngSize(buffer)).toEqual({ width: 192, height: 192 });
  });
});
