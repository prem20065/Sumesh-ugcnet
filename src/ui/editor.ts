import { $, el, fit } from "../dom";
import { state, nextId, type Question } from "../state";
import { applyKey, parseKey } from "../parse/key";
import { prepLines } from "../parse/clean";
import { renderQ } from "./render";

const STORE_KEY = "pc.v1";

let saveT = 0;
export function persist() {
  clearTimeout(saveT);
  saveT = window.setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ qs: state.QS }));
    } catch {
      /* storage can be blocked; the app works without it */
    }
  }, 500);
}

/** The paper saved by an earlier visit, if any. */
export function loadSaved(): Question[] | null {
  try {
    const old = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return old && old.qs && old.qs.length ? old.qs : null;
  } catch {
    return null;
  }
}

function issues(q: Question): string[] {
  const r: string[] = [];
  const filled = q.o.filter((o) => o.trim()).length;
  if (!q.q.trim()) r.push("No question text");
  if (q.o.length < 2 || filled < 2) r.push("Needs at least two options");
  else if (filled < q.o.length) r.push("Empty option");
  if (q.a < 0) r.push("No correct answer set");
  return r;
}

export function fitAll() {
  if ($("s2").hidden) return;
  document.querySelectorAll<HTMLTextAreaElement>("#s2 textarea.ta").forEach(fit);
}

function summary() {
  const withKey = state.QS.filter((q) => q.a >= 0).length;
  const flag = state.QS.filter((q) => issues(q).length).length;
  const c = $("chips");
  c.textContent = "";
  c.append(
    el("span", { class: "chip" }, el("b", { text: state.QS.length }), " questions"),
    el("span", { class: "chip" }, el("b", { text: withKey }), " with an answer"),
    el("span", { class: "chip" + (flag ? " w" : "") }, el("b", { text: flag }), " need attention"),
  );
  if (state.dropped)
    c.append(el("span", { class: "chip" }, el("b", { text: state.dropped }), " dropped, no options"));
}

function badge(card: HTMLElement, q: Question) {
  const is = issues(q);
  const b = card.querySelector(".badge") as HTMLElement;
  card.classList.toggle("flag", is.length > 0);
  b.className = "badge" + (is.length ? " w" : "");
  b.textContent = is.length ? is[0] : "Looks good";
  card.dataset.flag = is.length ? "1" : "";
}

function ta(value: string, cls: string, fn: (v: string) => void) {
  const t = el("textarea", { class: "ta " + cls, rows: 1, spellcheck: "false" }) as HTMLTextAreaElement;
  t.value = value;
  t.addEventListener("input", () => {
    fit(t);
    fn(t.value);
  });
  return t;
}

function buildCard(q: Question, idx: number): HTMLElement {
  const c = el("article", { class: "qc" });
  const num = el("span", {
    class: "qn",
    text: "Q" + (idx + 1) + (q.n !== idx + 1 ? "  (paper no. " + q.n + ")" : ""),
  });
  const head = el(
    "div",
    { class: "qh" },
    el("div", { class: "l" }, num, el("span", { class: "badge" })),
    el(
      "div",
      { class: "row" },
      idx > 0
        ? el("button", {
            class: "btn sm",
            title: "Add this question's text to the one above and remove it",
            text: "Merge up",
            onclick: () => mergeUp(idx),
          })
        : null,
      el("button", {
        class: "btn sm",
        text: "Clear answer",
        onclick: () => {
          q.a = -1;
          renderEditor(true);
        },
      }),
      el("button", {
        class: "btn sm",
        text: "Delete",
        onclick: () => {
          state.QS.splice(idx, 1);
          renderEditor(true);
          persist();
        },
      }),
    ),
  );
  c.append(head);
  c.append(el("label", { class: "mu", for: "q" + q.id, text: "Question" }));
  const qt = ta(q.q, "qq", (v) => {
    q.q = v;
    badge(c, q);
    summary();
    persist();
  });
  qt.id = "q" + q.id;
  c.append(qt);
  const box = el("div");
  q.o.forEach((o, i) => {
    const radio = el("input", {
      type: "radio",
      name: "a" + q.id,
      "aria-label": "Option " + (i + 1) + " is correct",
    }) as HTMLInputElement;
    radio.checked = q.a === i;
    radio.addEventListener("change", () => {
      q.a = i;
      badge(c, q);
      summary();
      persist();
    });
    box.append(
      el(
        "div",
        { class: "oe" },
        radio,
        el("span", { class: "lt", text: "(" + (i + 1) + ")" }),
        ta(o, "oo", (v) => {
          q.o[i] = v;
          badge(c, q);
          summary();
          persist();
        }),
        el("button", {
          class: "btn sm",
          title: "Remove this option",
          "aria-label": "Remove option " + (i + 1),
          text: "×",
          onclick: () => {
            q.o.splice(i, 1);
            if (q.a === i) q.a = -1;
            else if (q.a > i) q.a--;
            renderEditor(true);
            persist();
          },
        }),
      ),
    );
  });
  c.append(box);
  c.append(
    el(
      "div",
      { class: "row", style: "margin-top:8px" },
      q.o.length < 6
        ? el("button", {
            class: "btn sm",
            text: "Add option",
            onclick: () => {
              q.o.push("");
              renderEditor(true);
              persist();
            },
          })
        : null,
    ),
  );
  badge(c, q);
  return c;
}

export function renderEditor(keepScroll?: boolean) {
  const y = window.scrollY;
  const list = $("list");
  list.textContent = "";
  const only = $("onlyFlag").checked;
  let shown = 0;
  state.QS.forEach((q, i) => {
    const c = buildCard(q, i);
    if (only && !c.dataset.flag) return;
    list.append(c);
    shown++;
  });
  if (!shown)
    list.append(
      el("p", { class: "mu", text: only ? "Nothing needs attention." : "No questions yet. Add one below." }),
    );
  summary();
  $("t2").disabled = !state.QS.length;
  $("t3").disabled = !state.QS.length;
  requestAnimationFrame(() => {
    fitAll();
    if (keepScroll) window.scrollTo(0, y);
  });
}

function mergeUp(i: number) {
  const p = state.QS[i - 1];
  const q = state.QS[i];
  p.q = (p.q + "\n" + q.n + ". " + q.q).trim();
  if (p.o.filter((o) => o.trim()).length < 2) {
    p.o = q.o;
    if (q.a >= 0) p.a = q.a;
  }
  state.QS.splice(i, 1);
  renderEditor(true);
  persist();
}

/* ---------- clean view ---------- */
function optLabel(j: number, style: string) {
  const n = style.indexOf("A") >= 0 ? String.fromCharCode(65 + j) : String(j + 1);
  return style.replace(/[1A]/, n);
}

export function cleanText(withAns: boolean): string {
  const st = $("ostyle").value;
  return state.QS.map((q, i) => {
    let s = i + 1 + ". " + q.q + "\n";
    q.o.forEach((o, j) => {
      s += optLabel(j, st) + " " + o + "\n";
    });
    if (withAns && q.a >= 0) s += "Answer: " + optLabel(q.a, st) + "\n";
    return s;
  }).join("\n");
}

function renderClean() {
  const st = $("ostyle").value;
  const showAns = $("cvAns").checked;
  const box = $("cvbody");
  box.textContent = "";
  if (!state.QS.length) {
    box.append(el("p", { class: "mu", text: "No questions yet." }));
    return;
  }
  state.QS.forEach((q, i) => {
    const stem = el("div", { class: "cqx" });
    renderQ(stem, q.q);
    const d = el(
      "div",
      { class: "cq" },
      el("div", { class: "cqt" }, el("span", { class: "cqn", text: i + 1 + "." }), stem),
    );
    q.o.forEach((o, j) => {
      d.append(
        el(
          "div",
          { class: "cqo" + (showAns && q.a === j ? " ok" : "") },
          el("span", { class: "cql", text: optLabel(j, st) }),
          el("span", { text: o }),
        ),
      );
    });
    box.append(d);
  });
}

export function setView(clean: boolean) {
  $("vEdit").setAttribute("aria-pressed", clean ? "false" : "true");
  $("vClean").setAttribute("aria-pressed", clean ? "true" : "false");
  $("cv").hidden = !clean;
  $("list").hidden = clean;
  $("addQ").closest(".row").hidden = clean;
  $("onlyFlag").closest(".row").hidden = clean;
  if (clean) $("keyBox").hidden = true;
  if (clean) renderClean();
  else requestAnimationFrame(fitAll);
}

/** Wire up everything in step 2 except starting the exam. */
export function initEditor() {
  let fitT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(fitT);
    fitT = window.setTimeout(fitAll, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(fitAll, 50));

  $("onlyFlag").onchange = () => renderEditor();
  $("addQ").onclick = () => {
    const last = state.QS[state.QS.length - 1];
    state.QS.push({ id: nextId(), n: last ? last.n + 1 : 1, q: "", o: ["", "", "", ""], a: -1 });
    renderEditor();
    persist();
    requestAnimationFrame(() => {
      const cs = document.querySelectorAll("#list .qc");
      const l = cs[cs.length - 1];
      if (l) {
        l.scrollIntoView({ block: "center" });
        const t = l.querySelector("textarea");
        if (t) t.focus();
      }
    });
  };
  $("keyToggle").onclick = () => {
    $("keyBox").hidden = !$("keyBox").hidden;
    requestAnimationFrame(fitAll);
  };
  $("keyApply").onclick = () => {
    const key = parseKey(prepLines($("ktxt2").value, false).join(" "));
    const n = applyKey(state.QS, key);
    const total = Object.keys(key).length;
    $("keyMsg").className = "status " + (n ? "good" : "bad");
    $("keyMsg").textContent = n
      ? "Set " + n + " answers (" + total + " found in the key)."
      : "No answers matched. Check the numbers in the key.";
    renderEditor(true);
    persist();
  };
  $("vEdit").onclick = () => setView(false);
  $("vClean").onclick = () => setView(true);
  $("ostyle").onchange = renderClean;
  $("cvAns").onchange = renderClean;
  $("copy").onclick = () => {
    const t = cleanText($("cvAns").checked);
    const o = $("out");
    o.value = t;
    const fallback = () => {
      o.hidden = false;
      o.style.height = "160px";
      o.focus();
      o.select();
      $("startMsg").textContent = "Press Ctrl+C to copy the selected text.";
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(() => {
        o.hidden = true;
        $("startMsg").textContent = "Copied " + state.QS.length + " questions to the clipboard.";
      }, fallback);
    else fallback();
  };
}
