-- Create task locks table for preventing concurrent execution
CREATE TABLE IF NOT EXISTS public.task_locks (
  task_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON public.task_locks(expires_at);

COMMENT ON TABLE public.task_locks IS 'Distributed locks for preventing concurrent task execution';
COMMENT ON COLUMN public.task_locks.task_name IS 'Unique identifier for the task (e.g., weather-cache, compute-rankings)';
COMMENT ON COLUMN public.task_locks.locked_at IS 'When the lock was acquired';
COMMENT ON COLUMN public.task_locks.locked_by IS 'Optional identifier of the process holding the lock';
COMMENT ON COLUMN public.task_locks.expires_at IS 'When the lock expires (for automatic cleanup of stale locks)';
