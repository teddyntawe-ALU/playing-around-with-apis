# RxLens

Look up official FDA medication labels and check whether a drug has been recalled, using live data from the openFDA API.

- **Live site:** https://www.teddyntawe.tech
- **Demo video:** https://www.youtube.com/watch?v=_j_SBkCJtVs

## Why

When you want to know what a medicine is for, how to take it, or whether it has been recalled, the trustworthy answer lives in FDA databases that aren't easy to search. RxLens puts both behind one search box and shows the important parts first: uses, dosage, warnings, and recall severity.

It's a learning project, not medical advice. Always check with a pharmacist or doctor.

## What you can do

- **Search medications** by brand or generic name (try `ibuprofen` or `metformin`). The home page already shows the most recently updated labels.
- **Filter** by route (oral, topical, injection…) and by over-the-counter vs prescription.
- **Sort** by best match, name, manufacturer, route or last update.
- **Open the full label** to read every section, including boxed warnings, with a link to DailyMed.
- **Check recalls** for a drug in one click, filter by severity (Class I–III) or status, and sort by date or severity.
- **Refine** the results on screen by typing a manufacturer or keyword. This happens instantly, with no extra API calls.

If something goes wrong (no results, a typo with odd characters, the FDA being slow or down, or you going offline), you get a clear message and a retry button instead of a blank page. The layout works on phones, supports dark mode, and the footer shows which server answered you.

## How it works

```
Browser ──HTTPS──▶ Lb01 (HAProxy) ──▶ Web01 / Web02 (Nginx ▶ Node/Express) ──▶ api.fda.gov
```

The browser never talks to openFDA directly. It calls our small Express backend. The backend checks the input, builds the openFDA query, waits at most 8 seconds for an answer, tidies up the response, and caches it for 5 minutes. Any API key stays on the server.

**Built with:** Node.js 20+, Express 5, Helmet, plain HTML/CSS/JavaScript (no build step), `node:test` + Supertest, Nginx, systemd and HAProxy.

```
src/       backend: routes, openFDA client, validation, cache
public/    frontend: index.html, css/, js/
tests/     automated tests (openFDA is faked, so they run offline)
deploy/    Nginx, HAProxy and systemd configs
scripts/   deploy, load-balancer test and live smoke test
```

## The API: openFDA

Data comes from the [openFDA API](https://open.fda.gov/apis/), run by the U.S. Food and Drug Administration.

| Endpoint | Used for |
|---|---|
| [`/drug/label.json`](https://open.fda.gov/apis/drug/label/) | Medication labels |
| [`/drug/enforcement.json`](https://open.fda.gov/apis/drug/enforcement/) | Drug recalls |

It works without a key (1,000 requests a day per IP). A [free key](https://open.fda.gov/apis/authentication/) raises that to 120,000. One quirk worth knowing: openFDA answers "no results" with a 404, so the backend treats that as an empty list, not an error.

> Data provided by openFDA (U.S. FDA). This project is not endorsed by the FDA. Full-label links go to [DailyMed](https://dailymed.nlm.nih.gov/) (U.S. National Library of Medicine). See the openFDA [terms](https://open.fda.gov/terms/) and [license](https://open.fda.gov/license/).

## Run it locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/teddyntawe-ALU/playing-around-with-apis.git
cd playing-around-with-apis
npm install
cp .env.example .env
npm run dev
```

Then open http://localhost:3000.

The defaults in `.env` are fine for local use. The settings you might change are `PORT`, `OPENFDA_API_KEY` (optional) and `SERVER_NAME` (the name shown in the footer). Every option is explained in `.env.example`.

## Tests

```bash
npm test                                        # 53 offline tests
npm run smoke                                   # live checks against http://localhost:3000
node scripts/smoke.mjs https://www.teddyntawe.tech
```

The offline tests cover every endpoint, bad input, and every way openFDA can fail: no results, rate limits, outages, timeouts and broken responses. They also check that the API key never reaches the browser.

## Deployment

| Server | Role |
|---|---|
| Web01, Web02 | Run the app (Node on port 3000, behind Nginx on port 80) |
| Lb01 | HAProxy: handles HTTPS and spreads traffic across both web servers |

### Web01 and Web02

Run the same steps on both servers so they serve identical code. The script installs Node, clones the repo into `/opt/rxlens`, sets up the systemd service and Nginx, backs up the old Nginx site, and finishes with a health check.

```bash
ssh ubuntu@<WEB_SERVER_IP>
sudo cp -a /etc/nginx /etc/nginx.bak.$(date +%F)       # extra backup, just in case
curl -fsSL -o deploy-web.sh https://raw.githubusercontent.com/teddyntawe-ALU/playing-around-with-apis/main/scripts/deploy-web.sh
sudo bash deploy-web.sh https://github.com/teddyntawe-ALU/playing-around-with-apis.git main
```

Running the same command again later pulls the latest code and restarts the app. To check it worked:

```bash
curl -i http://<WEB_SERVER_IP>/api/health
```

### Lb01

The HAProxy config is in [`deploy/haproxy/haproxy.cfg`](deploy/haproxy/haproxy.cfg). Back up the current one, copy ours in, fill in the server IPs and your certificate, then validate and reload:

```bash
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak.$(date +%F)
sudo cp haproxy.cfg /etc/haproxy/haproxy.cfg
sudo sed -i 's/WEB01_IP/<web01-ip>/; s/WEB02_IP/<web02-ip>/; s#CERT_PEM#/etc/haproxy/certs/<domain>.pem#' /etc/haproxy/haproxy.cfg
sudo haproxy -c -f /etc/haproxy/haproxy.cfg && sudo systemctl reload haproxy
```

What it does:

- Redirects HTTP to HTTPS and terminates TLS.
- Alternates requests between Web01 and Web02 (round robin).
- Checks `/api/health` on each server every 2 seconds, takes a failing server out after two misses, and brings it back once it recovers.
- If a server errors on a request, retries it on the other one, so visitors don't notice.

(If your load balancer runs Nginx instead, there's an equivalent config in `deploy/nginx/lb01-nginx.conf`.)

### Checking the load balancer

```bash
bash scripts/test-lb.sh https://www.teddyntawe.tech 10
```

This prints which server answered each request. On 25 Nov 2026, 10 requests split 5 / 5. Then I stopped the app on Web01:

- Every request kept working, served by Web02.
- HAProxy marked Web01 as down within seconds.
- When Web01 was restarted, it rejoined by itself.

To try it yourself:

```bash
ssh ubuntu@<web01-ip> sudo systemctl stop rxlens     # site keeps working via Web02
ssh ubuntu@<web01-ip> sudo systemctl start rxlens    # Web01 rejoins after a few seconds
```

## Troubleshooting

| Problem | What to check |
|---|---|
| "The FDA is busy right now" | You hit openFDA's daily limit. Add a free API key to `.env`. |
| 502 Bad Gateway on a web server | The app isn't running: `sudo systemctl status rxlens` and `journalctl -u rxlens -n 50` |
| Old Nginx page still showing | `ls /etc/nginx/sites-enabled/` should only list `rxlens`. Reload Nginx. |
| HAProxy shows a server as DOWN | On that server, run `curl -i http://127.0.0.1/api/health`. Make sure port 80 is open. |
| Port 3000 already in use | Change `PORT` in `.env` or stop the other process (`lsof -i :3000`). |

## Security

- The API key lives only in `.env` on the server. That file is git-ignored and never sent to the browser.
- All input is checked before it reaches openFDA. Anything that could change the query syntax is rejected.
- FDA text is put on the page as plain text, never as HTML, and a strict Content-Security-Policy blocks inline scripts.
- The app runs as its own low-privilege user, listens only on localhost, and is reached through Nginx.
- Still to do: rate limiting on our own API.

## Credits

Data from [openFDA](https://open.fda.gov/) (U.S. Food and Drug Administration). Label links from [DailyMed](https://dailymed.nlm.nih.gov/). Based on the "Playing with APIs" reference project.
