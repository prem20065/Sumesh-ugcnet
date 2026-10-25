import { describe, expect, it } from "vitest";
import { Gate, type AuthUser, type Backend, type GateState, type KeyValue } from "../src/auth/gate";

/** A pretend server shared by every device. */
class Server {
  allowed = new Set<string>();
  sessions = new Map<string, string>();
  watchers = new Map<string, Set<(sid: string | null) => void>>();
  setSession(uid: string, sid: string) {
    this.sessions.set(uid, sid);
    this.watchers.get(uid)?.forEach((cb) => cb(sid));
  }
}

class Device {
  user: AuthUser | null = null;
  cb: ((u: AuthUser | null) => void) | null = null;
  store = new Map<string, string>();
  states: GateState[] = [];
  denyWatch = false;
  constructor(
    public server: Server,
    private account: AuthUser,
    signedIn = false,
  ) {
    if (signedIn) this.user = account;
  }
  kv: KeyValue = {
    get: (k) => this.store.get(k) ?? null,
    set: (k, v) => void this.store.set(k, v),
    remove: (k) => void this.store.delete(k),
  };
  backend: Backend = {
    onUser: (cb) => {
      this.cb = cb;
      queueMicrotask(() => cb(this.user));
      return () => (this.cb = null);
    },
    signIn: async () => {
      this.user = this.account;
      this.cb?.(this.user);
    },
    signOut: async () => {
      this.user = null;
    },
    isAllowed: async (email) => this.server.allowed.has(email),
    getSession: async (uid) => this.server.sessions.get(uid) ?? null,
    setSession: async (uid, _email, sid) => this.server.setSession(uid, sid),
    watchSession: (uid, cb, onError) => {
      if (this.denyWatch) {
        queueMicrotask(() => onError({ code: "permission-denied" }));
        return () => {};
      }
      const set = this.server.watchers.get(uid) ?? new Set();
      this.server.watchers.set(uid, set);
      set.add(cb);
      queueMicrotask(() => cb(this.server.sessions.get(uid) ?? null));
      return () => set.delete(cb);
    },
  };
  gate = new Gate(this.backend, this.kv, (s) => this.states.push(s));
  get state() {
    return this.gate.state.kind;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const me: AuthUser = { uid: "u1", email: "a@x.com" };

function setup() {
  const server = new Server();
  server.allowed.add("a@x.com");
  return server;
}

describe("Gate", () => {
  it("starts signed out", async () => {
    const d = new Device(setup(), me);
    d.gate.start();
    await tick();
    expect(d.state).toBe("signedOut");
  });

  it("refuses an email that is not on the list", async () => {
    const server = setup();
    server.allowed.clear();
    const d = new Device(server, me);
    d.gate.start();
    await tick();
    await d.gate.signIn();
    await tick();
    expect(d.state).toBe("denied");
    expect(server.sessions.size).toBe(0);
  });

  it("lets an allowed email in and claims the session", async () => {
    const server = setup();
    const d = new Device(server, me);
    d.gate.start();
    await tick();
    await d.gate.signIn();
    await tick();
    expect(d.state).toBe("active");
    expect(server.sessions.get("u1")).toBe(d.store.get("pc.sid.u1"));
  });

  it("signs the first device out when a second one signs in", async () => {
    const server = setup();
    const a = new Device(server, me);
    const b = new Device(server, me);
    for (const d of [a, b]) d.gate.start();
    await tick();
    await a.gate.signIn();
    await tick();
    await b.gate.signIn();
    await tick();
    expect(b.state).toBe("active");
    expect(a.state).toBe("kicked");
  });

  it("lets the first device take it back, which signs out the second", async () => {
    const server = setup();
    const a = new Device(server, me);
    const b = new Device(server, me);
    for (const d of [a, b]) d.gate.start();
    await tick();
    await a.gate.signIn();
    await tick();
    await b.gate.signIn();
    await tick();
    await a.gate.useHere();
    await tick();
    expect(a.state).toBe("active");
    expect(b.state).toBe("kicked");
  });

  it("keeps the same device signed in after a reload", async () => {
    const server = setup();
    const a1 = new Device(server, me);
    a1.gate.start();
    await tick();
    await a1.gate.signIn();
    await tick();
    a1.gate.stop();
    // reload: new page, same browser storage, auth restored
    const a2 = new Device(server, me, true);
    a2.store = a1.store;
    a2.gate.start();
    await tick();
    expect(a2.state).toBe("active");
  });

  it("asks before taking over when a restored login belongs to a stale device", async () => {
    const server = setup();
    const a = new Device(server, me);
    a.gate.start();
    await tick();
    await a.gate.signIn();
    await tick();
    const phone = new Device(server, me, true); // still logged in from last week, never took over
    phone.store.set("pc.sid.u1", "old-session");
    phone.gate.start();
    await tick();
    expect(phone.state).toBe("takeover");
    expect(a.state).toBe("active"); // the active device is not disturbed
  });

  it("clears the stored session on sign out", async () => {
    const server = setup();
    const a = new Device(server, me);
    a.gate.start();
    await tick();
    await a.gate.signIn();
    await tick();
    await a.gate.signOut();
    expect(a.state).toBe("signedOut");
    expect(a.store.has("pc.sid.u1")).toBe(false);
  });

  it("shows no access when the owner removes the buyer mid-session", async () => {
    const server = setup();
    const a = new Device(server, me);
    a.denyWatch = true;
    a.gate.start();
    await tick();
    await a.gate.signIn();
    await tick();
    expect(a.state).toBe("denied");
  });
});
