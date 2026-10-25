import { $, el } from "../dom";
import { Gate, type GateState, type KeyValue } from "./gate";
import { firebaseBackend } from "./backend";
import { AUTH_DISABLED, authConfigured, USE_EMULATOR } from "./config";

/** localStorage that never throws (it can be blocked in private windows). */
const browserStore: KeyValue = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* the session still works until the page is reloaded */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nothing to clear */
    }
  },
};

/** Show the sign-in screen until the person is signed in, allowed, and holds the active session. */
export function startGate() {
  if (AUTH_DISABLED) return;
  document.body.classList.add("locked");
  $("gate").hidden = false;

  if (!authConfigured() && !USE_EMULATOR) {
    render(
      {
        kind: "error",
        message: "Sign-in is not set up yet. Ask the owner to finish the Firebase setup.",
      },
      null,
    );
    return;
  }

  const gate: Gate = new Gate(firebaseBackend(), browserStore, (s) => render(s, gate));
  $("signout").onclick = () => void gate.signOut();
  gate.start();
}

function render(s: GateState, gate: Gate | null) {
  const active = s.kind === "active";
  document.body.classList.toggle("locked", !active);
  $("gate").hidden = active;
  $("who").hidden = !active;
  if (s.kind === "active") $("whoMail").textContent = s.email;
  if (active) return;

  const box = $("gatebox");
  box.textContent = "";
  const btn = (text: string, fn: () => void, primary = true) =>
    el("button", { class: "btn" + (primary ? " p" : ""), text, onclick: fn });
  const title = (t: string) => box.append(el("h1", { text: t }));
  const para = (t: string, cls = "mu") => box.append(el("p", { class: cls, text: t }));

  switch (s.kind) {
    case "loading":
      para("Checking your access…");
      break;
    case "signedOut":
      title("Paper Cleaner");
      para("Sign in with the Google account you gave the seller.");
      if (s.message) para(s.message, "bad");
      box.append(btn("Sign in with Google", () => void gate?.signIn()));
      break;
    case "denied":
      title("This account has no access");
      para(
        s.email +
          " is not on the list. Sign in with the email you gave the seller, or ask the seller to add it.",
      );
      box.append(btn("Use another account", () => void gate?.signOut()));
      break;
    case "takeover":
      title("Already in use");
      para("This account may be open on another device. Only one device can use it at a time.");
      box.append(
        el(
          "div",
          { class: "row" },
          btn("Use here", () => void gate?.useHere()),
          btn("Sign out", () => void gate?.signOut(), false),
        ),
      );
      break;
    case "kicked":
      title("Signed out here");
      para(
        "Your account was opened on another device, so this one was signed out. Your work on this page is kept if you take it back.",
      );
      box.append(
        el(
          "div",
          { class: "row" },
          btn("Use here", () => void gate?.useHere()),
          btn("Sign out", () => void gate?.signOut(), false),
        ),
      );
      break;
    case "error":
      title("Cannot open the app");
      para(s.message, "bad");
      if (gate) box.append(btn("Try again", () => location.reload()));
      break;
  }
}
