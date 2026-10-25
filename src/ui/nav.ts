import { $ } from "../dom";
import { state } from "../state";

const VIEWS = ["s1", "s2", "exam", "res"];

/** Hooks other modules register so nav does not depend on them. */
export const hooks: { onEditorShown?: () => void } = {};

export function show(v: string) {
  VIEWS.forEach((id) => {
    $(id).hidden = id !== v;
  });
  $("exambar").hidden = v !== "exam";
  $("bar").hidden = v === "exam";
  $("t1").setAttribute("aria-current", v === "s1" ? "step" : "false");
  $("t2").setAttribute("aria-current", v === "s2" ? "step" : "false");
  $("t3").setAttribute("aria-current", v === "exam" || v === "res" ? "step" : "false");
  $("t2").disabled = !state.QS.length;
  $("t3").disabled = !state.QS.length;
  window.scrollTo(0, 0);
  if (v === "s2") requestAnimationFrame(() => hooks.onEditorShown?.());
}
