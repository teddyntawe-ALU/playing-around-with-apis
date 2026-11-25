# Project status — Playing Around with APIs (RxLens)

_Last updated: 2026-11-25_

## Completed (and verified)

| Area | What | How it was verified |
|---|---|---|
| Reference analysis | Watched the reference video (“Playing with APIs”, MedLookup) via its transcript and frames: openFDA labels + recalls, sort/filter, error handling | Transcript read in the browser |
| Backend | Express API: `/api/drugs`, `/api/drugs/:id`, `/api/recalls`, `/api/health`; validation; timeout; cache; error mapping | 53 automated tests pass (`npm test`); live calls to openFDA |
| Frontend | Search, quick chips, route/type/severity/status filters, 6 + 4 sort modes, refine, load more, refresh, detail dialog, recall hand-off, URL state | Driven manually in a browser against live data |
| Error handling | No match, invalid input, FDA unreachable, rate limit, timeout, malformed data, server down (Nginx 502) | Automated tests + manual browser tests (outage simulated with an unreachable base URL) |
| Responsive / a11y | 375 px mobile (no horizontal scroll), dark mode, keyboard shortcuts, ARIA tabs, live regions | Browser at mobile size and dark scheme |
| Deployment assets | systemd unit, Nginx web-server site, HAProxy config, Nginx LB alternative, deploy + LB test scripts, smoke test | `bash -n` + shellcheck clean; smoke test 9/9 locally |
| Docs | README (21 sections), this status file | — |
| GitHub | Public repo https://github.com/teddyntawe-ALU/playing-around-with-apis, `main` | Pushed normally (no force push) |
| Web01 / Web02 | Node 22 + systemd `rxlens` behind Nginx on both, same commit; `/etc/nginx` backed up first (`/etc/nginx.bak.<date>`) | Smoke test 9/9 against each server directly |
| Lb01 | HAProxy 2.0: HTTPS for www.teddyntawe.tech, round-robin, `/api/health` checks every 2 s, retry-on 502/503/504; old config at `/etc/haproxy/haproxy.cfg.bak.2026-11-25-2031` | 5/5 split over 10 requests; smoke 9/9 via domain; failover test with 0 errors (README §16) |

## Outstanding (needs action from you)

1. **Demo video** (≤ 2 min): record it, upload it, and add the link to the README.
2. **CodeVibe report**: generate it with CodeVibe and place it in `codevibe-reports/`.
3. Optional: an openFDA API key in each server's `/opt/rxlens/.env` (raises the daily limit from 1,000 to 120,000 requests per IP), then `sudo systemctl restart rxlens`.
4. Optional: the bare domain `teddyntawe.tech` points straight at web-01 (35.178.153.123), bypassing the load balancer. Point it at lb-01 (3.10.227.167) in your DNS settings if you want both names balanced.

## Known issues / limitations

- An old machine (18.133.158.178) also has the hostname `7123-web-01`. lb-01 does not use it. Deploy only to the web-01 that lb-01 points to.
- The cache is per server (in-memory), so the first identical search on each server calls openFDA once. That's acceptable at this scale.
- Client-side sort reorders only the results loaded so far (24 per page). Use “Load more” to sort a larger set. openFDA can't sort labels by text fields server-side.
- Searches match whole words/phrases as indexed by openFDA (e.g. `5/325` returns nothing; search the drug name instead).
- HTTPS is terminated at Lb01; the web servers themselves still answer plain HTTP on their public IPs. No rate limiting on our own API yet (see README §18).

## Demo script (≤ 2 minutes)

| Time | Show | Say (in your own words) |
|---|---|---|
| 0:00–0:12 | Open https://www.teddyntawe.tech | Name, purpose: FDA labels + recalls from the live openFDA API. Home page already shows the newest labels |
| 0:12–0:40 | Click **Ibuprofen** chip → set Type **Prescription** → Route **Oral** → Sort **Manufacturer A–Z** | Search goes through our backend to openFDA; filters run server-side, sorting is instant client-side |
| 0:40–0:58 | Open **Full label** → scroll boxed warning → **Check recalls for Ibuprofen** | Full official label sections, DailyMed link, hand-off to recalls |
| 0:58–1:20 | Recalls: sort **Most severe first**, filter **Class I**, type `ongoing` in Refine | Different FDA dataset (enforcement reports), severity classes explained |
| 1:20–1:38 | Search `xqzzvbnt` → then type `ibu"profen` | Friendly empty state; invalid characters caught before any API call. Mention timeout/rate-limit handling |
| 1:38–1:55 | Terminal: `bash scripts/test-lb.sh https://www.teddyntawe.tech 6`; browser footer “Served by 7123-web-01/02” | Load balancer alternates between Web01 and Web02; health checks remove a failed server |
| 1:55–2:00 | Wrap up | Thanks |

## Rubric self-assessment (honest, current state)

| Criterion | Max | Now | Notes |
|---|---:|---:|---|
| Purpose and value | 10 | 9 | Real problem, two complementary FDA datasets |
| API usage | 15 | 14 | Two endpoints, filters, paging, detail lookup, optional key, caching |
| Error handling | 10 | 10 | All failure modes handled and tested |
| User interaction | 15 | 14 | Search, filters, sort, refine, detail, hand-off, URL state |
| Server deployment | 10 | 10 | Same commit on Web01 + Web02 via systemd + Nginx; verified directly |
| Load balancer | 10 | 10 | HAProxy round-robin + health checks + HTTPS; distribution and failover tested |
| User interface | 5 | 5 | Responsive, dark mode, consistent |
| Data presentation | 5 | 5 | Clear cards, badges, severity colours, full label view |
| README | 5 | 5 | Complete, with real commands |
| API attribution | 5 | 5 | README + in-app footer |
| Demo functionality | 5 | — | Depends on the recording |
| Demo presentation | 5 | — | Depends on the recording |
| **Total (verified so far)** | **100** | **87 / 90 assessable** | The demo (10 points) depends on your recording |

## Authorship note

You chose to have the AI write the full application. As delivered, nearly all the code is AI-written, so CodeVibe will report AI authorship well above the 20 % cap. Do not try to hide or falsify this. If the cap is strict for grading, discuss it with your facilitator, or rewrite substantial parts yourself so the work becomes genuinely yours. Good candidates: `public/js/render.js`, `src/services/transform.js`, the recall view, and the deployment on the real servers.
