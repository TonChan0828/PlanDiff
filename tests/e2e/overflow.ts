import { expect, type Locator } from "@playwright/test";

/**
 * 要素が横にはみ出していないことを確かめる(CLAUDE.md R-2)。
 *
 * `document.documentElement.scrollWidth <= window.innerWidth` だけでは検出できない。
 * 本体は内側のスクロール領域(overflow-y: auto は overflow-x も auto になる)に描かれ、
 * はみ出してもその領域が横スクロールするだけで、document の幅は変わらないためである。
 * 対象から祖先をたどり、すべてのスクロール領域と画面の右端を調べる。
 * 意図して横スクロールする領域(週表示のグリッドなど)の中の要素には使わない。
 */
export async function expectNoHorizontalOverflow(target: Locator) {
  const problems = await target.evaluate((element) => {
    const found: string[] = [];
    const describe = (node: Element) =>
      `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const scrolls =
        node === document.documentElement ||
        /(auto|scroll)/.test(getComputedStyle(node).overflowX);
      if (scrolls && node.scrollWidth > node.clientWidth) {
        found.push(
          `横スクロール: ${describe(node)} ${node.scrollWidth} > ${node.clientWidth}`,
        );
      }
    }
    const { right } = element.getBoundingClientRect();
    if (right > window.innerWidth + 0.5) {
      found.push(`画面の右端を超える: ${right} > ${window.innerWidth}`);
    }
    return found;
  });
  expect(problems).toEqual([]);
}
