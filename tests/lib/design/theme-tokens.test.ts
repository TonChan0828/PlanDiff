import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 仕様書: docs/specs/D-6_Structuredテーマ.md S12〜S16
// テーマのトークン定義を静的に検証する。globals.cssをテキストとして読み、
// (1)テーマ間の定義漏れ (2)ダークの二重定義のズレ (3)コントラスト比
// (4)@theme inlineの間接参照 (5)既存テーマの角丸の不変性 を守る

const ROOT = path.resolve(__dirname, "../../..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** セレクタ(または@theme等のat-rule)直後の `{...}` の中身を、括弧の対応を数えて取り出す */
function readBlock(selector: string): string {
  const start = CSS.indexOf(selector);
  expect(start, `セレクタが見つからない: ${selector}`).toBeGreaterThanOrEqual(
    0,
  );

  // 探索はstartから。セレクタ文字列自体が `{` を含む場合(":root {")に飛び越さないため
  const open = CSS.indexOf("{", start);
  expect(open, `ブロックの開き括弧が見つからない: ${selector}`).toBeGreaterThan(
    -1,
  );

  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error(`ブロックが閉じていない: ${selector}`);
}

/** ブロック内のカスタムプロパティを {変数名: 値} で取り出す(コメントは除去する) */
function readCustomProperties(block: string): Record<string, string> {
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const properties: Record<string, string> = {};
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      properties[name] = value.trim();
    }
  }
  return properties;
}

/** トークンを必須として取り出す(未定義なら何が足りないかを名指しして落とす) */
function requireProperty(
  properties: Record<string, string>,
  name: string,
): string {
  const value = properties[name];
  if (value === undefined) throw new Error(`トークンが未定義: ${name}`);
  return value;
}

function parseHex(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match?.[1]) throw new Error(`16進表記ではない色: ${value}`);
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

/**
 * WCAG 2.1 の相対輝度(0=黒 / 1=白)。
 * sRGBの各チャンネルを0-1に正規化し、ガンマ補正を戻してから
 * 人間の視感度で重み付けする。
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(rgb: [number, number, number]): number {
  // 8bit値 → 0-1に正規化 → sRGBのガンマ補正を戻す
  const linearize = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb;
  // 緑が7割・青が7%。同じ暗さでも色相でコントラストの稼ぎ方が変わる
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG のコントラスト比(1〜21)。明るい方を分子に置く */
function contrastRatio(foreground: string, background: string): number {
  const light = relativeLuminance(parseHex(foreground));
  const dark = relativeLuminance(parseHex(background));
  const [hi, lo] = light > dark ? [light, dark] : [dark, light];
  return (hi + 0.05) / (lo + 0.05);
}

const ROOT_PROPERTIES = readCustomProperties(readBlock(":root {"));
const STRUCTURED_PROPERTIES = readCustomProperties(
  readBlock(':root[data-theme="structured"]'),
);

describe("テーマ間のトークン定義(D-6 S12・S13)", () => {
  it("S12: :root が定義する全カスタムプロパティを structured も定義している", () => {
    const missing = Object.keys(ROOT_PROPERTIES).filter(
      (name) => !(name in STRUCTURED_PROPERTIES),
    );

    expect(
      missing,
      `structuredで未定義のトークン:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("S13: ダークの二重定義(@media と [data-theme=dark])が完全に一致する", () => {
    // globals.css のコメントが「変更時は必ず両方を揃えること」と警告している規約を
    // 実行可能にする。片方だけ直す事故を検出する
    const viaMediaQuery = readCustomProperties(
      readBlock(':root:not([data-theme="light"])'),
    );
    const viaAttribute = readCustomProperties(
      readBlock(':root[data-theme="dark"]'),
    );

    // color-scheme はカスタムプロパティではないので readCustomProperties が拾わない
    // (属性側だけが持つが、比較対象に入らない)
    expect(viaAttribute).toEqual(viaMediaQuery);
  });
});

describe("Structuredテーマのコントラスト(D-6 S14)", () => {
  // 前景 / 背景 の組み合わせ。すべて WCAG AA(通常テキスト 4.5:1)以上であること
  const PAIRS: [foreground: string, background: string][] = [
    ["--ink", "--paper"],
    ["--ink", "--surface"],
    ["--ink-muted", "--paper"],
    ["--ink-muted", "--surface"],
    ["--brand-ink", "--brand"],
    ["--brand-ink", "--interrupt"],
    ["--brand-ink", "--danger"],
    ["--plan-text", "--surface"],
    ["--plan-text", "--paper"],
  ];

  it.each(PAIRS)("S14: %s / %s が 4.5:1 以上", (foreground, background) => {
    const fg = requireProperty(STRUCTURED_PROPERTIES, foreground);
    const bg = requireProperty(STRUCTURED_PROPERTIES, background);
    const ratio = contrastRatio(fg, bg);

    expect(
      ratio,
      `${foreground}(${fg}) / ${background}(${bg}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("@theme inline の間接参照(D-6 S15)", () => {
  const THEME_PROPERTIES = readCustomProperties(readBlock("@theme inline"));

  // テーマから外れた直書きの回帰防止。生の値を書くとdata-themeで上書きできなくなる
  it.each([
    "--radius-xs",
    "--radius-md",
    "--radius-lg",
    "--radius-xl",
    "--radius-control",
    "--radius-control-lg",
    "--font-sans",
  ])("S15: %s が var() の間接参照になっている", (name) => {
    expect(
      THEME_PROPERTIES[name],
      `${name} が @theme inline にない`,
    ).toBeDefined();
    expect(THEME_PROPERTIES[name]).toMatch(/^var\(--[\w-]+\)$/);
  });
});

describe("既存テーマの角丸(D-6 S16)", () => {
  // Tailwind v4 の既定値(node_modules/tailwindcss/theme.css)と一致させ、
  // 角丸のトークン化によって既存テーマの見た目が変わっていないことを保証する
  it.each([
    ["--r-xs", "0.125rem"],
    ["--r-md", "0.375rem"],
    ["--r-lg", "0.5rem"],
    ["--r-xl", "0.75rem"],
  ])("S16: :root の %s が Tailwind 既定値 %s と一致する", (name, expected) => {
    expect(ROOT_PROPERTIES[name]).toBe(expected);
  });

  // ボタンをrounded-lg/rounded-xlからrounded-control系へ移した際に、既存テーマの
  // 見た目が変わっていないことを保証する(小さめボタンは--r-lg、大きめCTAは--r-xl相当)
  it.each([
    ["--r-control", "--r-lg"],
    ["--r-control-lg", "--r-xl"],
  ])(
    "S16: :root の %s が %s と同値(ピル化前の見た目を保つ)",
    (control, base) => {
      expect(requireProperty(ROOT_PROPERTIES, control)).toBe(
        requireProperty(ROOT_PROPERTIES, base),
      );
    },
  );

  it("S16: structured では角丸が既存テーマより大きい", () => {
    for (const name of ["--r-lg", "--r-xl"]) {
      expect(
        parseFloat(requireProperty(STRUCTURED_PROPERTIES, name)),
        `${name} が既存テーマ以下`,
      ).toBeGreaterThan(parseFloat(requireProperty(ROOT_PROPERTIES, name)));
    }
  });
});
