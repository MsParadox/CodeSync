# CodeSync — Architecture Reference

## System Overview

CodeSync is a distributed real-time collaborative coding platform.  
It enables multiple users to edit code simultaneously with CRDT-based conflict resolution, live cursor tracking, Docker-sandboxed execution, and structured session replay.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT (React + Vite)                     │
│                                                                    │
│   ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐     │
│   │ Monaco      │   │ Yjs          │   │ Redux Toolkit       │     │
│   │ Editor      │◄──│ CRDT         │   │ (auth / room state) │     │
│   │             │   │ (y-monaco)   │   └─────────────────────┘     │
│   └─────────────┘   └──────┬───────┘                               │
│                             │ binary updates                       │
└─────────────────────────────┼──────────────────────────────────────┘
                              │  WebSocket (Socket.IO)
                              │
┌─────────────────────────────▼──────────────────────────────────────┐
│                       SERVER (Node.js / Express)                   │
│                                                                    │
│  ┌──────────────────┐   ┌───────────────────┐  ┌────────────────┐  │
│  │  REST API        │   │  Socket.IO        │  │  Snapshot      │  │
│  │  /api/rooms      │   │  roomHandlers     │  │  Service       │  │
│  │  /api/execute    │   │  yjsHandlers      │  │  (every 60s)   │  │
│  │  /api/auth       │   │  cursorHandlers   │  └────────────────┘  │
│  └──────────────────┘   └────────┬──────────┘                      │
│                                  │                                 │
│  ┌───────────────────────────────▼─────────────────┐               │
│  │               In-process Y.Doc Store            │               │
│  │        Map<roomId, Y.Doc>  (server authority)   │               │
│  └─────────────────────────────────────────────────┘               │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │
           ┌───────────────────────┼──────────────────────┐
           │                       │                      │
    ┌──────▼───────┐        ┌──────▼────────┐    ┌────────▼────────┐
    │   MongoDB    │        │     Redis     │    │  Docker Engine  │
    │              │        │               │    │                 │
    │ • Users      │        │ • Presence    │    │  Per-language   │
    │ • Rooms      │        │ • Room meta   │    │  sandbox        │
    │ • Snapshots  │        │ • Pub/Sub     │    │  containers     │
    │ • Executions │        │ • Heartbeats  │    │  (NetworkMode:  │
    │ • Sessions   │        │ • Adapter     │    │   none, tmpfs,  │
    │ • Submissions│        │ • Rate limits │    │   uid 1000)     │
    │ • Problems   │        │               │    │                 │
    └──────────────┘        └───────────────┘    └─────────────────┘
```

**MongoDB collections** — `User` (auth, stats, `solvedProblems`, `streak`),
`Room` (roster, interview config, hidden `testCases`), `Snapshot` (Yjs state +
plaintext), `Execution` (run log), `SessionEvent` (replay timeline + Yjs
checkpoints, 30-day TTL), `Submission` (per-room & per-problem solution history,
90-day TTL), `Problem` (seeded practice catalog + hidden tests).

---

## Collaboration Data Flow

How a single keystroke travels from User A to User B:

```
User A types a character
        │
        ▼
  Monaco Editor
  (onChange fires)
        │
        ▼
  y-monaco binding
  converts to Yjs operation
        │
        ▼
  Y.Doc.transact()
  CRDT generates a binary update
        │
        ├──────────────────────────────────────────────────┐
        │  socket.emit('yjs-update', base64)               │
        │                                                  │
        ▼                                                  │
  Server: yjsHandlers.js                                   │
  • assertCanEdit() (editor/owner only)                    │
  • Rate-limit check (50 updates/sec/room)                 │
  • Y.applyUpdate(serverDoc, binary, 'remote')             │
  • socket.to(roomId).emit('yjs-update', update)           │
        │                                                  │
        ▼                                                  │
  Redis Pub/Sub (if multi-instance)                        │
        │                                                  │
        ▼                                                  │
  All OTHER sockets in the room                            │
  receive 'yjs-update'                                     │
        │                                                  │
        ▼                                                  │
  useYjs.handleRemoteUpdate()                              │
  Y.applyUpdate(clientDoc, binary, 'remote')               │
        │                                                  │
        ▼                                                  │
  y-monaco binding applies the diff                        │
  to Monaco's text model                                   │
        │                                                  │
        ▼                                                  │
  User B sees the change instantly       ◄─────────────────┘
  (no cursor flicker, no overwrite)
```

---

## Code Execution Flow

```
User clicks "Run"  (or Ctrl+Enter)
        │
        ▼
  Room.jsx: handleRun()
  • getCode() from Y.Doc
  • dispatch(executeCode({ language, code, stdin }))
        │
        ▼
  POST /api/execute
  • requireAuth middleware
  • executionLimiter (rate limit)
  • validateCode() — size & type check
        │
        ▼
  executionService.runCode()
        │
        ├── ensureImage(image)           ← pull the language image once if missing
        │
        ├── docker.createContainer({
        │     Image: language-specific image,
        │     Cmd: ['sh','-c', compile && run [< /code/.stdin]],
        │     NetworkMode: 'none',        ← no internet
        │     Memory / MemorySwap: 256MB, ← EXEC_MEMORY_MB (swap disabled)
        │     CpuQuota: 50%,
        │     PidsLimit: 64,              ← no fork bombs
        │     SecurityOpt: ['no-new-privileges:true'],
        │     Tmpfs: { '/tmp': noexec, '/build': exec },  ← compiled binaries run from /build
        │     User: '1000'                ← unprivileged
        │   })
        │
        ├── container.putArchive(tar(code, stdin))  ← code copied IN (no bind mount;
        │                                              works when the server is itself
        │                                              containerised via the docker.sock)
        ├── container.start()
        │
        ├── Promise.race([
        │     captureOutputAndWait(),     ← byte-limited demuxed streams
        │     timeout(10s)                ← kills infinite loops (TLE)
        │   ])
        │
        └── container.remove({ force: true })
        │
        ▼
  classifyStatus() → success | runtime_error | compile_error | timeout(TLE) | oom(MLE)
        │
        ▼
  Stored in Execution collection (MongoDB)
        │
        ▼
  socket.emit('broadcast-execution-result') → all participants see it in OutputPanel
```

> **Docker-in-Docker note.** The server reaches the host Docker daemon through the
> mounted `/var/run/docker.sock`. Because a bind-mounted host path would be resolved
> by the *host* daemon (not the server container), source is shipped into each
> sandbox with `putArchive` (an in-memory tar) — making execution work identically
> whether the server runs on bare metal or inside a container.

---

## Practice & Interview Judge

Both the **practice problems** (`/api/problems/:slug/submit`) and **interview hidden
tests** (`/api/rooms/:id/submit`) share one judge (`server/src/utils/judge.js`):

```
judge({ language, code, tests })
  • for each test:  runCode({ stdin: test.input })
  • verdictFor(run, test.expectedOutput):
        timeout       → Time Limit Exceeded
        oom           → Memory Limit Exceeded
        compile_error → Compilation Error
        exit ≠ 0      → Runtime Error
        output ≠ exp  → Wrong Answer         (whitespace-trimmed compare)
        output = exp  → Accepted
  • stops at the FIRST failure (compile error fails all)
  → { accepted, passed, total, firstFailureIndex, results[] }
```

A practice "Accepted" updates the user's `solvedProblems`, `stats.solvedByDifficulty`,
and daily `streak`; the leaderboard ranks by a weighted score (Easy ×1, Medium ×3,
Hard ×5). Problems are auto-seeded on first boot (`server/src/seed/problems.js`).
Hidden test inputs/expected outputs are **never** sent to clients — only pass/fail
verdicts are returned.

---

## Permission Model

```
Role Hierarchy:
  Owner > Editor > Viewer

┌──────────────────────────────────────────────────────────┐
│  Action                    │ Owner │ Editor │ Viewer     │
├──────────────────────────────────────────────────────────┤
│  View code (read-only)     │  ✅   │  ✅    │  ✅      │
│  Edit code (Yjs updates)   │  ✅   │  ✅    │  ❌      │
│  Send chat messages        │  ✅   │  ✅    │  ❌      │
│  Execute code              │  ✅   │  ✅    │  ❌      │
│  Change language           │  ✅   │  ❌    │  ❌      │
│  Toggle interview mode     │  ✅   │  ❌    │  ❌      │
│  Assign member roles       │  ✅   │  ❌    │  ❌      │
│  Delete room               │  ✅   │  ❌    │  ❌      │
│  View cursors              │  ✅   │  ✅    │  ✅      │
│  View session replay       │  ✅   │  ✅    │  ✅      │
└──────────────────────────────────────────────────────────┘

How role is determined on join:
  1. Owner's userId === room.owner → 'owner'
  2. userId in room.members[]    → member.role
  3. Public room + not in list   → 'editor' (default)
  4. Private room + not in list  → null (deny entry)
  5. Private room + valid pw     → 'editor'
```

---

## Presence & Heartbeat

```
Socket connects
    │
    ▼
socketAuthMiddleware()
JWT verified → user attached to socket
    │
    ▼
Client joins room
    │
    ├── Redis SET room:{id}:heartbeat:{userId} EX 90
    │
    ▼
Client sends 'heartbeat' every 20s
    │
    └── Server refreshes Redis key EX 90

Socket disconnects (or ping timeout ~60s):
    │
    ▼
handleLeaveRoom()
    ├── socket.leave(roomId)
    ├── Redis DEL heartbeat key
    ├── Redis SREM room:users
    └── Emit 'user-left' to room
```

---

## Session Replay

Every significant event in a room is stored in the `SessionEvent` collection:

```
Events stored:
  join | leave | execute | language_change
  chat | interview_start | interview_end
  snapshot | yjs_checkpoint (every 5s of activity)

GET /api/rooms/:roomId/replay?includeCode=true
    │
    ▼
Returns sorted SessionEvent[]
    │
    ├── Non-code events: join/leave/execute timeline
    └── yjs_checkpoint events: base64-encoded Yjs states
        (client can replay these in sequence to reconstruct
         the entire editing session)

Storage: auto-expired after 30 days via MongoDB TTL index
Pruning:  max 200 checkpoints per room kept
```

---

## Docker Sandbox Security

The execution sandbox is hardened at multiple layers:

```
Layer 1 — Network isolation
  NetworkMode: 'none'
  → Container cannot make any outbound connections
  → Cannot exfiltrate code or access internal services

Layer 2 — Resource limits
  Memory + MemorySwap: EXEC_MEMORY_MB (default 256MB, swap disabled)
  CpuQuota: 50000 / CpuPeriod: 100000 = 50% of one CPU
  PidsLimit: 64 (prevents fork bombs)
  Tmpfs /tmp:   64MB, noexec, nosuid
  Tmpfs /build: 128MB, exec (compiled binaries + toolchain caches)

Layer 3 — Filesystem isolation
  Source shipped in via putArchive (in-memory tar) — no host bind mount
  Writable area limited to the two tmpfs mounts
  Container removed immediately after execution

Layer 4 — Privilege restriction
  User: '1000' (non-root)
  SecurityOpt: ['no-new-privileges:true']

Layer 5 — Application limits
  Execution timeout: 10s (kills infinite loops)
  stdout cap: 1MB (prevents memory exhaustion)
  stderr cap: 256KB
  Code size limit: 100KB

Known limitation for production:
  docker.sock is mounted for container management.
  If the execution service were compromised, an attacker
  could use the Docker API. Production systems should use
  a dedicated execution node, Firecracker, gVisor, or
  Kata Containers for stronger host isolation.
```

---

## Redis Usage

```
Key pattern                          Purpose              TTL
─────────────────────────────────── ──────────────────── ──────
room:{id}:users                     Active user set      24h
room:{id}:meta                      Language, name       24h
room:{id}:cursors                   Cursor positions     24h
room:{id}:heartbeat:{userId}        Presence TTL         90s
```

Pub/Sub via `@socket.io/redis-adapter` enables horizontal scaling:  
when `io.to(roomId).emit()` is called on Server A, Redis routes it  
to Server B's sockets automatically — zero code change needed.

---

## Tech Stack Summary

| Layer        | Technology                       | Why                                      |
|:-------------|:---------------------------------|:-----------------------------------------|
| Frontend     | React 18, Redux Toolkit, Vite    | Fast DX, predictable state               |
| Editor       | Monaco Editor (VS Code core)     | Industry-standard, language support      |
| CRDT         | Yjs + y-monaco                   | Conflict-free merging, offline-safe      |
| Transport    | Socket.IO (WebSocket + polling)  | Auto-reconnect, rooms, adapters          |
| Backend      | Node.js + Express                | Non-blocking I/O, npm ecosystem          |
| Auth         | JWT (access) + refresh tokens    | Stateless, scalable                      |
| Primary DB   | MongoDB + Mongoose               | Flexible schema for rooms/sessions       |
| Cache/PubSub | Redis (ioredis)                  | Presence, adapter, fast key-value        |
| Execution    | Dockerode + Docker Engine        | Language-agnostic sandbox                |
| Reverse Proxy| Nginx                            | TLS termination, WebSocket upgrade       |

---

## Scaling Path

Current architecture handles ~50 concurrent rooms on a single server.  
To scale further:

1. **Horizontal API scaling** — already supported via Redis adapter.  
   Add more Node.js instances behind Nginx with zero code change.

2. **Execution service isolation** — move Docker execution to dedicated  
   worker VMs. Use a job queue (BullMQ) to distribute runs.

3. **MongoDB Atlas** — switch connection string for managed replication.

4. **Redis Cluster** — for very high presence volume (>10k connections).

Technologies deliberately **not** added yet:
- Kubernetes, Kafka, GraphQL, CQRS, Event Sourcing, Microservices
