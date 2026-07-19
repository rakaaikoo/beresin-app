const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, "tasks.json");
const VALID_PRIORITIES = ["genting", "prioritas", "santuy"];

app.use(cors());
app.use(express.json());

// --- helper penyimpanan sederhana berbasis file JSON ---
function readTasks() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("gagal baca tasks.json, mulai dari kosong:", e.message);
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

// --- routes ---

// ambil semua tugas
app.get("/api/tasks", (req, res) => {
  res.json(readTasks());
});

// tambah tugas baru
app.post("/api/tasks", (req, res) => {
  const { title, priority, due } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "judul tugas wajib diisi" });
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "priority harus salah satu dari: " + VALID_PRIORITIES.join(", ") });
  }

  const tasks = readTasks();
  const newTask = {
    id: crypto.randomUUID(),
    title: title.trim(),
    priority,
    due: due || null,
    done: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  writeTasks(tasks);
  res.status(201).json(newTask);
});

// update tugas (toggle done, ubah judul/priority/due)
app.patch("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "tugas gak ketemu" });

  const { title, priority, due, done } = req.body;
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "priority gak valid" });
  }

  tasks[idx] = {
    ...tasks[idx],
    ...(title !== undefined ? { title } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(due !== undefined ? { due } : {}),
    ...(done !== undefined ? { done } : {}),
  };
  writeTasks(tasks);
  res.json(tasks[idx]);
});

// hapus tugas
app.delete("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const next = tasks.filter((t) => t.id !== req.params.id);
  if (next.length === tasks.length) {
    return res.status(404).json({ error: "tugas gak ketemu" });
  }
  writeTasks(next);
  res.status(204).end();
});

// health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`BERESIN backend jalan di http://localhost:${PORT}`);
});
