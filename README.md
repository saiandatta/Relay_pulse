# ⚡ RelayPulse — AI Outbound Sales & Speed-to-Lead Engine

**RelayPulse** is a high-performance Node.js + TypeScript backend and real-time Operator Console engineered for modern RevOps and speed-to-lead pipelines. It automates multi-attribute lead qualification, outbound sequence orchestration, intelligent inbound reply classification, strict state-machine enforcement, user authentication, and append-only audit logging.

Built with clean layered architecture (**Routes &rarr; Middleware &rarr; Services &rarr; Repositories &rarr; Database Engine**), deterministic AI fallback safeguards, zero-dependency SQLite persistence, and enterprise `Idempotency-Key` replay protection.

---

## 🎯 Key Capabilities

1. **🔐 User Authentication & Protected Routes:**
   - Full signup, login, session management, and logout (`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`).
   - Cryptographically salted password hashing via `crypto.scrypt` with timing-safe validation.
   - Dual authentication support: **HTTP-only session cookies** for browsers and **`Authorization: Bearer <token>`** for API/webhook consumers.
   - All workspace endpoints (`/api/leads`, `/api/campaigns`, `/api/sequences`, `/api/webhooks`, `/api/logs`, `/api/events`, `/api/workspace`) are protected behind `requireAuth` middleware (returning `401 Unauthorized` for unauthenticated calls).

2. **💡 First-Run Onboarding Modal & Platform Guide:**
   - On first sign-in (when `hasSeenOnboarding = false`), an interactive 4-step modal walks new users through the speed-to-lead engine.
   - The **"Get Started"** button calls `PATCH /api/auth/onboarding-complete` to persist the completion flag in the database so it never interrupts returning operators.
   - Reopenable at any time from the **"? Guide"** button in the header.

3. **📊 100% Dynamic Frontend (Zero Hardcoded Data):**
   - Zero hardcoded numbers, fake prospects, or static table rows. Every metric card (Total Leads, In Sequence, Hot ICP Leads, Replied/Booked, Avg Lead Score, Conversion Rate), table row, campaign list, and activity log entry is fetched dynamically from the REST API.
   - Clean, actionable **Empty States** with call-to-action buttons when a workspace is brand new.
   - **"Load Sample Workspace Data"** button (`POST /api/workspace/sample-data`) allows immediate one-click testing with realistic B2B sales data.

4. **⚡ Speed-to-Lead Qualification Engine:**
   - Multi-factor evaluation across decision-maker seniority, company headcount fit, high-intent pain points, and engagement history.
   - Generates calibrated **0–100 Lead Scores** and **Intent Tiers** (`hot`, `warm`, `cold`, `disqualified`).
   - Pluggable LLM interface (compatible with OpenAI / Anthropic) coupled with a **100% deterministic rule-based AI engine** when no API keys are present in `.env`.

5. **🚀 Multi-Step Outbound Sequence Orchestration:**
   - Multi-touch sequence scheduling with time delay gates (`delayHours`) and optional force bypass.
   - Dynamic copy generation tailored to prospect role, company size, and specific pain points (Hook &rarr; Case Study &rarr; Executive Meeting Booking).
   - Real-time execution tracking in `sequence_executions`.

6. **💬 Inbound Reply Classification & Routing:**
   - Webhook endpoint (`POST /api/webhooks/reply`) analyzing prospect responses for sentiment (`positive`, `neutral`, `negative`, `unsubscribe`) and detected intent (`meeting_request`, `pricing`, `objection`, `not_interested`, `unsubscribe`).
   - **Meeting Requests** automatically transition leads to `booked`, boost lead score (&ge;95), and halt outbound sequences.
   - **Unsubscribe Requests** immediately transition leads to `unsubscribed` and permanently lock them out of further outbound actions.
   - **Objections & Questions** transition leads to `replied` and draft tailored response copy.

7. **🔒 State Machine & Idempotency Protection:**
   - Strict state transition rules: unsubscribed prospects can never advance; replied/booked prospects pause active sequences.
   - `Idempotency-Key` / `X-Idempotency-Key` headers on sequence advance and webhook endpoints prevent duplicate outbound sends or double reply records during network retries.
   - Replays cached responses with `X-Cache-Lookup: HIT` and `Idempotency-Replayed: true`.

8. **📜 Append-Only Audit Trail:**
   - Persistent `activity_logs` recording every event (`lead_created`, `lead_qualified`, `sequence_step_advanced`, `reply_received`, `lead_booked`, `lead_unsubscribed`, `action_blocked`) with structured JSON payloads and actor attribution (`ai_engine`, `webhook`, `operator`, `system`).

---

## 🏗️ Architecture & Layered Design

```
Relay_pulse/
├── src/
│   ├── config/
│   │   ├── env.ts                   # Validated configuration via Zod
│   │   ├── database.ts              # SQLite database init, WAL mode, foreign keys, migrations
│   │   └── logger.ts                # Structured JSON & console logger with log levels
│   ├── types/
│   │   ├── auth.ts                  # User, session, signup, login types & schemas
│   │   ├── lead.ts                  # Lead models, statuses, intent tiers, Zod validation schemas
│   │   ├── campaign.ts              # Campaign definitions, sequence step schemas
│   │   ├── sequence.ts              # Sequence execution & advance DTOs
│   │   ├── reply.ts                 # Inbound reply models, sentiment & intent types
│   │   ├── event.ts                 # Audit log types, event actors, payload schemas
│   │   ├── idempotency.ts           # Idempotency record types
│   │   └── llm.ts                   # AI qualification, copy generation, and reply contracts
│   ├── repositories/
│   │   ├── interfaces.ts            # Clean repository contracts (Dependency Inversion)
│   │   ├── user.repository.ts       # User persistence & onboarding flag management
│   │   ├── session.repository.ts    # Session token management & expiration pruning
│   │   ├── lead.repository.ts       # Lead CRUD, multi-filter queries, transactional updates
│   │   ├── campaign.repository.ts   # Campaign & sequence step persistence
│   │   ├── sequence.repository.ts   # Outbound step execution history
│   │   ├── reply.repository.ts      # Inbound reply log persistence
│   │   ├── event.repository.ts      # Append-only activity log store
│   │   └── idempotency.repository.ts # Key caching, expiry enforcement, SHA-256 hash checks
│   ├── services/
│   │   ├── auth.service.ts          # Salted scrypt hashing, sessions, onboarding flag
│   │   ├── lead.service.ts          # State machine enforcement, lead lifecycle
│   │   ├── sequence.service.ts      # Multi-step outbound orchestration, scheduling & gating
│   │   ├── reply.service.ts         # Inbound reply routing, sentiment/intent classification
│   │   ├── campaign.service.ts      # Campaign templates & sequence definitions
│   │   └── llm.service.ts           # LLM wrapper + deterministic fallback engine
│   ├── middleware/
│   │   ├── auth.ts                  # Session & Bearer token authentication guard
│   │   ├── error-handler.ts         # Centralized AppError and Zod validation error handler
│   │   ├── idempotency.ts           # Idempotency key interceptor & cache replay
│   │   ├── request-logger.ts        # HTTP request duration & status logger
│   │   └── validator.ts             # Zod schema validation middleware (body, query)
│   ├── routes/
│   │   ├── index.ts                 # Root API router mounting public & protected sub-routers
│   │   ├── auth.routes.ts           # /api/auth endpoints (signup, login, logout, me, onboarding)
│   │   ├── lead.routes.ts           # /api/leads endpoints
│   │   ├── campaign.routes.ts       # /api/campaigns endpoints
│   │   ├── sequence.routes.ts       # /api/sequences endpoints
│   │   ├── webhook.routes.ts        # /api/webhooks endpoints
│   │   ├── event.routes.ts          # /api/events & /api/logs endpoints
│   │   └── workspace.routes.ts      # /api/workspace endpoints (sample data seeder)
│   ├── public/                      # Operator Console Frontend (100% Dynamic)
│   │   ├── index.html               # Responsive RevOps dashboard UI & modals
│   │   ├── css/styles.css           # Modern cyber-dark CSS design system
│   │   └── js/app.js                # Interactive reactive client application with auth state
│   ├── seeds/
│   │   └── seed.ts                  # Production-grade seed data (campaigns, leads, logs)
│   ├── server.ts                    # Express application setup & middleware stack
│   └── index.ts                     # Entry point & graceful shutdown handlers
├── tests/
│   ├── auth.test.ts                 # Signup, login, password hashing, session tokens, 401 gating
│   ├── lead-scoring.test.ts         # AI scoring logic, weights, 0-100 bounds, disqualification
│   ├── state-transitions.test.ts    # Valid lifecycle pathing, rejection of backward transitions
│   ├── sequence-engine.test.ts      # Multi-step sequence progression, time-gates, copy synthesis
│   ├── reply-routing.test.ts        # Webhook routing (booking vs opt-out vs objections)
│   └── idempotency.test.ts          # Duplicate prevention, cached replay, key expiration
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 🗄️ Database Schema

The database uses SQLite (with `WAL` journal mode, `PRAGMA foreign_keys = ON`, and optimized indices):

```sql
-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  has_seen_onboarding INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Active User Sessions
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Campaigns & Sequence Step Templates
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_persona TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  steps_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Leads & Speed-to-Lead State
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  company_size TEXT NOT NULL,
  pain_points TEXT,
  engagement_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 0,
  intent_tier TEXT NOT NULL DEFAULT 'cold',
  current_step INTEGER NOT NULL DEFAULT 0,
  next_action_at TEXT,
  qualification_summary TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Sequence Executions (Dispatched outreach copy)
CREATE TABLE IF NOT EXISTS sequence_executions (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Inbound Replies
CREATE TABLE IF NOT EXISTS inbound_replies (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  message TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  ai_recommended_action TEXT,
  processed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Append-Only Audit Trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Idempotency Records
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  expires_at TEXT NOT NULL
);
```

---

## 📡 REST API Reference

### 1. Authentication API (Public)

#### `POST /api/auth/signup`
Create a new user account, hash the password using `crypto.scrypt`, and return a signed session token.

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jordan Bell",
    "email": "jordan@cloudscale.io",
    "password": "securePassword123!"
  }'
```

#### `POST /api/auth/login`
Authenticate with email and password to receive a session token and HTTP-only cookie.

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jordan@cloudscale.io",
    "password": "securePassword123!"
  }'
```

#### `POST /api/auth/logout`
Terminates the active session and clears the session cookie.

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <session-token>"
```

#### `GET /api/auth/me`
Retrieve the current authenticated user profile and `hasSeenOnboarding` status.

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <session-token>"
```

#### `PATCH /api/auth/onboarding-complete`
Persist `hasSeenOnboarding: true` for the active user.

```bash
curl -X PATCH http://localhost:3000/api/auth/onboarding-complete \
  -H "Authorization: Bearer <session-token>"
```

---

### 2. Protected Workspace & Leads API

*All routes below require `Authorization: Bearer <token>` or valid session cookie.*

#### `POST /api/workspace/sample-data`
One-click seeding of realistic B2B sales data into the database.

```bash
curl -X POST http://localhost:3000/api/workspace/sample-data \
  -H "Authorization: Bearer <session-token>"
```

#### `POST /api/leads`
Create a new prospect. Supports optional `autoQualify: true`.

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-token>" \
  -d '{
    "firstName": "Elena",
    "lastName": "Rostova",
    "email": "elena.rostova@nexacloud.io",
    "company": "NexaCloud",
    "role": "VP of Sales",
    "companySize": "201-1000",
    "painPoints": "Slow inbound lead response time",
    "engagementNotes": "Visited pricing page twice",
    "autoQualify": true
  }'
```

#### `GET /api/leads`
List and filter leads by status, intent tier, campaign, or search query.

```bash
curl "http://localhost:3000/api/leads?status=qualified&intentTier=hot" \
  -H "Authorization: Bearer <session-token>"
```

#### `GET /api/leads/:id`
Retrieve the full prospect dossier (lead data, sequence history, inbound replies, and activity logs).

```bash
curl http://localhost:3000/api/leads/lead_elena_001 \
  -H "Authorization: Bearer <session-token>"
```

#### `POST /api/leads/:id/qualify`
Trigger on-demand AI qualification, updating the lead's score, intent tier, and reasoning.

```bash
curl -X POST http://localhost:3000/api/leads/lead_elena_001/qualify \
  -H "Authorization: Bearer <session-token>"
```

#### `POST /api/sequences/advance`
Advance a prospect to the next sequence step, synthesizing personalized copy and scheduling `nextActionAt`. Supports `Idempotency-Key` to prevent duplicate sends.

```bash
curl -X POST http://localhost:3000/api/sequences/advance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-token>" \
  -H "Idempotency-Key: seq_adv_001" \
  -d '{ "leadId": "lead_elena_001", "force": true }'
```

#### `POST /api/webhooks/reply`
Ingests an inbound prospect reply, analyzes sentiment/intent, updates lead status (`booked`, `replied`, or `unsubscribed`), and pauses active sequence timers.

```bash
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-token>" \
  -H "Idempotency-Key: reply_webhook_001" \
  -d '{
    "leadId": "lead_elena_001",
    "channel": "email",
    "message": "Can we schedule a 15-minute demo this Thursday?"
  }'
```

#### `GET /api/events` (or `/api/logs`)
Fetch the append-only activity log stream.

```bash
curl "http://localhost:3000/api/logs?limit=50" \
  -H "Authorization: Bearer <session-token>"
```

#### `GET /api/events/stats/summary`
Retrieve real-time pipeline performance metrics (total leads, in-sequence count, hot leads, response rate, conversion rate).

```bash
curl http://localhost:3000/api/events/stats/summary \
  -H "Authorization: Bearer <session-token>"
```

---

## ⚡ Quickstart & Local Setup

### 1. Install & Configure
```bash
git clone <repo-url>
cd Relay_pulse
npm install
cp .env.example .env
```

### 2. Start Application
```bash
npm run dev
```

### 3. Open Operator Console
Navigate to [http://localhost:3000](http://localhost:3000) in your browser:
1. **Create an account** or sign in on the sleek auth card.
2. The **Onboarding Modal** will pop up explaining the 4-step workflow.
3. Click **"Get Started"** to enter the workspace.
4. If your workspace is empty, click **"⚡ Load Sample Data"** in the top header or empty state card to instantly populate realistic RevOps data!

---

## 🧪 Automated Testing

RelayPulse includes 26 automated Vitest tests across 6 suites covering authentication, scoring, state transitions, sequence orchestration, reply routing, and idempotency:

```bash
npm test
```

```
 RUN  v3.2.7 C:/Users/DELL/Documents/Relay_pulse

 ✓ tests/auth.test.ts (8 tests)
 ✓ tests/lead-scoring.test.ts (5 tests)
 ✓ tests/sequence-engine.test.ts (2 tests)
 ✓ tests/state-transitions.test.ts (4 tests)
 ✓ tests/reply-routing.test.ts (3 tests)
 ✓ tests/idempotency.test.ts (4 tests)

 Test Files  6 passed (6)
      Tests  26 passed (26)
   Duration  1.59s
```

---

## 📦 Production Build

```bash
# Compile TypeScript to dist/ and copy static assets
npm run build

# Start production server
npm start
```
