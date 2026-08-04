const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "beresin-super-secret-key-2026";

const DB_FILE = path.join(__dirname, "tasks.json");
const USER_DB_FILE = path.join(__dirname, "users.json");
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
function readUsers() {
  if (!fs.existsSync(USER_DB_FILE)) return [];
  try {
    const raw = fs.readFileSync(USER_DB_FILE, "utf-8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Gagal baca users.json:", e.message);
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USER_DB_FILE, JSON.stringify(users, null, 2), "utf-8");
}

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

// --- Middleware Autentikasi JWT ---
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Akses ditolak, silakan login terlebih dahulu" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sesi login tidak valid atau kadaluarsa" });
  }
}

// --- Helper Notifikasi Push Per User ---
async function sendNotificationToUser(userId, payload) {
  const subs = readSubscriptions();
  if (subs.length === 0) return;

  const validSubs = [];
  for (const sub of subs) {
    if (sub.userId && sub.userId !== userId) {
      validSubs.push(sub);
      continue;
    }
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      validSubs.push(sub);
    } catch (err) {
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

      if (t.userId) {
        await sendNotificationToUser(t.userId, payload);
      }
      t.notified = true;
      updated = true;
    }
  }

  if (updated) {
    writeTasks(tasks);
  }
});

// --- Auth Routes ---

// Register User Baru
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nama, email, dan password wajib diisi" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter" });
  }

  const users = readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  if (users.some((u) => u.email === normalizedEmail)) {
    return res.status(400).json({ error: "Email sudah terdaftar! Silakan login." });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const newUser = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);

  const token = jwt.sign(
    { id: newUser.id, email: newUser.email, name: newUser.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email },
  });
});

// Login User
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi" });
  }

  const users = readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return res.status(400).json({ error: "Email atau password salah" });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(400).json({ error: "Email atau password salah" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// Check Session / Current User
app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// --- Push Subscription Routes ---

// Ambil VAPID Public Key untuk frontend
app.get("/api/subscribe/key", (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Simpan push subscription baru (terhubung ke userId)
app.post("/api/subscribe", authMiddleware, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: "Subscription tidak valid" });
  }

  const subs = readSubscriptions();
  const existsIndex = subs.findIndex((s) => s.endpoint === sub.endpoint);
  const newSub = { ...sub, userId: req.user.id };
  if (existsIndex >= 0) {
    subs[existsIndex] = newSub;
  } else {
    subs.push(newSub);
  }
  writeSubscriptions(subs);
  res.status(201).json({ message: "Subscription berhasil disimpan!" });
});

// Kirim notifikasi tes manual untuk user yang sedang login
app.post("/api/subscribe/test", authMiddleware, async (req, res) => {
  const payload = {
    title: `🔔 Tes Alarm BERESIN (${req.user.name})`,
    body: "Mantap! Notifikasi HP dan Alarm pengingat BERESIN berhasil aktif!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "test-notification",
    data: { url: "/" },
  };
  await sendNotificationToUser(req.user.id, payload);
  res.json({ message: "Notifikasi tes telah dikirim!" });
});

// --- Tasks Routes (Protected per User) ---

// Ambil semua tugas milik user yang sedang login
app.get("/api/tasks", authMiddleware, (req, res) => {
  const allTasks = readTasks();
  const userTasks = allTasks.filter((t) => t.userId === req.user.id);
  res.json(userTasks);
});

// Tambah tugas baru milik user yang sedang login
app.post("/api/tasks", authMiddleware, (req, res) => {
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
    userId: req.user.id,
    title: title.trim(),
    priority,
    due: due || null,
    done: false,
    notified: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  writeTasks(tasks);

  res.status(201).json(newTask);
});

// Update tugas (hanya tugas milik user yang sedang login)
app.patch("/api/tasks/:id", authMiddleware, (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id && t.userId === req.user.id);
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

// Hapus tugas (hanya tugas milik user yang sedang login)
app.delete("/api/tasks/:id", authMiddleware, (req, res) => {
  const tasks = readTasks();
  const targetTask = tasks.find((t) => t.id === req.params.id && t.userId === req.user.id);
  if (!targetTask) {
    return res.status(404).json({ error: "Tugas tidak ditemukan" });
  }

  const next = tasks.filter((t) => t.id !== req.params.id);
  writeTasks(next);
  res.status(204).end();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`BERESIN backend (Multi-User & Push Ready) jalan di http://localhost:${PORT}`);
});
