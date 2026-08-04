// Service Worker untuk BERESIN PWA & Web Push Notification

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tangani event Push Notification dari Backend
self.addEventListener("push", (event) => {
  let data = {
    title: "🚨 ALARM DEADLINE BERESIN!",
    body: "Ada tugas yang sudah mendekati/melewati waktu deadline!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "beresin-alarm",
    data: { url: "/" },
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    vibrate: [300, 100, 300, 100, 500, 100, 300], // Pola getar alarm keras
    tag: data.tag || "beresin-alarm",
    renotify: true,
    requireInteraction: true, // Notifikasi tetap ada di layar sampai diinteraksi (seperti alarm)
    data: data.data || { url: "/" },
    actions: [
      { action: "open", title: "Buka Aplikasi 🚀" },
      { action: "close", title: "Tutup ✕" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Tangani event saat Notifikasi diklik oleh pengguna
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Fokus ke window yang sudah terbuka
      for (let client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Jika belum terbuka, buka window baru
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
