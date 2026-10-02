# 🏀 Muqabla 2026 — Live Basketball Player Auction Platform

A production-ready, real-time sports auction web application custom-built for **Muqabla**, the annual intra-university sports festival.

Designed to replace chaotic manual whiteboard auctions with a **fair, strictly enforced, anonymous, and anti-favouritism live draft platform**.

---

## 🚀 Instant Quick Start

The server is currently running locally on:
**[http://localhost:4000](http://localhost:4000)**

### Pre-Configured Credentials

Accounts and secure initial credentials are generated via `npm run accounts:init` (passwords stored strictly as bcrypt hashes):

| Role | Username | Team Name | Captain Name | Retained Player |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | Platform Admin | Administrator | — |
| **Public Display** | `display` | Screen / Projector | Display Mode | — |
| **Team A Captain** | `ashmit_curry` | Team Ashmit | Ashmit | Rahul Sharma |
| **Team B Captain** | `vansh_baby` | Team Vansh | Vansh | Sneha Reddy |
| **Team C Captain** | `divyanshu_lebron` | Team Divyanshu | Divyanshu | Arjun Singh |
| **Team D Captain** | `champ_chirayu` | Team Chirayu | Chirayu | Rohit Nair |
| **Team E Captain** | `parth_gangsta` | Team Parth | Parth | Ritu Sen |

---

## ⚡ Core Rules & Mathematical Enforcement

1. **Squad Structure**:
   - Starting Budget: **100 Credits**
   - Minimum Squad Size: **5 players** (1 Captain + 1 Retained + at least 3 Auctioned)
   - Maximum Squad Size: **8 players** (1 Captain + 1 Retained + at most 6 Auctioned)
   - Captain counts as 1 player
   - Exactly 1 Retained Player pre-assigned by Admin before auction (Costs 0 credits, marked `RETAINED — FREE`)
2. **Compulsory Female Requirement**:
   - Every final team must have **at least 1 female player** (Captain, Retained, or Auctioned).
   - The validation engine prevents captains from spending all their credits on male players if it would make it mathematically impossible to satisfy the female player requirement.
   - If a team has 7 players and 0 females, bids on male players are strictly rejected: they **must** acquire a female player as their 8th player.
3. **Credit Reservation Formula**:
   - When a team has $C$ credits remaining and needs $R$ more players to reach the minimum size of 5:
   - Maximum legal bid is:
     $$\text{Max Legal Bid} = C - (R - 1) \times \text{min\_bid}$$
   - Verified against edge cases (e.g. 1st bid cap = 98 credits, leaving 2 credits for the remaining 2 required players).
4. **Anonymous Live Bidding (Anti-Favouritism)**:
   - When Team A bids, other captains and the public display only see `CURRENT BID: 30`.
   - Captains **never** see who is bidding against them.
   - Captains cannot strategic-lobby or manipulate bids based on friendships.
   - Only the Administrator sees the live bidder identity in the Control Center.
   - Winning team is revealed on the public screen **only after** the sale is confirmed by the admin.
5. **No Trades or Post-Auction Swaps**:
   - All sales are final.
   - Administrator has an **Undo Last Sale** mechanism available strictly before the next player begins bidding.

---

## 🛠 Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Real-Time Engine**: Socket.IO with privacy rooms (`admin`, `display`, and private `captain_<teamId>`)
- **Database**: SQLite with `better-sqlite3` in **WAL (Write-Ahead Logging)** mode for ACID transactions with zero cloud latency
- **Concurrency**: FIFO async mutex queue for handling simultaneous microsecond bids
- **Audio Engine**: Synthesized Web Audio API stadium sound effects (bid chirps, countdown ticks, gavel strikes)
- **Frontend**: Vite + React + TypeScript with dark sports aesthetics, glassmorphism, and responsive layouts
- **Automated Testing**: Vitest test suite with 22 unit & integration tests

---

## 🧪 Running Automated Tests

To run the complete test suite:

```bash
npm test
```

This verifies:
- Budget deductions and reservations
- Compulsory female player requirement edge cases
- Roster capacity limits (8 players)
- Live multi-captain concurrent bid race conditions
- Sale confirmation, credit deductions, and undo refunds
