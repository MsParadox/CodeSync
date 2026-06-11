<div align="center">

<h1>⚡ CodeSync</h1>
<h3>Real-Time Collaborative Code Editor</h3>

<p><i>Code together. Ship faster. Interview smarter.</i></p>

<p>
  <a href="#"><img src="https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Version-2.0.0-blue?style=flat-square" /></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Infrastructure-$0%2Fmonth-brightgreen?style=flat-square" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.io-4.7-010101?style=flat-square&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Yjs-CRDT-7C3AED?style=flat-square" />
  <img src="https://img.shields.io/badge/Monaco-Editor-0066B8?style=flat-square&logo=visualstudiocode&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Sandbox-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-Pub%2FSub-DC382D?style=flat-square&logo=redis&logoColor=white" />
</p>

<p>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Frontend-Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />
  <img src="https://img.shields.io/badge/Backend-Render.com-46E3B7?style=flat-square&logo=render&logoColor=white" />
  <img src="https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" />
</p>

<p>
  A production-ready collaborative code editor with <b>live execution in 7 languages</b>, <b>Yjs CRDT conflict-free sync</b>, <b>remote cursors</b>, <b>built-in chat</b>, and an <b>Interview Mode</b> — running entirely on free-tier infrastructure.
</p>

<p>
  <a href="#-quick-start">Get Started</a> ·
  <a href="#-api-reference">API Docs</a> ·
  <a href="#-socket-events">Socket Events</a> ·
  <a href="#-deployment">Deploy Guide</a>
</p>

<!-- TODO: Add live demo URL once deployed -->
<!-- <a href="#">🔗 Live Demo</a> -->

</div>

---

## ✨ Features

| Feature | Details |
|---------|---------|
| ⚡ **Real-Time Collaboration** | Yjs CRDT — conflict-free concurrent edits, unlimited users, zero merge conflicts |
| 🚀 **Live Code Execution** | Docker sandboxes: JS, TS, Python, C++17, Java 21, Go, Rust — 10s timeout, 128 MB RAM |
| 🖱️ **Remote Cursors** | Color-coded live cursor positions and selections per user |
| 💬 **Built-In Chat** | Per-room scoped chat with emoji picker and auto-scroll |
| 🎯 **Interview Mode** | Problem statement panel + countdown timer for technical interviews |
| 💾 **Auto Snapshots** | Yjs state persisted to MongoDB every 60 s; last 20 snapshots retained |
| 🔄 **Silent JWT Refresh** | Access tokens refreshed transparently — sessions never expire mid-session |
| 🛡️ **Rate Limiting** | Redis-backed per-user execution limits (10 runs/min) |
| 📝 **Monaco Editor** | Cyberpunk neon-dark theme, ligatures, bracket-pair colorization, multi-cursor |
| 📊 **Profile & Stats** | Language usage charts, execution history, 7-day activity bar |
| 🔎 **Room Browser** | Search and filter public rooms by language or keyword |
| 📡 **Horizontal Scaling** | Socket.io Redis Adapter — scale to N Node.js instances without sticky sessions |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Vite React SPA)                                            │
│  React · Redux Toolkit · Monaco Editor · Yjs · Socket.io-client      │
│  useYjs() hook — CRDT delta encode/decode                            │
│  useSocket() hook — room join/leave, cursor, chat, execution         │
└───────────────────────┬──────────────────────────────────────────────┘
                        │ HTTPS / WSS
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Nginx  (reverse proxy · SSL termination · static asset serving)     │
└──────────┬─────────────────────────────────────────┬─────────────────┘
           │ /api/*  /socket.io/*                    │ /* (SPA)
           ▼                                         │
┌──────────────────────┐                             │
│  Node.js / Express   │◄── MongoDB Atlas (M0 free)  │
│  + Socket.io         │◄── Upstash Redis  (free)    │
│  + Yjs Y.Doc server  │                             │
└──────────┬───────────┘                             │
           │ docker.sock                             ▼
           ▼                          ┌──────────────────────────────┐
┌──────────────────────┐              │  Vercel / Netlify (free)     │
│  Docker Sandbox      │              │  or Nginx static serving     │
│  (code execution)    │              └──────────────────────────────┘
└──────────────────────┘

Redis Pub/Sub: all Socket.io events broadcast across all Node instances
Yjs CRDT sync: user types → delta update → server applies to Y.Doc
              → broadcasts to all other clients → identical state everywhere
```

### CRDT Sync Flow

```
User A types
    → Yjs encodes delta (binary Uint8Array → base64)
    → Socket.io emits  yjs-update  to server
    → Server applies update to in-memory Y.Doc (origin='remote')
    → Server broadcasts to all OTHER room clients
    → Each client applies delta with try/catch
    → All editors converge to identical state
    → Per-room throttle: max 50 updates/sec
```

---

## 🔒 Security Model

### Code Execution Sandbox

Each run spawns a **brand-new Docker container** with the following hard limits:

| Constraint | Value | Why |
|------------|-------|-----|
| Network | `none` | Zero internet access — prevents exfiltration |
| RAM | 128 MB hard cap | OOM-killed if exceeded |
| CPU | 50% of 1 core | Fair usage, no starvation |
| Filesystem | Read-only root + 64 MB tmpfs | Compiled binaries only |
| User | Non-root (UID 1000) | No privilege escalation |
| Processes | Max 64 (`--pids-limit`) | Fork-bomb prevention |
| Timeout | 10 seconds (SIGKILL) | Infinite-loop prevention |
| Cleanup | `AutoRemove: true` | Container deleted immediately |
| Concurrency | Max 20 simultaneous | Server resource protection |

### API Security

- JWT access tokens (24h) + refresh tokens (7d)
- bcrypt password hashing (cost factor 12)
- Rate limiting per IP (Express) + Redis per-user execution limits (10/min)
- Helmet.js security headers
- CORS whitelist
- Zod input validation

---

## 🛠️ Tech Stack

### Frontend

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite |
| State | Redux Toolkit (slices) |
| Editor | Monaco Editor (VS Code engine) |
| Collaboration | Yjs CRDT (`useYjs` custom hook) |
| Realtime | Socket.io-client (`useSocket` custom hook) |
| Styling | TailwindCSS (cyberpunk neon-dark theme) |

### Backend

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 (ESM) |
| Framework | Express.js |
| Realtime | Socket.io 4 + Redis Adapter |
| Collaboration | Yjs (server-side Y.Doc) |
| Code Execution | Dockerode (7 language images) |
| Database | MongoDB + Mongoose |
| Cache / Pub-Sub | Redis (Upstash) via ioredis |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Zod |
| Logging | Winston |
| Testing | Jest + Supertest + mongodb-memory-server |

### Infrastructure (All Free)

| Service | Provider | Free Tier |
|---------|----------|-----------|
| MongoDB | Atlas M0 | 512 MB |
| Redis | Upstash | 10k commands/day |
| Backend | Render.com | 750 hrs/month |
| Frontend | Vercel | Unlimited |
| CI/CD | GitHub Actions | 2,000 min/month |
| Container Registry | GHCR | Free (public) |
| SSL | Let's Encrypt | Free |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

### 1. Clone

```bash
git clone https://github.com/MsParadox/codesync.git
cd codesync
```

### 2. Start with Docker Compose (recommended)

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Frontend (via Nginx) | http://localhost |
| Frontend (Vite direct) | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |

### 3. Manual Setup (without Docker)

```bash
# Terminal 1 — Backend
cd server
cp .env.example .env      # Set MONGODB_URI and REDIS_URL
npm install
npm run dev               # → http://localhost:4000

# Terminal 2 — Frontend
cd client
cp .env.example .env
npm install
npm run dev               # → http://localhost:5173
```

---

## 🧪 Running Tests

```bash
cd server
npm test
```

The test suite uses **in-memory MongoDB** (no external DB required) and covers:

| Suite | What's Tested |
|-------|--------------|
| `auth.test.js` | Register, login, token refresh, logout, protected route access |
| `room.test.js` | Room CRUD: create, list, join, archive |
| `socket.test.js` | join-room, leave-room, chat-message, cursor-update, yjs-update |
| `execution.test.js` | Code execution across all 7 languages, timeout handling, invalid input |

---

## 📡 API Reference

<details>
<summary><b>Auth</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get JWT tokens |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/refresh` | Refresh access token |

</details>

<details>
<summary><b>Rooms</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rooms` | List public rooms (filter by language/keyword) |
| `POST` | `/api/rooms` | Create room (optional password) |
| `GET` | `/api/rooms/:id` | Get room details |
| `PUT` | `/api/rooms/:id` | Update room (owner only) |
| `DELETE` | `/api/rooms/:id` | Archive room (owner only) |
| `GET` | `/api/rooms/:id/snapshots` | Snapshot history (last 20) |

</details>

<details>
<summary><b>Code Execution</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/execute` | Run code in Docker sandbox |
| `GET` | `/api/execute/history` | User execution history |
| `GET` | `/api/execute/stats` | Active containers + aggregate stats |

**Execute request body:**
```json
{
  "language": "python",
  "code": "print('hello')",
  "stdin": ""
}
```

**Supported languages:** `javascript` · `typescript` · `python` · `cpp` · `java` · `go` · `rust`

</details>

---

## 🔌 Socket Events

<details>
<summary><b>Client → Server</b></summary>

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomId, password? }` | Join a room |
| `leave-room` | `{ roomId }` | Leave a room |
| `yjs-update` | `{ roomId, update }` | Send Yjs delta (base64) |
| `yjs-awareness` | `{ roomId, awarenessUpdate }` | Sync awareness state |
| `request-sync` | `{ roomId }` | Request full Yjs state on reconnect |
| `chat-message` | `{ roomId, text }` | Send chat message |
| `cursor-update` | `{ roomId, line, column }` | Broadcast cursor position |
| `language-change` | `{ roomId, language }` | Change room language |
| `set-interview-mode` | `{ roomId, enabled, problemStatement }` | Toggle interview mode |

</details>

<details>
<summary><b>Server → Client</b></summary>

| Event | Payload | Description |
|-------|---------|-------------|
| `room-joined` | `{ roomId, language, yjsState, color, … }` | Successful join |
| `yjs-sync` | `{ roomId, state }` | Full Yjs state (base64) on request-sync |
| `participant-list` | `[{ userId, username, avatar, color }]` | Current participants |
| `user-joined` / `user-left` | `{ userId, username }` | Participant changes |
| `yjs-update` | `{ update, userId }` | Remote Yjs delta |
| `yjs-awareness` | `{ awarenessUpdate, userId }` | Remote awareness update |
| `cursor-update` | `{ userId, username, color, line, column }` | Remote cursor |
| `chat-message` | `{ userId, username, text, timestamp }` | Incoming chat |
| `language-changed` | `{ language, changedBy }` | Language changed |
| `interview-mode-changed` | `{ enabled, problemStatement }` | Interview mode toggled |

</details>

---

## 📁 Project Structure

```
codesync/
├── client/                         # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── Editor/             # MonacoEditor · EditorToolbar · LanguageSelector
│       │   └── Room/               # ChatPanel · ParticipantPanel · OutputPanel · InterviewPanel
│       ├── hooks/
│       │   ├── useYjs.js           # Yjs CRDT encode/decode + awareness
│       │   └── useSocket.js        # Socket.io connection + all event handlers
│       ├── pages/                  # Home · Room · Login · Register · Profile
│       ├── store/                  # Redux slices
│       └── services/               # Axios API client
│
├── server/                         # Node.js backend
│   └── src/
│       ├── config/                 # MongoDB · Redis connections
│       ├── models/                 # User · Room · Snapshot
│       ├── routes/                 # auth · rooms · execute · users
│       ├── socket/                 # roomHandlers · yjsHandlers · cursorHandlers
│       ├── services/               # executionService · snapshotService
│       ├── middleware/             # auth · rateLimit · error
│       └── __tests__/              # Jest test suites
│
├── nginx/                          # dev + prod configs
├── docker/                         # per-language Dockerfiles
├── docker-compose.yml
└── .github/workflows/ci-cd.yml     # CI/CD pipeline
```

---

## ☁️ Free Deployment

### Step 1 — MongoDB Atlas

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → Create M0 free cluster
2. Add DB user → copy connection string → whitelist `0.0.0.0/0`

### Step 2 — Upstash Redis

1. [upstash.com](https://upstash.com) → Create database → select Global → copy `REDIS_URL`

### Step 3 — Backend (Render.com)

1. New Web Service → connect GitHub → root dir: `server`
2. Build: `npm install` · Start: `node server.js`
3. Set env vars from `server/.env.example`

### Step 4 — Frontend (Vercel)

```bash
cd client && vercel --prod
# VITE_API_URL=https://your-app.onrender.com/api
# VITE_SOCKET_URL=https://your-app.onrender.com
```

### Step 5 — CI/CD

Push to `main` → GitHub Actions runs tests → builds Docker images → pushes to GHCR → triggers Render deploy hook → deploys Vercel frontend. **Fully automated.**

Required secrets: `MONGODB_URI` · `REDIS_URL` · `JWT_SECRET` · `REFRESH_TOKEN_SECRET` · `CLIENT_URL` · `VITE_API_URL` · `VITE_SOCKET_URL` · `RENDER_DEPLOY_HOOK` · `VERCEL_TOKEN`

---

## 🤝 Contributing

```bash
git checkout -b feat/your-feature
# make changes
git commit -m "feat: describe your change"
git push origin feat/your-feature
# open a Pull Request
```

Please follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## 👨‍💻 Author

**Mohit Sharma** — Full-Stack Developer · React · Node.js · Systems Design

[![GitHub](https://img.shields.io/badge/GitHub-MsParadox-181717?style=flat-square&logo=github)](https://github.com/MsParadox)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-mohit--sharma-0A66C2?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/mohit-sharma-27a6532b6)

---

<div align="center">
  <b>Built with ⚡ React · Node.js · Socket.io · Yjs · Monaco · Docker · Redis</b>
</div>
