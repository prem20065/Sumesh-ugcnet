import { $, el } from "../dom";
import { state } from "../state";
import { renderQ } from "./render";
import { show } from "./nav";

interface ExamQuestion {
  q: string;
  o: string[];
  a: number;
}
interface Exam {
  qs: ExamQuestion[];
  ans: number[];
  mark: boolean[];
  seen: boolean[];
  cur: number;
  left: number;
  marks: number;
  neg: number;
  skipped: number;
  timer: number | null;
  done?: boolean;
}

let E: Exam | null = null;

function ask(text: string, ok: string, fn: () => void) {
  $("mtext").textContent = text;
  $("myes").textContent = ok;
  $("modal").hidden = false;
  $("myes").focus();
  $("myes").onclick = () => {
    $("modal").hidden = true;
    fn();
  };
  $("mno").onclick = () => {
    $("modal").hidden = true;
  };
}

export function startMock() {
  if (E && E.timer) clearInterval(E.timer);
  const list: ExamQuestion[] = [];
  state.QS.forEach((q) => {
    const keep: string[] = [];
    const map: number[] = [];
    q.o.forEach((o, i) => {
      if (o.trim()) {
        map[i] = keep.length;
        keep.push(o.trim());
      }
    });
    if (q.q.trim() && keep.length >= 2)
      list.push({ q: q.q.trim(), o: keep, a: q.a >= 0 && map[q.a] !== undefined ? map[q.a] : -1 });
  });
  if (!list.length) {
    $("startMsg").className = "mu bad";
    $("startMsg").textContent = "Add at least one question with two options first.";
    return;
  }
  const skipped = state.QS.length - list.length;
  E = {
    qs: list,
    ans: list.map(() => -1),
    mark: list.map(() => false),
    seen: list.map(() => false),
    cur: 0,
    left: Math.max(1, +$("mins").value || 60) * 60,
    marks: +$("mk").value || 0,
    neg: +$("ng").value || 0,
    skipped,
    timer: null,
  };
  $("startMsg").textContent = "";
  show("exam");
  drawExam();
  tick();
  E.timer = window.setInterval(tick, 1000);
}

function tick() {
  if (!E) return;
  const m = Math.floor(E.left / 60);
  const s = E.left % 60;
  $("etime").textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  $("etime").classList.toggle("low", E.left < 300);
  if (E.left-- <= 0) finish();
}

function drawExam() {
  if (!E) return;
  const ex = E;
  const q = ex.qs[ex.cur];
  ex.seen[ex.cur] = true;
  $("ecount").textContent = "Question " + (ex.cur + 1) + " of " + ex.qs.length;
  renderQ($("eq"), q.q);
  const box = $("eo");
  box.textContent = "";
  q.o.forEach((t, i) => {
    box.append(
      el(
        "button",
        {
          class: "o" + (ex.ans[ex.cur] === i ? " s" : ""),
          onclick: () => {
            ex.ans[ex.cur] = i;
            drawExam();
          },
        },
        el("i", { text: i + 1 }),
        el("span", { text: t }),
      ),
    );
  });
  $("em").textContent = ex.mark[ex.cur] ? "Remove review mark" : "Mark for review";
  const pal = $("epal");
  pal.textContent = "";
  ex.qs.forEach((_, i) => {
    pal.append(
      el("button", {
        class: (ex.mark[i] ? "m " : ex.ans[i] >= 0 ? "a " : ex.seen[i] ? "v " : "") + (i === ex.cur ? "c" : ""),
        text: i + 1,
        "aria-label": "Question " + (i + 1),
        onclick: () => {
          ex.cur = i;
          drawExam();
        },
      }),
    );
  });
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

function finish() {
  if (!E || E.done) return;
  const ex = E;
  ex.done = true;
  if (ex.timer) clearInterval(ex.timer);
  let ok = 0;
  let bad = 0;
  let skip = 0;
  let unscored = 0;
  ex.qs.forEach((q, i) => {
    if (ex.ans[i] < 0) skip++;
    else if (q.a < 0) unscored++;
    else if (ex.ans[i] === q.a) ok++;
    else bad++;
  });
  const scorable = ex.qs.filter((q) => q.a >= 0).length;
  const score = ok * ex.marks - bad * ex.neg;
  const total = scorable * ex.marks;
  const r = $("res");
  r.textContent = "";
  const unkeyed = ex.qs.length - scorable;
  r.append(
    el("h1", { text: "Result" }),
    el(
      "div",
      { class: "card" },
      el("div", { class: "score", text: fmt(score) + " / " + fmt(total) }),
      el("p", {
        class: "mu",
        text:
          "Correct " + ok + " · Wrong " + bad + " · Skipped " + skip + (unscored ? " · No key for " + unscored : "") + ". " +
          fmt(ex.marks) + " per correct, " + (ex.neg ? "minus " + fmt(ex.neg) + " per wrong." : "no negative marking.") +
          (ex.skipped
            ? " " + ex.skipped + " question" + (ex.skipped > 1 ? "s were" : " was") + " left out because it had no text or fewer than two options."
            : ""),
      }),
      scorable < ex.qs.length
        ? el("p", {
            class: "warn",
            text: unkeyed + " question" + (unkeyed > 1 ? "s have" : " has") + " no correct answer set, so they are not scored. Set them in the editor.",
          })
        : null,
      el(
        "div",
        { class: "row" },
        el("button", { class: "btn p", text: "Retake this paper", onclick: startMock }),
        el("button", { class: "btn", text: "Back to editing", onclick: () => show("s2") }),
        el("button", { class: "btn", text: "Load another paper", onclick: () => show("s1") }),
      ),
    ),
    el("h2", { text: "Review" }),
  );
  ex.qs.forEach((q, i) => {
    const state_ = ex.ans[i] < 0 ? "Skipped" : q.a < 0 ? "No key" : ex.ans[i] === q.a ? "Correct" : "Wrong";
    const stem = el("div", { class: "q" });
    renderQ(stem, q.q);
    const card = el(
      "div",
      { class: "qc" },
      el(
        "div",
        { class: "qh" },
        el("span", { class: "qn", text: "Question " + (i + 1) }),
        el("span", { class: "badge" + (state_ === "Correct" ? "" : " w"), text: state_ }),
      ),
      stem,
    );
    q.o.forEach((t, j) => {
      const cl = j === q.a ? "ok" : j === ex.ans[i] && q.a >= 0 ? "no" : "";
      const note =
        j === q.a && j === ex.ans[i] ? "Your answer · correct" : j === q.a ? "Correct answer" : j === ex.ans[i] ? "Your answer" : "";
      card.append(
        el(
          "div",
          { class: "o " + cl + (j === ex.ans[i] && q.a < 0 ? " s" : "") },
          el("i", { text: j + 1 }),
          el("span", { text: t }),
          note ? el("em", { text: note }) : null,
        ),
      );
    });
    r.append(card);
  });
  show("res");
}

export function initExam() {
  $("start").onclick = () => startMock();
  $("en").onclick = () => {
    if (!E) return;
    if (E.cur < E.qs.length - 1) E.cur++;
    drawExam();
    window.scrollTo(0, 0);
  };
  $("ep").onclick = () => {
    if (!E) return;
    if (E.cur > 0) E.cur--;
    drawExam();
    window.scrollTo(0, 0);
  };
  $("em").onclick = () => {
    if (!E) return;
    E.mark[E.cur] = !E.mark[E.cur];
    drawExam();
  };
  $("ec").onclick = () => {
    if (!E) return;
    E.ans[E.cur] = -1;
    drawExam();
  };
  $("esub").onclick = () => {
    if (!E) return;
    const n = E.ans.filter((a) => a < 0).length;
    ask(n ? n + " question" + (n > 1 ? "s are" : " is") + " unanswered. Submit now?" : "Submit your exam?", "Submit", finish);
  };
  document.addEventListener("keydown", (e) => {
    if (!E || $("exambar").hidden || !$("modal").hidden || /^(TEXTAREA|INPUT)$/.test((e.target as HTMLElement).tagName)) return;
    const q = E.qs[E.cur];
    if (/^[1-9]$/.test(e.key) && +e.key <= q.o.length) {
      E.ans[E.cur] = +e.key - 1;
      drawExam();
    } else if (e.key === "ArrowRight" && E.cur < E.qs.length - 1) {
      E.cur++;
      drawExam();
    } else if (e.key === "ArrowLeft" && E.cur > 0) {
      E.cur--;
      drawExam();
    }
  });
}
