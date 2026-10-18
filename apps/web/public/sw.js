/*
 * WonderHome's service worker (story 23-015). It does one job: show a push
 * notification the server sent, and open the right screen when it is tapped.
 * It caches nothing and answers no page requests, so the app always loads
 * fresh from the network exactly as it did before there was a worker.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "WonderHome", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "WonderHome";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // One thread, one notification: a newer word about the same thing replaces the older.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: Boolean(data.critical),
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
