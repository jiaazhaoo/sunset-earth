// Sunset Earth service worker: shows sunset reminders and opens the camera.
self.addEventListener("push", (event) => {
  let data = { title: "Sunset Earth", body: "", url: "/", tag: "sunset" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    })
  );
});
