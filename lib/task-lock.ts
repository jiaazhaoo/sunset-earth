import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TASK_LOCKS_TABLE = "task_locks";

export type TaskLockResult =
  | { success: true }
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
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // First, clean up any expired locks
    await supabaseAdmin
      .from(TASK_LOCKS_TABLE)
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Try to insert a new lock
    const { error } = await supabaseAdmin
      .from(TASK_LOCKS_TABLE)
      .insert({
        task_name: taskName,
        locked_at: new Date().toISOString(),
        locked_by: lockedBy ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      // Check if it's a unique constraint violation (task already locked)
      if (error.code === "23505") {
        // Query who holds the lock
        const { data: existingLock } = await supabaseAdmin
          .from(TASK_LOCKS_TABLE)
          .select("locked_by")
          .eq("task_name", taskName)
          .single();

        return {
          success: false,
          reason: "locked",
          lockedBy: existingLock?.locked_by ?? undefined,
        };
      }
      console.error("[task-lock] acquire error:", error);
      return { success: false, reason: "error" };
    }

    return { success: true };
  } catch (error) {
    console.error("[task-lock] acquire exception:", error);
    return { success: false, reason: "error" };
  }
}

/**
 * Releases a task lock.
 */
export async function releaseTaskLock(taskName: string): Promise<void> {
  try {
    await supabaseAdmin
      .from(TASK_LOCKS_TABLE)
      .delete()
      .eq("task_name", taskName);
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
    await supabaseAdmin
      .from(TASK_LOCKS_TABLE)
      .delete()
      .lt("expires_at", new Date().toISOString());

    const { data, error } = await supabaseAdmin
      .from(TASK_LOCKS_TABLE)
      .select("task_name")
      .eq("task_name", taskName)
      .maybeSingle();

    if (error) {
      console.error("[task-lock] check error:", error);
      return false;
    }

    return data !== null;
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
    await releaseTaskLock(taskName);
  }
}
