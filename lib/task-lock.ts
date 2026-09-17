import { execute, queryOne, nowIso } from "@/lib/db";

const TASK_LOCKS_TABLE = "task_locks";

export type TaskLockResult =
  | { success: true; token: string }
  | { success: false; reason: "locked" | "error"; lockedBy?: string };

/**
 * Attempts to acquire a distributed lock for a task.
 * Returns success: true if lock was acquired, or success: false if already locked.
 */
export async function acquireTaskLock(
  taskName: string,
  ttlSeconds: number = 600,
  lockedBy?: string
): Promise<TaskLockResult> {
  try {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const token = crypto.randomUUID();

    // First, clean up any expired locks
    await execute(
      `DELETE FROM ${TASK_LOCKS_TABLE} WHERE expires_at < ?`,
      now
    );

    // Try to take the lock. ON CONFLICT DO NOTHING makes this atomic: either
    // this statement inserts our row or it changes nothing because someone
    // else holds the lock. (Replaces the old Postgres 23505 error check.)
    await execute(
      `INSERT INTO ${TASK_LOCKS_TABLE} (task_name, locked_at, locked_by, lock_token, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(task_name) DO NOTHING`,
      taskName,
      now,
      lockedBy ?? null,
      token,
      expiresAt
    );

    // Confirm ownership by reading the token back rather than trusting a
    // rows-changed count: if the stored token is ours, the insert above won.
    const existing = await queryOne<{
      locked_by: string | null;
      lock_token: string;
    }>(
      `SELECT locked_by, lock_token FROM ${TASK_LOCKS_TABLE} WHERE task_name = ?`,
      taskName
    );

    if (existing?.lock_token === token) {
      return { success: true, token };
    }

    return {
      success: false,
      reason: "locked",
      lockedBy: existing?.locked_by ?? undefined,
    };
  } catch (error) {
    console.error("[task-lock] acquire exception:", error);
    return { success: false, reason: "error" };
  }
}

/**
 * Releases a task lock.
 *
 * Pass the token returned by acquireTaskLock so a run whose TTL already expired
 * cannot delete a lock that another run has since taken.
 */
export async function releaseTaskLock(
  taskName: string,
  token?: string
): Promise<void> {
  try {
    if (token) {
      await execute(
        `DELETE FROM ${TASK_LOCKS_TABLE} WHERE task_name = ? AND lock_token = ?`,
        taskName,
        token
      );
    } else {
      await execute(
        `DELETE FROM ${TASK_LOCKS_TABLE} WHERE task_name = ?`,
        taskName
      );
    }
  } catch (error) {
    console.error("[task-lock] release error:", error);
  }
}

/**
 * Checks if a task is currently locked (without trying to acquire).
 */
export async function isTaskLocked(taskName: string): Promise<boolean> {
  try {
    // Clean up expired locks first
    await execute(
      `DELETE FROM ${TASK_LOCKS_TABLE} WHERE expires_at < ?`,
      nowIso()
    );

    const row = await queryOne<{ task_name: string }>(
      `SELECT task_name FROM ${TASK_LOCKS_TABLE} WHERE task_name = ?`,
      taskName
    );

    return row !== null;
  } catch (error) {
    console.error("[task-lock] check exception:", error);
    return false;
  }
}

/**
 * Executes a function with a task lock. Automatically acquires and releases the lock.
 */
export async function withTaskLock<T>(
  taskName: string,
  fn: () => Promise<T>,
  options?: {
    ttlSeconds?: number;
    lockedBy?: string;
  }
): Promise<{ success: true; result: T } | { success: false; reason: string }> {
  const lockResult = await acquireTaskLock(
    taskName,
    options?.ttlSeconds,
    options?.lockedBy
  );

  if (!lockResult.success) {
    return {
      success: false,
      reason:
        lockResult.reason === "locked"
          ? `Task ${taskName} is already running${
              lockResult.lockedBy ? ` (locked by: ${lockResult.lockedBy})` : ""
            }`
          : "Failed to acquire lock",
    };
  }

  try {
    const result = await fn();
    return { success: true, result };
  } finally {
    await releaseTaskLock(taskName, lockResult.token);
  }
}
