import { useState, useEffect, useCallback } from "react";
import {
  Flame,
  Zap,
  Moon,
  Check,
  X,
  Clock,
  BellRing,
  Plus,
  Smile,
  Meh,
  Frown,
  PartyPopper,
  Sparkles,
  WifiOff,
  LogIn,
  LogOut,
  User,
  Lock,
  Mail,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";
const PRIORITY_ORDER = ["genting", "prioritas", "santuy"];

const PRIORITY_META = {
  genting: {
    label: "GENTING BANGET",
    Icon: Flame,
    ring: "border-rose-500",
    text: "text-rose-400",
    dim: "bg-rose-950/60",
    solid: "bg-rose-500",
  },
  prioritas: {
    label: "PRIORITAS",
    Icon: Zap,
    ring: "border-sky-400",
    text: "text-sky-300",
    dim: "bg-sky-950/60",
    solid: "bg-sky-400",
  },
  santuy: {
    label: "SANTUY DULU",
    Icon: Moon,
    ring: "border-lime-400",
    text: "text-lime-300",
    dim: "bg-lime-950/60",
    solid: "bg-lime-400",
  },
};

const NAG_OVERDUE = [
  (n) => `woy ${n} tugas udah lewat waktunya. gas kerjain sebelum makin numpuk.`,
  (n) => `santai boleh, tapi ${n} tugas ini udah nungguin dari tadi lho.`,
  (n) => `psst... ${n} deadline udah kelewat. jangan pura-pura gak liat ini ya.`,
  (n) => `ini bukan drama, gak bakal ada plot twist kalau ${n} tugas ini gak dikerjain.`,
];
const NAG_URGENT_TODAY = [
  (n) => `ada ${n} tugas genting yang deadline-nya hari ini. gas mulai sekarang.`,
  (n) => `hari ini D-day buat ${n} tugas prioritas tinggi. kelarin dulu baru rebahan.`,
];
const NAG_CLEAR = [
  () => `mantap, gak ada yang telat. tapi kerjain yang genting dulu ya.`,
  () => `aman sejahtera. gaskeun yang prioritas biar makin cepet beres.`,
];

function isOverdue(t) {
  if (!t.due || t.done) return false;
  return new Date(t.due).getTime() < Date.now();
}
function isDueToday(t) {
  if (!t.due) return false;
  const d = new Date(t.due),
    now = new Date();
  return d.toDateString() === now.toDateString();
}
function fmtDue(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("beresin_token") || null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("beresin_user")) || null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("genting");
  const [nagIndex, setNagIndex] = useState(0);
  const [pushStatus, setPushStatus] = useState("default");
  const [swRegistration, setSwRegistration] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("beresin_token");
    localStorage.removeItem("beresin_user");
    setToken(null);
    setUser(null);
    setTasks([]);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setSwRegistration(reg);
          if (Notification.permission === "granted") {
            setPushStatus("granted");
          } else if (Notification.permission === "denied") {
            setPushStatus("denied");
          }
        })
        .catch((err) => console.error("SW Registration Error:", err));
    }
  }, []);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function enablePushNotifications() {
    if (!token) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("Browser Anda belum mendukung Notifikasi Push.");
      return;
    }
    try {
      setPushStatus("subscribing");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatus("denied");
        alert("Izin notifikasi ditolak. Silakan izinkan notifikasi di setelan browser.");
        return;
      }

      const reg = swRegistration || (await navigator.serviceWorker.ready);
      const resKey = await fetch(`${API_BASE}/subscribe/key`);
      const { publicKey } = await resKey.json();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const resSub = await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sub),
      });

      if (resSub.status === 401) {
        handleLogout();
        return;
      }

      await fetch(`${API_BASE}/subscribe/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPushStatus("granted");
    } catch (e) {
      console.error("Gagal mengaktifkan push:", e);
      setPushStatus("default");
      alert("Gagal mengaktifkan notifikasi: " + e.message);
    }
  }

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error("gagal ambil data");
      const data = await res.json();
      setTasks(data);
      setOffline(false);
    } catch (e) {
      setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (token) {
      fetchTasks();
      const poll = setInterval(fetchTasks, 15000);
      const nagTimer = setInterval(() => setNagIndex((i) => i + 1), 5000);
      return () => {
        clearInterval(poll);
        clearInterval(nagTimer);
      };
    }
  }, [token, fetchTasks]);

  // Auth Handler
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const isRegister = authMode === "register";
    const endpoint = isRegister ? "/auth/register" : "/auth/login";
    const body = isRegister
      ? { name: authName, email: authEmail, password: authPassword }
      : { email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal autentikasi");
      }
      // Success
      localStorage.setItem("beresin_token", data.token);
      localStorage.setItem("beresin_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setAuthPassword("");
      setAuthError("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function addTask() {
    const text = title.trim();
    if (!text || !token) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: text,
          priority,
          due: due ? new Date(due).toISOString() : null,
        }),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error("gagal nambah tugas");
      const newTask = await res.json();
      setTasks((prev) => [...prev, newTask]);
      setOffline(false);
      setTitle("");
      setDue("");
    } catch (e) {
      setOffline(true);
    }
  }

  async function toggleDone(id) {
    if (!token) return;
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ done: !target.done }),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error("gagal update tugas");
      setOffline(false);
    } catch (e) {
      setOffline(true);
      fetchTasks();
    }
  }

  async function deleteTask(id) {
    if (!token) return;
    const prevTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok && res.status !== 204) throw new Error("gagal hapus tugas");
      setOffline(false);
    } catch (e) {
      setOffline(true);
      setTasks(prevTasks);
    }
  }

  // Render Login / Register Modal if not logged in
  if (!token || !user) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950 text-orange-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-purple-900/40 border border-white/10 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-sky-400 flex items-center justify-center shadow-lg shadow-black/30 mb-3">
              <Smile className="w-8 h-8 text-purple-950" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-black tracking-tight">BERESIN.</h1>
            <p className="text-xs text-violet-300 mt-1">
              Masuk atau daftar untuk menyimpan & mengelola tugas kamu
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-purple-950/60 p-1 rounded-2xl border border-white/10 mb-6">
            <button
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                authMode === "login"
                  ? "bg-gradient-to-r from-rose-500 to-purple-600 text-white shadow-md"
                  : "text-violet-400 hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5 inline mr-1.5" />
              MASUK
            </button>
            <button
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                authMode === "register"
                  ? "bg-gradient-to-r from-rose-500 to-purple-600 text-white shadow-md"
                  : "text-violet-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
              DAFTAR
            </button>
          </div>

          {/* Error Banner */}
          {authError && (
            <div className="bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs rounded-xl p-3 mb-4 flex items-center gap-2">
              <X className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label className="block text-xs font-semibold text-violet-300 mb-1.5">
                  Nama Lengkap / Panggilan
                </label>
                <div className="flex items-center bg-purple-950/50 border border-white/10 rounded-xl px-3 py-2.5">
                  <User className="w-4 h-4 text-violet-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Contoh: Raka"
                    className="w-full bg-transparent outline-none text-sm text-white placeholder-violet-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-violet-300 mb-1.5">
                Alamat Email
              </label>
              <div className="flex items-center bg-purple-950/50 border border-white/10 rounded-xl px-3 py-2.5">
                <Mail className="w-4 h-4 text-violet-400 mr-2 shrink-0" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full bg-transparent outline-none text-sm text-white placeholder-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-violet-300 mb-1.5">
                Password
              </label>
              <div className="flex items-center bg-purple-950/50 border border-white/10 rounded-xl px-3 py-2.5">
                <Lock className="w-4 h-4 text-violet-400 mr-2 shrink-0" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent outline-none text-sm text-white placeholder-violet-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 bg-lime-400 hover:bg-lime-300 text-purple-950 font-black text-sm py-3 rounded-xl shadow-[0_4px_0_0_rgba(101,120,20,1)] active:translate-y-[2px] active:shadow-[0_1px_0_0_rgba(101,120,20,1)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {authLoading ? (
                "Memproses..."
              ) : authMode === "login" ? (
                <>
                  <LogIn className="w-4 h-4" strokeWidth={3} />
                  MASUK SEKARANG
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" strokeWidth={3} />
                  BUAT AKUN BARU
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const overdueCount = tasks.filter(isOverdue).length;
  const urgentTodayCount = tasks.filter(
    (t) => !t.done && !isOverdue(t) && t.priority === "genting" && isDueToday(t)
  ).length;
  const pendingCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.filter((t) => t.done).length;

  let MascotIcon = Smile;
  if (overdueCount > 2) MascotIcon = Frown;
  else if (overdueCount > 0) MascotIcon = Meh;
  else if (tasks.length > 0 && tasks.every((t) => t.done)) MascotIcon = PartyPopper;

  let nagPool = null,
    nagN = 0;
  if (overdueCount > 0) {
    nagPool = NAG_OVERDUE;
    nagN = overdueCount;
  } else if (urgentTodayCount > 0) {
    nagPool = NAG_URGENT_TODAY;
    nagN = urgentTodayCount;
  } else if (pendingCount > 0) {
    nagPool = NAG_CLEAR;
    nagN = 0;
  }
  const nagMessage = nagPool ? nagPool[nagIndex % nagPool.length](nagN) : null;

  const grouped = PRIORITY_ORDER.map((p) => ({
    key: p,
    items: tasks
      .filter((t) => t.priority === p)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.due && b.due) return new Date(a.due) - new Date(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return 0;
      }),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950 text-orange-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* header */}
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-sky-400 flex items-center justify-center shadow-lg shadow-black/30 shrink-0">
              <MascotIcon className="w-7 h-7 text-purple-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">BERESIN.</h1>
              <p className="text-xs text-violet-300">
                to-do list buat yang capek liat tema polos & notif garing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* User Info & Logout Pill */}
            <div className="flex items-center gap-2 bg-purple-900/60 border border-white/10 rounded-full px-3 py-1.5 text-xs text-violet-200">
              <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="font-semibold max-w-[120px] truncate">{user.name}</span>
              <button
                onClick={handleLogout}
                title="Keluar"
                className="ml-1 text-violet-400 hover:text-rose-400 transition-colors p-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={enablePushNotifications}
              disabled={pushStatus === "subscribing"}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-xs shadow-lg transition-all border ${
                pushStatus === "granted"
                  ? "bg-lime-950/60 border-lime-400/50 text-lime-300 cursor-default"
                  : pushStatus === "denied"
                  ? "bg-rose-950/60 border-rose-400/50 text-rose-300 cursor-pointer"
                  : "bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 border-sky-300/40 text-white font-bold animate-pulse cursor-pointer"
              }`}
            >
              <BellRing className="w-4 h-4" />
              {pushStatus === "granted" && "Alarm HP Aktif 🔔"}
              {pushStatus === "denied" && "Izin Notif Ditolak ❌"}
              {pushStatus === "subscribing" && "Mengaktifkan..."}
              {pushStatus === "default" && "Aktifkan Alarm HP 🔔"}
            </button>
            <div className="flex items-center gap-2 bg-purple-900/50 border border-white/10 rounded-full px-4 py-2 font-mono text-sm shadow-lg shadow-black/20">
              <Flame className="w-4 h-4 text-lime-300" />
              <span className="text-violet-300">streak beres:</span>
              <b className="text-lime-300 text-base">{doneCount}</b>
            </div>
          </div>
        </div>

        {/* offline warning */}
        {loaded && offline && (
          <div className="flex items-center gap-3 bg-orange-950/50 border border-orange-400/40 rounded-2xl px-4 py-3 mb-4 text-sm">
            <WifiOff className="w-5 h-5 text-orange-300 shrink-0" />
            <p>
              gak bisa nyambung ke backend di <code className="font-mono">localhost:3001</code>.
              pastikan server-nya udah jalan (<code className="font-mono">npm start</code> di folder backend).
            </p>
          </div>
        )}

        {/* nag banner */}
        {loaded && !offline && nagMessage && (
          <div className="flex items-start gap-3 bg-gradient-to-r from-rose-950/60 to-purple-900/40 border border-dashed border-rose-400/60 rounded-2xl px-4 py-3 mb-6 text-sm leading-relaxed">
            <BellRing className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <p>{nagMessage}</p>
          </div>
        )}

        {/* composer */}
        <div className="bg-purple-900/40 border border-white/10 rounded-2xl p-4 mb-8 shadow-lg shadow-black/20">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="mau ngerjain apa nih... (contoh: revisi laporan PjBL)"
            maxLength={120}
            className="w-full bg-transparent outline-none text-orange-50 placeholder-violet-400 text-base pb-3 mb-3 border-b border-white/10"
          />
          <div className="flex gap-2 flex-wrap mb-3">
            {PRIORITY_ORDER.map((p) => {
              const meta = PRIORITY_META[p];
              const active = priority === p;
              return (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-colors cursor-pointer ${
                    active
                      ? `${meta.ring} ${meta.text} ${meta.dim}`
                      : "border-transparent bg-purple-950/50 text-violet-400"
                  }`}
                >
                  <meta.Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex items-center gap-2 bg-purple-950/50 border border-white/10 rounded-xl px-3 py-2 flex-1 min-w-[170px]">
              <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="bg-transparent outline-none text-xs font-mono text-orange-50 w-full [color-scheme:dark]"
              />
            </div>
            <button
              onClick={addTask}
              className="flex items-center gap-1.5 bg-lime-400 text-purple-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-[0_4px_0_0_rgba(101,120,20,1)] active:translate-y-[3px] active:shadow-[0_1px_0_0_rgba(101,120,20,1)] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={3} />
              GASKEUN
            </button>
          </div>
        </div>

        {/* list */}
        {grouped.length === 0 ? (
          <div className="text-center py-16 text-violet-400">
            <Sparkles className="w-9 h-9 mx-auto mb-3 text-violet-500" />
            <p className="text-sm">belum ada tugas... hidup lagi damai, nikmatin dulu</p>
          </div>
        ) : (
          grouped.map((g) => {
            const meta = PRIORITY_META[g.key];
            return (
              <div key={g.key} className="mb-6">
                <div className="flex items-center gap-2 mb-3 ml-1 text-xs font-mono uppercase tracking-widest text-violet-400">
                  <meta.Icon className={`w-3.5 h-3.5 ${meta.text}`} />
                  <span>{meta.label}</span>
                  <span className="bg-white/10 rounded-full px-2 py-0.5 text-[10px]">
                    {g.items.length}
                  </span>
                </div>
                {g.items.map((t) => {
                  const overdue = isOverdue(t);
                  return (
                    <div
                      key={t.id}
                      className={`relative flex items-start gap-3 bg-purple-900/40 rounded-xl px-4 py-3 mb-3 border-l-4 ${
                        meta.ring
                      } shadow-md shadow-black/20 ${t.done ? "opacity-40" : ""} ${
                        overdue ? "outline outline-1 outline-dashed outline-rose-400/60" : ""
                      }`}
                    >
                      <button
                        onClick={() => toggleDone(t.id)}
                        aria-label="tandai selesai"
                        className={`w-6 h-6 shrink-0 mt-0.5 rounded-full border-2 flex items-center justify-center cursor-pointer ${
                          meta.ring
                        } ${t.done ? meta.solid + " text-purple-950" : "text-transparent"}`}
                      >
                        {t.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold break-words ${t.done ? "line-through" : ""}`}>
                          {t.title}
                        </p>
                        {t.due && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-violet-400">
                            <Clock className="w-3 h-3" />
                            {overdue ? (
                              <span className="text-rose-400">TELAT — {fmtDue(t.due)}</span>
                            ) : (
                              <span>{fmtDue(t.due)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteTask(t.id)}
                        aria-label="hapus tugas"
                        className="text-violet-500 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
