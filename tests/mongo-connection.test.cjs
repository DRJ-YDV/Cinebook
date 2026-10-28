const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/source-loader.cjs');

test('connection failures log safe identifiers, hide secrets, and permit retry', async () => {
  const logs = [];
  let attempts = 0;
  const secret = 'mongodb://private-user:private-password@private-host';
  class MongoClient {
    async connect() {
      attempts++;
      if (attempts === 1) {
        const error = new Error(secret);
        error.name = 'MongoServerError';
        error.code = 8000;
        throw error;
      }
    }
    db() { return { connected: true }; }
  }
  const loader = sourceLoader({ mongodb: { MongoClient } }, {
    env: { MONGODB_URI: secret },
    console: { error: (...args) => logs.push(args) },
  });
  const db = loader.load('src/lib/db/mongo.server.ts');
  await assert.rejects(db.getDb(), error => error.code === 'DB_UNAVAILABLE' && !error.message.includes(secret));
  assert.equal(logs[0][1].code, 8000);
  assert.equal(logs[0][1].name, 'MongoServerError');
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal((await db.getDb()).connected, true);
  await db.getDb();
  assert.equal(attempts, 2);
});
