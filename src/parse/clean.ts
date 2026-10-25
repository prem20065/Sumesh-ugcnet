import { nextId, type Question } from "../state";

/* ---------- line cleanup ---------- */
const SHY = /\u00AD/g;
const LIG_FI = /\uFB01/g;
const LIG_FL = /\uFB02/g;
const NBSP = /\u00A0/g;
const HINDI = /[\u0900-\u097F\u200C\u200D]+/g;

export function prepLines(text: string, noHindi: boolean): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => {
      l = l.replace(SHY, "").replace(LIG_FI, "fi").replace(LIG_FL, "fl").replace(NBSP, " ");
      if (noHindi) l = l.replace(HINDI, " ");
      l = l
        .replace(/Question\s*ID\s*[:-]?\s*\d+/gi, "")
        .replace(/Option\s*[1-4]\s*ID\s*[:-]?\s*\d+/gi, "");
      l = l.replace(/\s+/g, " ").trim();
      /* option lines are not table rows; only real table rows keep their | separators */
      if (/\(\s*[1-4A-Da-d]\s*\)/.test(l) || /^\|\s|\s\|$/.test(l))
        l = l.replace(/\s*\|\s*/g, " ").trim();
      return l;
    })
    .filter(Boolean);
}

/* ---------- splitting into questions ---------- */
/* "Question number 1", "Question No. 1:", "Ques 1", "Q.1" (label, punctuation optional) or a bare "1." / "1)" */
const QLAB =
  /^(?:Question|Ques|Que|Qn|Q)\s*(?:number|no|num|#)?\s*[.:-]?\s*(\d{1,3})(?!\d)\s*[.):-]?\s*(.*)$/i;
const QBARE = /^(\d{1,3})\s*[.):]\s*(.*)$/;
const qStart = (l: string) => QLAB.exec(l) || QBARE.exec(l);
const OPT2 = /\(\s*[2-4B-Db-d]\s*\)|^(?:[B-Db-d]\s*[).]|[2-4]\s*\))\s/;

interface RawQuestion {
  n: number;
  lines: string[];
  hits: number;
  sub: number[];
  num?: number;
}

export function splitQuestions(lines: string[], gate: boolean): RawQuestion[] {
  const out: RawQuestion[] = [];
  let cur: RawQuestion | null = null;
  let expected = 1;
  /* does this candidate have its own options before the next candidate number?
     (lets an option-less passage or essay end) */
  function hasOptsAfter(i: number, n: number) {
    for (let j = i; j < lines.length && j < i + 40; j++) {
      const mm = qStart(lines[j]);
      if (j > i && mm && +mm[1] === n + 1) return false;
      if (OPT2.test(lines[j])) return true;
    }
    return false;
  }
  function later(from: number, n: number) {
    for (let j = from; j < lines.length; j++) {
      const m = qStart(lines[j]);
      if (m && +m[1] === n) return true;
    }
    return false;
  }
  lines.forEach((ln, i) => {
    let m = qStart(ln);
    let start = false;
    let n = 0;
    const numOpt = /^([1-4])\s*\)\s/.exec(ln);
    /* "4) Madrid" right after "3) Berlin" is an option, not question 4 */
    if (m && numOpt && cur && cur.num && +numOpt[1] === cur.num + 1) m = null;
    if (m) {
      n = +m[1];
      /* a repeated number is a false start (e.g. numbered instructions) only if everything seen since was a later number */
      const c = cur as RawQuestion | null;
      if (c && n === c.n && c.hits < 1 && c.sub.length && c.sub.every((x) => x > c.n)) {
        out.pop();
        cur = null;
        start = true;
      } else if (
        !c ||
        !gate ||
        c.hits >= 1 ||
        (n === expected &&
          !(c.sub.length && c.sub[c.sub.length - 1] === n - 1) &&
          hasOptsAfter(i, n))
      ) {
        if (n === expected) start = true;
        else if (n > expected && n <= expected + 2 && !later(i + 1, expected)) start = true;
      }
    }
    if (start && m) {
      cur = { n, lines: [m[2]], hits: OPT2.test(m[2]) ? 1 : 0, sub: [] };
      out.push(cur);
      expected = n + 1;
    } else if (cur) {
      cur.lines.push(ln);
      if (m) cur.sub.push(+m[1]);
      if (numOpt) cur.num = +numOpt[1];
      if (OPT2.test(ln)) cur.hits++;
    }
  });
  return out;
}

/* ---------- splitting a question into stem and options ---------- */
interface Style {
  l: string[];
  re: (L: string) => string;
  f: string;
}
const STY: Style[] = [
  { l: ["1", "2", "3", "4"], re: (L) => "\\(\\s*" + L + "\\s*\\)", f: "g" },
  { l: ["a", "b", "c", "d"], re: (L) => "\\(\\s*" + L + "\\s*\\)", f: "gi" },
  { l: ["a", "b", "c", "d"], re: (L) => "(?:^|\\n)[ \\t]*" + L + "[ \\t]*[\\).][ \\t]", f: "gi" },
  { l: ["1", "2", "3", "4"], re: (L) => "(?:^|\\n)[ \\t]*" + L + "[ \\t]*\\)[ \\t]", f: "g" },
];
interface Mark {
  i: number;
  e: number;
}

function findChain(body: string, s: Style): Mark[] | null {
  const r1 = new RegExp(s.re(s.l[0]), s.f);
  const all: Mark[] = [];
  let m: RegExpExecArray | null;
  while ((m = r1.exec(body))) all.push({ i: m.index, e: m.index + m[0].length });
  for (let k = all.length - 1; k >= 0; k--) {
    const chain = [all[k]];
    let pos = all[k].e;
    for (let t = 1; t < 4; t++) {
      const r = new RegExp(s.re(s.l[t]), s.f);
      r.lastIndex = pos;
      const mm = r.exec(body);
      if (!mm) break;
      chain.push({ i: mm.index, e: mm.index + mm[0].length });
      pos = chain[t].e;
    }
    if (chain.length >= 2) return chain;
  }
  return null;
}

export function splitOptions(body: string): { q: string; o: string[] } {
  let best: Mark[] | null = null;
  STY.forEach((s) => {
    const c = findChain(body, s);
    if (c && (!best || c[0].i > best[0].i)) best = c;
  });
  const chain = best as Mark[] | null;
  if (!chain) return { q: body, o: [] };
  const o = chain.map((c, k) =>
    body
      .slice(c.e, k + 1 < chain.length ? chain[k + 1].i : body.length)
      .replace(/\s+/g, " ")
      .trim(),
  );
  return { q: body.slice(0, chain[0].i), o };
}

/* ---------- re-joining wrapped lines ---------- */
const KEEP =
  /^(?:[A-E]\.\s|Question\s*:|LIST-I|\(?[a-dA-D]\)|\(?[ivxIVX]{1,4}[).]|\(\d{1,2}\)|\d{1,2}[.)]\s|[-•*]\s|(?:Statement|Assertion|Reason|Column|List|Codes?|Passage|Choose|Read|Given|Match|Directions?|Which of the)\b)/;

export function reflow(t: string): string {
  const ls = t
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  let out = "";
  ls.forEach((l, i) => {
    if (!i) {
      out = l;
      return;
    }
    if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(l)) out = out.slice(0, -1) + l;
    else if (KEEP.test(l) || /:$/.test(out) || l.indexOf(" | ") >= 0) out += "\n" + l;
    else out += " " + l;
  });
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

export function cleanPaper(text: string, noHindi: boolean): Question[] {
  const lines = prepLines(text, noHindi);
  let raw = splitQuestions(lines, true);
  if (raw.length < 3) {
    const alt = splitQuestions(lines, false);
    if (alt.length > raw.length) raw = alt;
  }
  return raw.map((r) => {
    const s = splitOptions(r.lines.join("\n"));
    return { id: nextId(), n: r.n, q: reflow(s.q), o: s.o, a: -1 };
  });
}
