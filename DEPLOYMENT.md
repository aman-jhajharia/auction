# 🏀 Muqabla 2026 Basketball Auction Platform — Production Deployment Guide

This production guide details the exact architecture, environment configuration, database migration, and step-by-step procedures to deploy the platform:

- **Frontend**: [Vercel](https://vercel.com) (React 18 + Vite + TypeScript)
- **Backend**: [Render](https://render.com) (Node.js 22 + Express + TypeScript + Socket.IO)
- **Database**: Managed PostgreSQL (Render PostgreSQL, Supabase, Neon, or Railway)

---

## 📋 Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             Vercel Frontend             │
                      │  https://muqabla-auction.vercel.app     │
                      └────────────────────┬────────────────────┘
                                           │
                        HTTPS REST & WSS   │  (JWT Authenticated)
                        Cross-Origin Calls │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │              Render Backend             │
                      │  https://muqabla-api.onrender.com       │
                      │  Node.js + Express + Socket.IO          │
                      │  - Concurrency-safe FIFO bidQueue       │
                      │  - Strict Role-Based Rooms              │
                      └────────────────────┬────────────────────┘
                                           │
                         Pooled Connection │  (SSL Encrypted)
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │           Managed PostgreSQL            │
                      │  - Row-Level Locking (FOR UPDATE)       │
                      │  - Relational Integrity & Constraints   │
                      │  - Idempotent Schema & Migrations       │
                      └─────────────────────────────────────────┘
```

---

## 🏀 Authoritative Team & Captain Mapping

The platform strictly maps the 5 teams and captains as follows. Passwords are never stored in source code and are saved purely as bcrypt one-way hashes:

| Team | Team Name | Captain Name | Login ID (Username) | Retained Player (0 Credits) |
| :--- | :--- | :--- | :--- | :--- |
| **Team A** | **Ashmit** | Ashmit | `ashmit_curry` | Rahul Sharma |
| **Team B** | **Vansh** | Vansh | `vansh_baby` | Sneha Reddy |
| **Team C** | **Divyanshu** | Divyanshu | `divyanshu_lebron` | Arjun Singh |
| **Team D** | **Chirayu** | Chirayu | `champ_chirayu` | Rohit Nair |
| **Team E** | **Parth** | Parth | `parth_gangsta` | Ritu Sen |
| **Admin** | Platform Admin | Administrator | `admin` | Full Auction Controls |
| **Display** | Arena Screen | Public Spectator | `display` | Sanitized Projector Mode |

---

## 🔒 Concurrency & Transaction Guarantees

Bidding during a live sports auction is intense and simultaneous. The platform uses a **dual-tier concurrency architecture**:

1. **In-Process FIFO Queue (`bidQueue`)**:
   - Every bid submitted via WebSocket enters a serialized promise chain on the Node.js event loop.
   - Prevents race conditions from simultaneous network events entering the handler.
2. **PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Within an atomic PostgreSQL transaction (`BEGIN ... COMMIT`), the engine locks the single live `auction_state` row (`id = 1`) and the bidding `teams` row.
   - Any concurrent bid waiting in the queue immediately reads the updated `current_highest_bid` and team's actual remaining budget upon lock acquisition.
   - If a bid is stale, below minimum increment, or violates squad rules, it is rejected and recorded in the `bids` audit table without mutating live state.
3. **Budget & Squad Validation**:
   - Credits remaining are validated against the formula:
     $$\text{Max Legal Bid} = \text{Credits Remaining} - (\text{Remaining Squad Needed} - 1) \times \text{min\_bid}$$
   - Prevents negative budgets, roster overflows, and ensures compulsory female-player requirements are satisfied.

---

## Part A: PostgreSQL Database Provisioning

You can use any managed PostgreSQL provider (Render PostgreSQL, Neon, Supabase, AWS RDS, etc.).

### Option 1: Render PostgreSQL (Recommended for simplicity)
1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **PostgreSQL**.
3. Configure:
   - **Name**: `muqabla-auction-db`
   - **Database**: `muqabla_auction`
   - **User**: `muqabla_user`
   - **Region**: Choose the same region as your web service (e.g., Frankfurt / Oregon / Singapore).
   - **Plan**: Free or Starter.
4. Click **Create Database**.
5. Once provisioned, locate the **Internal Database URL** (for Render web service) or **External Database URL** (for local migrations).

---

## Part B: Schema & Data Initialization

The backend includes automated DDL execution on boot (`initDatabase()`), plus CLI tools for initial seeding and SQLite migration.

### Step 1: Run Database Schema & Account Seed
From your local terminal with your production database URL:

```bash
# Initialize schema and seed accounts directly on PostgreSQL
DATABASE_URL="postgres://user:password@hostname:5432/muqabla_auction" npm run seed:prod
```

This will:
- Execute `server/src/schema.sql` (creates `teams`, `users`, `players`, `bids`, `sales`, `auction_state`, `audit_logs` and indexes).
- Insert the 5 teams and 5 captains with high-entropy 16-character passwords.
- Output the generated passwords securely in a formatted table on your terminal.
- Seed the 5 free retained players and 42 university pool players.

### Step 2 (Optional): Migrate Existing Local SQLite Data
If you have local SQLite auction data in `data/auction.db` that you wish to transfer to PostgreSQL:

```bash
# Non-destructive migration: reads SQLite read-only and upserts into PostgreSQL
DATABASE_URL="postgres://user:password@hostname:5432/muqabla_auction" npm run db:migrate
```

---

## Part C: Backend Deployment on Render

### Step 1: Connect GitHub Repository
1. In Render Dashboard, click **New +** → **Web Service**.
2. Connect your GitHub repository: `https://github.com/aman-jhajharia/auction.git`.

### Step 2: Configure Service Settings
- **Name**: `muqabla-auction-server`
- **Region**: Same region as your database.
- **Branch**: `main`
- **Root Directory**: `server`
- **Runtime**: `Node`
- **Build Command**:
  ```bash
  npm install && npm run build
  ```
- **Start Command**:
  ```bash
  npm start
  ```
- **Plan**: Free or Starter (Starter is recommended for live events to avoid free-tier spin-down).

### Step 3: Configure Render Environment Variables
Under the **Environment** tab on Render, add the following variables:

| Variable Name | Required Value / Description | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Must be `production` | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@dpg-xxx:5432/muqabla_auction` |
| `DATABASE_SSL` | Enable SSL for managed DB | `true` |
| `JWT_SECRET` | 64-char random cryptographic key (`openssl rand -hex 32`) | `9f3c7e...b41a` |
| `JWT_EXPIRES_IN` | Session duration | `24h` |
| `FRONTEND_ORIGIN` | Your Vercel frontend URL (no trailing slash) | `https://muqabla-auction.vercel.app` |
| `CORS_ORIGIN` | Comma-separated allowed origins | `https://muqabla-auction.vercel.app` |

Click **Save Changes**. Render will trigger the build and start the service.
Note your Render backend URL: `https://muqabla-auction-server.onrender.com`.

---

## Part D: Frontend Deployment on Vercel

### Step 1: Import Project in Vercel
1. Log into your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `https://github.com/aman-jhajharia/auction.git`.

### Step 2: Configure Vercel Project Settings
- **Framework Preset**: `Vite`
- **Root Directory**: Click **Edit** and select `client`.
- **Build Command**: `npm run build` (or leave default `vite build`)
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Configure Vercel Environment Variables
Under **Environment Variables**, add:

| Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://muqabla-auction-server.onrender.com` | Your live Render backend HTTPS URL |
| `VITE_SOCKET_URL` | `https://muqabla-auction-server.onrender.com` | Your live Render backend WSS URL |

Click **Deploy**. Vercel will build the React application and deploy it to a global edge network.

---

## Part E: Production Verification & Smoke Testing

### 1. Backend Health Check
Test the health endpoint:
```bash
curl -i https://muqabla-auction-server.onrender.com/api/health
```
Expected response:
```json
{
  "status": "ok",
  "uptime": 120,
  "timestamp": "2026-10-02T01:30:00.000Z",
  "database": "connected"
}
```

### 2. CORS Verification
Verify that CORS headers are returned for your Vercel frontend:
```bash
curl -H "Origin: https://muqabla-auction.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type,Authorization" \
     -X OPTIONS https://muqabla-auction-server.onrender.com/api/auth/login -i
```
Expected header:
```http
Access-Control-Allow-Origin: https://muqabla-auction.vercel.app
Access-Control-Allow-Credentials: true
```

### 3. Live WebSocket & Role Verification
1. Open the Vercel URL in your browser.
2. Log into the **Admin** dashboard (`admin`).
3. Open an Incognito window and log in as Captain A (`ashmit_curry`).
4. In Admin, reveal a player and click **Start Bidding**.
5. In Captain A, observe the live 10-second timer and place a bid.
6. Verify that Captain A sees the anonymous bid confirmation and the timer resets to 10 seconds.
7. Confirm that Public Display (`display`) does NOT expose Captain A's identity or private team budget.

---

## Part F: Operations, Password Resets & Backups

### Resetting a Captain Password
If a captain needs their password reset before or during the auction:
```bash
DATABASE_URL="postgres://..." npm run reset:password -- --user vansh_baby
# Or set an explicit password:
DATABASE_URL="postgres://..." npm run reset:password -- --user vansh_baby --password "SecretPass2026!"
```

### Exporting Database Snapshot
To create an offline JSON snapshot of all tables (`teams`, `users`, `players`, `bids`, `sales`, `audit_logs`):
```bash
DATABASE_URL="postgres://..." npm run db:backup
```
The snapshot will be saved in `backups/auction_pg_snapshot_<timestamp>.json`.

---

## Part G: Rollback Strategy

1. **Frontend Rollback**:
   - In Vercel Dashboard, go to **Deployments**.
   - Click the three dots next to the previous working deployment → **Instant Rollback**.
2. **Backend Rollback**:
   - In Render Dashboard, go to **Events** / **Deploys**.
   - Click **Rollback to this deploy** on any previous successful build.
3. **Database State Rollback**:
   - To undo an accidental sale during the live auction: click the **Undo Last Sale** button on the Admin Dashboard before the next player starts bidding.
   - For database disaster recovery: restore from the automated point-in-time recovery backup provided by Render/Supabase/Neon.
