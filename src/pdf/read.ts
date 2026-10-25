import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pageToLines, type Item } from "./layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfText {
  pages: string[][];
  /** True when there is almost no selectable text, i.e. the PDF is a scan. */
  scan: boolean;
}

export async function readPdf(file: File): Promise<PdfText> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[][] = [];
  let chars = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const items: Item[] = (tc.items as any[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({
        s: i.str,
        x: i.transform[4],
        y: i.transform[5],
        w: i.width,
        h: Math.abs(i.transform[3]) || 10,
      }));
    const out = pageToLines(items);
    chars += out.join("").length;
    pages.push(out);
  }
  return { pages, scan: chars < 40 * pdf.numPages };
}
