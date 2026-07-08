// PNG仕様のIHDRチャンク(シグネチャ8byte + 長さ4byte + "IHDR" 4byteの直後)から
// 幅・高さ(各4byte, big-endian)を読み取る。テストで実際に生成された画像サイズを検証するために使う。
export function readPngSize(buffer: ArrayBuffer): {
  width: number;
  height: number;
} {
  const view = new DataView(buffer);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}
