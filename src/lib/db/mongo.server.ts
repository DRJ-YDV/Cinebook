/**
 * MongoDB Atlas access for CineBook — official MongoDB Node.js driver.
 *
 * Server-only. Never import this from a component or from the top level of a
 * *.functions.ts module. The connection string (MONGODB_URI) is read inside
 * the connect call so it never reaches the browser bundle.
 *
 * The driver needs a Node.js-compatible server runtime (raw TCP). Vite dev and
 * any Node host (Render / Railway / Fly / VPS / Vercel Node) work. On an edge
 * runtime the import fails and every call surfaces DB_UNAVAILABLE, which the
 * app already degrades from gracefully.
 */

import type { Db, MongoClient, ClientSession } from "mongodb";
import { AsyncLocalStorage } from "node:async_hooks";
import { ZodError } from "zod";

export type DbErrorCode =
  | "DB_NOT_CONFIGURED"
  | "DB_UNAVAILABLE"
  | "INVALID_SHOW"
  | "INVALID_THEATRE"
  | "INVALID_BOOKING"
  | "SEATS_UNAVAILABLE"
  | "DUPLICATE_BOOKING"
  | "BOOKING_CANCELLED"
  | "UNAUTHORIZED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "INDEX_CONFLICT"
  | "PAYMENT_ERROR"
  | "VALIDATION";

export class DbError extends Error {
  code: DbErrorCode;
  constructor(code: DbErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DbError";
  }
}

function uri(): string | undefined {
  const value = process.env["MONGODB_URI"];
  return value && value.trim() ? value.trim() : undefined;
}

function dbName(): string {
  return process.env["MONGODB_DB"]?.trim() || "cinebook";
}

export function isDbConfigured(): boolean {
  return uri() !== undefined;
}

/**
 * One pooled MongoClient per server process, cached on globalThis so dev-time
 * HMR and serverless warm starts reuse the same connection pool.
 */
type Cache = { client: MongoClient | null; promise: Promise<MongoClient> | null };
const globalCache = globalThis as typeof globalThis & { __cinebookMongo?: Cache };
const cache: Cache = (globalCache.__cinebookMongo ??= { client: null, promise: null });
const transactions = new AsyncLocalStorage<ClientSession>();
const sessionOptions = () => {
  const session = transactions.getStore();
  return session ? { session } : {};
};

/** All repository calls inside work share one MongoDB transaction/session. */
export async function withTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactions.getStore()) return work();
  const client = await getClient();
  const session = client.startSession();
  try {
    const result = await session.withTransaction(() => transactions.run(session, work));
    return result as T;
  } finally {
    await session.endSession();
  }
}

async function loadDriver() {
  // Keep the import discoverable so serverless builds include the driver.
  // This module is server-only and requires a Node runtime.
  return import("mongodb");
}

async function getClient(): Promise<MongoClient> {
  const connectionString = uri();
  if (!connectionString) {
    throw new DbError(
      "DB_NOT_CONFIGURED",
      "MongoDB is not configured yet. Set MONGODB_URI to your MongoDB Atlas connection string.",
    );
  }
  if (cache.client) return cache.client;
  if (!cache.promise) {
    cache.promise = (async () => {
      const { MongoClient: Ctor } = await loadDriver();
      const client = new Ctor(connectionString, {
        maxPoolSize: 10,
        minPoolSize: 0,
        retryWrites: true,
        serverSelectionTimeoutMS: 8000,
        // Some hosts (including this sandbox) prefer IPv6 egress, which Atlas
        // Network Access allowlists typically don't cover. Force IPv4.
        family: 4,
      } as never);
      await client.connect();
      cache.client = client;
      return client;
    })().catch((cause) => {
      cache.promise = null;
      // Log only allowlisted identifiers: driver messages can contain credentials
      // or connection strings. Keep the browser-facing error generic.
      const name = cause instanceof Error ? cause.name : "UnknownError";
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      console.error("[cinebook:db:connect]", {
        name: [
          "MongoServerError",
          "MongoServerSelectionError",
          "MongoParseError",
          "MongoAPIError",
          "MongoNetworkError",
          "MongoInvalidArgumentError",
        ].includes(name)
          ? name
          : "ConnectionError",
        code: [
          18,
          8000,
          "ERR_MODULE_NOT_FOUND",
          "MODULE_NOT_FOUND",
          "ENOTFOUND",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "EAI_AGAIN",
        ].includes(code as never)
          ? code
          : "UNCLASSIFIED",
      });
      throw new DbError(
        "DB_UNAVAILABLE",
        "Could not connect to MongoDB. Check the server connection settings and network access.",
      );
    });
  }
  return cache.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbName());
}

function wrap(cause: unknown): never {
  if (cause instanceof DbError) throw cause;
  if (
    transactions.getStore() &&
    cause &&
    typeof cause === "object" &&
    "hasErrorLabel" in cause &&
    typeof cause.hasErrorLabel === "function" &&
    cause.hasErrorLabel("TransientTransactionError")
  )
    throw cause;
  if (cause && typeof cause === "object" && "code" in cause && cause.code === 11000)
    throw new DbError("VALIDATION", "A record with these details already exists.");
  console.error("[cinebook:db]", cause instanceof Error ? cause.name : "DatabaseError");
  throw new DbError(
    "DB_UNAVAILABLE",
    "The database request could not be completed. Please try again.",
  );
}

/** Converts driver values (ObjectId, Date) into plain JSON-safe values. */
function plain<T>(doc: unknown): T {
  if (doc === null || doc === undefined) return doc as T;
  return JSON.parse(
    JSON.stringify(doc, (_k, v: unknown) =>
      v &&
      typeof v === "object" &&
      typeof (v as { toHexString?: () => string }).toHexString === "function"
        ? (v as { toHexString: () => string }).toHexString()
        : v,
    ),
  ) as T;
}

/** Thin, typed collection helper mirroring the driver methods we actually use. */
export function collection<TDoc extends object>(name: string) {
  const col = async () => (await getDb()).collection(name);
  return {
    async countDocuments(filter: object = {}): Promise<number> {
      try {
        const c = await col();
        return await c.countDocuments(filter as never, sessionOptions());
      } catch (error) {
        return wrap(error);
      }
    },
    async find(
      filter: object = {},
      opts: { sort?: object; limit?: number; skip?: number; projection?: object } = {},
    ): Promise<TDoc[]> {
      try {
        const c = await col();
        let cursor = c.find(filter as never, {
          ...sessionOptions(),
          ...(opts.projection ? { projection: opts.projection } : {}),
        });
        if (opts.sort) cursor = cursor.sort(opts.sort as never);
        if (opts.skip) cursor = cursor.skip(opts.skip);
        if (opts.limit) cursor = cursor.limit(opts.limit);
        return plain<TDoc[]>(await cursor.toArray());
      } catch (e) {
        return wrap(e);
      }
    },
    async findOne(filter: object, projection?: object): Promise<TDoc | null> {
      try {
        const c = await col();
        const doc = await c.findOne(filter as never, {
          ...sessionOptions(),
          ...(projection ? { projection } : {}),
        });
        return doc ? plain<TDoc>(doc) : null;
      } catch (e) {
        return wrap(e);
      }
    },
    async insertOne(document: TDoc): Promise<string> {
      try {
        const c = await col();
        const r = await c.insertOne({ ...(document as object) } as never, sessionOptions());
        return String(r.insertedId);
      } catch (e) {
        return wrap(e);
      }
    },
    async insertMany(documents: TDoc[]): Promise<string[]> {
      if (documents.length === 0) return [];
      try {
        const c = await col();
        const r = await c.insertMany(
          documents.map((d) => ({ ...(d as object) })) as never,
          sessionOptions(),
        );
        return Object.values(r.insertedIds).map((id) => String(id));
      } catch (e) {
        return wrap(e);
      }
    },
    async updateOne(
      filter: object,
      update: object,
      opts: { upsert?: boolean } = {},
    ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: string }> {
      try {
        const c = await col();
        const r = await c.updateOne(filter as never, update as never, {
          upsert: opts.upsert ?? false,
          ...sessionOptions(),
        });
        return {
          matchedCount: r.matchedCount,
          modifiedCount: r.modifiedCount,
          ...(r.upsertedId ? { upsertedId: String(r.upsertedId) } : {}),
        };
      } catch (e) {
        return wrap(e);
      }
    },
    async updateMany(
      filter: object,
      update: object,
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      try {
        const c = await col();
        const r = await c.updateMany(filter as never, update as never, sessionOptions());
        return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
      } catch (e) {
        return wrap(e);
      }
    },
    async deleteOne(filter: object): Promise<{ deletedCount: number }> {
      try {
        const c = await col();
        const r = await c.deleteOne(filter as never, sessionOptions());
        return { deletedCount: r.deletedCount };
      } catch (e) {
        return wrap(e);
      }
    },
    async deleteMany(filter: object): Promise<{ deletedCount: number }> {
      try {
        const c = await col();
        const r = await c.deleteMany(filter as never, sessionOptions());
        return { deletedCount: r.deletedCount };
      } catch (e) {
        return wrap(e);
      }
    },
    async aggregate<TOut = TDoc>(pipeline: object[]): Promise<TOut[]> {
      try {
        const c = await col();
        return plain<TOut[]>(await c.aggregate(pipeline as never, sessionOptions()).toArray());
      } catch (e) {
        return wrap(e);
      }
    },
    /** Do not continue unsafe writes when required unique indexes cannot be created. */
    async ensureIndex(keys: object, opts: object = {}): Promise<void> {
      try {
        const c = await col();
        await c.createIndex(keys as never, opts as never);
      } catch (error) {
        if (error instanceof DbError) throw error;
        throw new DbError(
          "INDEX_CONFLICT",
          "Required database indexes could not be established. Review existing records without deleting them.",
        );
      }
    },
  };
}

/** Normalises anything thrown inside a repository into a client-safe shape. */
export function toClientError(err: unknown): { code: DbErrorCode; message: string } {
  if (err instanceof DbError) return { code: err.code, message: err.message };
  if (err instanceof ZodError)
    return { code: "VALIDATION", message: err.issues[0]?.message ?? "Invalid request." };
  console.error("[cinebook:server]", err instanceof Error ? err.name : "UnknownError");
  return {
    code: "INTERNAL_ERROR",
    message: "The request could not be completed. Please try again.",
  };
}
