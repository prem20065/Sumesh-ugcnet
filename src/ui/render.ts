import { el } from "../dom";

/* Question text with real tables.
   Lines that contain " | " are table rows (a leading "- " is allowed). Everything else stays as text. */
function tableEl(rows: string[][]): HTMLElement {
  const n = Math.max(...rows.map((r) => r.length));
  const first = rows[0][0] || "";
  const head =
    /^(LIST|Year|Sr|S\.?\s*No|Column|Name|Item|Statement|Type)/i.test(first) ||
    (rows.length > 1 && !/^(?:[A-Da-d]|[IVX]+|\d+)[.)]/.test(first) && !/^\d/.test(first));
  const t = el("table");
  rows.forEach((r, i) => {
    const tr = el("tr");
    for (let c = 0; c < n; c++) {
      const v = r[c] || "";
      const isH = head && i === 0;
      tr.append(
        el(isH ? "th" : "td", {
          text: v,
          class: !isH && /^[\d.,%+\-≤≥<>∞\s]+$/.test(v) && v.trim() ? "n" : null,
        }),
      );
    }
    t.append(tr);
  });
  return el("div", { class: "tw" }, t);
}

export function renderQ(box: HTMLElement, text: string) {
  box.textContent = "";
  const lines = String(text).split("\n");
  let i = 0;
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      box.append(el("div", { class: "qp", text: buf.join("\n") }));
      buf = [];
    }
  };
  while (i < lines.length) {
    if (lines[i].indexOf(" | ") >= 0) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].indexOf(" | ") >= 0) {
        rows.push(
          lines[i]
            .replace(/^-\s+/, "")
            .split(/\s+\|\s+/)
            .map((s) => s.trim()),
        );
        i++;
      }
      box.append(tableEl(rows));
    } else {
      buf.push(lines[i]);
      i++;
    }
  }
  flush();
}
