"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("That token was not accepted.");
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <label className="text-sm text-muted" htmlFor="token">
        Admin token (the deployment&apos;s CRON_SECRET)
      </label>
      <input
        id="token"
        type="password"
        autoComplete="current-password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !token}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        Sign in
      </button>
    </form>
  );
}
