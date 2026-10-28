/** Deliberate single-account administrator setup. Dry-run unless --apply is supplied. */
const { loadEnvFile } = require("node:process");
const { MongoClient } = require("mongodb");
try {
  loadEnvFile(".env");
} catch {
  /* Hosts may supply environment variables directly. */
}
async function run() {
  const designated = process.env.CINEBOOK_ADMIN_EMAIL?.trim().toLowerCase();
  if (!designated || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(designated))
    throw new Error("Set CINEBOOK_ADMIN_EMAIL to the designated administrator email.");
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI on the server.");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const users = client.db(process.env.MONGODB_DB || "cinebook").collection("users");
    const account = await users.findOne({ email: designated });
    if (!account)
      throw new Error(
        "The designated administrator must register through /login first. No account was created.",
      );
    if (!process.argv.includes("--apply")) {
      console.log(
        "Designated account exists. Dry-run only: no roles changed. Review CINEBOOK_ADMIN_EMAIL, then rerun with --apply.",
      );
      return;
    }
    const result = await users.updateOne(
      { userId: account.userId, email: designated },
      { $set: { role: "admin", updatedAt: new Date().toISOString() } },
    );
    console.log(
      `Administrator setup completed for ${result.matchedCount} designated account. Sign in through the normal login form.`,
    );
  } finally {
    await client.close();
  }
}
run().catch((error) => {
  if (error.name === "MongoParseError") {
    console.error(
      "MONGODB_URI is malformed. Check .env and URL-encode special characters in the database username/password (for example, @ becomes %40).",
    );
    process.exitCode = 1;
    return;
  }
  if (
    error.code === 18 ||
    (error.code === 8000 && /bad auth|authentication failed/i.test(error.message ?? ""))
  ) {
    console.error(
      "Atlas rejected the database credentials. Check the database user in Atlas Security > Database Access, then update MONGODB_URI in .env. Use the database user's password, not your Atlas website password. No administrator role was changed.",
    );
    process.exitCode = 1;
    return;
  }
  console.error(
    error.name === "Error"
      ? error.message
      : `Administrator setup failed (${error.name}). Check server database configuration.`,
  );
  process.exitCode = 1;
});
