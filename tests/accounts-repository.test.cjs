const test = require("node:test");
const assert = require("node:assert/strict");
const { repositoryFixture } = require("./helpers/fixtures.cjs");

test("isolated repository: signup normalizes email, hashes the password and never accepts a supplied admin role", async () => {
  const { repository, database } = repositoryFixture();
  const user = await repository.createUser({
    name: "New Member",
    email: " New@Example.Test ",
    password: "test-password-123",
    role: "admin",
  });
  assert.equal(user.email, "new@example.test");
  assert.equal(user.role, "user");
  assert.equal(user.password, undefined);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.passwordSalt, undefined);
  const saved = database.data.users.find((row) => row.userId === user.userId);
  assert.ok(saved.passwordHash);
  assert.notEqual(saved.passwordHash, "test-password-123");
  assert.equal(saved.password, undefined);
  const login = await repository.verifyUser("NEW@EXAMPLE.TEST", "test-password-123");
  assert.equal(login.userId, user.userId);
  assert.equal(await repository.verifyUser("new@example.test", "wrong-password"), null);
});

test("isolated repository: case-insensitive duplicate signup is rejected", async () => {
  const { repository, database } = repositoryFixture();
  const size = database.data.users.length;
  await assert.rejects(
    repository.createUser({
      name: "Duplicate",
      email: " A@EXAMPLE.TEST ",
      password: "test-password-123",
    }),
    (error) => error.code === "VALIDATION",
  );
  assert.equal(database.data.users.length, size);
});

test("isolated repository: editing profile cannot overwrite role, email or password through extra fields", async () => {
  const { repository, database } = repositoryFixture();
  await repository.updateUser("user-a", {
    name: "Updated Name",
    role: "admin",
    email: "b@example.test",
    passwordHash: "attacker",
  });
  const user = database.data.users.find((row) => row.userId === "user-a");
  assert.equal(user.name, "Updated Name");
  assert.equal(user.role, "user");
  assert.equal(user.email, "a@example.test");
  assert.equal(user.passwordHash, undefined);
});
