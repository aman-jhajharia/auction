# 🚀 Muqabla 2026 Live Auction — Production Deployment Guide

This guide provides end-to-end, step-by-step instructions to deploy the **Muqabla 2026 Basketball Player Auction Platform** to a Linux VPS (Ubuntu 22.04 or 24.04 LTS) under your own custom domain or subdomain with **HTTPS, WebSocket reverse proxying (Nginx), PM2 process manager, and automated SQLite backups**.

---

## 1. Architecture Summary for Production

```
 [ Browser / Captain Phone / Projector ]
                  │
             HTTPS / WSS (Port 443)
                  │
                  ▼
         [ Nginx Reverse Proxy ]
      - SSL / TLS Termination (Let's Encrypt)
      - WebSocket Upgrade Headers (HTTP 101)
      - Gzip & Static Asset Caching
                  │
             HTTP / WS (Port 4000 on localhost)
                  │
                  ▼
         [ PM2 Process Manager ]
            muqabla-auction (Node.js 20 LTS)
                  │
                  ▼
     [ Single-Origin Fullstack App ]
      ├─ Serves Client: client/dist
      ├─ Express API: /api
      ├─ Socket.IO Hub: /socket.io
      └─ SQLite DB with WAL: data/auction.db
```

---

## 2. Server Requirements

- **Operating System**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- **CPU**: 1 vCPU minimum (2 vCPU recommended for live auction events)
- **RAM**: 1 GB minimum (2 GB recommended)
- **Disk**: 15 GB SSD
- **Network Ports Open**: `80` (HTTP for SSL verification), `443` (HTTPS/WSS)
  *(Port 4000 remains internal on localhost and is NEVER exposed directly to the public internet).*

---

## 3. Server Setup & Dependencies

### Step 1: Update Packages & Install System Tools
SSH into your server and run:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw certbot python3-certbot-nginx build-essential
```

### Step 2: Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # Should output v20.x.x
npm -v    # Should output 10.x.x
```

### Step 3: Install PM2 Process Manager Globally
```bash
sudo npm install -g pm2
```

### Step 4: Configure UFW Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## 4. Deploying the Application

### Step 1: Clone the Codebase
```bash
cd /var/www
sudo git clone <YOUR_GIT_REPOSITORY_URL> muqabla-auction
sudo chown -R $USER:$USER /var/www/muqabla-auction
cd /var/www/muqabla-auction
```

### Step 2: Install Dependencies
```bash
npm install
npm --prefix server install
npm --prefix client install
```

### Step 3: Configure Environment Variables (`.env`)
Copy the provided environment template:
```bash
cp .env.example .env
```

Generate a secure 64-character JWT cryptographic secret:
```bash
openssl rand -hex 32
```

Edit `.env` using your preferred editor (`nano .env`):
```ini
NODE_ENV=production
PORT=4000
JWT_SECRET=paste_your_generated_64_character_openssl_secret_here
JWT_EXPIRES_IN=24h

# Set your actual domain name:
CORS_ORIGIN=https://YOUR-DOMAIN.com,https://auction.YOUR-DOMAIN.com
FRONTEND_ORIGIN=https://YOUR-DOMAIN.com

# Database storage path (outside build directory)
DATABASE_PATH=./data/auction.db

# Optional: You can specify custom passwords for admin/display or leave blank to auto-generate
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
DISPLAY_USERNAME=display
DISPLAY_PASSWORD=
```

---

## 5. Account Seeding & Secure Password Generation

The application includes an automated, idempotent production seed CLI that creates the **5 Captain Accounts**, **Admin**, and **Display** accounts with secure random 16-character passwords and displays them **ONCE** to your terminal.

Run the production seed command:
```bash
npm run seed:prod
```

### Generated Account Summary:

| Role | Team Name | Login ID (Username) | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | Platform Admin | `admin` | Full control room, 5-team squads, audit logs |
| **Display** | Arena Display | `display` | 16:9 Projector presentation screen |
| **Captain** | Ashmit | `ashmit_curry` | Phoenix (Captain: Ashmit, Retained: Rahul Sharma) |
| **Captain** | Vansh | `vansh_baby` | Spartans (Captain: Vansh, Retained: Sneha Reddy) |
| **Captain** | Divyanshu | `divyanshu_lebron` | Thunder (Captain: Divyanshu, Retained: Arjun Singh) |
| **Captain** | Chirayu | `champ_chirayu` | Gladiators (Captain: Chirayu, Retained: Rohit Nair) |
| **Captain** | Parth | `parth_gangsta` | Vipers (Captain: Parth, Retained: Ritu Sen) |

> ⚠️ **IMPORTANT**: Copy the generated passwords output in the terminal and distribute each login ID and password securely to the respective team captain. Passwords are saved **only** as one-way bcrypt hashes in the database.

### Need to Reset a Captain's Password Later?
If a captain forgets their password or you need to issue a new one:
```bash
npm run reset:password -- --user vansh_baby
# Or specify an explicit password:
npm run reset:password -- --user vansh_baby --password "NewSecurePassword123!"
```

---

## 6. Build & Launch with PM2

### Step 1: Create Production Build
```bash
npm run build
```
*(This compiles both the React frontend into `client/dist` and the TypeScript backend into `server/dist` in seconds).*

### Step 2: Start Application via PM2
```bash
pm2 start ecosystem.config.cjs --env production
```

### Step 3: Configure PM2 to Auto-Start on System Boot
```bash
pm2 startup
# Copy and execute the command PM2 prints to your terminal, then save state:
pm2 save
```

### Useful PM2 Commands:
- `pm2 status`: View application health and uptime.
- `pm2 logs muqabla-auction`: View live application logs (never contains passwords).
- `pm2 restart muqabla-auction`: Gracefully restart the application.

---

## 7. Nginx Reverse Proxy & WebSocket Configuration

Nginx acts as the public-facing gateway on ports 80/443, proxying HTTP and WebSocket connections to Node.js on port 4000.

### Step 1: Create Nginx Site Configuration
```bash
sudo nano /etc/nginx/sites-available/muqabla-auction
```

Paste the following configuration (replace `YOUR-DOMAIN.com` with your actual domain or subdomain):

```nginx
# Upstream Node.js server
upstream auction_backend {
    server 127.0.0.1:4000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name YOUR-DOMAIN.com;

    # Redirect all HTTP traffic to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name YOUR-DOMAIN.com;

    # SSL certificates will be configured by Certbot in Step 8

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload limit (for player imports if needed)
    client_max_body_size 10M;

    # 1. Real-time WebSocket Proxy (Socket.IO)
    location /socket.io/ {
        proxy_pass http://auction_backend/socket.io/;
        proxy_http_version 1.1;

        # Mandatory WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Preserve client IP and protocol
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts for persistent live auction sessions
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # 2. REST API & Health Check
    location /api/ {
        proxy_pass http://auction_backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Frontend Single-Page App (SPA)
    location / {
        proxy_pass http://auction_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 2: Enable Configuration & Test Nginx
```bash
sudo ln -s /etc/nginx/sites-available/muqabla-auction /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Domain DNS & HTTPS/SSL Setup (Let's Encrypt)

### Step 1: Point DNS to Your Server
In your domain registrar DNS panel (Cloudflare, GoDaddy, Namecheap, etc.):
- Create an **`A` record**:
  - **Host**: `@` (or `auction` if using a subdomain)
  - **Value**: Your VPS Public IPv4 Address
  - **TTL**: Auto or 300s

Wait 2–5 minutes for DNS propagation, then verify:
```bash
ping YOUR-DOMAIN.com
```

### Step 2: Obtain Free SSL Certificate
Run Certbot:
```bash
sudo certbot --nginx -d YOUR-DOMAIN.com
```
Follow the prompts (enter your admin email and agree to terms). Certbot will automatically install the SSL certificates and configure auto-renewal.

Test SSL auto-renewal:
```bash
sudo certbot renew --dry-run
```

---

## 9. SQLite Persistence & Backup Strategy

The database uses SQLite in **WAL (Write-Ahead Logging)** mode. The database file is located at `/var/www/muqabla-auction/data/auction.db` and is preserved across builds and server reboots.

### Manual Backup Command
Create an instant, non-blocking online backup without interrupting live bidding:
```bash
npm run db:backup
```
Backups are saved to `/var/www/muqabla-auction/backups/auction_backup_YYYY-MM-DD_HH-mm-ss.db`.

### Automated Hourly Cron Job
To automatically back up the database every hour during tournament day:
```bash
crontab -e
```
Add the following line at the end:
```cron
0 * * * * cd /var/www/muqabla-auction && npm run db:backup >> /var/www/muqabla-auction/logs/backup.log 2>&1
```

### Restoring from a Backup
If you ever need to restore a backup:
1. Stop the application: `pm2 stop muqabla-auction`
2. Copy the backup file over the active database:
   ```bash
   cp backups/auction_backup_TARGET_TIMESTAMP.db data/auction.db
   rm -f data/auction.db-wal data/auction.db-shm
   ```
3. Restart the application: `pm2 start muqabla-auction`

---

## 10. Update & Rollback Procedures

### Standard Update (Zero Database Loss)
```bash
cd /var/www/muqabla-auction

# 1. Take safety backup
npm run db:backup

# 2. Pull latest code
git pull origin main

# 3. Install dependencies & build
npm install
npm run build

# 4. Gracefully reload PM2 process
pm2 reload muqabla-auction
```

### Emergency Rollback
```bash
cd /var/www/muqabla-auction
git checkout <PREVIOUS_COMMIT_OR_TAG>
npm run build
pm2 restart muqabla-auction
```

---

## 11. Production Verification Checklist

Run through this checklist before opening the live auction:

- [ ] **Health Check**: Visit `https://YOUR-DOMAIN.com/api/health` and verify `{"status":"ok","database":"connected"}`.
- [ ] **HTTPS Padlock**: Ensure browser URL bar shows secure lock `https://` with no mixed-content warnings.
- [ ] **Socket.IO Connection**: Open browser DevTools Network tab, filter by `WS`, verify WebSocket connection to `/socket.io/?EIO=4&transport=websocket` is status `101 Switching Protocols`.
- [ ] **Admin Login**: Log in as `admin`, verify 5 teams exist with correct names (Ashmit, Vansh, Divyanshu, Chirayu, Parth).
- [ ] **Captain Logins**: Log in as Captain Ashmit (`ashmit_curry`). Verify only Ashmit's squad and budget are visible.
- [ ] **Anti-Favouritism Verification**: Place a bid as Captain Ashmit. Open Captain Vansh's dashboard in another window and verify that Vansh sees `CURRENT BID: X` but **NOT** Ashmit's name.
- [ ] **Public Display**: Open `https://YOUR-DOMAIN.com` logged in as `display`. Verify full-screen 16:9 projector mode has zero team budgets or bidder names.
- [ ] **Test Database Backup**: Run `npm run db:backup` and verify backup file created in `backups/`.
