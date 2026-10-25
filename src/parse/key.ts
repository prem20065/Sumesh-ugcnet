import type { Question } from "../state";

const ROW = /^\s*\d{1,3}(?:\s*\|\s*\d{1,3})+\s*$/;

/** NTA key tables: rows like "1 | 1 | 26 | 4" are pairs of (question number | answer). */
function parseKeyTable(text: string): Record<number, number> | null {
  const rows = text.split(/\r?\n/).filter((l) => ROW.test(l));
  if (rows.length < 2) return null;
  const k: Record<number, number> = {};
  rows.forEach((r) => {
    const c = r.split("|").map((x) => +x.trim());
    if (c.length % 2) return;
    for (let i = 0; i < c.length; i += 2)
      if (c[i + 1] >= 1 && c[i + 1] <= 5) k[c[i]] = c[i + 1] - 1;
  });
  return Object.keys(k).length ? k : null;
}

/** Parse an answer key such as "1. B", "2-(3)", "3 C" into { questionNumber: optionIndex }. */
export function parseKey(text: string): Record<number, number> {
  const table = parseKeyTable(text);
  if (table) return table;
  const t = text
    .replace(/\|/g, " ")
    .replace(/\b(?:ans(?:wer)?s?|key)\b[:.]?/gi, " ")
    .replace(/\b(?:question|ques|que|qn|q)s?\.?\s*(?:number|no|num)?\.?\s*(?=\d)/gi, "")
    .replace(/\s+/g, " ");
  const k: Record<number, number> = {};
  const re = /(?:^|[^\d])(\d{1,3})\s*[.\-:=)\s]\s*\(?([1-4A-Da-d])\)?(?![A-Za-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = m[2].toUpperCase();
    k[+m[1]] = "1234".indexOf(a) >= 0 ? +a - 1 : "ABCD".indexOf(a);
  }
  return k;
}

/** Set the correct option on every question whose paper number is in the key. Returns how many were set. */
export function applyKey(qs: Question[], key: Record<number, number>): number {
  let n = 0;
  qs.forEach((q) => {
    const v = key[q.n];
    if (v !== undefined && v < q.o.length) {
      q.a = v;
      n++;
    }
  });
  return n;
}
