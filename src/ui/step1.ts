import { $ } from "../dom";
import { state, nextId, type Question } from "../state";
import { readPdf, type ImageQuestion } from "../pdf/read";
import { buildText } from "../pdf/layout";
import { cleanPaper, prepLines } from "../parse/clean";
import { applyKey, parseKey } from "../parse/key";
import { persist, renderEditor, setView } from "./editor";
import { show } from "./nav";

let qPages: string[][] | null = null;
let kPages: string[][] | null = null;
/** Set when the question PDF holds its questions as pictures; used instead of the text box. */
let imagePaper: ImageQuestion[] | null = null;

function updateClean() {
  $("clean").disabled = !imagePaper && !$("qtxt").value.trim();
}

function setup(
  inputId: string,
  dropId: string,
  nameId: string,
  statusId: string,
  areaId: string,
  kind: "q" | "k",
) {
  function handle(f?: File) {
    if (!f) return;
    $(nameId).textContent = f.name;
    $(statusId).className = "status mu";
    $(statusId).textContent = "Reading " + f.name + "…";
    readPdf(f)
      .then((r) => {
        if (kind === "q") {
          qPages = r.pages;
          imagePaper = r.images || null;
        } else kPages = r.pages;
        $(areaId).value = buildText(r.pages, $("noHF").checked);
        if (kind === "q" && r.images) {
          const n = r.images.length;
          $(statusId).className = "status good";
          $(statusId).textContent =
            "Read " +
            r.pages.length +
            " pages. The questions in this PDF are pictures: found " +
            n +
            " questions. The text below is only labels; press Clean paper to use the pictures.";
        } else if (r.scan) {
          $(statusId).className = "status warn";
          $(statusId).textContent =
            "Almost no selectable text here, so this looks like a scan. Paste the text instead, or use a text PDF.";
        } else {
          $(statusId).className = "status good";
          $(statusId).textContent =
            "Read " + r.pages.length + " page" + (r.pages.length > 1 ? "s" : "") + ".";
        }
        updateClean();
      })
      .catch((e) => {
        $(statusId).className = "status bad";
        $(statusId).textContent =
          "Could not open that PDF (" + ((e && e.message) || "unknown error") + ").";
      });
  }
  $(inputId).addEventListener("change", (e: Event) =>
    handle((e.target as HTMLInputElement).files?.[0]),
  );
  const d = $(dropId);
  d.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    d.classList.add("over");
  });
  d.addEventListener("dragleave", () => d.classList.remove("over"));
  d.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    d.classList.remove("over");
    handle(e.dataTransfer?.files[0]);
  });
}

export function initStep1() {
  setup("qf", "dq", "qn", "qs", "qtxt", "q");
  setup("kf", "dk", "kn", "ks", "ktxt", "k");
  $("qtxt").addEventListener("input", () => {
    imagePaper = null; // the person is typing their own text
    updateClean();
  });
  $("noHF").addEventListener("change", () => {
    if (qPages) $("qtxt").value = buildText(qPages, $("noHF").checked);
    if (kPages) $("ktxt").value = buildText(kPages, $("noHF").checked);
  });
  $("clean").onclick = () => {
    const noHindi = $("noHindi").checked;
    let qs: Question[] = imagePaper
      ? imagePaper.map((p) => ({
          id: nextId(),
          n: p.n,
          q: "",
          o: Array.from({ length: p.opts }, (_, i) => "Option " + (i + 1)),
          a: -1,
          pics: noHindi ? p.pics.slice(0, 1) : p.pics,
        }))
      : cleanPaper($("qtxt").value, noHindi);
    state.dropped = 0;
    if (!imagePaper && $("onlyOpt").checked) {
      const all = qs.length;
      qs = qs.filter((q) => q.o.filter((o) => o.trim()).length >= 2);
      state.dropped = all - qs.length;
    }
    if (!qs.length) {
      $("qs").className = "status bad";
      $("qs").textContent =
        "No numbered questions found. Questions should start like “1.” or “Q1.” on their own line. Check the text above and try again.";
      return;
    }
    state.QS = qs;
    const keyTxt = $("ktxt").value.trim();
    if (keyTxt) applyKey(state.QS, parseKey(prepLines(keyTxt, false).join("\n")));
    $("ktxt2").value = keyTxt;
    renderEditor();
    setView(false);
    persist();
    show("s2");
  };
  updateClean();
}
