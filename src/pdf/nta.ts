/* NTA "question paper with answer options" exports keep each question (stem and options) as a
   picture, and only the labels ("Question Number : 3 Question Id : …", "Options :", option IDs)
   as text. There is nothing to clean, so we find where each question's pictures are and which
   question they belong to, and the caller crops them out of the rendered pages. */
import { groupLines, joinItems, type Item } from "./layout";

/** A box in PDF page space (origin bottom-left). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface PageData {
  items: Item[];
  images: Rect[];
}
export interface ImgRef {
  page: number;
  idx: number;
}
/** One printing of a question. Bilingual papers print English first, then Hindi. */
export interface NtaVersion {
  /** Passage or table shared by a group of questions. */
  ctx: ImgRef[];
  imgs: ImgRef[];
}
export interface NtaQuestion {
  n: number;
  versions: NtaVersion[];
  /** Number of options, from the option labels. */
  opts: number;
}

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, c: Matrix): Matrix => [
  m[0] * c[0] + m[1] * c[2],
  m[0] * c[1] + m[1] * c[3],
  m[2] * c[0] + m[3] * c[2],
  m[2] * c[1] + m[3] * c[3],
  m[4] * c[0] + m[5] * c[2] + c[4],
  m[4] * c[1] + m[5] * c[3] + c[5],
];

/** Where each picture is drawn, from a pdf.js operator list. */
export function imageRects(
  fnArray: number[],
  argsArray: any[],
  OPS: Record<string, number>,
): Rect[] {
  const out: Rect[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const paint = new Set([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
  ]);
  fnArray.forEach((fn, i) => {
    const a = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(a as Matrix, ctm);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (a && a[0]) ctm = mul(a[0] as Matrix, ctm);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (paint.has(fn)) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        xs.push(ctm[0] * u + ctm[2] * v + ctm[4]);
        ys.push(ctm[1] * u + ctm[3] * v + ctm[5]);
      }
      out.push({
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      });
    }
  });
  return out;
}

type Ev =
  | { page: number; y: number; kind: "q"; n: number }
  | { page: number; y: number; kind: "comp" }
  | { page: number; y: number; kind: "range"; a: number; b: number }
  | { page: number; y: number; kind: "opt"; label: number }
  | { page: number; y: number; kind: "img"; idx: number };

const Q_HEAD = /Question Number\s*:\s*(\d+)\s+Question Id/;
const COMP_HEAD = /Question Id\s*:\s*\d+\s+Question Type\s*:\s*COMPREHENSION/;
const RANGE = /Question Numbers\s*:\s*\(\s*(\d+)\s*to\s*(\d+)\s*\)/;
const OPT = /^\d{6,}\.\s*(\d)$/;

/** Returns null when the pages are not in this format. */
export function parseNta(pages: PageData[]): NtaQuestion[] | null {
  const evs: Ev[] = [];
  pages.forEach((p, page) => {
    groupLines(p.items).forEach((L) => {
      const t = joinItems(L.items, L.h).replace(/\s*\|\s*/g, " ");
      let m: RegExpExecArray | null;
      if ((m = Q_HEAD.exec(t))) evs.push({ page, y: L.y, kind: "q", n: +m[1] });
      else if (COMP_HEAD.test(t)) evs.push({ page, y: L.y, kind: "comp" });
      else if ((m = RANGE.exec(t))) evs.push({ page, y: L.y, kind: "range", a: +m[1], b: +m[2] });
      else if ((m = OPT.exec(t))) evs.push({ page, y: L.y, kind: "opt", label: +m[1] });
    });
    p.images.forEach((r, idx) => evs.push({ page, y: r.y1, kind: "img", idx }));
  });
  if (evs.filter((e) => e.kind === "q").length < 3) return null;
  evs.sort((a, b) => a.page - b.page || b.y - a.y);

  const qs = new Map<number, NtaQuestion>();
  let cur: NtaQuestion | null = null;
  let ver: NtaVersion | null = null;
  let inComp = false;
  let range: [number, number] | null = null;
  let passage: ImgRef[] = [];
  for (const e of evs) {
    if (e.kind === "comp") {
      inComp = true;
      range = null;
      passage = [];
      cur = null;
      ver = null;
    } else if (e.kind === "range") {
      range = [e.a, e.b];
    } else if (e.kind === "q") {
      // The same header again with no picture in between is a repeat across a page break.
      if (cur && ver && cur.n === e.n && !ver.imgs.length) continue;
      if (inComp && range && (e.n < range[0] || e.n > range[1])) {
        inComp = false;
        passage = [];
      }
      let q = qs.get(e.n);
      if (!q) {
        q = { n: e.n, versions: [], opts: 0 };
        qs.set(e.n, q);
      }
      ver = { ctx: inComp ? passage.slice() : [], imgs: [] };
      q.versions.push(ver);
      cur = q;
    } else if (e.kind === "opt") {
      if (cur) cur.opts = Math.max(cur.opts, e.label);
    } else if (e.kind === "img") {
      const ref = { page: e.page, idx: e.idx };
      if (ver) ver.imgs.push(ref);
      else if (inComp) passage.push(ref);
    }
  }
  return [...qs.values()].sort((a, b) => a.n - b.n);
}
