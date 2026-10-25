import { describe, expect, it } from "vitest";
import { imageRects, parseNta, type PageData } from "../src/pdf/nta";
import { applyKey, parseKey } from "../src/parse/key";

const text = (s: string, y: number) => ({ s, x: 40, y, w: s.length * 5, h: 10 });
const img = (y1: number) => ({ x0: 40, y0: y1 - 100, x1: 400, y1 });

describe("NTA answer key table", () => {
  const key = parseKey("Paper - 2 Jan 2026\n1 | 1 | 26 | 4\n2 | 1 | 27 | 4\n3 | 2 | 28 | 1");
  it("reads (question | answer) pairs from both halves of each row", () => {
    expect(key).toEqual({ 1: 0, 2: 0, 3: 1, 26: 3, 27: 3, 28: 0 });
  });
  it("applies by paper question number", () => {
    const qs = [1, 26, 28].map((n, i) => ({ id: i, n, q: "", o: ["a", "b", "c", "d"], a: -1 }));
    expect(applyKey(qs, key)).toBe(3);
    expect(qs.map((q) => q.a)).toEqual([0, 3, 0]);
  });
});

describe("parseNta", () => {
  const head = (n: number, y: number) =>
    text(
      `Question Number : ${n} Question Id : 99${n} Question Type : MCQ Option Shuffling : No`,
      y,
    );
  const opts = (base: number, y: number) =>
    [1, 2, 3, 4].map((l, i) => text(`${611987000 + base + l}. ${l}`, y - i * 12));

  it("returns null for ordinary papers", () => {
    expect(parseNta([{ items: [text("1. What is x?", 700)], images: [] }])).toBeNull();
  });

  it("maps each picture to its question, English then Hindi", () => {
    const page = (n: number, imgY: number): PageData => ({
      items: [head(n, 780), text("Options :", imgY - 120), ...opts(1000 * n, imgY - 130)],
      images: [img(imgY)],
    });
    // English printings on pages 0-2, Hindi printings on pages 3-5
    const pages = [1, 2, 3, 1, 2, 3].map((n, i) => page(n, 740 - i));
    const r = parseNta(pages)!;
    expect(r.map((q) => q.n)).toEqual([1, 2, 3]);
    expect(r[0].versions.map((v) => v.imgs.map((i) => i.page))).toEqual([[0], [3]]);
    expect(r[1].opts).toBe(4);
  });

  it("treats a header repeated at a page break as the same printing", () => {
    const pages: PageData[] = [
      { items: [head(1, 780), head(2, 200)], images: [img(740)] },
      { items: [head(2, 780)], images: [img(740)] },
      { items: [head(3, 780)], images: [img(740)] },
    ];
    const r = parseNta(pages)!;
    expect(r.map((q) => q.versions.length)).toEqual([1, 1, 1]);
    expect(r[1].versions[0].imgs[0].page).toBe(1);
  });

  it("attaches a shared passage to the questions in its range", () => {
    const comp = (y: number) => [
      text("Question Id : 5 Question Type : COMPREHENSION Sub Question Shuffling Allowed : Yes", y),
      text("Question Numbers : (1 to 2)", y - 12),
    ];
    const pages: PageData[] = [
      {
        items: [...comp(780), head(1, 600), head(2, 400), head(3, 200)],
        images: [img(740), img(560), img(360), img(160)],
      },
      { items: [], images: [] },
      { items: [], images: [] },
      { items: [], images: [] },
    ];
    const r = parseNta(pages)!;
    expect(r[0].versions[0].ctx).toEqual([{ page: 0, idx: 0 }]);
    expect(r[1].versions[0].ctx).toEqual([{ page: 0, idx: 0 }]);
    expect(r[2].versions[0].ctx).toEqual([]);
  });
});

describe("imageRects", () => {
  const OPS = {
    save: 1,
    restore: 2,
    transform: 3,
    paintImageXObject: 4,
    paintInlineImageXObject: 5,
    paintImageMaskXObject: 6,
    paintFormXObjectBegin: 7,
    paintFormXObjectEnd: 8,
  };
  it("tracks the transform around a painted image", () => {
    const fns = [
      OPS.save,
      OPS.transform,
      OPS.paintImageXObject,
      OPS.restore,
      OPS.save,
      OPS.transform,
      OPS.paintImageXObject,
      OPS.restore,
    ];
    const args = [
      null,
      [200, 0, 0, 100, 50, 300],
      ["a"],
      null,
      null,
      [100, 0, 0, 50, 10, 20],
      ["b"],
      null,
    ];
    expect(imageRects(fns, args, OPS)).toEqual([
      { x0: 50, y0: 300, x1: 250, y1: 400 },
      { x0: 10, y0: 20, x1: 110, y1: 70 },
    ]);
  });
});
