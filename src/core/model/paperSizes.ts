/**
 * 纸张尺寸 ✓：**封闭词表** ✓ ⇒ ⇒ 每种纸的物理尺寸只在这里定义一次 ✓。
 *
 * 96dpi 下的像素尺寸由 mm 算出 ✓ ⇒ ⇒ 分页量测与打印框用的是同一份换算 ✓。
 */
export const PAPER_SIZE_NAMES = ['A4', 'A3', 'B5'] as const;
export type PaperSize = (typeof PAPER_SIZE_NAMES)[number];

export const PAPER_SIZES: Readonly<Record<PaperSize, {widthMm: number; heightMm: number}>> = {
  A4: {widthMm: 210, heightMm: 297},
  A3: {widthMm: 297, heightMm: 420},
  B5: {widthMm: 176, heightMm: 250},
};

/** 打印与分页量测用的像素尺寸 ✓（96dpi ✓）。 */
export function paperPixels(size: PaperSize): {width: number; height: number} {
  const paper = PAPER_SIZES[size];
  return {
    width: Math.round((paper.widthMm / 25.4) * 96),
    height: Math.round((paper.heightMm / 25.4) * 96),
  };
}
