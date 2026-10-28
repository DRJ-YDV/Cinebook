import { randomBytes, createHash } from "node:crypto";
import {
  useSession as getServerSession,
  getRequestIP,
  setResponseHeader,
} from "@tanstack/react-start/server";
import type { PublicUser } from "./db/models";
import { collection, DbError } from "./db/mongo.server";

type CookieData = { sessionToken?: string };
type SessionRecord = { _id: string; userId: string; expiresAt: string; createdAt: string };
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const sessions = () => collection<SessionRecord>("sessions");
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

function config() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32)
    throw new DbError("INTERNAL_ERROR", "Server sign-in sessions are not configured.");
  return {
    password,
    name: "cinebook-session",
    maxAge: SESSION_SECONDS,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export function privateResponse() {
  setResponseHeader("cache-control", "private, no-store");
}

export function isAdministrator(user: PublicUser): boolean {
  const designated = process.env["CINEBOOK_ADMIN_EMAIL"]?.trim().toLowerCase();
  return user.role === "admin" && (!designated || user.email.trim().toLowerCase() === designated);
}

export async function currentUser(): Promise<PublicUser | null> {
  privateResponse();
  const cookie = await getServerSession<CookieData>(config());
  const token = cookie.data.sessionToken;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await sessions().findOne({
    _id: digest(token),
    expiresAt: { $gt: new Date().toISOString() },
  });
  if (!row) return null;
  const { getUser } = await import("./db/repositories.server");
  const user = await getUser({ userId: row.userId });
  if (!user) return null;
  return { ...user, role: isAdministrator(user) ? "admin" : "user" };
}

export async function requireUser(): Promise<PublicUser> {
  const user = await currentUser();
  if (!user) throw new DbError("AUTH_REQUIRED", "Sign in to continue.");
  return user;
}

export async function requireAdmin(): Promise<PublicUser> {
  const user = await requireUser();
  if (!isAdministrator(user)) throw new DbError("FORBIDDEN", "Administrator access is required.");
  return user;
}

export async function beginSession(user: PublicUser): Promise<PublicUser> {
  privateResponse();
  const cookie = await getServerSession<CookieData>(config());
  if (cookie.data.sessionToken)
    await sessions().deleteOne({ _id: digest(cookie.data.sessionToken) });
  await cookie.clear();
  const token = randomBytes(32).toString("hex");
  await sessions().insertOne({
    _id: digest(token),
    userId: user.userId,
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  await cookie.update({ sessionToken: token });
  return { ...user, role: isAdministrator(user) ? "admin" : "user" };
}

export async function endSession() {
  privateResponse();
  const cookie = await getServerSession<CookieData>(config());
  if (cookie.data.sessionToken)
    await sessions().deleteOne({ _id: digest(cookie.data.sessionToken) });
  await cookie.clear();
}

// Per-process protection. A shared gateway limiter is still required for multi-instance hosts.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function limitAuthentication(email: string) {
  const ip = getRequestIP() ?? "unknown";
  const now = Date.now();
  for (const [key, bucket] of attempts) if (bucket.resetAt <= now) attempts.delete(key);
  for (const identifier of [`ip:${ip}`, `account:${email.trim().toLowerCase()}`]) {
    const key = digest(identifier);
    const max = identifier.startsWith("ip:") ? 100 : 15;
    const bucket = attempts.get(key) ?? { count: 0, resetAt: now + 15 * 60_000 };
    if (bucket.count >= max)
      throw new DbError("RATE_LIMITED", "Too many sign-in attempts. Please try again later.");
    bucket.count++;
    attempts.set(key, bucket);
  }
}
