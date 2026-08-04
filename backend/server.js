const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, "tasks.json");
const SUB_FILE = path.join(__dirname, "subscriptions.json");
const VAPID_FILE = path.join(__dirname, "vapid.json");
const VALID_PRIORITIES = ["genting", "prioritas", "santuy"];

app.use(cors());
app.use(express.json());

// --- Setup VAPID Keys for Web Push ---
function getVapidKeys() {
  if (fs.existsSync(VAPID_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VAPID_FILE, "utf-8"));
    } catch (e) {
      console.error("Gagal membaca vapid.json, membuat ulang...", e.message);
    }
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), "utf-8");
  return keys;
}

const vapidKeys = getVapidKeys();
webpush.setVapidDetails(
  "mailto:admin@beresin.app",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Helper JSON Storage ---
function readTasks() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Gagal baca tasks.json, mulai dari kosong:", e.message);
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

function readSubscriptions() {
  if (!fs.existsSync(SUB_FILE)) return [];
  try {
    const raw = fs.readFileSync(SUB_FILE, "utf-8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Gagal baca subscriptions.json:", e.message);
    return [];
  }
}

function writeSubscriptions(subs) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

// Helper untuk mengirim notifikasi push ke semua subscriber
async function sendNotificationToAll(payload) {
  const subs = readSubscriptions();
  if (subs.length === 0) return;

  const validSubs = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      validSubs.push(sub);
    } catch (err) {
      // 404/410 berarti subscription sudah tidak berlaku di browser client
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log("Subscription kadaluarsa, menghapus subscriber:", sub.endpoint);
      } else {
        console.error("Gagal kirim notifikasi push:", err.message);
        validSubs.push(sub);
      }
    }
  }
  if (validSubs.length !== subs.length) {
    writeSubscriptions(validSubs);
  }
}

// --- Cron Job Pengingat Deadline Tugas (Cek setiap 30 detik) ---
cron.schedule("*/30 * * * * *", async () => {
  const tasks = readTasks();
  let updated = false;
  const now = Date.now();

  for (const t of tasks) {
    if (t.done || !t.due || t.notified) continue;

    const dueTime = new Date(t.due).getTime();
    // Kirim notifikasi jika deadline sudah dekat (<= 2 menit lagi) atau sudah lewat (kurang dari 24 jam)
    if (dueTime <= now + 2 * 60 * 1000 && dueTime >= now - 24 * 60 * 60 * 1000) {
      console.log(`[ALERT] Mengirim notifikasi deadline untuk tugas: ${t.title}`);
      const payload = {
        title: `🚨 ALARM DEADLINE: ${t.title}`,
        body: `Woy! Tugas "${t.title}" (${t.priority.toUpperCase()}) sudah masuk waktu deadline! Gas kerjain sekarang!`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `task-${t.id}`,
        data: { url: "/" },
      };

      await sendNotificationToAll(payload);
      t.notified = true;
      updated = true;
    }
  }

  if (updated) {
    writeTasks(tasks);
  }
});

// --- Routes ---

// Ambil VAPID Public Key untuk frontend
app.get("/api/subscribe/key", (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Simpan push subscription baru
app.post("/api/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: "Subscription tidak valid" });
  }

  const subs = readSubscriptions();
  const exists = subs.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subs.push(sub);
    writeSubscriptions(subs);
  }
  res.status(201).json({ message: "Subscription berhasil disimpan!" });
});

// Kirim notifikasi tes manual
app.post("/api/subscribe/test", async (req, res) => {
  const payload = {
    title: "🔔 Tes Alarm & Notifikasi BERESIN",
    body: "Mantap! Notifikasi HP dan Alarm pengingat BERESIN berhasil aktif!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "test-notification",
    data: { url: "/" },
  };
  await sendNotificationToAll(payload);
  res.json({ message: "Notifikasi tes telah dikirim!" });
});

// Ambil semua tugas
app.get("/api/tasks", (req, res) => {
  res.json(readTasks());
});

// Tambah tugas baru
app.post("/api/tasks", (req, res) => {
  const { title, priority, due } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Judul tugas wajib diisi" });
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Priority harus salah satu dari: " + VALID_PRIORITIES.join(", ") });
  }

  const tasks = readTasks();
  const newTask = {
    id: crypto.randomUUID(),
    title: title.trim(),
    priority,
    due: due || null,
    done: false,
    notified: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  writeTasks(tasks);

  // Jika tugas dibuat dengan deadline yang sangat dekat (< 2 menit lagi), jadwalkan pengingat
  res.status(201).json(newTask);
});

// Update tugas (toggle done, ubah judul/priority/due)
app.patch("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Tugas tidak ditemukan" });

  const { title, priority, due, done } = req.body;
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Priority tidak valid" });
  }

  const resetNotified = due !== undefined && due !== tasks[idx].due;

  tasks[idx] = {
    ...tasks[idx],
    ...(title !== undefined ? { title } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(due !== undefined ? { due } : {}),
    ...(done !== undefined ? { done } : {}),
    ...(resetNotified ? { notified: false } : {}),
  };
  writeTasks(tasks);
  res.json(tasks[idx]);
});

// Hapus tugas
app.delete("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const next = tasks.filter((t) => t.id !== req.params.id);
  if (next.length === tasks.length) {
    return res.status(404).json({ error: "Tugas tidak ditemukan" });
  }
  writeTasks(next);
  res.status(204).end();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`BERESIN backend (Web Push Ready) jalan di http://localhost:${PORT}`);
});
