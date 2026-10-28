const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { sourceLoader } = require("./helpers/source-loader.cjs");
const { memoryDatabase } = require("./helpers/memory-database.cjs");

function authFixture(options = {}) {
  const user = {
    userId: "user-a",
    name: "User A",
    email: "a@example.test",
    phone: "",
    role: "user",
  };
  const database = memoryDatabase({ sessions: [], users: [user] });
  const headers = {};
  const cookie = {
    data: {},
    config: null,
    async clear() {
      cookie.data = {};
    },
    async update(data) {
      cookie.data = { ...cookie.data, ...data };
    },
  };
  const loader = sourceLoader(
    {
      "src/lib/db/mongo.server.ts": database.module,
      "src/lib/db/repositories.server.ts": {
        getUser: async ({ userId }) =>
          structuredClone(database.data.users.find((row) => row.userId === userId) ?? null),
      },
      "@tanstack/react-start/server": {
        useSession: async (config) => {
          cookie.config = config;
          return cookie;
        },
        getRequestIP: () => "127.0.0.1",
        setResponseHeader: (name, value) => {
          headers[name] = value;
        },
      },
    },
    options,
  );
  return { auth: loader.load("src/lib/auth.server.ts"), database, cookie, headers, user };
}

test("mocked session store: anonymous, malformed and legacy browser identity cannot authenticate", async () => {
  const { auth, cookie, database } = authFixture();
  for (const data of [
    {},
    { userId: "user-a", role: "admin" },
    { sessionToken: "forged" },
    { sessionToken: "a".repeat(64) },
  ]) {
    cookie.data = data;
    assert.equal(await auth.currentUser(), null);
    await assert.rejects(auth.requireUser(), (error) => error.code === "AUTH_REQUIRED");
  }
  assert.equal(database.data.sessions.length, 0);
});

test("mocked session store: login rotates token, stores only its digest, and logout revokes replay", async () => {
  const { auth, cookie, database, user, headers } = authFixture();
  await auth.beginSession(user);
  const first = cookie.data.sessionToken;
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(database.data.sessions[0]._id, createHash("sha256").update(first).digest("hex"));
  assert.equal(JSON.stringify(database.data.sessions).includes(first), false);
  assert.equal((await auth.currentUser()).userId, user.userId);
  await auth.beginSession(user);
  assert.notEqual(cookie.data.sessionToken, first);
  assert.equal(database.data.sessions.length, 1);
  const second = cookie.data.sessionToken;
  cookie.data = { sessionToken: first };
  assert.equal(await auth.currentUser(), null);
  cookie.data = { sessionToken: second };
  await auth.endSession();
  assert.equal(database.data.sessions.length, 0);
  cookie.data = { sessionToken: second };
  assert.equal(await auth.currentUser(), null);
  assert.equal(headers["cache-control"], "private, no-store");
});

test("mocked session store: expired session and deleted account deny access", async () => {
  const { auth, database, user } = authFixture();
  await auth.beginSession(user);
  database.data.sessions[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(await auth.currentUser(), null);
  database.data.sessions[0].expiresAt = new Date(Date.now() + 100000).toISOString();
  database.data.users = [];
  assert.equal(await auth.currentUser(), null);
});

test("mocked session store: administrator role is re-read from database and designated email cannot grant a role", async () => {
  const { auth, database, user } = authFixture({ env: { CINEBOOK_ADMIN_EMAIL: "a@example.test" } });
  await auth.beginSession({ ...user, role: "admin" });
  await assert.rejects(auth.requireAdmin(), (error) => error.code === "FORBIDDEN");
  database.data.users[0].role = "admin";
  assert.equal((await auth.requireAdmin()).role, "admin");
  database.data.users[0].email = "someone-else@example.test";
  await assert.rejects(auth.requireAdmin(), (error) => error.code === "FORBIDDEN");
});

test("mocked session cookie: production session flags secure HttpOnly same-site cookies", async () => {
  const { auth, cookie, user } = authFixture({ env: { NODE_ENV: "production" } });
  await auth.beginSession(user);
  assert.equal(cookie.config.cookie.httpOnly, true);
  assert.equal(cookie.config.cookie.secure, true);
  assert.equal(cookie.config.cookie.sameSite, "lax");
  assert.equal(cookie.config.cookie.path, "/");
});

test("mocked session request: repeated sign-in attempts are rate limited by account", () => {
  const { auth } = authFixture();
  for (let i = 0; i < 15; i++) auth.limitAuthentication("a@example.test");
  assert.throws(
    () => auth.limitAuthentication("A@EXAMPLE.TEST"),
    (error) => error.code === "RATE_LIMITED",
  );
  assert.doesNotThrow(() => auth.limitAuthentication("different@example.test"));
});
