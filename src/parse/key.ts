import type { Question } from "../state";

/** Parse an answer key such as "1. B", "2-(3)", "3 C" into { questionNumber: optionIndex }. */
export function parseKey(text: string): Record<number, number> {
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
