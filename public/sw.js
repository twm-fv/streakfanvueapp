/* Streak service worker: receives reminder pushes and opens the dashboard on tap.
   It caches nothing and reads no page data. */

self.addEventListener("push", (event) => {
  let payload = { title: "Streak", body: "Time to post.", url: "/dashboard", tag: "streak" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* A malformed payload still shows the default reminder. */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: payload.tag,
      renotify: false,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(self.location.origin));
      if (existing) return existing.focus().then(() => existing.navigate?.(target));
      return self.clients.openWindow(target);
    }),
  );
});
