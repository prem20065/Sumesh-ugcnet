import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { USE_EMULATOR, firebaseConfig } from "./config";
import type { Backend } from "./gate";

/** Firebase implementation of the gate's backend.
    Data model (see firestore.rules):
      allowed/{email}   – one document per paying buyer, created by the owner in the console
      sessions/{uid}    – { sid, email, startedAt }, the one device currently allowed to use the app */
export function firebaseBackend(): Backend {
  const app = initializeApp(
    USE_EMULATOR
      ? { apiKey: "demo", projectId: "demo-paper-cleaner", appId: "demo" }
      : firebaseConfig,
  );
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const lower = (e: string) => e.trim().toLowerCase();

  return {
    onUser: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(u && u.email ? { uid: u.uid, email: lower(u.email) } : null),
      ),
    signIn: async () => {
      if (USE_EMULATOR) {
        // Test builds only (compiled out of production): sign in as ?as=<email> with a fake Google
        // credential, which the Auth emulator accepts. The real popup needs apis.google.com.
        const email = new URLSearchParams(location.search).get("as") || "test@example.com";
        const idToken = JSON.stringify({ sub: email, email, email_verified: true });
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    isAllowed: async (email) => (await getDoc(doc(db, "allowed", lower(email)))).exists(),
    getSession: async (uid) => {
      const s = await getDoc(doc(db, "sessions", uid));
      return s.exists() ? (s.data().sid as string) : null;
    },
    setSession: (uid, email, sid) =>
      setDoc(doc(db, "sessions", uid), { sid, email, startedAt: serverTimestamp() }),
    watchSession: (uid, cb, onError) =>
      onSnapshot(
        doc(db, "sessions", uid),
        (s) => cb(s.exists() ? (s.data().sid as string) : null),
        onError,
      ),
  };
}
