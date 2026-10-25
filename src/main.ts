import "./styles/tokens.css";
import "./styles/app.css";
import { $ } from "./dom";
import { state, nextId } from "./state";
import { hooks, show } from "./ui/nav";
import { fitAll, initEditor, loadSaved, renderEditor } from "./ui/editor";
import { initStep1 } from "./ui/step1";
import { initExam, startMock } from "./ui/exam";
import { startGate } from "./auth/ui";

startGate();

hooks.onEditorShown = fitAll;

$("t1").onclick = () => show("s1");
$("t2").onclick = () => show("s2");
$("t3").onclick = () => startMock();

initStep1();
initEditor();
initExam();

const saved = loadSaved();
if (saved) {
  $("resume").hidden = false;
  $("resume").textContent = "Resume last paper (" + saved.length + " questions)";
  $("resume").onclick = () => {
    state.QS = saved;
    state.QS.forEach((q) => {
      q.id = nextId();
    });
    renderEditor();
    show("s2");
  };
}
