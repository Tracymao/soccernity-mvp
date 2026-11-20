/* Soccernity service worker -- web push only (build register B-062 / B-285, Decision Log #472 (e)).
 *
 * Served from the web root as /sw.js so its scope is the whole site. Production hosting must serve it
 * with a JavaScript content type and "Cache-Control: no-cache" so a browser always checks for a new
 * copy (docs/deployment.md, static-site section).
 *
 * It does exactly two things and nothing else: show a notification from the push payload (title and
 * body ONLY -- the server sends nothing else, by decision), and on click focus an open Soccernity tab
 * or open one at /notifications. It has no fetch handler, no cache and no background sync.
 */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var title = "Soccernity";
  var body = "You have a new notification";
  try {
    var data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && data.title) title = data.title;
    if (data && typeof data.body === "string" && data.body) body = data.body;
  } catch (e) {
    /* an unreadable payload still shows the generic notification */
  }
  event.waitUntil(self.registration.showNotification(title, { body: body, tag: "soccernity-notification" }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL("/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (client.url && client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          return client.focus().then(function (focused) {
            return focused && "navigate" in focused ? focused.navigate(target) : focused;
          });
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
