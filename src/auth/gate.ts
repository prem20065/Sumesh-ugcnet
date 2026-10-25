/* Sign-in gate with one active session per account.

   - Only emails in the owner's allowlist can use the app.
   - Signing in on a device takes over the session; any other device that was using the account is
     told it has been signed out and must press "Use here" to take it back.
   Everything backend-specific sits behind `Backend`, so this logic is unit tested with a fake. */

export interface AuthUser {
  uid: string;
  email: string;
}

export interface Backend {
  /** Calls back with the signed-in user (also restored after a reload) or null. */
  onUser(cb: (u: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAllowed(email: string): Promise<boolean>;
  getSession(uid: string): Promise<string | null>;
  setSession(uid: string, email: string, sid: string): Promise<void>;
  /** Calls back with the current session id whenever it changes. */
  watchSession(
    uid: string,
    cb: (sid: string | null) => void,
    onError: (e: unknown) => void,
  ): () => void;
}

export interface KeyValue {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
}

export type GateState =
  | { kind: "loading" }
  | { kind: "signedOut"; message?: string }
  | { kind: "denied"; email: string }
  | { kind: "takeover"; email: string }
  | { kind: "kicked"; email: string }
  | { kind: "active"; email: string }
  | { kind: "error"; message: string };

const newSid = () =>
  globalThis.crypto?.randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

const SID_KEY = (uid: string) => "pc.sid." + uid;

export class Gate {
  state: GateState = { kind: "loading" };
  private user: AuthUser | null = null;
  private fresh = false;
  private unwatch: (() => void) | null = null;
  private unUser: (() => void) | null = null;
  private run = 0;

  constructor(
    private backend: Backend,
    private store: KeyValue,
    private onState: (s: GateState) => void,
  ) {}

  start() {
    this.unUser = this.backend.onUser((u) => void this.handleUser(u));
  }

  stop() {
    this.unUser?.();
    this.unwatch?.();
  }

  private set(s: GateState) {
    this.state = s;
    this.onState(s);
  }

  /** The person pressed "Sign in": this device should take over the session. */
  async signIn() {
    this.fresh = true;
    this.set({ kind: "loading" });
    try {
      await this.backend.signIn();
    } catch (e: any) {
      this.fresh = false;
      const closed =
        e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request";
      this.set({
        kind: "signedOut",
        message: closed
          ? undefined
          : "Could not sign in" + (e?.code ? " (" + e.code + ")" : "") + ". Try again.",
      });
    }
  }

  /** Take the session back from another device. */
  async useHere() {
    if (!this.user) return;
    this.set({ kind: "loading" });
    try {
      await this.claim(this.user);
    } catch (e) {
      this.fail(e);
    }
  }

  async signOut() {
    this.unwatch?.();
    this.unwatch = null;
    if (this.user) this.store.remove(SID_KEY(this.user.uid));
    this.user = null;
    this.fresh = false;
    await this.backend.signOut();
    this.set({ kind: "signedOut" });
  }

  private async handleUser(u: AuthUser | null) {
    const my = ++this.run;
    this.unwatch?.();
    this.unwatch = null;
    this.user = u;
    if (!u) {
      this.fresh = false;
      this.set({ kind: "signedOut" });
      return;
    }
    this.set({ kind: "loading" });
    try {
      if (!(await this.backend.isAllowed(u.email))) {
        if (my === this.run) this.set({ kind: "denied", email: u.email });
        return;
      }
      const remote = await this.backend.getSession(u.uid);
      if (my !== this.run) return;
      const local = this.store.get(SID_KEY(u.uid));
      if (this.fresh || !remote) await this.claim(u);
      else if (local && local === remote) this.watch(u, local);
      else this.set({ kind: "takeover", email: u.email });
    } catch (e) {
      if (my === this.run) this.fail(e);
    } finally {
      this.fresh = false;
    }
  }

  private async claim(u: AuthUser) {
    const sid = newSid();
    await this.backend.setSession(u.uid, u.email, sid);
    this.store.set(SID_KEY(u.uid), sid);
    this.watch(u, sid);
  }

  private watch(u: AuthUser, sid: string) {
    this.unwatch?.();
    this.unwatch = this.backend.watchSession(
      u.uid,
      (remote) => {
        if (remote === sid) {
          if (this.state.kind !== "active") this.set({ kind: "active", email: u.email });
        } else this.set({ kind: "kicked", email: u.email });
      },
      (e) => this.fail(e),
    );
    this.set({ kind: "active", email: u.email });
  }

  private fail(e: any) {
    if (e?.code === "permission-denied" && this.user)
      this.set({ kind: "denied", email: this.user.email });
    else
      this.set({
        kind: "error",
        message: "Something went wrong" + (e?.code ? " (" + e.code + ")" : "") + ".",
      });
  }
}
