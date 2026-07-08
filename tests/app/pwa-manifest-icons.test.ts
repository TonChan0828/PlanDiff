// @vitest-environment node
// next/ogのImageResponse(Sharp)はjsdomのVMコンテキストだとcross-realmで動かないため。
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { GET as getIcon192 } from "@/app/icon-192/route";
import { GET as getIcon512 } from "@/app/icon-512/route";

// 仕様書: docs/specs/P3-3_PWA対応.md S7(結合・異常系)
// manifestのicons[].srcが実際に解決できるルートに対応していることを確認し、
// 「片方だけ実装してmanifestの参照が壊れる」回帰を防ぐ。

const routesBySrc: Record<string, () => Promise<Response> | Response> = {
  "/icon-192": getIcon192,
  "/icon-512": getIcon512,
};

describe("manifestのicons参照とRoute Handlerの整合性", () => {
  it("S7: manifest.icons[].srcのすべてに対応するRoute Handlerが存在し、200・image/pngを返す", async () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      const src = icon.src;
      const handler = routesBySrc[src];
      if (!handler) {
        throw new Error(`${src} に対応するRoute Handlerが見つからない`);
      }

      const response = await handler();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
  });
});
