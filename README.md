# 📋 BERESIN — Fullstack To-Do List Premium

**BERESIN** adalah aplikasi pengelolaan tugas harian (*To-Do List*) berbasis fullstack yang dirancang dengan antarmuka modern, interaktif, dan performa tinggi. Aplikasi ini memisahkan area *client* (React + Vite) dengan *server* (Express API) dan mendukung kontainerisasi penuh menggunakan **Docker & Docker Compose** untuk memudahkan peluncuran (*launch*) maupun penyebaran (*deployment*).

---

## 🌟 Fitur Utama

### 1. 🚀 Arsitektur Fullstack Modern
* **Frontend**: React.js didevelop dengan **Vite** untuk build super cepat, dipadukan dengan **TailwindCSS** untuk desain visual premium berbasis *dark mode* serta ikon dinamis dari **Lucide React**.
* **Backend**: Express.js REST API yang menangani seluruh operasi CRUD (Create, Read, Update, Delete) tugas secara real-time.
* **Penyimpanan**: Sistem penyimpanan lokal berbasis file `tasks.json` di backend, memudahkan portabilitas tanpa ketergantungan database berat pada tahap awal.

### 2. 🔔 Nagging & Dynamic Alert System (Sistem Pengingat Interaktif)
Aplikasi ini dilengkapi pengingat otomatis berbahasa kasual/lokal yang berubah setiap **5 detik** berdasarkan status tugas Anda:
* **Overdue Nag**: Memberikan dorongan humoris/tegas jika ada tugas penting yang telah melewati batas tenggat waktu.
* **Urgent Today Alert**: Memberikan sorotan khusus bagi tugas berkategori **Genting** yang batas waktunya hari ini.
* **Clear State**: Memberikan apresiasi atau saran santai jika semua tugas berada dalam kondisi aman.

### 3. 🚦 Deteksi Status Koneksi (Offline Banner)
Dilengkapi pemantauan otomatis (*auto-polling* setiap 15 detik) untuk mendeteksi status server backend. Jika koneksi terputus, banner **"Offline Mode"** akan langsung muncul di UI untuk memberitahukan pengguna secara elegan.

### 4. 🏷️ Manajemen Prioritas dengan Visual Khas
Setiap tugas dikelompokkan ke dalam 3 tingkat prioritas dengan skema desain visualnya masing-masing:
* 🔥 **GENTING BANGET**: Dengan aksen warna Rose/Red menyala.
* ⚡ **PRIORITAS**: Dengan aksen warna Sky Blue.
* 🌙 **SANTUY DULU**: Dengan aksen warna Lime Green yang tenang.

---

## 🛠️ Tech Stack

* **Frontend**: React (v18), Vite, TailwindCSS, PostCSS, Autoprefixer, Lucide React
* **Backend**: Node.js, Express.js, CORS
* **Containerization**: Docker, Docker Compose, Nginx (sebagai web server statis frontend dalam kontainer produksi)

---

## 📁 Struktur Proyek

```text
beresin-fullstack/
├── backend/
│   ├── Dockerfile             # Konfigurasi container backend
│   ├── package.json           # Dependensi Express API
│   ├── server.js              # Entrypoint server backend
│   └── tasks.json             # Penyimpanan data tugas (JSON Database)
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Logika UI & Komunikasi API utama
│   │   ├── index.css          # Styling Tailwind global
│   │   └── main.jsx           # Entrypoint React
│   ├── Dockerfile             # Multi-stage Dockerfile (Build -> Nginx Production)
│   ├── package.json           # Dependensi React & Vite
│   ├── vite.config.js         # Konfigurasi server Vite
│   ├── tailwind.config.js     # Kustomisasi utility class Tailwind
│   └── postcss.config.js      # PostCSS configuration
├── docker-compose.yml         # Konfigurasi orkestrasi container lokal
└── README.md                  # Dokumentasi aplikasi
```

---