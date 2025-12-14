# ⚡ Slack Jenkins Control Bot

Bot Slack untuk mengontrol service (**start / stop / restart**) melalui Jenkins Pipeline.  
Menggunakan **Slack Socket Mode**, **Jenkins REST API**, dan **permission berbasis database MySQL**.

⚠️ Bot ini menerapkan **global session lock**  
→ hanya **1 sesi aktif** di seluruh Slack workspace dalam satu waktu.

---

## 📁 Struktur Folder

```text
src/
│
├── app/                    # Modul utama Slack bot
│ ├── handlers.js           # Event & interaction handler (global session)
│ ├── keyboards.js          # Slack Block Kit UI builder
│ ├── main.js               # Slack App entrypoint (Socket Mode)
│ └── workers.js            # Background worker (session expiry)
│
├── core/                   # Fondasi aplikasi
│ ├── config.js             # Loader environment variables
│ └── logger.js             #  Winston logger (CLI + file)
│
├── db/
│ └── db.js                 # MySQL pool + connection test
│
├── permissions/            # Permission berbasis database
│ ├── permissions.js        # Cache + validator permission
│ └── permissionsRepo.js    # Query SQL ke tabel permission
│
└── services/
  └── api.js                # Wrapper Slack API & Jenkins API
```

---

## 🔄 Alur Kerja Bot

1. User mention bot (`@bot`) di channel
2. Bot cek:
   - Channel diizinkan
   - User adalah **allowed_mentioner**
   - Tidak ada session global aktif
3. Bot membuka menu service
4. User memilih service → bot cek status ke Jenkins
5. User memilih action (start / stop / restart)
6. Bot meminta **approval (YES / NO)**
7. Jenkins dijalankan
8. Progress + hasil dikirim ke Slack
9. Session otomatis dibersihkan

---

## 🔐 Permission System (MySQL)

### 📊 Tabel Permission

| Tabel | Deskripsi |
|---|---|
| channel_ids | Channel yang diizinkan |
| allowed_mentioners | User yang boleh mention bot |
| allowed_users | User yang boleh menjalankan action |
| approval_users | User yang boleh approve YES / NO |

> Semua tabel mendukung **soft delete** (`deleted_at`)

---

### 🔑 Role Flow

```text
Mention Bot
↓
allowed_mentioners
↓
allowed_users (pilih service & action)
↓
approval_users (YES / NO)
↓
Jenkins Execution
```

---

## 🗄 Database Requirement

```text
MySQL **WAJIB** aktif.

Saat bot start, koneksi akan diuji:
📡 Database connected successfully

Jika gagal:
❌ Database connection failed
```

---

## ⚙️ Environment Variables

```env
# SLACK
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=

# JENKINS
JENKINS_URL=
JENKINS_USER=
JENKINS_TOKEN=

# MYSQL
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_PORT=3306
DB_NAME=

# LOGGING
LOG_DIR=logs
LOG_LEVEL=info
TZ=Asia/Jakarta

# BOT
SESSION_EXPIRE_SECONDS=45
```

---

## ⏱ Session Management

- **Satu sesi global**
- Timeout otomatis (default: 45 detik)
- Worker mengecek expiry setiap 5 detik
- Session bisa dihentikan dengan tombol **Exit**

---

## 📜 Logging

```text
Log tersimpan di:
logs/botlog-YYYY-MM-DD.log

Format CLI:
[INFO] 2025-11-27 10:03:24 Slack updateMessage sukses

Semua aksi Jenkins memiliki **trace_id** untuk audit trail.
```

---

## 🧩 Arsitektur Singkat

```text
Slack Event
↓
main.js
↓
handlers.js (session + permission)
↓
permissions (MySQL)
↓
keyboards (UI)
↓
api.js (Slack & Jenkins)
```

---

## ▶️ Menjalankan Bot

```bash
npm install
cp .env.example .env
npm start
```

---

## ⚠️ Catatan Penting

- Bot **tidak mendukung multi-session**
- Approval user **berbeda** dengan executor
- Semua permission **diambil dari DB**