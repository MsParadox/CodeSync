<a name="top"></a>

<div align="center">

# 🐳 CodeSync — Full Production Deployment (VM / Self‑Host)

**The no‑compromise path: the real per‑run Docker sandbox, live over HTTPS**

<br/>

![Engine](https://img.shields.io/badge/EXEC__ENGINE-docker-2496ED?logo=docker&logoColor=white)
![Host](https://img.shields.io/badge/Host-DigitalOcean_Droplet-0080FF?logo=digitalocean&logoColor=white)
![Proxy](https://img.shields.io/badge/Proxy-nginx-009639?logo=nginx&logoColor=white)
![TLS](https://img.shields.io/badge/TLS-Let's_Encrypt-003A70?logo=letsencrypt&logoColor=white)
![Compose](https://img.shields.io/badge/Orchestration-Docker_Compose-2496ED?logo=docker&logoColor=white)

<br/>

📚 **Docs:** [Architecture](ARCHITECTURE.md) · [Card‑free Deploy](DEPLOY_JUDGE0.md) · **VM Deploy**

</div>

This is a **complete, no‑compromise** deployment guide. Following it end‑to‑end
gives you the **entire** product running publicly over HTTPS — real‑time
collaboration, interviews, **multi‑language code execution (all 7 languages) in a
hardened per‑run Docker sandbox**, the practice judge, leaderboard, and Learn hub.

> This is the **self‑hosted VM route** (`EXEC_ENGINE=docker`). Want a live URL
> with **no credit card and no VM**? Use the card‑free PaaS route in
> [`DEPLOY_JUDGE0.md`](DEPLOY_JUDGE0.md) instead. Same codebase — only
> `EXEC_ENGINE` differs.

---

## Table of contents

1. [Why this stack (and why a real VM)](#1-why-this-stack)
2. [What it costs and what you'll create](#2-cost--accounts)
3. [Architecture you're deploying](#3-architecture)
4. [STAGE A — Prepare the code & push to GitHub](#stage-a)
5. [STAGE B — Claim your DigitalOcean credit](#stage-b)
6. [STAGE C — Get a free domain](#stage-c)
7. [STAGE D — Create the Droplet (Docker host)](#stage-d)
8. [STAGE E — Free managed database & cache](#stage-e)
9. [STAGE F — Point the domain at the server](#stage-f)
10. [STAGE G — Pull the code onto the server](#stage-g)
11. [STAGE H — Configure secrets (`.env.production`)](#stage-h)
12. [STAGE I — Configure nginx for your domain](#stage-i)
13. [STAGE J — Build images & pre-pull language runtimes](#stage-j)
14. [STAGE K — First boot (HTTP)](#stage-k)
15. [STAGE L — Enable HTTPS (Let's Encrypt)](#stage-l)
16. [STAGE M — Verify every feature](#stage-m)
17. [STAGE N — Auto-renew TLS + auto-restart](#stage-n)
18. [Day-2 operations (update, logs, backup)](#day-2)
19. [Troubleshooting](#troubleshooting)
20. [Security hardening checklist](#security)

---

<a name="1-why-this-stack"></a>
## 1. Why this stack — and why a real VM is required

CodeSync runs **untrusted user code** by spawning one throwaway,
network-isolated Docker container **per run**. The API server reaches the host's
Docker daemon through `/var/run/docker.sock`.

➡ **The backend must run on a host with its own Docker daemon — i.e. a real
Linux VM.** Serverless / free-PaaS tiers (Vercel, Netlify, Render free, Railway
free) **cannot** do this, so code execution would be disabled there. That's the
"compromise" you said you don't want — so we use a **DigitalOcean Droplet**,
which your Student Pack pays for.

---

<a name="2-cost--accounts"></a>
## 2. Cost and the accounts you'll create

| Component | Provider | How it's free | Used for |
|:----------|:---------|:--------------|:---------|
| **Docker host (VM)** | **DigitalOcean Droplet** | **$200 Student Pack credit** (12 mo) | Runs everything: API, judge, client, nginx |
| **Database** | **MongoDB Atlas M0** | Free forever (512 MB) | Users, rooms, problems, submissions |
| **Cache / presence** | **Upstash Redis** | Free forever | Presence, pub/sub, Socket.IO adapter |
| **Domain** | **Namecheap** (Student Pack) | Free `.me` for 1 yr | Public HTTPS URL |
| **TLS certificate** | **Let's Encrypt** | Free forever | HTTPS |
| **Source hosting / CI** | **GitHub** | Free | Repo + optional CI |

**Droplet sizing:**
- **Recommended: 4 GB RAM / 2 vCPU / 80 GB SSD** (~$24/mo → ~8 months on $200).
  Comfortable headroom for compiling C++/Java/Rust.
- **Budget: 2 GB RAM / 1 vCPU / 50 GB** (~$12/mo → ~16 months). Works, but keep
  `MAX_CONCURRENT_EXECUTIONS` low and use Atlas+Upstash (don't self-host the DB).

> [!IMPORTANT]
> The $200 credit covers all of it. DigitalOcean asks for a card **only for
> identity verification** at signup — with the Student Pack credit applied you
> are **not billed** while credit remains. **If you truly have no card at all,**
> use the **Azure for Students $100** offer in the pack instead — Azure verifies
> students **without a card** — and create an Ubuntu VM there; every other stage
> below is identical.

---

<a name="3-architecture"></a>
## 3. What you're deploying (single droplet)

```mermaid
flowchart TB
    NET["🌐 Internet · HTTPS :443"] --> NGX["nginx · TLS termination<br/>80 → 443 redirect"]
    NGX -->|"/api · /socket.io"| SRV["server :4000<br/>Express + Socket.IO + judge"]
    NGX -->|"/"| CLI["client :80<br/>built SPA"]
    SRV -->|/var/run/docker.sock| BOX["🐳 throwaway sandbox containers<br/>gcc · temurin · golang · rust · python · node · codesync-ts"]
    SRV --> M[("MongoDB Atlas<br/>managed, off-droplet")]
    SRV --> R[("Upstash Redis<br/>managed, off-droplet")]

    subgraph DROPLET["DigitalOcean Droplet · docker-compose.prod.yml"]
        NGX
        SRV
        CLI
        BOX
    end
```

> [!NOTE]
> Only **nginx** publishes ports (80/443). `server` and `client` are internal to
> the compose network. The sandbox containers are spawned per‑run and removed
> immediately after.

---

<a name="stage-a"></a>
## STAGE A — Prepare the code & push to GitHub

You'll do this **on your Windows machine** (this project folder).

### A1. Confirm `.gitignore` protects your secrets
Already updated for you (see the bottom of this file for the full list). The
critical rule: **every `.env` and `.env.production` is ignored; only `.env.example`
is committed.**

### A2. Files to COMMIT vs OMIT

✅ **COMMIT these (required to build on the server):**

```
client/            (all source: src/, public/, index.html, vite.config.js,
                    tailwind.config.js, postcss.config.js)
client/package.json
client/package-lock.json          ← REQUIRED: `npm ci` needs the lockfile
client/Dockerfile
client/Dockerfile.dev
client/.env.example

server/            (all source: src/, server.js, tests)
server/package.json
server/package-lock.json          ← REQUIRED
server/Dockerfile
server/.env.example

docker/typescript/Dockerfile
nginx/default.conf
nginx/prod.conf
nginx/certbot/www/.gitkeep
docker-compose.yml
docker-compose.prod.yml
.github/workflows/ci-cd.yml
docs/                              (all guides)
README.md
.gitignore
```

🚫 **NEVER commit these (secrets / generated / local):**

```
server/.env                 ← real local secrets
server/.env.production      ← real production secrets  ★ most important
client/.env                 ← local
**/node_modules/            ← reinstalled by `npm ci`
client/dist/  •  **/build/  ← generated on the server
**/logs/  •  *.log
coverage/
nginx/certs/                ← TLS keys (live on the host's /etc/letsencrypt)
.DS_Store  •  Thumbs.db
```

> Lockfiles (`package-lock.json`) **must** be committed — the Docker builds run
> `npm ci`, which fails without them. They are **not** secrets.

### A3. Initialize git and make the first commit

```bash
# In the project root:
git init
git add .
git status        # ← SANITY CHECK: confirm NO .env / .env.production / node_modules appear
git commit -m "Initial commit: CodeSync platform"
```

If `git status` lists any `.env`, `.env.production`, or `node_modules`, **stop**
and fix `.gitignore` before committing (they'd be exposed publicly).

### A4. Create the GitHub repo and push

Create an **empty** repo on github.com (no README/license — you already have
them). A **private** repo is fine; the Student Pack and DigitalOcean work with
private repos.

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/codesync.git
git push -u origin main
```

> **Double-check secrecy after pushing:** open the repo on github.com and
> confirm there is **no** `server/.env.production` and **no** `node_modules`. If
> a secret ever lands in history, rotate `JWT_SECRET` / DB passwords immediately.

---

<a name="stage-b"></a>
## STAGE B — Claim your DigitalOcean credit

1. Go to **education.github.com/pack** → sign in → find **DigitalOcean**.
2. Click **Get access** / **Claim**. It links your GitHub account and grants
   **$200 in credit for 12 months** on a new DigitalOcean account.
3. Complete DigitalOcean signup. If asked for a card, it's **verification only**
   — the credit covers usage. Confirm under **Billing** that you see the
   **$200 credit** applied before creating anything.

---

<a name="stage-c"></a>
## STAGE C — Get a free domain (Student Pack)

You need a domain for HTTPS (Let's Encrypt won't issue certs for a bare IP).

1. In the Student Pack, open **Namecheap** → claim the **free `.me` domain for
   1 year** (or **Name.com** free domain). Register e.g.
   `codesync-yourname.me`.
2. Keep the domain registrar tab open — you'll add a DNS record in Stage F.

> No domain at all? You can still test over the droplet's raw IP on **HTTP only**
> (skip Stage L), but you won't get HTTPS, and WebSockets/Monaco behave best over
> HTTPS. Grab the free domain — it's worth it.

---

<a name="stage-d"></a>
## STAGE D — Create the Droplet (your Docker host)

In the DigitalOcean dashboard: **Create → Droplets**.

| Setting | Choice |
|:--------|:-------|
| **Image** | **Marketplace → "Docker"** (Ubuntu 22.04 with Docker + Compose pre-installed) |
| **Plan** | Basic → Regular → **4 GB / 2 vCPU** (or 2 GB to stretch credit) |
| **Region** | Closest to you (e.g. Bangalore `BLR1`) |
| **Authentication** | **SSH key** (recommended) — paste your public key. Or Password. |
| **Hostname** | `codesync` |

Click **Create Droplet**. Note its **public IPv4** (e.g. `203.0.113.45`).

> Using the **Docker Marketplace image** means Docker & Compose are already
> installed — you can skip manual Docker install.

### D1. Connect

```bash
ssh root@YOUR_DROPLET_IP
docker --version && docker compose version    # confirm both exist
```

### D2. Firewall (open 22, 80, 443)

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
ufw status
```

(Optionally also add a **DigitalOcean Cloud Firewall** in the dashboard with the
same rules — defense in depth.)

---

<a name="stage-e"></a>
## STAGE E — Free managed database & cache

The production compose defaults to **managed** MongoDB + Redis (keeps RAM off
your droplet — recommended, especially on 2 GB).

### E1. MongoDB Atlas (M0, free forever)
1. **atlas.mongodb.com** → create a free **M0** cluster (pick a nearby region).
2. **Database Access** → add a user (username + strong password). Save them.
3. **Network Access** → add your **droplet's IP** (or `0.0.0.0/0` for simplicity;
   tighten later).
4. **Connect → Drivers** → copy the URI:
   `mongodb+srv://USER:PASS@cluster.mongodb.net/codesync?retryWrites=true&w=majority`

### E2. Upstash Redis (free forever)
1. **upstash.com** → **Create Database** (region near the droplet).
2. Copy the **`rediss://…`** (TLS) URL — looks like
   `rediss://default:PASSWORD@xxxx.upstash.io:6380`.

> **Prefer fully self-hosted on the droplet?** (one box, no external accounts) —
> open `docker-compose.prod.yml`, **uncomment** the `mongodb` and `redis`
> services + the `volumes:` block, set a `MONGO_PASSWORD`, and in Stage H use
> `MONGODB_URI=mongodb://codesync:PASS@mongodb:27017/codesync?authSource=admin`
> and `REDIS_URL=redis://redis:6379`. Use a **4 GB** droplet if you do this.

---

<a name="stage-f"></a>
## STAGE F — Point the domain at the droplet

At your registrar (Namecheap), set DNS:

| Type | Host | Value | TTL |
|:-----|:-----|:------|:----|
| **A** | `@` | `YOUR_DROPLET_IP` | Automatic |
| **A** | `www` | `YOUR_DROPLET_IP` | Automatic |

Wait for propagation (minutes), then verify from the droplet:

```bash
dig +short yourdomain.me        # must print YOUR_DROPLET_IP
```

Do **not** continue to TLS (Stage L) until this resolves correctly.

---

<a name="stage-g"></a>
## STAGE G — Pull the code onto the droplet

```bash
# On the droplet
cd ~
git clone https://github.com/<your-username>/codesync.git
cd codesync                       # the folder containing docker-compose.prod.yml
ls docker-compose.prod.yml        # confirm you're in the right place
```

(For a **private** repo, GitHub will prompt for a username + a **Personal Access
Token** as the password, or add the droplet's SSH key to your GitHub account.)

---

<a name="stage-h"></a>
## STAGE H — Configure production secrets

```bash
cp server/.env.example server/.env.production
nano server/.env.production
```

Fill it in (this is the **full** set the server reads):

```ini
NODE_ENV=production
PORT=4000

# ── From Stage E ────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/codesync?retryWrites=true&w=majority
REDIS_URL=rediss://default:PASSWORD@xxxx.upstash.io:6380

# ── Auth — generate UNIQUE values (see below) ───────────────────
JWT_SECRET=<paste 64 hex chars>
REFRESH_TOKEN_SECRET=<paste a DIFFERENT 64 hex chars>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# ── Your domain (must match the browser URL exactly) ────────────
CLIENT_URL=https://yourdomain.me
EXTRA_ORIGINS=https://www.yourdomain.me

# ── Code execution engine ───────────────────────────────────────
# docker = the hardened per-run sandbox (this VM route).
# Switch to judge0 only if you'd rather call a remote API (see DEPLOY_JUDGE0.md).
EXEC_ENGINE=docker

# ── Code execution sandbox (docker engine) ──────────────────────
DOCKER_SOCKET=/var/run/docker.sock
MAX_CONCURRENT_EXECUTIONS=10     # lower to 3-4 on a 2 GB droplet
EXECUTION_TIMEOUT_MS=10000
EXEC_MEMORY_MB=256               # raise to 384-512 if Java/Rust get "Killed"
EXECUTION_RATE_LIMIT=10
MAX_STDOUT_BYTES=1048576
MAX_STDERR_BYTES=262144

LOG_LEVEL=info
```

Generate the two secrets (run twice, paste each):

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Save (`Ctrl+O`, `Enter`) and exit (`Ctrl+X`).

> `server/.env.production` is git-ignored and lives **only** on the droplet —
> never commit it.

---

<a name="stage-i"></a>
## STAGE I — Configure nginx for your domain

`nginx/prod.conf` ships with the placeholder `codesync.example.com`. Replace it
everywhere with your real domain:

```bash
sed -i 's/codesync.example.com/yourdomain.me/g' nginx/prod.conf
grep server_name nginx/prod.conf        # confirm it now shows yourdomain.me
```

> The `ssl_certificate` paths in that file point at
> `/etc/letsencrypt/live/yourdomain.me/…`, which **don't exist yet** — that's
> expected. Stage K starts nginx in HTTP-only mode first, then Stage L creates
> the certs and we switch HTTPS on.

---

<a name="stage-j"></a>
## STAGE J — Build images & pre-pull language runtimes

```bash
# Build the three app images (ts-builder, server, client)
docker compose -f docker-compose.prod.yml build

# Pre-pull all 7 language images so the FIRST run of each is instant.
# (Skip this and they pull on demand on first use — the API waits up to ~180s.)
for img in node:20-alpine python:3.12-alpine gcc:13 \
           eclipse-temurin:21-jdk golang:1.22-alpine rust:1.78-slim; do
  echo "Pulling $img ..."; docker pull "$img"; done
```

> Disk budget: `gcc:13` ≈ 1.3 GB, `rust:1.78-slim` ≈ 0.7 GB,
> `eclipse-temurin:21-jdk` ≈ 0.4 GB. All seven ≈ 6–8 GB. On the 80 GB droplet
> that's fine; on a tiny disk, pre-pull only the languages you care about (the
> rest still work on-demand later).

The **TypeScript** runner (`codesync-ts:latest`) is built by the `ts-builder`
service in the compose `build` step above — no separate command needed.

---

<a name="stage-k"></a>
## STAGE K — First boot (HTTP), before TLS

`nginx/prod.conf` references TLS certs that don't exist yet, so start in two
steps.

**K1. Temporarily serve HTTP only** so nginx can boot and answer the ACME
challenge. Comment out the entire `server { listen 443 ssl; … }` block in
`nginx/prod.conf` for now (leave the port-80 block), **or** use this quick
approach: bring everything up except nginx first, then add nginx after certs.
Simplest reliable path:

```bash
# Start app services (server + client + ts-builder)
docker compose -f docker-compose.prod.yml up -d server client

# Start nginx — if it fails on missing certs, see K2
docker compose -f docker-compose.prod.yml up -d nginx
docker compose -f docker-compose.prod.yml ps
```

**K2.** If nginx restarts/crashes complaining about missing
`ssl_certificate` files, temporarily neutralize the 443 block so port 80 works,
then proceed to Stage L which creates the certs:

```bash
# Comment out the HTTPS server block just long enough to issue certs
nano nginx/prod.conf      # wrap the `server { listen 443 ssl; ... }` block in #, save
docker compose -f docker-compose.prod.yml restart nginx
```

Confirm HTTP is answering:

```bash
curl -s http://yourdomain.me/health      # expect {"status":"ok",...} or a redirect
```

---

<a name="stage-l"></a>
## STAGE L — Enable HTTPS (Let's Encrypt)

With nginx serving port 80 and the domain resolving to the droplet, issue the
certificate using a one-shot certbot container (writes into the host's
`/etc/letsencrypt`, which nginx already mounts read-only):

```bash
docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v "$PWD/nginx/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d yourdomain.me -d www.yourdomain.me \
  --agree-tos -m you@example.com --no-eff-email
```

When it reports success:

1. **Re-enable the HTTPS block** in `nginx/prod.conf` if you commented it out in
   K2 (uncomment the `server { listen 443 ssl; … }` block).
2. Reload nginx:

```bash
docker compose -f docker-compose.prod.yml restart nginx
```

Open **https://yourdomain.me** 🎉 — full HTTPS, valid certificate.

> **Cloudflare alternative (no certbot):** put the domain behind Cloudflare
> (free), SSL mode **Full**, proxy ON. Then keep only the **port-80** server
> block in `nginx/prod.conf` (Cloudflare terminates TLS at its edge). Simpler if
> you don't want to manage certs.

---

<a name="stage-m"></a>
## STAGE M — Verify every feature works

```bash
# Infra
curl -s https://yourdomain.me/health                       # {"status":"ok"}
docker compose -f docker-compose.prod.yml ps               # all Up/healthy
docker compose -f docker-compose.prod.yml logs -f server   # watch for errors
```

In the browser at **https://yourdomain.me**:

1. **Auth** — Register a user, log out, log back in.
2. **Collaboration** — Create a room; open it in a 2nd browser/incognito; type
   in both → live multi-cursor sync, chat, presence.
3. **Execution (the big one)** — In a room, run the default template in **each**
   language: **JavaScript, TypeScript, Python, C++, Java, Go, Rust**. First run
   of a not-pre-pulled language pulls its image (be patient once).
4. **Interactive / stdin** — Run a program that reads input; provide stdin.
5. **Interview** — Start an interview, set a duration + hidden test cases, submit
   a solution → verdict + submissions appear (owner sees all, member sees own).
6. **Practice** — `/problems` → open a problem → **Run** (samples) and **Submit**
   (hidden tests) → Accepted updates your solved list + streak.
7. **Leaderboard** — `/leaderboard` shows weighted score (E×1, M×3, H×5) + streak.
8. **Learn** — `/learn` loads notes, Big-O, dev docs, and DSA-CP deep links.
9. **Session replay** — open a room's replay → checkpoints scrub (not "no
   checkpoints").

If a language is slow on first use, that's the one-time image pull — subsequent
runs are instant.

---

<a name="stage-n"></a>
## STAGE N — Auto-renew TLS + survive reboots

**Auto-renew the certificate** (twice daily at off-peak minutes):

```bash
crontab -e
# add this single line (edit the path if your repo folder differs):
17 3,15 * * * cd ~/codesync && docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v "$PWD/nginx/certbot/www:/var/www/certbot" certbot/certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f docker-compose.prod.yml restart nginx
```

**Survive droplet reboots** — every service in `docker-compose.prod.yml` already
has `restart: unless-stopped`, and Docker's daemon starts on boot, so the whole
stack comes back automatically after a reboot/maintenance.

**Enable automatic OS security updates:**

```bash
apt update && apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

<a name="day-2"></a>
## Day-2 operations

```bash
# Tail logs
docker compose -f docker-compose.prod.yml logs -f server

# Deploy new code (after you push to GitHub)
cd ~/codesync
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Restart / stop / start
docker compose -f docker-compose.prod.yml restart server
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Reclaim disk (old images/containers)
docker system prune -af
```

**Backups:** Atlas M0 keeps automatic snapshots; you can also run
`mongodump --uri="$MONGODB_URI"`. Practice problems **re-seed automatically** on
an empty DB at boot, so losing the DB doesn't lose the catalog.

**Scaling:** the Socket.IO Redis adapter means you can run multiple `server`
replicas behind nginx (add entries to the `upstream codesync_api` block) sharing
one Redis — presence, pub/sub, and rooms stay consistent.

---

<a name="troubleshooting"></a>
## Troubleshooting

| Symptom | Cause / Fix |
|:--------|:------------|
| Browser can't reach the site | DNS not propagated (`dig +short yourdomain.me`), or UFW/Cloud Firewall blocking 80/443. |
| nginx keeps restarting | TLS cert files missing — you're past Stage K but skipped Stage L, or the 443 block is enabled before certs exist. Comment the 443 block, issue certs, re-enable. |
| `502 Bad Gateway` | `server` or `client` not healthy yet. `docker compose -f docker-compose.prod.yml ps` + check `logs server`. |
| "Execution engine unavailable" | Docker socket not reachable. Confirm `docker ps` works on the droplet and the `server` service mounts `/var/run/docker.sock` (it does in the prod compose). |
| `No such image: gcc:13` on first run | Image still pulling — wait, or pre-pull (Stage J). |
| Java / Rust → "Killed" / MLE | Raise `EXEC_MEMORY_MB` to 384–512 in `.env.production`, then `restart server`. On a 2 GB droplet also lower `MAX_CONCURRENT_EXECUTIONS`. |
| WebSocket won't connect / cursors don't sync | `CLIENT_URL` must equal the exact browser origin (`https://yourdomain.me`). Add the `www`/apex variant to `EXTRA_ORIGINS`. |
| Cert renewal fails | Port 80 must stay open and reach `/.well-known/acme-challenge/`. Don't fully block 80. |
| Mongo/Redis connection errors | Atlas **Network Access** must include the droplet IP; Upstash URL must use `rediss://` (TLS). |
| Disk full | `docker system prune -af`; pre-pull fewer language images. |
| Out of memory under load | Move DB/cache to Atlas+Upstash (don't self-host on a 2 GB box), and/or resize the droplet (DO lets you resize RAM up). |

---

<a name="security"></a>
## Security hardening checklist

- [x] Per-run sandbox: `NetworkMode: none`, RAM cap (`EXEC_MEMORY_MB`), 50% CPU,
      `PidsLimit: 64`, `no-new-privileges`, non-root `uid 1000`, `noexec /tmp`.
- [x] Output byte caps (1 MB stdout / 256 KB stderr) + 10s wall-clock TLE.
- [x] JWT access/refresh; bcrypt password hashing.
- [x] Rate limits (API, auth, execution, room creation) + Helmet + strict CORS.
- [x] HTTPS via Let's Encrypt; HSTS header set in `nginx/prod.conf`.
- [ ] **You:** unique `JWT_SECRET` / `REFRESH_TOKEN_SECRET` (Stage H).
- [ ] **You:** restrict Atlas **Network Access** to the droplet IP.
- [ ] **You:** SSH keys only — disable password login
      (`PasswordAuthentication no` in `/etc/ssh/sshd_config`, then
      `systemctl restart ssh`).
- [ ] **You:** `unattended-upgrades` enabled (Stage N).
- [ ] **You (optional):** front with Cloudflare for free DDoS/WAF.
- [ ] **You:** confirm GitHub repo contains **no** `.env*` secrets.

---

## One-page command recap (after accounts + domain exist)

```bash
# On the droplet (Docker Marketplace image):
git clone https://github.com/<you>/codesync.git && cd codesync
cp server/.env.example server/.env.production && nano server/.env.production   # fill secrets
sed -i 's/codesync.example.com/yourdomain.me/g' nginx/prod.conf
docker compose -f docker-compose.prod.yml build
for img in node:20-alpine python:3.12-alpine gcc:13 eclipse-temurin:21-jdk golang:1.22-alpine rust:1.78-slim; do docker pull "$img"; done
docker compose -f docker-compose.prod.yml up -d server client
# (comment 443 block) → start nginx on :80 → issue certs:
docker compose -f docker-compose.prod.yml up -d nginx
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v "$PWD/nginx/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot -d yourdomain.me -d www.yourdomain.me \
  --agree-tos -m you@example.com --no-eff-email
# (uncomment 443 block) →
docker compose -f docker-compose.prod.yml restart nginx
curl -s https://yourdomain.me/health
```

Done — the **full** CodeSync is live at **https://yourdomain.me**

---

<div align="center">

**CodeSync** · VM / Self‑Host Deployment · **the real Docker sandbox**
[⬆ Back to top](#top)

</div>
