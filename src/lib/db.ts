/**
 * CineBook database entry point.
 *
 * MongoDB Atlas via the official MongoDB Node.js driver. Server-side only —
 * the connection string lives in MONGODB_URI and never reaches the browser.
 * Import this from server functions / *.server.ts modules only.
 */
export {
  DbError,
  collection,
  getDb,
  isDbConfigured,
  toClientError,
  type DbErrorCode,
} from "./db/mongo.server";
