/* Turning positioned text pieces into lines, and rebuilding "Match LIST-I with LIST-II" tables.
   No PDF library or DOM in here, so it can be unit tested. */

export interface Item {
  s: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Line {
  y: number;
  h: number;
  items: Item[];
}

/** Text pieces on one line, with " | " where a wide gap separates table columns. */
export function joinItems(items: Item[], h: number): string {
  let s = "";
  let end: number | null = null;
  items.forEach((it) => {
    if (end !== null) {
      const gap = it.x - end;
      if (gap > h * 2.8) s = s.replace(/\s+$/, "") + " | ";
      else if (gap > h * 0.18 && !/\s$/.test(s) && !/^\s/.test(it.s)) s += " ";
    }
    s += it.s;
    end = it.x + it.w;
  });
  return s.replace(/\s+/g, " ").trim();
}

const LBL = /^\(?([A-Za-z]{1,4}|\d{1,2})[.)]\s+\S/;
const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

export function colKind(labels: string[]): string {
  if (labels.length < 2) return "";
  const u = labels.map((l) => String(l).replace(/[().]/g, ""));
  if (u.every((l, i) => ROMAN[l.toLowerCase()] === i + 1)) return "roman";
  if (u.every((l, i) => /^\d+$/.test(l) && +l === +u[0] + i)) return "digits";
  if (
    u.every(
      (l, i) =>
        l.length === 1 && l.toUpperCase().charCodeAt(0) === u[0].toUpperCase().charCodeAt(0) + i,
    )
  )
    return "letters";
  return "";
}

const TSTOP =
  /^(?:\d{1,3}\s*[.):]|(?:Question|Ques|Que|Q)\b|Match\b|Choose\b|Arrange\b|Which\b|Given\b|Read\b|\(\s*[1-4]\s*\))/i;

/** When a cell wraps or is centred, its text sits on different lines from its neighbour. Use the
    x position of every piece of text to put each cell back in its own row. */
export function matchTables(lines: Line[]): {
  rows: Record<number, string[]>;
  skip: Record<number, boolean>;
} {
  const rep: { rows: Record<number, string[]>; skip: Record<number, boolean> } = {
    rows: {},
    skip: {},
  };
  const wide = (L: Line) => {
    for (let j = 1; j < L.items.length; j++)
      if (L.items[j].x - (L.items[j - 1].x + L.items[j - 1].w) > L.h * 2.8) return true;
    return false;
  };
  const starts = (L: Line) => {
    const s = [L.items[0].x];
    for (let j = 1; j < L.items.length; j++)
      if (L.items[j].x - (L.items[j - 1].x + L.items[j - 1].w) > L.h * 2.8) s.push(L.items[j].x);
    return s;
  };
  const colOf = (x: number, st: number[]) => {
    let c = 0;
    for (let k = 0; k < st.length; k++) if (x >= st[k] - 3) c = k;
    return c;
  };
  const fits = (L: Line, st: number[]) => {
    const it = L.items;
    if (it[0].x < st[0] - 3) return false;
    for (let j = 0; j < it.length; j++) {
      const k = colOf(it[j].x, st);
      if (k < st.length - 1 && it[j].x + it[j].w > st[k + 1] - 3) return false;
    }
    return true;
  };
  const near = (a: Line, b: Line) => Math.abs(a.y - b.y) <= Math.max(a.h, b.h) * 2.7;

  let i = 0;
  while (i < lines.length) {
    const L = lines[i];
    if (rep.skip[i] || !L.items.length || !wide(L)) {
      i++;
      continue;
    }
    const st = starts(L);
    if (st.length !== 2) {
      i++;
      continue;
    }
    let a = i;
    let b = i;
    while (
      a > 0 &&
      !rep.skip[a - 1] &&
      near(lines[a - 1], lines[a]) &&
      fits(lines[a - 1], st) &&
      !TSTOP.test(joinItems(lines[a - 1].items, lines[a - 1].h))
    )
      a--;
    while (
      b + 1 < lines.length &&
      near(lines[b], lines[b + 1]) &&
      fits(lines[b + 1], st) &&
      !TSTOP.test(joinItems(lines[b + 1].items, lines[b + 1].h))
    )
      b++;
    const cols: string[][] = [[], []];
    for (let li = a; li <= b; li++) {
      const parts: Item[][] = [[], []];
      lines[li].items.forEach((it) => parts[colOf(it.x, st)].push(it));
      for (let k = 0; k < 2; k++)
        if (parts[k].length) cols[k].push(joinItems(parts[k], lines[li].h));
    }
    const cells: { label: string; text: string }[][] = [[], []];
    const pre: string[][] = [[], []];
    for (let k2 = 0; k2 < 2; k2++)
      cols[k2].forEach((t) => {
        const m = LBL.exec(t);
        if (m) cells[k2].push({ label: m[1], text: t });
        else if (cells[k2].length) cells[k2][cells[k2].length - 1].text += " " + t;
        else pre[k2].push(t);
      });
    const k0 = colKind(cells[0].map((c) => c.label));
    const k1 = colKind(cells[1].map((c) => c.label));
    if (cells[0].length >= 2 && cells[0].length === cells[1].length && k0 && k1 && k0 !== k1) {
      const out: string[] = [];
      let h0 = pre[0].slice();
      const h1 = pre[1].slice();
      let hi = -1;
      h0.forEach((t, j) => {
        if (/^LIST/i.test(t)) hi = j;
      });
      if (hi < 0 && h0.length) hi = h0.length - 1;
      if (hi > 0) {
        h0.slice(0, hi).forEach((t) => out.push(t));
        h0 = h0.slice(hi);
      }
      if (h0.length || h1.length) out.push((h0.join(" ") || "") + " | " + (h1.join(" ") || ""));
      cells[0].forEach((c, r) => out.push(c.text + " | " + cells[1][r].text));
      rep.rows[a] = out;
      for (let s = a + 1; s <= b; s++) rep.skip[s] = true;
      i = b + 1;
    } else i++;
  }
  return rep;
}

/** Group text pieces into lines, top to bottom, each line sorted left to right. */
export function groupLines(items: Item[]): Line[] {
  const sorted = items.slice().sort((a, b) => b.y - a.y);
  const lines: Line[] = [];
  let cur: Line | null = null;
  sorted.forEach((it) => {
    if (cur && Math.abs(it.y - cur.y) <= cur.h * 0.5) cur.items.push(it);
    else {
      cur = { y: it.y, h: it.h, items: [it] };
      lines.push(cur);
    }
  });
  lines.forEach((L) => L.items.sort((a, b) => a.x - b.x));
  return lines;
}

/** Group one page's text pieces into lines (top to bottom, left to right) and return their text. */
export function pageToLines(items: Item[]): string[] {
  const lines = groupLines(items);
  const rep = matchTables(lines);
  const out: string[] = [];
  lines.forEach((L, li) => {
    if (rep.skip[li]) return;
    if (rep.rows[li]) {
      rep.rows[li].forEach((r) => out.push(r));
      return;
    }
    const s = joinItems(L.items, L.h);
    if (s) out.push(s);
  });
  return out;
}

const OPTLINE =
  /^(?:\(\s*[1-4A-Da-d]\s*\)|[A-Da-d1-4][).]\s|(?:Question|Ques|Que|Qn|Q)\s*(?:number|no|num|#)?\s*[.:-]?\s*\d|\d{1,3}\s*[.):]\s)/i;
const PAGENO = /^[-–—\s]*(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?[-–—\s]*$/i;

/** Join pages into one text. With `strip`, drop headers, footers and page numbers that repeat. */
export function buildText(pages: string[][], strip: boolean): string {
  let P = pages.map((p) => p.slice());
  if (strip && P.length >= 2) {
    const norm = (l: string) => l.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    const cnt = new Map<string, number>();
    P.forEach((p) => {
      new Set(p.slice(0, 3).concat(p.slice(-3)).map(norm)).forEach((k) => {
        if (k) cnt.set(k, (cnt.get(k) || 0) + 1);
      });
    });
    const lim = Math.max(2, Math.ceil(P.length * 0.5));
    P = P.map((p) =>
      p.filter((l, i) => {
        const edge = i < 3 || i >= p.length - 3;
        if (!edge) return true;
        if (PAGENO.test(l) && (i === 0 || i === p.length - 1)) return false;
        if (OPTLINE.test(l)) return true;
        return !((cnt.get(norm(l)) ?? 0) >= lim);
      }),
    );
  }
  return P.map((p) => p.join("\n")).join("\n");
}
