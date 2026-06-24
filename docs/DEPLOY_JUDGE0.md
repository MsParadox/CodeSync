<a name="top"></a>

<div align="center">

# 💳🚫 CodeSync — Card‑Free Production Deployment

**Judge0 + Render + Vercel · a live, fully‑featured CodeSync**

<br/>

![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=white)
![Atlas](https://img.shields.io/badge/DB-MongoDB_Atlas_M0-47A248?logo=mongodb&logoColor=white)
![Upstash](https://img.shields.io/badge/Cache-Upstash_Redis-00E9A3?logo=upstash&logoColor=white)
![Judge0](https://img.shields.io/badge/Exec-Judge0_keyless-FF6B00)
![Card](https://img.shields.io/badge/Credit_card-not_required-success)

<br/>

📚 **Docs:** [Architecture](ARCHITECTURE.md) · **Card‑free Deploy** · [VM Deploy](PRODUCTION_DEPLOYMENT.md)

</div>

The **real, no‑credit‑card** path to a live, fully‑featured CodeSync — including
multi‑language code execution. No Docker host, no VM, no card
anywhere. Code execution runs on the **Judge0** API instead of a local Docker
sandbox (`EXEC_ENGINE=judge0`).


> Doing the Docker/VM deployment later? That's covered separately in
> [`PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md). This guide is the
> card‑free PaaS route.

---

## 📑 Stages at a glance

| # | Stage | What you do |
|:-:|:------|:------------|
| 0 | [Push to GitHub](#stage-0--push-the-code-to-github) | Repo + `.gitignore` safety check |
| 1 | [MongoDB Atlas](#stage-1--mongodb-atlas-m0-free-no-card) | M0 database |
| 2 | [Upstash Redis](#stage-2--upstash-redis-free-no-card) | Free TLS Redis |
| 3 | [Auth secrets](#stage-3--generate-auth-secrets) | `openssl rand -hex 32` ×2 |
| 4 | [Judge0](#stage-4--judge0-execution) | Keyless execution engine |
| 5 | [Backend → Render](#stage-5--deploy-the-backend-on-render) | Express + Socket.IO |
| 6 | [Frontend → Vercel](#stage-6--deploy-the-frontend-on-vercel) | Vite SPA |
| 7 | [Connect (CORS)](#stage-7--connect-the-two-cors) | `CLIENT_URL` wiring |
| 8 | [Keep‑alive](#stage-8--keep-the-backend-awake-optional-but-recommended) | Beat the cold start |
| 9 | [Verify](#stage-9--verify-every-feature) | Exercise every feature |

---

## 🗺️ How the pieces map (all free, all card‑free)

```mermaid
flowchart LR
    U["🌐 Browser"] -->|HTTPS| V["▲ Vercel<br/>static SPA"]
    V -->|"VITE_API_URL → /api<br/>VITE_SOCKET_URL → origin"| R["Render<br/>Node API + Socket.IO"]
    R --> A[("MongoDB Atlas M0<br/>data")]
    R --> UP[("Upstash Redis<br/>presence · pub/sub")]
    R -->|"EXEC_ENGINE=judge0"| J["☁️ Judge0 API<br/>runs user code · 7 langs"]
```

| Layer | Provider | Card? | Notes |
|:------|:---------|:-----:|:------|
| Frontend (SPA) | **Vercel** | ❌ none | GitHub login; auto-builds `client/` |
| Backend (API + WS) | **Render** (free Web Service) | ❌ none | GitHub login; sleeps when idle |
| Database | **MongoDB Atlas M0** | ❌ none | 512 MB free forever |
| Cache / presence | **Upstash Redis** | ❌ none | free forever |
| Code execution | **Judge0** | ❌ none | keyless public instance `ce.judge0.com` |

### Known limits (and how to handle them) — read before you start
- **Render free sleeps** after ~15 min idle; the next request cold-starts
  (~30–50 s). Fix: a free uptime pinger (Step 8) keeps it awake.
- **Keyless public Judge0 (`ce.judge0.com`) is rate-limited / best-effort** and
  is your only truly card-free option now (see note below).
- Render free = 512 MB RAM. Plenty here, because execution is **remote** (Judge0),
  not on the server.


> **Card‑free reality check (June 2026):** the hosted Judge0 paths that used to be
> card‑free have changed — **RapidAPI now requires a card** even for the $0 Basic
> plan (a $0.50 validation hold), and **Sulu** (the other hosted provider) is
> shutting down its marketplace. That leaves **keyless `ce.judge0.com`** as the
> only zero‑card hosted option. For higher reliability without a card, the path is
> to **self‑host Judge0** on a VM later ([`PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md)),
> or use a RapidAPI key once you have any usable card.

---

## STAGE 0 — Push the code to GitHub

If you haven't already (see `docs/PRODUCTION_DEPLOYMENT.md` Stage A for the full
commit/omit rules and the `.gitignore` safety check):

```bash
# In the project root
git init
git add .
git status        # confirm NO .env / .env.production / node_modules appear
git commit -m "Initial commit: CodeSync"
git branch -M main
git remote add origin https://github.com/<your-username>/codesync.git
git push -u origin main
```

Render and Vercel both deploy straight from this repo (private repos are fine).

---

## STAGE 1 — MongoDB Atlas (M0, free, no card)

1. **atlas.mongodb.com** → sign up → create a free **M0** cluster (region near you).
2. **Database Access** → add a user (username + strong password). Save them.
3. **Network Access** → **Add IP → Allow access from anywhere (`0.0.0.0/0`)**.
   *(Render's free egress IP isn't static, so allow-all is the practical choice;
   the DB is still protected by the username/password.)*
4. **Connect → Drivers** → copy the URI:
   ```
   mongodb+srv://USER:PASS@cluster.mongodb.net/codesync?retryWrites=true&w=majority
   ```

---

## STAGE 2 — Upstash Redis (free, no card)

1. **upstash.com** → sign up (GitHub) → **Create Database** (region near Render's).
2. Copy the **`rediss://…`** (TLS) URL — looks like:
   ```
   rediss://default:PASSWORD@xxxx.upstash.io:6380
   ```
   *(Must be `rediss://`, not `redis://` — Upstash is TLS-only.)*

---

## STAGE 3 — Generate auth secrets

Run twice and keep both values for Stage 5:

```bash
openssl rand -hex 32     # → JWT_SECRET
openssl rand -hex 32     # → REFRESH_TOKEN_SECRET
```
*(No `openssl`? Use any 64-char hex string from a password generator.)*

---

## STAGE 4 — Judge0 execution

**Card-free path — Keyless public instance (use this):** nothing to do. The
server defaults to `JUDGE0_API_URL=https://ce.judge0.com` with no key, no signup,
no card. It's a shared, rate-limited instance — perfect for a portfolio/demo; you
may hit occasional rate limits under heavy use. This is the only zero-card hosted
option as of June 2026.

**If you later get a usable card — RapidAPI key (not card-free anymore):**
RapidAPI now requires a card on file even for the $0 "Basic" plan (a temporary
$0.50 validation hold), so this is **not** part of the card-free route. If you do
have a card and want higher, more reliable limits:
1. **rapidapi.com** → sign up → search **"Judge0 CE"** → **Subscribe → Basic
   ($0/month)** → enter card for validation.
2. Copy your **`X-RapidAPI-Key`** and set in Stage 5:
   ```
   JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_API_KEY=<your key>
   JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
   ```

**Most reliable + fully free (no third party) — self-host:** run Judge0 yourself
on a VM with `EXEC_ENGINE=docker` or a self-hosted Judge0. That's the deferred
route in `docs/PRODUCTION_DEPLOYMENT.md`.

---

## STAGE 5 — Deploy the backend on Render

1. **render.com** → sign up with GitHub (no card) → **New + → Web Service**.
2. Connect your repo. Configure:

   | Field | Value |
   |:------|:------|
   | **Root Directory** | `server` |
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `node server.js` |
   | **Instance Type** | **Free** |

3. **Environment → Add Environment Variables** (do **not** add `PORT` — Render
   sets it automatically and the server already reads `process.env.PORT`):

   ```ini
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/codesync?retryWrites=true&w=majority
   REDIS_URL=rediss://default:PASSWORD@xxxx.upstash.io:6380
   JWT_SECRET=<from Stage 3>
   REFRESH_TOKEN_SECRET=<from Stage 3>
   JWT_EXPIRES_IN=15m
   REFRESH_TOKEN_EXPIRES_IN=7d

   # ── card-free execution engine (keyless Judge0) ──
   EXEC_ENGINE=judge0
   JUDGE0_API_URL=https://ce.judge0.com
   # Leave it keyless — do NOT set JUDGE0_API_KEY / JUDGE0_API_HOST.
   # (Only add those if you later switch to a RapidAPI key, which needs a card.)

   EXECUTION_TIMEOUT_MS=10000
   EXEC_MEMORY_MB=256
   LOG_LEVEL=info

   # CLIENT_URL is set in Stage 7 (after the frontend URL exists).
   # Put a placeholder for now:
   CLIENT_URL=https://example.vercel.app
   ```

4. **Create Web Service.** Wait for the build → you get a URL like
   **`https://codesync-server.onrender.com`**. Copy it.
5. Sanity check:
   ```bash
   curl -s https://codesync-server.onrender.com/health      # {"status":"ok",...}
   ```
   (First hit after idle may take ~40 s — that's the cold start.)

---

## STAGE 6 — Deploy the frontend on Vercel

1. **vercel.com** → sign up with GitHub (no card) → **Add New → Project** →
   import your repo.
2. Configure:

   | Field | Value |
   |:------|:------|
   | **Root Directory** | `client` |
   | **Framework Preset** | Vite (auto-detected) |
   | **Build Command** | `npm run build` (default) |
   | **Output Directory** | `dist` (default) |

3. **Environment Variables** — point the SPA at your Render backend.

   > [!WARNING]
   > **`VITE_API_URL` MUST end in `/api`** (the server mounts every REST route
   > under `/api`). **`VITE_SOCKET_URL` must NOT** — Socket.IO connects to the
   > server origin. Getting this wrong gives `Route POST /api/auth/login not found`
   > style 404s and an empty Problems page in production.

   ```ini
   VITE_API_URL=https://codesync-server.onrender.com/api
   VITE_SOCKET_URL=https://codesync-server.onrender.com
   ```
   *(These are read at **build time** — if you change them later, you must
   redeploy/rebuild the frontend, not just save.)*
4. **SPA deep-link routing.** The app uses `BrowserRouter`, so direct visits /
   refreshes of routes like `/problems` or `/room/abc` need a fallback to
   `index.html` or they 404 in production. This is handled by **`client/vercel.json`**
   (already in the repo):
   ```json
   { "rewrites": [ { "source": "/(.*)", "destination": "/index.html" } ] }
   ```
   Just confirm that file is present and committed — no dashboard setting needed.
5. **Deploy.** You get a URL like **`https://codesync-xxxx.vercel.app`**. Copy it.

---

## STAGE 7 — Connect the two (CORS)

The backend must trust the frontend's origin (used by both REST **and**
Socket.IO).

1. Back in **Render → your service → Environment**, set:
   ```ini
   CLIENT_URL=https://codesync-xxxx.vercel.app
   # optional, if you also use the apex/preview domains:
   # EXTRA_ORIGINS=https://www.codesync-xxxx.vercel.app
   ```
2. **Save** → Render redeploys automatically. Without this, the browser console
   shows `CORS blocked` and Socket.IO won't connect.

> If you later add a custom domain on Vercel, update `CLIENT_URL` to match it.

---

## STAGE 8 — Keep the backend awake (optional but recommended)

Render free sleeps after ~15 min idle. A free pinger avoids cold starts:

1. **cron-job.org** (free, no card) → create a job:
   - URL: `https://codesync-server.onrender.com/health`
   - Interval: **every 14 minutes**
2. Done — the service stays warm during the day.

*(This consumes Render free monthly hours faster; for a pure portfolio you may
prefer to let it sleep and accept the one-time cold start.)*

---

## STAGE 9 — Verify every feature

Open **`https://codesync-xxxx.vercel.app`** and check:

1. **Register / login** — works (JWT issued).
2. **Create a room**, open it in a 2nd browser → live multi-cursor sync, chat,
   presence (this exercises Socket.IO + Redis + Atlas).
3. **Run code in each language** — JavaScript, TypeScript, Python, C++, Java, Go,
   Rust → all execute via Judge0. Verdicts (Accepted / WA / TLE / Compilation
   Error / Runtime Error) show correctly.
4. **stdin** — run a program that reads input.
5. **Interview** — set duration + hidden tests, submit → judged, submissions
   stored (owner sees all, member sees own).
6. **Practice** `/problems` → Run (samples) + Submit (hidden tests) → solved list
   + streak update.
7. **Leaderboard** `/leaderboard` and **Learn** `/learn`.

If runs fail with a rate-limit message, the shared keyless instance is throttled —
retry shortly. For consistently higher limits without a card, self-host Judge0
later (`docs/PRODUCTION_DEPLOYMENT.md`); with a usable card, a RapidAPI key
(Stage 4) raises the limits.

---

## Troubleshooting

| Symptom | Fix |
|:--------|:----|
| `Route POST /api/auth/login not found` / login & register fail / **Problems page empty** | `VITE_API_URL` is missing the `/api` suffix. Set it to `https://<backend>.onrender.com/api` on Vercel and **redeploy** (build-time var). |
| Real-time sync / Socket.IO won't connect but REST works | `VITE_SOCKET_URL` should be the **origin** (no `/api`). If you accidentally appended `/api`, remove it and redeploy. |
| Learn page blank in prod but fine locally | A source file under `client/src/data/` was gitignored (unanchored `data/` rule). Run `git check-ignore client/src/data/learn.js` — fix the rule to `/data/`, commit, redeploy. |
| Home page loads, but refreshing/opening `/problems`, `/login`, `/room/...` directly gives a **404 (Vercel)** | SPA fallback missing — ensure `client/vercel.json` (rewrite all → `/index.html`) is committed, then redeploy. |
| `CORS blocked` in console / Socket.IO won't connect | `CLIENT_URL` on Render must **exactly** equal the Vercel origin (no trailing slash). Redeploy after changing it. |
| First request hangs ~40 s then works | Render cold start — normal. Add the uptime pinger (Stage 8). |
| Execution: "rate-limited" / intermittent failures | Keyless Judge0 throttling (shared instance) — retry; for stable limits self-host Judge0, or use a RapidAPI key if you have a card (Stage 4). |
| `Unsupported language` on run | A `JUDGE0_LANG_*` override is wrong, or a self-hosted instance uses different IDs. Defaults match `ce.judge0.com`. |
| Mongo connection error on Render | Atlas **Network Access** must allow `0.0.0.0/0`; URI user/pass correct. |
| Redis error | URL must be `rediss://` (TLS), copied from Upstash. |
| Frontend calls `localhost` in prod | `VITE_API_URL` / `VITE_SOCKET_URL` weren't set at build — set them in Vercel and **redeploy**. |
| 401 on every API call after a while | Access token expired and refresh failed — confirm `JWT_SECRET` / `REFRESH_TOKEN_SECRET` are set and stable on Render. |

---

## What's different from the Docker/VM build

- `EXEC_ENGINE=judge0` swaps the local Docker sandbox for the remote Judge0 API.
  **Nothing else changes** — same judge verdicts, same routes, same frontend.
- You don't run `docker-compose.prod.yml` or nginx here; Render serves the API
  and Vercel serves the SPA directly.
- To move to the self-hosted Docker sandbox later (better isolation, no external
  dependency, an interview talking point), set `EXEC_ENGINE=docker` on a VM and
  follow `docs/PRODUCTION_DEPLOYMENT.md`. No code changes needed.


---

<div align="center">

**CodeSync** · Card‑Free Deployment Guide · 
[⬆ Back to top](#top)

</div>
