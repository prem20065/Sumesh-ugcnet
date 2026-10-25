import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pageToLines, type Item } from "./layout";
import { imageRects, parseNta, type ImgRef, type NtaQuestion, type PageData } from "./nta";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** One printing of a question as pictures: an optional shared passage, then the question itself. */
export interface Pic {
  ctx: string;
  img: string;
}
export interface ImageQuestion {
  n: number;
  opts: number;
  /** English first; a second entry is the Hindi printing of a bilingual paper. */
  pics: Pic[];
}

export interface PdfText {
  pages: string[][];
  /** True when there is almost no selectable text, i.e. the PDF is a scan. */
  scan: boolean;
  /** Set for papers whose questions are pictures (NTA exports). */
  images?: ImageQuestion[];
}

const SCALE = 2;

export async function readPdf(file: File): Promise<PdfText> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    .promise;
  const pages: string[][] = [];
  const data: PageData[] = [];
  let chars = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = (tc.items as any[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({
        s: i.str,
        x: i.transform[4],
        y: i.transform[5],
        w: i.width,
        h: Math.abs(i.transform[3]) || 10,
      }));
    const ol = await page.getOperatorList();
    data.push({ items, images: imageRects(ol.fnArray, ol.argsArray, pdfjsLib.OPS as any) });
    const out = pageToLines(items);
    chars += out.join("").length;
    pages.push(out);
  }
  const res: PdfText = { pages, scan: chars < 40 * pdf.numPages };
  const nta = parseNta(data);
  if (nta) res.images = await cropQuestions(pdf, data, nta);
  return res;
}

/** Render the pages that hold question pictures and cut each picture out. */
async function cropQuestions(
  pdf: any,
  data: PageData[],
  qs: NtaQuestion[],
): Promise<ImageQuestion[]> {
  const need = new Map<number, Set<number>>();
  const use = (r: ImgRef) => {
    if (!need.has(r.page)) need.set(r.page, new Set());
    need.get(r.page)!.add(r.idx);
  };
  qs.forEach((q) =>
    q.versions.forEach((v) => {
      v.ctx.forEach(use);
      v.imgs.forEach(use);
    }),
  );

  const crops = new Map<string, HTMLCanvasElement>();
  for (const [page, idxs] of need) {
    const pg = await pdf.getPage(page + 1);
    const vp = pg.getViewport({ scale: SCALE });
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(vp.width);
    cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    for (const idx of idxs) {
      const r = data[page].images[idx];
      const [ax, ay, bx, by] = vp.convertToViewportRectangle([r.x0, r.y0, r.x1, r.y1]);
      const x = Math.max(0, Math.floor(Math.min(ax, bx)));
      const y = Math.max(0, Math.floor(Math.min(ay, by)));
      const w = Math.min(cv.width - x, Math.ceil(Math.abs(bx - ax)));
      const h = Math.min(cv.height - y, Math.ceil(Math.abs(by - ay)));
      const c = document.createElement("canvas");
      c.width = Math.max(1, w);
      c.height = Math.max(1, h);
      c.getContext("2d")!.drawImage(cv, x, y, w, h, 0, 0, w, h);
      crops.set(page + ":" + idx, c);
    }
    cv.width = 0;
  }

  /** Stack several crops top to bottom into one JPEG data URL. */
  const stack = (refs: ImgRef[]): string => {
    const cs = refs
      .map((r) => crops.get(r.page + ":" + r.idx))
      .filter(Boolean) as HTMLCanvasElement[];
    if (!cs.length) return "";
    const gap = 8;
    const out = document.createElement("canvas");
    out.width = Math.max(...cs.map((c) => c.width));
    out.height = cs.reduce((s, c) => s + c.height, 0) + gap * (cs.length - 1);
    const o = out.getContext("2d")!;
    o.fillStyle = "#fff";
    o.fillRect(0, 0, out.width, out.height);
    let y = 0;
    cs.forEach((c) => {
      o.drawImage(c, 0, y);
      y += c.height + gap;
    });
    return out.toDataURL("image/jpeg", 0.85);
  };

  return qs
    .map((q) => ({
      n: q.n,
      opts: q.opts || 4,
      pics: q.versions.map((v) => ({ ctx: stack(v.ctx), img: stack(v.imgs) })).filter((p) => p.img),
    }))
    .filter((q) => q.pics.length);
}
