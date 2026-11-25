# RxLens — FDA Medication Label & Recall Lookup

RxLens is a web application that lets anyone search **official U.S. FDA medication labels** and check whether a medication has been **recalled**, using live data from the [openFDA API](https://open.fda.gov/apis/). It runs on two application servers (Web01, Web02) behind a load balancer (Lb01).

> **Live app (via Lb01):** https://www.teddyntawe.tech &nbsp;·&nbsp; **Demo video (≤ 2 min):** _link to be added_

---

## Table of contents

1. [Problem](#1-problem)
2. [Features](#2-features)
3. [Technologies](#3-technologies)
4. [Architecture](#4-architecture)
5. [API provider & attribution](#5-api-provider--attribution)
6. [Prerequisites](#6-prerequisites)
7. [Installation](#7-installation)
8. [Environment configuration](#8-environment-configuration)
9. [Running locally](#9-running-locally)
10. [Testing](#10-testing)
11. [API reference (backend)](#11-api-reference-backend)
12. [Deployment overview](#12-deployment-overview)
13. [Web01 deployment](#13-web01-deployment)
14. [Web02 deployment](#14-web02-deployment)
15. [Lb01 load-balancer configuration](#15-lb01-load-balancer-configuration)
16. [Testing the load balancer](#16-testing-the-load-balancer)
17. [Troubleshooting](#17-troubleshooting)
18. [Security considerations](#18-security-considerations)
19. [Project structure](#19-project-structure)
20. [Demo video](#20-demo-video)
21. [Deployed application](#21-deployed-application)

---

## 1. Problem

Patients, caregivers and students often need quick, trustworthy answers to two questions:

- *What is this medication for, how is it taken, and what are its warnings?*
- *Has this medication (or a product I bought) been recalled, and how serious is it?*

The authoritative answers are published by the FDA, but they are spread across large databases that are hard to search without technical knowledge. RxLens puts both data sets behind one simple search box, presents the important parts first, and links to the full official label on DailyMed.

> RxLens is an educational tool. It is **not** medical advice. The data may be incomplete or out of date.

## 2. Features

**Medications (FDA drug labels)**
- Loads the most recently updated FDA labels on the home page, so it's useful the moment it opens.
- Search by brand, generic or active-substance name (e.g. `ibuprofen`, `Tylenol`, `metformin`).
- **Filter** by route of administration (oral, topical, intravenous…) and by type (over-the-counter / prescription). Filtering runs on the server through openFDA.
- **Sort** by best match, brand name A–Z / Z–A, manufacturer, route, or most recently updated.
- Cards show brand and generic name, manufacturer, route, OTC/Rx badge, **boxed-warning** badge, uses, dosage and warnings.
- **Full label** dialog with every available section (boxed warning, indications, dosage, contraindications, adverse reactions, interactions…), a link to DailyMed and a **“Check recalls for this drug”** shortcut.

**Recalls (FDA enforcement reports)**
- Search recalls by product or company name; the latest recalls load by default.
- **Filter** by severity (Class I / II / III) and status (Ongoing / Completed / Terminated).
- **Sort** by newest, oldest, most severe or least severe.
- Colour-coded severity, recall number, reason, quantity, distribution and dates.

**Everywhere**
- “Refine loaded results”: instant client-side text filter (e.g. by manufacturer) with no extra API calls.
- “Load more” pagination, a **Refresh** button that bypasses the server cache, and shareable URLs (`?tab=recalls&q=metformin&sort=severity-desc`) that work with browser back/forward.
- Skeleton loading states, helpful empty states and clear, specific error messages (rate limit, timeout, FDA outage, offline, invalid input). The page never goes blank.
- Responsive layout (phone → desktop), keyboard accessible (`/` focuses search, arrow keys switch tabs), automatic dark mode.
- Footer shows which server (`web-01` / `web-02`) answered, which makes load balancing visible.

## 3. Technologies

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js ≥ 20 | Built-in `fetch`, `AbortController`, test runner |
| Backend | Express 5 | Minimal, well-known; async errors handled natively |
| Security headers | Helmet | Strict Content-Security-Policy and safe defaults |
| Config | dotenv | Secrets and environment settings stay out of code |
| Frontend | HTML, CSS, vanilla JavaScript (ES modules) | No build step; easy to read, explain and deploy |
| Tests | `node:test` + Supertest | No heavy framework; tests the real Express app with a fake openFDA |
| Servers | Ubuntu, Nginx (reverse proxy), systemd | Standard, matches the existing web-server setup |
| Load balancer | HAProxy (Nginx alternative included) | Round-robin with active health checks |

## 4. Architecture

```
                        ┌──────────────────────────── Lb01 ───────────────────────────┐
  Browser ─ HTTPS :443 ▶│ HAProxy · TLS · roundrobin · health check /api/health (2s) │
                        └───────────────┬──────────────────────────────┬──────────────┘
                                        │                              │
                ┌────────── Web01 ──────▼─────┐        ┌────────── Web02 ──────▼─────┐
                │ Nginx :80 (X-Served-By)     │        │ Nginx :80 (X-Served-By)     │
                │   └▶ Node/Express :3000     │        │   └▶ Node/Express :3000     │
                │       ├ /            static │        │       ├ /            static │
                │       ├ /api/drugs          │        │       ├ /api/drugs          │
                │       ├ /api/recalls        │        │       ├ /api/recalls        │
                │       └ /api/health         │        │       └ /api/health         │
                └──────────────┬──────────────┘        └──────────────┬──────────────┘
                               └────────────── HTTPS ─────────────────┘
                                                ▼
                                   api.fda.gov (openFDA)
```

**Request flow:** the browser only talks to our backend (`/api/...`). The backend validates the input, builds the openFDA query, calls openFDA with an 8-second timeout, normalises the response into a compact shape, caches it for 5 minutes, and returns JSON. The browser renders it. The optional API key never leaves the server.

**Backend layers (`src/`):**

| File | Responsibility |
|---|---|
| `config.js` | Reads all settings from environment variables |
| `utils/validate.js` | Validates and sanitises query parameters |
| `utils/errors.js` | `AppError`, the single error type returned to clients |
| `services/queries.js` | Builds openFDA search expressions |
| `services/openfdaClient.js` | HTTP calls, timeout, caching, error mapping |
| `services/transform.js` | Converts raw openFDA records to UI-friendly objects |
| `services/cache.js` | In-memory TTL + LRU cache |
| `routes/*.js` | `/api/drugs`, `/api/recalls`, `/api/health` |
| `app.js` / `server.js` | Express setup and process start/shutdown |

**Frontend (`public/js/`):** `main.js` (state, URL sync, events), `api.js` (fetch wrapper), `render.js` (cards and states), `detail.js` (label dialog), `sort.js` (pure sort/filter/validation logic, unit-tested), `dom.js` (safe element builder: data is inserted only as text, never as HTML).

## 5. API provider & attribution

This project uses the **openFDA API**, provided by the **U.S. Food and Drug Administration**.

| Endpoint | Used for | Docs |
|---|---|---|
| `GET https://api.fda.gov/drug/label.json` | Drug labelling (Structured Product Labeling) | https://open.fda.gov/apis/drug/label/ |
| `GET https://api.fda.gov/drug/enforcement.json` | Drug recall enforcement reports | https://open.fda.gov/apis/drug/enforcement/ |

- Query syntax: https://open.fda.gov/apis/query-syntax/
- Authentication & rate limits: https://open.fda.gov/apis/authentication/ (no key: 240 requests/min and 1,000/day per IP; with a free key: 120,000/day)
- Terms of service: https://open.fda.gov/terms/ · License: https://open.fda.gov/license/ (public domain / CC0)
- Full-label links point to **DailyMed** by the U.S. National Library of Medicine: https://dailymed.nlm.nih.gov/

> *Data provided by openFDA (U.S. Food and Drug Administration). This product uses the openFDA API but is not endorsed or certified by the FDA. Do not rely on openFDA to make decisions regarding medical care.*

How the API is used:
- Labels are searched with `(openfda.brand_name:"q" openfda.generic_name:"q" openfda.substance_name:"q")`, plus `AND openfda.route:"…"` / `AND openfda.product_type:"…"` for filters.
- Recalls are searched on product description, brand, generic name and recalling firm, sorted by `report_date:desc`.
- openFDA answers “no results” with **HTTP 404 `NOT_FOUND`**. The backend turns that into an empty result, not an error.

## 6. Prerequisites

- **Node.js 20 or newer** and npm (`node -v`)
- Git
- Internet access (the app calls `api.fda.gov`)
- For deployment: three Ubuntu servers (Web01, Web02, Lb01) reachable over SSH with `sudo`

## 7. Installation

```bash
git clone <YOUR_REPO_URL> rxlens
cd rxlens
npm install
cp .env.example .env
```

## 8. Environment configuration

All configuration is in `.env` (never committed). Defaults work for local development.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` on servers, so only Nginx can reach it) |
| `NODE_ENV` | `development` | `production` on servers (enables static-file caching) |
| `SERVER_NAME` | machine hostname | Shown in `/api/health` and the `X-Served-By` header |
| `TRUST_PROXY` | `loopback` | Express `trust proxy` setting (proxies whose `X-Forwarded-For` is trusted) |
| `OPENFDA_API_KEY` | _(empty)_ | Optional free key from https://open.fda.gov/apis/authentication/ |
| `OPENFDA_BASE_URL` | `https://api.fda.gov` | Override for testing |
| `OPENFDA_TIMEOUT_MS` | `8000` | Abort openFDA requests after this many ms |
| `CACHE_TTL_SECONDS` | `300` | How long identical searches are cached (0 disables) |
| `CACHE_MAX_ENTRIES` | `500` | Max cached responses per server |

## 9. Running locally

```bash
npm run dev      # auto-restarts on file changes
# or
npm start
```

Open http://localhost:3000. Check the backend directly:

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/drugs?q=ibuprofen&route=ORAL&limit=3"
curl "http://localhost:3000/api/recalls?q=metformin&classification=Class%20II&limit=3"
```

## 10. Testing

**Automated tests (offline, 53 tests):**

```bash
npm test
```

These cover every endpoint, the openFDA query building, data transformation, the cache, input validation (8 kinds of bad input, each rejected without calling openFDA), and **every upstream failure mode**: 404-no-match, 429 rate limit, 500 outage, 400 rejection, non-JSON body, missing fields, network failure and timeout. They also check that the API key is never exposed, and test the frontend's sort/filter logic. openFDA is replaced with a fake `fetch`, so the tests are fast and deterministic.

**Live smoke test (real openFDA, against any running instance):**

```bash
npm run smoke                          # http://localhost:3000
node scripts/smoke.mjs http://<WEB01_IP>
node scripts/smoke.mjs http://<LB01_IP>
```

**Manual checks done in the browser:** home page loads live labels; search, route/type filters, all sort options, refine, load more, full-label dialog, “check recalls” hand-off, recall severity sorting, gibberish search (friendly empty state), invalid characters (inline validation), FDA unreachable (error state with retry), 375 px mobile layout (no horizontal scroll), dark mode.

## 11. API reference (backend)

All errors use the shape `{ "error": { "code": "…", "message": "…" } }`.

| Method & path | Query parameters | Notes |
|---|---|---|
| `GET /api/health` | — | `{status, server, version, uptimeSeconds, timestamp}`. Does not call openFDA, so an FDA outage doesn't take servers out of the load balancer |
| `GET /api/drugs` | `q` (2–100 chars), `route`, `type` (`otc`/`rx`), `limit` (1–100, default 24), `skip` (0–25000), `refresh=1` | No `q` → newest labels |
| `GET /api/drugs/:id` | — | Full label sections + DailyMed URL; 404 if not found |
| `GET /api/recalls` | `q`, `classification` (`Class I`/`II`/`III`), `status` (`Ongoing`/`Completed`/`Terminated`), `limit`, `skip`, `refresh=1` | Newest reports first |

| Error code | HTTP | When |
|---|---|---|
| `INVALID_INPUT` | 400 | Bad or unsafe query parameter |
| `NOT_FOUND` | 404 | Unknown endpoint or label id |
| `RATE_LIMITED` | 429 | openFDA rate limit reached |
| `UPSTREAM_ERROR` / `UPSTREAM_REJECTED` / `UPSTREAM_MALFORMED` / `UPSTREAM_UNREACHABLE` | 502 | openFDA failed, rejected the query, sent bad data, or was unreachable |
| `UPSTREAM_TIMEOUT` | 504 | openFDA took longer than `OPENFDA_TIMEOUT_MS` |

## 12. Deployment overview

| Server | Role | Software |
|---|---|---|
| Web01 | App server 1 | Node.js 22 (systemd service `rxlens`), Nginx reverse proxy on :80 |
| Web02 | App server 2 | Identical to Web01 |
| Lb01 | Load balancer | HAProxy on :80, round-robin to Web01/Web02 with health checks |

Both web servers run the **same Git commit**. Deploy to Web01 and Web02 with the same command, then point Lb01 at both.

Replace the placeholders below with your real values: `<WEB01_IP>`, `<WEB02_IP>`, `<LB01_IP>`, `<REPO_URL>`, and your SSH user (often `ubuntu`).

## 13. Web01 deployment

```bash
# 1. From your computer: connect
ssh ubuntu@<WEB01_IP>

# 2. On Web01: back up the current Nginx configuration (the script also backs up the default site)
sudo cp -r /etc/nginx /etc/nginx.bak.$(date +%F-%H%M)

# 3. Download and run the deploy script (installs Node 22, clones the repo to /opt/rxlens,
#    installs dependencies, sets up systemd + Nginx, and runs a health check)
curl -fsSL -o deploy-web.sh <RAW_URL_OF>/scripts/deploy-web.sh
sudo bash deploy-web.sh <REPO_URL> main
```

Or clone the repo first and run `sudo bash scripts/deploy-web.sh <REPO_URL> main` from it.

**Manual steps (what the script does)** if you prefer to run them yourself:

```bash
sudo apt-get update && sudo apt-get install -y git nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo useradd --system --home /opt/rxlens --shell /usr/sbin/nologin rxlens
sudo git clone <REPO_URL> /opt/rxlens && cd /opt/rxlens
sudo npm ci --omit=dev
sudo cp .env.example .env && sudo nano .env      # NODE_ENV=production, HOST=127.0.0.1, SERVER_NAME=web-01, optional OPENFDA_API_KEY
sudo chmod 600 .env && sudo chown -R rxlens:rxlens /opt/rxlens
sudo cp deploy/systemd/rxlens.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rxlens
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.pre-rxlens
sudo cp deploy/nginx/web-server.conf /etc/nginx/sites-available/rxlens
sudo ln -sf /etc/nginx/sites-available/rxlens /etc/nginx/sites-enabled/rxlens
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**Verify Web01:**

```bash
curl -i http://127.0.0.1/api/health          # on the server: 200 + X-Served-By header
systemctl status rxlens --no-pager
curl -I http://<WEB01_IP>/                    # from your computer
node scripts/smoke.mjs http://<WEB01_IP>      # from your computer
```

**Update later:** re-run `sudo bash /opt/rxlens/scripts/deploy-web.sh <REPO_URL> main`. It pulls with `--ff-only` and restarts the service.

## 14. Web02 deployment

Repeat [section 13](#13-web01-deployment) on Web02 (`ssh ubuntu@<WEB02_IP>`) with the **same repository and branch**, so both servers run identical code. Then confirm they serve the same version:

```bash
curl -s http://<WEB01_IP>/api/health      # "server":"…web-01", "version":"1.0.0"
curl -s http://<WEB02_IP>/api/health      # "server":"…web-02", "version":"1.0.0"
ssh ubuntu@<WEB01_IP> sudo -u rxlens git -C /opt/rxlens rev-parse --short HEAD
ssh ubuntu@<WEB02_IP> sudo -u rxlens git -C /opt/rxlens rev-parse --short HEAD   # must match
```

## 15. Lb01 load-balancer configuration

**HAProxy (recommended).** Config file: [`deploy/haproxy/haproxy.cfg`](deploy/haproxy/haproxy.cfg).

```bash
ssh ubuntu@<LB01_IP>
sudo apt-get update && sudo apt-get install -y haproxy
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak.$(date +%F-%H%M)   # back up first
# copy deploy/haproxy/haproxy.cfg to /etc/haproxy/haproxy.cfg, then set the server IPs and certificate:
sudo sed -i 's/WEB01_IP/<WEB01_IP>/; s/WEB02_IP/<WEB02_IP>/; s#CERT_PEM#/etc/haproxy/certs/<your-domain>.pem#' /etc/haproxy/haproxy.cfg
# (no certificate? delete the https_front block and the redirect line in http_front)
sudo haproxy -c -f /etc/haproxy/haproxy.cfg          # validate
sudo systemctl enable haproxy && sudo systemctl reload haproxy
```

The key part:

```haproxy
backend rxlens_servers
    balance roundrobin
    option httpchk GET /api/health
    http-check expect status 200
    default-server inter 2s fall 2 rise 2
    server web-01 <WEB01_IP>:80 check
    server web-02 <WEB02_IP>:80 check
```

- `http_front` redirects HTTP to HTTPS; `https_front` terminates TLS with the existing certificate.
- `balance roundrobin`: requests alternate between Web01 and Web02.
- `option httpchk` + `http-check expect status 200`: HAProxy polls `/api/health` every 2 s. A server is removed after 2 failures (~4 s) and re-added after 2 successes.
- `option forwardfor` / `X-Forwarded-Proto`: pass the real client IP and scheme to the web servers.
- `retries 2` + `option redispatch` + `retry-on conn-failure empty-response response-timeout 502 503 504`: if a server refuses the connection or answers 502/503/504 (for example, its Nginx is up but the Node app crashed), the request is retried on the other server, so users see no errors even before the health check marks the server down.
- Stats page (local only): `curl http://127.0.0.1:8404/stats` on Lb01.

**Nginx alternative.** If Lb01 uses Nginx, use [`deploy/nginx/lb01-nginx.conf`](deploy/nginx/lb01-nginx.conf) (an `upstream` block with passive health checks via `max_fails`/`fail_timeout` and `proxy_next_upstream` failover).

## 16. Testing the load balancer

```bash
# 1. Traffic distribution: alternating server names
bash scripts/test-lb.sh https://www.teddyntawe.tech 10
#   1  7123-web-01
#   2  7123-web-02
#   3  7123-web-01 …
#   Distribution: 5 7123-web-01 / 5 7123-web-02

# 2. Same thing with plain curl
for i in $(seq 1 6); do curl -sI https://www.teddyntawe.tech/ | grep -i x-served-by; done

# 3. Full functional test through the load balancer
node scripts/smoke.mjs https://www.teddyntawe.tech

# 4. Failover: stop the app on Web01 …
ssh ubuntu@<WEB01_IP> sudo systemctl stop rxlens
#    … every request is now answered by web-02 (failed attempts are retried immediately;
#    HAProxy marks web-01 DOWN after ~4 s):
bash scripts/test-lb.sh https://www.teddyntawe.tech 6
#    Restore Web01; it rejoins after 2 successful checks (~4 s):
ssh ubuntu@<WEB01_IP> sudo systemctl start rxlens

# 5. Health-check status as HAProxy sees it (run on Lb01)
curl -s "http://127.0.0.1:8404/stats;csv" | cut -d, -f2,18,37 | grep web-
#   web-01,UP,L7OK
#   web-02,UP,L7OK
```

**Results recorded on 2026-11-25** (live servers):

| Test | Result |
|---|---|
| 10 requests via `https://www.teddyntawe.tech` | 5 × web-01, 5 × web-02 |
| Smoke test via the load balancer | 9/9 passed, answers alternating between servers |
| HTTP → HTTPS | `301` to `https://www.teddyntawe.tech/`, certificate valid |
| Stop app on web-01, 6 requests right away | 6 × `200` from web-02 (0 errors) |
| 16 s later | HAProxy: `web-01 DOWN (L7STS)`, `web-02 UP`; 8/8 requests `200` |
| Restart app on web-01, 12 s later | Both `UP (L7OK)`; requests split 4 / 4 again |

In the browser, the footer shows **“Served by web-0X”**. Reload a few times to see it alternate.

## 17. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `EADDRINUSE` on start | Port 3000 is busy. `lsof -i :3000`, or set `PORT=3001` in `.env` |
| “The FDA is busy right now” (429) | openFDA rate limit (1,000/day per IP without a key). Add a free `OPENFDA_API_KEY`; caching already reduces calls |
| “The FDA took too long” (504) | Slow openFDA or network. Raise `OPENFDA_TIMEOUT_MS`; check the server's outbound internet: `curl -I https://api.fda.gov/drug/label.json?limit=1` |
| Nginx shows **502 Bad Gateway** on a web server | The Node service is down. `sudo systemctl status rxlens`, `journalctl -u rxlens -n 50` |
| Nginx serves the old “Holberton” page | The old default site is still enabled. `ls /etc/nginx/sites-enabled/` should list only `rxlens`. Reload Nginx |
| HAProxy marks a server **DOWN** | On that server: `curl -i http://127.0.0.1/api/health`. Check firewall (`sudo ufw status`; allow 80/tcp) |
| Duplicate `X-Served-By` header | Use the provided `web-server.conf`; it hides the app's header and adds Nginx's |
| Search shows no results for a brand name | Try the generic name; openFDA indexes names as published by manufacturers |
| Tests fail with `Cannot find module` | Run `npm install` first |

## 18. Security considerations

- **API key stays server-side.** The browser never calls openFDA. The key is read from `.env` (mode `600`, git-ignored), added only to outgoing server requests, kept out of cache keys and logs, and a test asserts it is never returned to the browser.
- **Input validation.** Every query parameter is validated: length limits, an allow-list of characters, enumerated values for filters, numeric ranges for paging. Characters that could alter openFDA query syntax (`" : * ( ) +`, etc.) are rejected before any upstream request.
- **XSS protection.** All FDA data is inserted into the page with `textContent`, never `innerHTML`. A strict **Content-Security-Policy** (`default-src 'self'`, no inline scripts) is set by Helmet, plus `X-Content-Type-Options`, `frame-ancestors 'none'` and others. External links use `rel="noopener"`, and the DailyMed link is checked against its expected host.
- **Least privilege.** The app runs as an unprivileged `rxlens` system user, under systemd hardening (`NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`), bound to `127.0.0.1`, so only Nginx can reach it.
- **No secrets in Git.** `.gitignore` excludes `.env*`, keys, `node_modules`, logs and build output. `.env.example` contains no real values.
- **Error hygiene.** Clients only get friendly messages and codes. Stack traces and upstream details stay in server logs.
- **Not yet implemented:** HTTPS (terminate TLS at Lb01, e.g. with Let's Encrypt + HAProxy) and per-client rate limiting on our own API. Both are recommended before any real public launch.

## 19. Project structure

```
.
├── src/                     # Express backend (see Architecture)
├── public/                  # Frontend: index.html, css/, js/, favicon.svg
├── tests/                   # node:test suites + fake openFDA helper
├── scripts/
│   ├── deploy-web.sh        # one-command deploy/update for Web01/Web02
│   ├── test-lb.sh           # shows load-balancer distribution
│   └── smoke.mjs            # live end-to-end checks against any URL
├── deploy/
│   ├── haproxy/haproxy.cfg  # Lb01 (HAProxy)
│   ├── nginx/web-server.conf# Web01/Web02 reverse proxy
│   ├── nginx/lb01-nginx.conf# Lb01 alternative (Nginx)
│   └── systemd/rxlens.service
├── codevibe-reports/        # CodeVibe authorship report (generated by CodeVibe)
├── docs/PROJECT_STATUS.md   # progress log, known issues, demo script
├── .env.example
└── package.json
```

## 20. Demo video

_Demo video link (≤ 2 minutes): **to be added**_

## 21. Deployed application

- **Through the load balancer (Lb01): https://www.teddyntawe.tech**
- Health check: https://www.teddyntawe.tech/api/health
- Web01 and Web02 also answer directly on their own IPs over HTTP (for testing). Use the domain for normal access.

---

**Credits:** data by [openFDA](https://open.fda.gov/), U.S. Food and Drug Administration. Label links by [DailyMed](https://dailymed.nlm.nih.gov/), U.S. National Library of Medicine. Inspired by the “Playing with APIs” reference project (MedLookup).
