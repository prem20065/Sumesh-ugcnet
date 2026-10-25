/* Firebase web config. These values identify your Firebase project and are meant to be public
   (they are not secrets). Fill them in from Firebase console → Project settings → Your apps. */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

export const authConfigured = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId);

/** Build-time switches, used for local development and tests only. */
export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "1";
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === "1";
