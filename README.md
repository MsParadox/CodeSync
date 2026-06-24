<!-- ════════════════════════ HERO ════════════════════════ -->
<a name="top"></a>

<img width="100%" src="https://capsule-render.vercel.app/api?type=soft&color=0:0D9488,55:0F766E,100:F59E0B&height=190&section=header&text=CodeSync&fontSize=82&fontColor=ffffff&fontAlignY=52&desc=Code%20together%20%E2%80%A2%20Run%20anywhere%20%E2%80%A2%20Interview%20smarter&descSize=18&descAlignY=80&descColor=fde9c8" alt="CodeSync" />

<div align="center">

<a href="https://github.com/MsParadox/CodeSync">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=21&pause=900&color=F59E0B&center=true&vCenter=true&width=820&height=46&lines=Real-time+collaborative+code+editor;7+languages%2C+executed+in+a+hardened+sandbox;Pluggable+engine%3A+Docker+or+Judge0+%E2%80%94+one+env+var;Interview+mode+%2B+a+hidden-test+DSA+judge" alt="What CodeSync is" />
</a>

<br/>

<!-- Primary CTAs -->
<a href="https://code-sync-chi-lemon.vercel.app">
  <img src="https://img.shields.io/badge/▶_LIVE_DEMO-0D9488?style=for-the-badge&labelColor=0f172a&logo=vercel&logoColor=white" alt="Live demo" />
</a>
<a href="https://github.com/MsParadox/CodeSync">
  <img src="https://img.shields.io/badge/◆_SOURCE-F59E0B?style=for-the-badge&labelColor=0f172a&logo=github&logoColor=white" alt="Source" />
</a>
<a href="docs/ARCHITECTURE.md">
  <img src="https://img.shields.io/badge/✦_ARCHITECTURE-334155?style=for-the-badge&labelColor=0f172a&logoColor=white" alt="Architecture" />
</a>

<br/>

<!-- Status chips -->
![Languages](https://img.shields.io/badge/languages-7-F59E0B?style=flat-square&labelColor=0f172a)
![License](https://img.shields.io/badge/license-MIT-94A3B8?style=flat-square&labelColor=0f172a)
![PRs](https://img.shields.io/badge/PRs-welcome-14B8A6?style=flat-square&labelColor=0f172a)

<br/>

<!-- Tech strip -->
![React](https://img.shields.io/badge/React_18-0f172a?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite_5-0f172a?style=flat-square&logo=vite&logoColor=F59E0B)
![Node](https://img.shields.io/badge/Node_20-0f172a?style=flat-square&logo=nodedotjs&logoColor=10B981)
![Socket.IO](https://img.shields.io/badge/Socket.IO-0f172a?style=flat-square&logo=socketdotio&logoColor=white)
![Yjs](https://img.shields.io/badge/Yjs_CRDT-0f172a?style=flat-square&logoColor=white)
![Monaco](https://img.shields.io/badge/Monaco-0f172a?style=flat-square&logo=visualstudiocode&logoColor=0EA5E9)
![MongoDB](https://img.shields.io/badge/MongoDB-0f172a?style=flat-square&logo=mongodb&logoColor=47A248)
![Redis](https://img.shields.io/badge/Redis-0f172a?style=flat-square&logo=redis&logoColor=DC382D)
![Docker](https://img.shields.io/badge/Docker-0f172a?style=flat-square&logo=docker&logoColor=2496ED)
![Judge0](https://img.shields.io/badge/Judge0-0f172a?style=flat-square&logoColor=F59E0B)

</div>

> **CodeSync** is a production, real-time collaborative coding platform: many people
> edit one file at once with conflict-free CRDT sync, run code in **7 languages**,
> practice DSA against a hidden-test judge, and run **timed technical interviews**.
>
> 🔗 **Try it now → [code-sync-chi-lemon.vercel.app](https://code-sync-chi-lemon.vercel.app)**

---

## 🧭 Contents

<table>
<tr>
<td>

- [Demo](#-demo)
- [Why CodeSync](#-why-codesync)
- [Feature tour](#-feature-tour)
- [The dual execution engine](#-the-dual-execution-engine)
- [Architecture](#-architecture)
- [How real-time sync works](#-how-real-time-sync-works)

</td>
<td>

- [Security model](#-security-model)
- [Tech stack](#-tech-stack)
- [Quick start](#-quick-start)
- [Environment variables](#-environment-variables)
- [Deployment](#-deployment)

</td>
<td>

- [Testing](#-testing)
- [API reference](#-api-reference)
- [Socket events](#-socket-events)
- [Project structure](#-project-structure)
- [Author](#-author)

</td>
</tr>
</table>

---

## 🎬 Demo

<div align="center">

https://github.com/user-attachments/assets/3befd1f3-7509-4128-b358-cf5cc0a8f4f6

<sub><i>▶️ A 35-second walkthrough lives here once recorded — meanwhile, the real thing is one click away: <a href="https://code-sync-chi-lemon.vercel.app"><b>open the live app</b></a>.</i></sub>

</div>

---

## 🌟 Why CodeSync

Most "collab editor" apps break the moment two people type at once, or quietly
disable code execution in the cloud. CodeSync solves both:

| | |
|:--|:--|
| 🧠 **Conflict-free editing** | A server-authoritative **Yjs CRDT** per room — concurrent edits merge with zero conflicts, survive reconnects, and resync offline changes automatically. |
| ⚙️ **Execution that deploys anywhere** | A **pluggable engine** runs untrusted code in a hardened Docker sandbox *or* a remote Judge0 API — switchable with **one env var**, so the same code ships to a free PaaS *or* a self-hosted VM. |
| 🎯 **Built for real use** | Interview mode with hidden tests + timer, a LeetCode-style practice judge with streaks and a leaderboard, session replay, and role-based rooms. |
| 💸 **Card Free** | Vercel + Render + MongoDB Atlas + Upstash + keyless Judge0 — a public, full-featured deploy that needs **no credit card**. |

<div align="center">

| 🔗 Live | 🧩 Languages | 🔌 Engine | 🗄️ Data | ⚡ Realtime |
|:--:|:--:|:--:|:--:|:--:|
| [Vercel](https://code-sync-chi-lemon.vercel.app) | 7 | Docker · Judge0 | Mongo · Redis | Socket.IO + Yjs |

</div>

---

## 🚀 Feature tour

<table>
<tr>
<td valign="top" width="50%">

### 👥 Collaboration
- Real-time multi-cursor editing (Yjs CRDT)
- Live **cursors, selections & typing** indicators
- Per-room **chat**
- Presence with auto-expiring heartbeats
- **Roles:** owner · editor · viewer
- Public & private (password) rooms

</td>
<td valign="top" width="50%">

### ⚡ Code execution
- **7 languages:** JS · TS · Python · C++ · Java · Go · Rust
- `stdin` support + execution history & stats
- Per-run **sandbox**: no network, capped RAM/CPU/PIDs
- Pluggable engine — **Docker** or **Judge0**
- Live result broadcast to all participants

</td>
</tr>
<tr>
<td valign="top" width="50%">

### 🎯 Interview & practice
- **Interview mode:** problem + countdown + hidden tests
- Candidate submissions stored & reviewable
- **Practice judge:** Run (samples) / Submit (hidden tests)
- Verdicts: AC · WA · TLE · MLE · CE · RE
- Solved tracking + **daily streak**

</td>
<td valign="top" width="50%">

### 🧩 Platform
- **Leaderboard** (weighted: Easy×1 · Med×3 · Hard×5)
- **Session replay** — scrub a whole editing session
- **Learn** hub (DSA notes + Big-O)
- Profiles + dashboard (activity, language stats)
- Silent JWT refresh — sessions never drop mid-task

</td>
</tr>
</table>

---

## 🔌 The dual execution engine

> This is CodeSync's signature design. Running untrusted code is the **only**
> Docker/VM-bound part of the system — so it's isolated behind one env var,
> `EXEC_ENGINE`. Every caller uses the same `runCode()` contract and never knows
> which engine is live.

| | 🐳 `EXEC_ENGINE=docker` *(default)* | ☁️ `EXEC_ENGINE=judge0` |
|:--|:--|:--|
| **How it runs** | One throwaway, network-isolated container per run | A base64 HTTPS call to a Judge0 API |
| **Isolation** | Strongest — full OS sandbox | Off-box (no Docker socket exposed) |
| **Needs a Docker host?** | ✅ Yes | ❌ No |
| **Best for** | Local dev · self-hosted VM | **Card-free PaaS** (Vercel + Render) |

```mermaid
flowchart LR
    A["callers<br/>/api/execute · practice judge · interview judge"] --> D{"executionService.js<br/>reads EXEC_ENGINE"}
    D -->|docker| E["runCodeDocker()<br/>dockerode → sandbox container"]
    D -->|judge0| J["judge0Service.js<br/>fetch → ce.judge0.com"]
    E --> R["unified result<br/>stdout · stderr · status · time"]
    J --> R
```

<details>
<summary><b>The shared contract & language matrix</b></summary>

<br/>

```ts
runCode({ language, code, stdin = '' }) → {
  stdout, stderr, exitCode, executionTimeMs,
  status   // success | error | timeout | oom | compile_error | runtime_error
}
```

| Language | Docker image | Judge0 ID |
|:--|:--|:--:|
| JavaScript | `node:20-alpine` | 63 |
| TypeScript | `codesync-ts` (built) | 74 |
| Python | `python:3.12-alpine` | 71 |
| C++ | `gcc:13` | 54 |
| Java | `eclipse-temurin:21-jdk` | 62 |
| Go | `golang:1.22-alpine` | 60 |
| Rust | `rust:1.78-slim` | 73 |

</details>

---

## 🧱 Architecture

```mermaid
flowchart TB
    subgraph C["🖥️ Client · React + Vite"]
        MON["Monaco Editor"] <--> YJS["Yjs CRDT"]
        RDX["Redux Toolkit"]
    end

    subgraph S["⚙️ Server · Express + Socket.IO"]
        REST["REST API<br/>auth · rooms · execute · problems · users"]
        WS["Socket handlers<br/>room · yjs · cursor"]
        DOC["In-process Y.Doc<br/>server authority"]
        WS --> DOC
    end

    subgraph X["💾 State & Execution"]
        M[("MongoDB Atlas")]
        RE[("Upstash Redis")]
        ENG{{"EXEC_ENGINE"}}
        DK["🐳 Docker sandbox"]
        J0["☁️ Judge0 API"]
        ENG -->|docker| DK
        ENG -->|judge0| J0
    end

    YJS -.->|"WSS · binary updates"| WS
    RDX -.->|"HTTPS · JWT"| REST
    REST --> ENG
    S --> M
    S --> RE
```

> **MongoDB collections:** `User` · `Room` · `Problem` · `Snapshot` · `Execution` ·
> `SessionEvent` (30-day TTL) · `Submission` (90-day TTL).
> **Redis:** presence sets, heartbeats (90 s TTL), cursors, and the Socket.IO
> pub/sub adapter for horizontal scaling.

📖 Deep dive: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## 🔄 How real-time sync works

```mermaid
sequenceDiagram
    participant A as User A
    participant S as Server (Y.Doc)
    participant B as User B
    A->>A: type → Yjs binary update
    A->>S: emit yjs-update (base64)
    Note over S: assertCanEdit · throttle 50/s<br/>Y.applyUpdate(serverDoc)
    S-->>B: broadcast yjs-update
    B->>B: Y.applyUpdate → Monaco patches, no flicker
    Note over A,B: a new joiner gets the full encoded state — zero round-trips
```

---

## 🛡️ Security model

The Docker engine hardens every run in **five layers**:

| Layer | Control |
|:--|:--|
| 🌐 **Network** | `NetworkMode: none` — no outbound connections |
| 📊 **Resources** | 256 MB RAM (swap off) · 50% CPU · `PidsLimit: 64` (fork-bomb safe) |
| 📁 **Filesystem** | source via in-memory `putArchive` · writable only on tmpfs `/tmp` (noexec) + `/build` (exec) · container removed after run |
| 🔒 **Privilege** | non-root `uid 1000` · `no-new-privileges` |
| ⏱️ **Application** | 10 s wall-clock TLE · stdout 1 MB / stderr 256 KB caps · 100 KB code limit |

Plus, platform-wide: **JWT** access (15 m) + refresh (7 d), **bcrypt** hashing,
**Helmet**, strict **CORS**, and rate limits on API / auth / execution / room creation.

> [!TIP]
> The Judge0 engine sidesteps the one known Docker trade-off (the mounted
> `docker.sock`) entirely by running code off-box — which is exactly what makes the
> card-free cloud deploy safe and simple.

---

## 🧰 Tech stack

**Frontend** — React 18 · Vite 5 · Redux Toolkit · React Router 6 · Monaco Editor ·
Yjs + y-monaco · Socket.IO-client · TailwindCSS · Axios

**Backend** — Node 20 (ESM) · Express 4 · Socket.IO 4 + Redis adapter · Mongoose 8 ·
ioredis · dockerode · jsonwebtoken · bcryptjs · zod · winston

**Data & infra** — MongoDB Atlas · Upstash Redis · Docker · Judge0 ·
Vercel · Render · nginx (VM route) · Let's Encrypt

**Testing** — Jest · Supertest · mongodb-memory-server

---

## ⚡ Quick start

> **Prerequisites:** Node 20+, and Docker (only needed for the local Docker
> execution engine). Mongo + Redis can be local or free cloud (Atlas + Upstash).

### Option A — Docker Compose (everything at once)

```bash
git clone https://github.com/MsParadox/CodeSync.git
cd CodeSync
docker compose up -d
# Frontend (via nginx) → http://localhost      Backend → http://localhost:4000
```

### Option B — manual (two terminals)

```bash
# Terminal 1 — backend
cd server && cp .env.example .env      # fill MONGODB_URI, REDIS_URL, secrets
npm install && npm run dev             # → http://localhost:4000

# Terminal 2 — frontend
cd client && cp .env.example .env      # see the env note below
npm install && npm run dev             # → http://localhost:5173
```

> **Two gotchas that only bite in production — already handled, don't undo them:**
> - `VITE_API_URL` **must end in `/api`** (routes are mounted under `/api`);
>   `VITE_SOCKET_URL` **must not** (Socket.IO connects to the origin).
> - SPA deep links rely on **`client/vercel.json`** (rewrite all → `index.html`),
>   so refreshing `/problems` doesn't 404 on Vercel.

---

## 🔑 Environment variables

<details>
<summary><b>server/.env</b></summary>

```ini
NODE_ENV=development
PORT=4000                       # Render injects this in prod — don't hardcode there
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/codesync
REDIS_URL=rediss://default:pass@host.upstash.io:6380   # rediss:// (TLS)
JWT_SECRET=<openssl rand -hex 32>
REFRESH_TOKEN_SECRET=<openssl rand -hex 32>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173            # the browser origin (CORS)

# Execution engine
EXEC_ENGINE=docker                          # docker | judge0
JUDGE0_API_URL=https://ce.judge0.com        # used when EXEC_ENGINE=judge0
EXECUTION_TIMEOUT_MS=10000
EXEC_MEMORY_MB=256
```

</details>

<details>
<summary><b>client/.env</b></summary>

```ini
VITE_API_URL=http://localhost:4000/api      # MUST end in /api
VITE_SOCKET_URL=http://localhost:4000       # origin, NO /api
```

</details>

---

## 🌐 Deployment

CodeSync ships **two first-class routes** from the same codebase:

| Route | Engine | Hosts | Card? | Guide |
|:--|:--:|:--|:--:|:--|
| ☁️ **Card-free PaaS** | `judge0` | Vercel + Render + Atlas + Upstash + Judge0 | ❌ none | **[DEPLOY_JUDGE0.md](docs/DEPLOY_JUDGE0.md)** |
| 🐳 **Self-hosted VM** | `docker` | Droplet + docker-compose + nginx + Let's Encrypt | 💳 Student Pack | **[PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)** |

> The live demo runs the **card-free PaaS** route → [code-sync-chi-lemon.vercel.app](https://code-sync-chi-lemon.vercel.app)

---

## 🧪 Testing

```bash
cd server && npm test     # Jest + Supertest, in-memory MongoDB (no external DB)
```

Suites cover **auth** (register/login/refresh), **rooms** (CRUD/join/archive),
**sockets** (join/leave/chat/cursor/yjs), and **execution** across all 7 languages.

---

## 📡 API reference

<details>
<summary><b>Auth</b> · <code>/api/auth</code></summary>

| Method | Endpoint | Description |
|:--|:--|:--|
| POST | `/register` | Create account → access + refresh tokens |
| POST | `/login` | Email/password → tokens |
| GET | `/me` | Current user |
| POST | `/refresh` | Exchange refresh token |
| POST | `/logout` | Stateless logout |

</details>

<details>
<summary><b>Rooms</b> · <code>/api/rooms</code></summary>

| Method | Endpoint | Description |
|:--|:--|:--|
| GET | `/` · `/my/rooms` | List public / owned rooms |
| POST | `/` | Create room |
| GET·PUT·DELETE | `/:roomId` | Read / update / archive |
| GET·POST·DELETE | `/:roomId/members…` | Manage roster & roles |
| GET | `/:roomId/snapshots` · `/replay` | History & session replay |
| GET·PUT | `/:roomId/testcases` | Hidden tests (owner only) |
| POST | `/:roomId/submit` | Run against hidden tests |
| GET | `/:roomId/submissions` | Interview submissions |

</details>

<details>
<summary><b>Execute & Problems</b> · <code>/api/execute</code> · <code>/api/problems</code></summary>

| Method | Endpoint | Description |
|:--|:--|:--|
| POST | `/api/execute` | Run code in the active engine |
| GET | `/api/execute/history` · `/stats` | Run history & aggregates |
| GET | `/api/problems` · `/:slug` | List / read problems |
| POST | `/api/problems/:slug/run` · `/submit` | Samples / hidden-test judge |
| GET | `/api/problems/meta/leaderboard` | Weighted leaderboard |

</details>

---

## 🔌 Socket events

<details>
<summary><b>Client → Server</b></summary>

`join-room` · `leave-room` · `yjs-update` · `yjs-awareness` · `request-sync` ·
`cursor-update` · `selection-update` · `typing-start` / `typing-stop` ·
`chat-message` · `language-change` · `set-interview-mode` · `interview-submit` ·
`heartbeat`

</details>

<details>
<summary><b>Server → Client</b></summary>

`room-joined` · `user-joined` / `user-left` · `participant-list` · `yjs-update` ·
`yjs-sync` · `yjs-awareness` · `cursor-update` · `selection-update` ·
`user-typing` / `user-stopped-typing` · `chat-message` · `language-changed` ·
`interview-mode-changed` · `interview-submitted` · `execution-started` /
`execution-result` · `your-role-changed`

</details>

---

## 📁 Project structure

```text
CodeSync/
├── client/                       # React + Vite SPA
│   └── src/
│       ├── components/{Editor,Room}/   # Monaco, panels, modals
│       ├── hooks/                # useYjs · useSocket
│       ├── pages/                # Home · Room · Problems · Leaderboard · Learn · …
│       ├── store/                # Redux slices (auth · room · problems)
│       ├── services/api.js       # Axios + JWT refresh
│       └── data/learn.js         # Learn hub content
│
├── server/                       # Node + Express + Socket.IO
│   └── src/
│       ├── routes/               # auth · rooms · execute · users · problems
│       ├── socket/               # room · yjs · cursor handlers + auth
│       ├── services/             # executionService · judge0Service · snapshotService
│       ├── models/               # User · Room · Problem · Snapshot · Submission · …
│       ├── seed/problems.js      # idempotent practice-problem seed
│       └── utils/judge.js        # engine-agnostic judge
│
├── docs/                         # ARCHITECTURE · DEPLOY_JUDGE0 · PRODUCTION_DEPLOYMENT
├── docker-compose.yml            # local stack
└── docker-compose.prod.yml       # VM stack (nginx + TLS)
```

---

## 👤 Author

<div align="center">

**Mohit Sharma** — Full-Stack Developer · Competitive Programmer

[![Live](https://img.shields.io/badge/▶_Live_Demo-0D9488?style=for-the-badge&labelColor=0f172a&logo=vercel&logoColor=white)](https://code-sync-chi-lemon.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-MsParadox-0f172a?style=for-the-badge&logo=github&logoColor=white)](https://github.com/MsParadox)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white&labelColor=0f172a)](https://www.linkedin.com/in/mohit-sharma-27a6532b6/)
[![Email](https://img.shields.io/badge/Email-Reach_out-F59E0B?style=for-the-badge&logo=gmail&logoColor=white&labelColor=0f172a)](mailto:mohitsharma782828372@gmail.com)

<sub>If CodeSync helped or impressed you, consider leaving a ⭐ — it genuinely helps.</sub>

</div>

<img width="100%" src="https://capsule-render.vercel.app/api?type=soft&color=0:F59E0B,50:0F766E,100:0D9488&height=110&section=footer&text=Built%20with%20care%20by%20Mohit%20Sharma&fontSize=16&fontColor=ffffff&fontAlignY=70&desc=MIT%20Licensed&descSize=12&descAlignY=92&descColor=fde9c8" alt="footer" />

<div align="center"><a href="#top">⬆ Back to top</a></div>
