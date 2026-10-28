const { MongoClient } = require("mongodb");

function databaseGate() {
  const uri = process.env.MONGODB_TEST_URI;
  const name = process.env.MONGODB_TEST_DB;
  if (!uri || !name)
    return {
      enabled: false,
      reason:
        "Isolated MONGODB_TEST_URI and MONGODB_TEST_DB were not supplied; the live database is never used by these tests.",
    };
  if (!/^cinebook_audit_[A-Za-z0-9_]+$/.test(name))
    return {
      enabled: false,
      reason: "MONGODB_TEST_DB must use the isolated cinebook_audit_ prefix.",
    };
  try {
    new MongoClient(uri);
  } catch {
    return {
      enabled: false,
      reason:
        "The isolated MONGODB_TEST_URI is malformed (MongoParseError); credentials are not printed.",
    };
  }
  return { enabled: true, uri, name };
}

module.exports = { databaseGate };
