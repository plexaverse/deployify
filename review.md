# Review — audit remediation, 2026-09-11

Everything below was written in one session, **without** the adversarial review agents
(you asked me to skip those). So treat this as *unreviewed work that compiles and passes
tests*, not as verified. That distinction has mattered in this audit: two earlier review
rounds found 7-of-9 and then 4-of-5 "finished" fixes were incomplete, including one of
mine that turned out to be dead code.

**Branch:** `main` · **Base:** `c764769^` (= `1069830`) · **Head:** `2630a4f`
**8 commits · 50 source files · +1198 / −117** (plus dependency and lockfile churn)

## Tree health

| Check | Before | After |
|---|---|---|
| Tests | 564 pass | **585 pass, 0 fail** (+21 new) |
| ESLint | 4 errors | **clean** |
| `tsc --noEmit` | clean | **clean** |
| `next build` | exit 0 | **exit 0** |
| `npm audit --omit=dev` | 60 vulns, 4 critical | **35 vulns, 2 critical** |

---

## How to review this

Per finding below: what was wrong, what changed, and **how to check it yourself**.
Fastest path is the "Verify" line — most are a single grep or a one-line reasoning check.

```bash
git log --oneline --reverse c764769^..HEAD     # the 8 commits
git diff c764769^ HEAD -- src                  # all source changes
```

Reviewing by commit is easier than by file — each commit is one coherent theme and its
message explains the reasoning.

---

# 1 · Production auth bypasses

### 1.1 `MOCK_DB=true` disabled authentication in production
**Was:** `getSession()` returned `MOCK_SESSION` — a fully-privileged enterprise admin —
whenever `MOCK_DB=true`, in **any** `NODE_ENV`. `src/proxy.ts` waved through every
dashboard route on the same condition. One stray env var on a Cloud Run revision served
an unauthenticated admin session to the internet.
**Now:** both require non-production. Production logs loudly and ignores the flag.
**Files:** `src/lib/auth.ts`, `src/proxy.ts`, `src/lib/auth.test.ts`
**Verify:** `grep -n "isProduction" src/lib/auth.ts src/proxy.ts` — the condition must
have a `NODE_ENV !== 'production'` term. 4 tests pin it.
**Risk:** none for dev (unchanged). If any *production* deployment was relying on
`MOCK_DB` to function, it will now correctly demand real auth.

### 1.2 Next.js proxy-bypass CVEs
**Was:** `next@16.2.4`, inside the vulnerable range for *"Middleware / Proxy bypass in App
Router applications"* and *"Middleware / Proxy redirects can be cache-poisoned"*.
`src/proxy.ts` is this platform's only edge auth gate, so a proxy bypass **is** an auth
bypass.
**Now:** `next@16.3.4`.
**Verify:** `npm audit --omit=dev --json | grep -c '"next"'` → 0.
**Risk:** a minor Next upgrade. tsc, lint, 585 tests and `next build` all pass. ⚠️ Worth a
manual smoke test of routing and the edge proxy before you trust it in production.

### 1.3 Session revocation did not exist
**Was:** the session cookie is a self-contained 7-day JWT. Logout only deleted the cookie
client-side; the token stayed valid for its full life. Removing someone from a team could
not cut their access either.
**Now:** per-user `sessionsRevokedAt` marker; tokens issued before it are rejected. Both
logout handlers revoke server-side.
**Files:** `src/lib/session-revocation.ts` (new), `src/lib/auth.ts`,
`src/app/api/auth/logout/route.ts`
**Verify:** read `isSessionRevoked()` — it must fail **open** on a lookup error and be a
no-op under `MOCK_DB`. 5 tests.
**Risk:** adds a Firestore read per user per minute (cached, `REVOCATION_CACHE_TTL_MS`).
No migration — a user with no marker behaves exactly as before. Kill switch:
`SESSION_REVOCATION_ENABLED=false`.
**⚠️ Trade-off to confirm:** revocation can take up to the cache TTL (60s) to propagate
across instances. Lower the TTL if that's not acceptable.

---

# 2 · Cross-tenant exposure

### 2.1 Ownership was derived from a free-text display name — 27 more sites
**Was:** the merge with main reintroduced `metadata.resourceName || storage.name.toLowerCase()`
in 27 places (sync ×15, remediation-utils ×6, logs, query, monitoring). Naming a connector
after a victim's instance pointed real operations at it.
**Now:** all go through `requireManagedResourceName()`, which **throws** rather than guessing.
**Verify:** `grep -rn "metadata?.resourceName as string) || " src/app/api src/lib` → only
`storage-validator.ts` (`|| ''`) should remain.

### 2.2 Two fallbacks resolved to the control-plane Firestore
**Was:** `clone` and `branch` fell back to `'(default)'` — Deployify's **own** database.
The clone path called `exportDocuments('(default)', gcsUri)` with a tenant-supplied GCS
URI: a full control-plane export.
**Now:** both require a server-written resource name.
**Verify:** `grep -rn "'(default)'" src/app/api` → no GCP-call sites.

### 2.3 Label-writing could steal ownership
**Was:** `syncResourceLabels()` derived its target from the display name while **writing**
`deployify-project-id` — the label every ownership check now trusts. A tenant could stamp
their own ownership onto another tenant's instance.
**Now:** refuses unless the connector has a server-written resourceName.
**Files:** `src/lib/gcp/labeling.ts`

### 2.4 Discovery listed every tenant's resources
**Was:** `isDiscoveryVisible()` short-circuited unless `GCP_DISCOVERY_SCOPE=owned`, which
was set nowhere and documented nowhere.
**Now:** scoped by default. **Carve-out:** unlabelled resources stay visible, because
orphan purge exists to find resources no connector claims. Only resources labelled for a
*different* project are hidden. `GCP_DISCOVERY_SCOPE=all` restores the old behaviour.
**⚠️ Check this one:** if orphan purge matters to you, confirm the carve-out is the
behaviour you want.

### 2.5 Service deletion only checked slugs
**Was:** `planServiceDeletion` consulted the ownership label **only on the contested
branch**, and contention compares project slugs only. `dfy-acme-pr-7` is not any project's
slug, so it looked uncontested and was deletable by whoever slugged themselves `acme-pr-7`.
**Now:** the label is authoritative for **every** candidate, via the same
`checkServiceClaim()` the deploy path uses.
**⚠️ Cost:** this makes one Cloud Run API call per candidate on delete, where the happy
path previously made zero. Bounded by services-per-project. `CLOUD_RUN_OWNERSHIP_LABEL_CHECK=false`.

### 2.6 Query comments had no tenant filter
**Was:** read by `queryId` alone; `queryId` is a URL segment.
**Now:** filtered by `projectId` too.
**🚨 DEPLOY NOTE:** needs the new composite index in `firestore.indexes.json`
(`projectId, queryId, createdAt`). **Deploy the index before or with this code** — without
it Firestore returns `FAILED_PRECONDITION` and comments break.
```bash
firebase deploy --only firestore:indexes
```
Backward compatible otherwise: the write path has recorded `projectId` since #494.

### 2.7 Legacy connectors were left unusable — verified adoption
**Was:** removing the display-name fallback left adopted/legacy connectors refusing every
infrastructure operation.
**Now:** `tryAdoptResourceName()` resolves the candidate and **asks GCP who owns it**.
Adoption succeeds only if the live resource carries this project's label, or no label at
all. A label naming another project is refused; a failed lookup fails closed. Wired into
the sync route, audited as `storage.resource_adopted`.
**Verify:** 7 tests in `src/lib/gcp/resource-adoption.test.ts` — the important one is
"REFUSES a resource labelled for another project".

---

# 3 · Role gates (viewers could mutate live state)

`checkProjectAccess` returns `allowed: true` for **any** team member, so membership alone
was never sufficient.

| Route | Was | Now |
|---|---|---|
| deployment rollback, project rollback | open to viewers | viewer refused |
| deployment alias (POST + DELETE) | open to viewers | viewer refused |
| dashboards PATCH + DELETE | open to viewers | viewer refused |
| env vars DELETE | the only handler in the route without a gate | viewer refused |
| remediation (per-connector + bulk) | see below | split by risk |

**Remediation gating is deliberately not blanket.** An earlier blanket owner/admin gate
locked out `member` — the **default invite role** — even for risks that only flip a
Firestore field, while the UI still rendered the FIX button. Now: viewers always refused;
owner/admin required only for the 12 risks in `PRIVILEGED_REMEDIATION_RISKS` that mutate
shared cloud state.
**⚠️ Check:** `grep -n -A14 "PRIVILEGED_REMEDIATION_RISKS" src/lib/gcp/remediation-utils.ts`
— confirm the split matches your intent.
**Note:** the dashboards **GET** deliberately has no viewer gate (reading is what a viewer
is for). I added one by mistake and removed it; worth confirming it's absent.

---

# 4 · Shared service-account IAM

**Was:** `broad_secret_access` hardcoded `revokeProjectRole(...secretmanager.secretAccessor)`
and `...admin` on the **shared platform SA**, bypassing the allowlist. Stripping those
breaks secret reads for every tenant at once.
**Now:** routed through `resolveRevocableRoles`, and `roles/owner`, `roles/editor` and both
secretmanager roles joined `projectIamAdmin` as **never auto-revocable**.

**🚨 This is the change most worth your judgement.** Consequence stated plainly: one-click
IAM hardening now **grants granular access but never revokes**. It reports honestly instead
of claiming a restriction it did not perform, and the badge is marked non-actionable so the
FIX button no longer appears (it used to be a dead loop — click, success toast, badge
unchanged next sync).

My reasoning: automated revocation of project roles on an account **every tenant shares**
is a platform-wide outage waiting to happen, triggerable from a tenant-facing button. The
real fix is per-tenant service accounts, which is an architectural change I did not attempt.
Operators can opt a role back in with `IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES` or
`IAM_ALLOW_SELF_LOCKOUT_REVOKE`.

Three tests asserted the old revoke-by-default behaviour and now pin the safer semantics —
**check I inverted them correctly and didn't just make them agree with the code.**

---

# 5 · Cost and abuse

| Finding | Was | Now |
|---|---|---|
| `ssrf-proxy-6` | subdomain traffic returned **before** the rate limiter, so every unauthenticated page view drove a Firestore write + BigQuery insert, unmetered | limited per-IP before the rewrite, 429 + Retry-After. `PROXY_RATE_LIMIT_REQUESTS` (600/min), `PROXY_RATE_LIMIT_MODE=off` |
| `ai-cost-abuse-8` | `buildTimeout` only had to be > 0 → 24-hour Cloud Builds | capped at 3600s, `MAX_BUILD_TIMEOUT_SECONDS` |
| `reliability-races-7` | image prune omitted `force=true`, so **every** delete failed on tagged versions, and the response was never checked — a silent no-op while storage grew | sends `force=true`, logs deleted/failed |
| `reliability-races-6` | regional "migration" is a **clone**; the source kept running and lost its last reference, billing forever | recorded as `supersededResourceName`, audited, stays reclaimable |
| `reliability-races-8` | public collect rate-limit Map never pruned | expiry + 20k ceiling |
| `webhooks-billing-8` | provider API key secret never deleted with the connector | both secrets cleaned up |
| `ops-config-supply-8` | 6 unused prod deps carrying most advisories | removed |

**⚠️ 5.1 — the proxy rate limit is the change most likely to affect real users.** A busy
tenant site behind one NAT could hit 600/min. Watch for 429s after deploy; raise
`PROXY_RATE_LIMIT_REQUESTS` or set `PROXY_RATE_LIMIT_MODE=off` if so.

**⚠️ 5.2 — removed dependencies:** `lighthouse`, `crypto-js`, `jsonwebtoken`, `next-auth`,
`cross-fetch`, `axios`. All had **zero** import sites (checked including dynamic imports;
`src/lib/performance/lighthouse.ts` is a local module that never imported the npm package).
**Verify:** `git show f9c48d7 -- package.json` and satisfy yourself none are needed.
This took `npm audit` from 60 vulns / 4 critical to 39 / 3, and removed the EBADENGINE
warning (lighthouse wanted node ≥22.19; the Dockerfile builds on node:20).

---

# 6 · Correctness and honesty

### 6.1 Analytics showed fabricated numbers as real
**Was:** `getAnalyticsStats()` substituted **randomly generated** visitors/pageviews when
the query returned empty **or threw**, with nothing marking them synthetic. A customer
reading "62 visitors today" on a dead project, or during an outage, had no way to know.
**Now:** payload carries `isPlaceholder`/`placeholderReason`; the dashboard renders a
"Sample data" banner saying which case it is. Figures unchanged, so no chart breaks.
**My view:** labelling is the minimum. Showing invented traffic numbers at all is a product
decision worth revisiting — real zeros would be more honest.

### 6.2 Stale project rendered under a new URL
**Was:** `fetchProjectDetails` had no failure branch, so a 403/404/500 left `currentProject`
pointing at the **previous** project — its settings rendered under the new project's URL,
with Save and Delete wired to it.
**Now:** cleared, reason recorded, page renders it with Retry instead of a blank screen.

### 6.3 Onboarding shown to existing customers
**Was:** a failed `/api/projects` left `projects` as `[]`, so the first-run "Welcome to
Deployify" screen appeared. **Now:** status checked, retryable error shown.

### 6.4 "Contact Sales" charged ₹15,000
**Was:** the Enterprise button called `onUpgrade('enterprise')` and opened a live Razorpay
charge at list price. **Now:** opens a mail draft (`NEXT_PUBLIC_SALES_EMAIL`).
**⚠️ Set `NEXT_PUBLIC_SALES_EMAIL`** — it defaults to `sales@deployify.io`.

### 6.5 Overlapping credential rotations revoked each other
**Was:** PlanetScale rotation deleted **every** `deployify-rotation-*` password except the
newest, so two overlapping rotations killed each other's live credential mid-flight.
**Now:** only reaps passwords older than `ROTATION_CLEANUP_GRACE_MS` (10 min), skips
unparseable names.

### 6.6 Razorpay webhook used the wrong secret
**Was:** verified with `RAZORPAY_KEY_SECRET`. Razorpay signs webhooks with a **separate**
dashboard secret. Either they were quietly set equal, or **every webhook has been rejected
and subscriptions have silently never activated**.
**Now:** reads `RAZORPAY_WEBHOOK_SECRET`, falls back to the key secret so existing
deployments keep working, logs an explicit diagnostic on failure.
**🚨 Please check which case you were actually in.** If webhooks were failing, there may be
paid customers who never got their tier.

### 6.7 Team invite was an open mailer
**Was:** `email` went to Resend as `to`, which accepts an **array**.
`{"email": ["a@x","b@y", ...]}` sent from your domain. **Now:** single valid address only.

### 6.8 Secret reveal was not audited
Every env-var mutation was audited; revealing the plaintext was not. Now logged as
`env.secret_revealed` (who, which key, when — never the value).

---

# 7 · CI and supply chain

**Was:** CI ran **no tests and no lint**. The only check anywhere was `npm run build`
inside the auto-merge workflow, so the 585 unit tests never executed in CI.
**Now:** `.github/workflows/ci.yml` — install + lint + typecheck + test + build, with
`permissions: contents: read` and `--ignore-scripts` (it runs on fork PRs). Its `npm ci`
also catches the lockfile drift that broke the Cloud Build image.

Also hardened, in the same pass:
- `contains(login, 'jules')` matched **any** account containing "jules" (`julesx`,
  `notjules`, `jules-attacker`) and that job **approves and auto-merges to main**. Exact
  logins only, and the PR must come from this repo, never a fork.
- it ran `npm install` on the PR's `package.json`, executing its lifecycle scripts in the
  runner. Now `npm ci --ignore-scripts`.
- `cron-auto-merge` used `gh pr merge --admin`, bypassing branch protection unattended.
  Removed.
- deleted stale `pnpm-lock.yaml` (Dockerfile uses `npm ci`; only `package-lock.json` is
  kept in sync).

**⚠️ The new CI will fail PRs that don't pass lint/tsc/tests.** That's the point, but it's
a workflow change for whoever is merging.

---

# 8 · Accessibility

The confirmation modal (project deletion, dropping tables, restoring backups) had no
dialog semantics, no focus management and no Escape handler. Added `role="dialog"`
`aria-modal`, `aria-labelledby`/`describedby`, initial focus, Tab focus trap, Escape,
backdrop click, restored focus, scroll lock.

**Not done:** type-to-confirm on destructive actions. The component already supports
`confirmDisabled`; wiring it into each call site is follow-up.

---

# 9 · New environment variables

All default to the safe/compatible value — **nothing here is required for the app to run.**

| Variable | Default | Purpose |
|---|---|---|
| `CSP_MODE` | `report` | CSP is **Report-Only** by default; `enforce` to block |
| `PROXY_RATE_LIMIT_REQUESTS` | `600` | per-IP limit on proxied tenant traffic |
| `PROXY_RATE_LIMIT_MODE` | on | `off` disables it |
| `MAX_BUILD_TIMEOUT_SECONDS` | `3600` | ceiling on tenant build timeout |
| `SESSION_REVOCATION_ENABLED` | on | `false` disables revocation checks |
| `REVOCATION_CACHE_TTL_MS` | `60000` | revocation lookup cache |
| `STORAGE_ADOPTION_ENABLED` | on | `false` disables verified adoption |
| `GCP_DISCOVERY_SCOPE` | scoped | `all` restores unscoped listing |
| `GCP_BYO_PROJECT_BLANKET_OWNERSHIP` | off | `true` restores the old whole-project grant |
| `CLOUD_RUN_SERVICE_CLAIM_MODE` | `enforce` | `monitor` / `off` |
| `ROTATION_CLEANUP_GRACE_MS` | `600000` | grace before reaping old rotation credentials |
| `RAZORPAY_WEBHOOK_SECRET` | falls back to key secret | **set this** |
| `NEXT_PUBLIC_SALES_EMAIL` | `sales@deployify.io` | **set this** |

Changed defaults: `STORAGE_METADATA_STRICT` now strips by default (`env.example` shipped
`false`, which disabled the guard — corrected), and `CLOUD_RUN_OWNERSHIP_LABELS` is on.

---

# 10 · Deliberately NOT changed

**X-Forwarded-For trust (`xss-frontend-sec-5`).** Rate limiters key on the leftmost XFF
entry, which the caller controls. The fix already exists — `resolveClientIp()` counts back
from the right by `TRUSTED_PROXY_HOPS` — but `RATE_LIMIT_MODE` defaults to `legacy`, which
uses the spoofable value.

I did not flip it. `TRUSTED_PROXY_HOPS` defaults to 1, meaning the **last** XFF entry. If
your Cloud Run service sits behind an external HTTPS load balancer, that last entry is the
**LB's IP — identical for every user** — which would collapse all traffic onto one bucket
and 429 everyone. I can't determine your XFF shape from the code.

**To decide it:** log `x-forwarded-for` on one production request, count the entries, set
`TRUSTED_PROXY_HOPS` to match, then set `RATE_LIMIT_MODE=enforce`. Tell me the shape and
I'll finish it.

**Also not done:**
- `injection-db-7` — no GST/tax on checkout, invoice pipeline is dead code. Tax logic is a
  business/compliance decision, not something I should invent.
- `observability-tests-8` — `errors` collection is write-only; no Sentry/APM. Needs a
  vendor choice.
- Type-to-confirm wiring (§8).
- Per-tenant service accounts — the real fix behind §4.

---

# 11 · What I'd check first

1. **§6.6 Razorpay webhook secret** — if webhooks were silently failing, real customers may
   have paid and not been upgraded. This is the one with money attached.
2. **§2.6 Firestore index** — deploy it with the code or comments break.
3. **§4 IAM revocation now disabled** — confirm you accept that trade-off.
4. **§1.2 Next upgrade** — smoke-test routing and the edge proxy.
5. **§5.1 proxy rate limit** — watch for 429s.

## Honest caveat

585 tests pass, lint and tsc are clean, and the build succeeds — but that was also true of
the fixes the earlier review rounds tore apart. Green checks did not catch a guard reading
a field that never existed. Where I've marked ⚠️ or 🚨 above, those are the places my own
reasoning could be wrong and a second pair of eyes matters most.
