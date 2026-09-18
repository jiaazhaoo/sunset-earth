"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Remind me before sunset" for one camera: registers the service worker,
 * asks for permission, subscribes this browser and tells the server which
 * camera it cares about. State is per camera id.
 */

export type PushState = "unsupported" | "idle" | "busy" | "on" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function usePushReminder(cameraId: string | null) {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<PushState>(supported && publicKey ? "idle" : "unsupported");

  // Is this browser already subscribed for this camera?
  useEffect(() => {
    if (!supported || !publicKey || !cameraId) return;
    let cancelled = false;
    (async () => {
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await currentSubscription().catch(() => null);
      if (!sub) {
        if (!cancelled) setState("idle");
        return;
      }
      const res = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => null);
      const data = res?.ok ? ((await res.json()) as { cameraIds?: string[] }) : null;
      if (!cancelled) setState(data?.cameraIds?.includes(cameraId) ? "on" : "idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, publicKey, cameraId]);

  const toggle = useCallback(async () => {
    if (!supported || !publicKey || !cameraId || state === "busy") return;
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      const wasOn = state === "on";
      if (wasOn && sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, cameraId }),
        });
        setState("idle");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), cameraId }),
      });
      setState(res.ok ? "on" : "idle");
    } catch (error) {
      console.warn("[push] subscribe failed", error);
      setState("idle");
    }
  }, [supported, publicKey, cameraId, state]);

  return { state, toggle };
}
