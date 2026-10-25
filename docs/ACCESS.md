# Access control: who can use the app, and one device at a time

The app is gated by Google sign-in. Only emails you add can get in, and each account can be
open on **one device at a time**: signing in on a second device signs the first one out.

How it works (Firebase, free Spark plan):

- `allowed/{email}` – one document per buyer, created by you in the Firebase console.
- `sessions/{uid}` – written by the app on sign-in; other devices watch it and sign themselves out
  when it changes. Rules are in `firestore.rules`.

## One-time setup (about 15 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** (any name, Analytics off).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, pick your email as
   the support email, Save.
3. **Authentication → Settings → Authorized domains → Add domain**: `prem20065.github.io`.
4. **Build → Firestore Database → Create database** → production mode → location `asia-south1` (Mumbai).
5. Firestore → **Rules** tab → replace everything with the contents of `firestore.rules` → **Publish**.
6. **Project settings (gear icon) → Your apps → Web (`</>`)** → register an app → copy the
   `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `appId`) into `src/auth/config.ts`,
   commit and push to `main`.

## Selling to someone

1. Take the ₹30 (UPI).
2. Firestore → **Data → Start collection** `allowed` (first time) → **Document ID** = their Gmail
   address, exactly as they sign in, in lower case → add one field `name` (string) → Save.
3. Send them the site link. They press "Sign in with Google" and they are in.

To cancel someone, delete their document in `allowed`. Their next request is refused.

## Limits

- The app's code is public and runs in the browser, so a determined developer could copy it. The
  sign-in stops everyone else, and the one-device rule makes sharing a login inconvenient.
- One account can still be shared by people who agree to take turns; nothing can prove who is typing.

## Local testing

`VITE_AUTH_DISABLED=1 npm run dev` skips the gate. `VITE_USE_EMULATOR=1` points the app at the
Firebase emulators (`firebase emulators:start --only auth,firestore`) and signs in as `?as=<email>`.
