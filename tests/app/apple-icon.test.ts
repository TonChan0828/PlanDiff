// @vitest-environment node
// next/ogのImageResponse(Sharp)はjsdomのVMコンテキストだとcross-realmで動かないため。
import { describe, expect, it } from "vitest";

import AppleIcon, { contentType, size } from "@/app/apple-icon";
import { readPngSize } from "../stubs/png";

// 仕様書: docs/specs/P3-3_PWA対応.md S5 / docs/specs/D-5_ロゴ作成.md S7

describe("app/apple-icon.tsx", () => {
  it("S5: sizeとcontentTypeが仕様通り(180x180, image/png)", () => {
    expect(size).toEqual({ width: 180, height: 180 });
    expect(contentType).toBe("image/png");
  });

  it("実際に生成されるPNGの寸法も180x180である", async () => {
    const response = AppleIcon();
    expect(response.headers.get("content-type")).toBe("image/png");

    const buffer = await response.arrayBuffer();
    expect(readPngSize(buffer)).toEqual({ width: 180, height: 180 });
  });
});
