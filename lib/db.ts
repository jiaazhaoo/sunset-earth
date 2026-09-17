import { getCloudflareContext } from "@opennextjs/cloudflare";
// Type-only import: keeps the D1 types available in app code without pulling
// the full workerd global types in (which would shadow the DOM lib).
import type { D1Database, D1Result } from "@cloudflare/workers-types";

/**
 * Returns the D1 binding for the current request.
 *
 * Unlike the old Supabase client this cannot be a module-level singleton:
 * Cloudflare only exposes bindings through the request context, so every call
 * site has to resolve it lazily.
 */
export function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as { DB?: D1Database }).DB;
  if (!db) {
    throw new Error(
      "Missing D1 binding 'DB'. Add it to wrangler.jsonc under d1_databases."
    );
  }
  return db;
}

/** Runs a query and returns all rows. */
export async function query<T>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const { results } = await getDb()
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return results ?? [];
}

/** Runs a query and returns the first row, or null. */
export async function queryOne<T>(
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const row = await getDb()
    .prepare(sql)
    .bind(...params)
    .first<T>();
  return row ?? null;
}

/** Runs a statement that returns no rows. */
export async function execute(
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return getDb()
    .prepare(sql)
    .bind(...params)
    .run();
}

/** Runs several statements as one batch (single round-trip, implicit transaction). */
export async function batch(
  statements: Array<{ sql: string; params?: unknown[] }>
): Promise<D1Result[]> {
  const db = getDb();
  return db.batch(
    statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? [])))
  );
}

// --- value helpers -------------------------------------------------------
// SQLite has no boolean, timestamp or JSON types, so translate at the edges.

/** SQLite INTEGER (0/1) -> boolean. */
export function toBool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  return value === 1 || value === true || value === "1";
}

/** boolean -> SQLite INTEGER (0/1). */
export function fromBool(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

/** Parses a JSON TEXT column, tolerating nulls and malformed values. */
export function parseJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Builds an `IN (?, ?, ...)` placeholder list.
 * Returns null when the list is empty, so callers can skip the query.
 */
export function placeholders(count: number): string | null {
  if (count <= 0) return null;
  return new Array(count).fill("?").join(",");
}

/** Current time as the ISO-8601 UTC string format used across all TEXT dates. */
export function nowIso(): string {
  return new Date().toISOString();
}
