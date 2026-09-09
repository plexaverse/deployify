export const meta = {
  name: 'deployify-critical-recheck',
  description: 'Re-verify the 5 previously-partial critical fixes after remediation',
  phases: [{ title: 'Recheck', detail: 'two reviewers per finding: bypass hunt / breakage hunt' }],
}
const REPO = '/Users/asangborkar/Documents/Plexaverse/deployify'
const BASE = 'ece2cf3'

const ITEMS = [
  { id: 'authn-session-1', t: 'Cross-tenant GCP resource delete via display-name-derived ownership',
    files: 'src/lib/gcp/resource-ownership.ts src/app/api/gcp/discover/route.ts src/app/api/projects/[id]/storage/route.ts src/app/api/projects/[id]/storage/[storageId]/replica/route.ts src/app/api/projects/[id]/storage/[storageId]/migrate-region/route.ts',
    orig: 'baseResourceName() fell back to storage.name, so naming a connector "Victim Prod DB" granted ownership of victim-prod-db and DELETE /api/gcp/discover removed it. providerProjectId was a blanket grant over a whole GCP project. replica / migrate-region / storage DELETE used the same fallback with no ownership check.' },
  { id: 'injection-db-1', t: 'Client-chosen subscription tier on the billing webhook',
    files: 'src/app/api/billing/webhook/route.ts src/lib/billing/order-registry.ts src/app/api/billing/verify/route.ts',
    orig: 'The webhook granted tier from payload.payment.entity.notes.tierId. Razorpay Checkout lets the browser attach notes to the payment, so paying for a pro order while sending tierId=enterprise granted enterprise.' },
  { id: 'tenancy-data-1', t: 'Cross-tenant Cloud Run service deletion',
    files: 'src/lib/gcp/service-claim.ts src/lib/gcp/service-ownership.ts src/app/api/webhooks/github/route.ts src/app/api/projects/[id]/route.ts',
    orig: 'planServiceDeletion only checked the project-slug namespace, but Cloud Run names include derived preview/branch names. A project slugged acme-pr-7 could delete project acme PR-7 preview service. The PR-closed cleanup in the GitHub webhook had no guard at all.' },
  { id: 'tenancy-data-2', t: 'Cross-tenant Cloud Run production takeover via slug collision',
    files: 'src/lib/slug-registry.ts src/lib/gcp/service-claim.ts src/lib/gcp/cloudbuild.ts src/app/api/projects/[id]/deploy/route.ts src/app/api/webhooks/github/route.ts src/lib/utils.ts',
    orig: 'The slug registry keyed the raw slug but generateServiceName truncates to 59 chars, so a 60-char slug overwrote a 59-char victim production service. Derived names (<slug>-pr-<n>, <slug>-<branch>) were never reserved. gcloud run deploy is create-or-update with no ownership precondition on any deploy path.' },
  { id: 'ai-cost-abuse-1', t: 'Platform-wide IAM DoS via tenant-driven remediation',
    files: 'src/lib/gcp/remediation-utils.ts src/app/api/projects/[id]/storage/[storageId]/remediate/route.ts src/app/api/infrastructure/remediate/route.ts src/lib/gcp/iam.ts src/app/api/projects/[id]/storage/route.ts',
    orig: 'The remediate route had no role check so a viewer could fire it, and the broad_secret_access branch hardcoded revokeProjectRole for secretmanager.secretAccessor/admin on the SHARED platform service account, bypassing resolveRevocableRoles entirely. metadata.provisioned and excessiveRoles were tenant-writable.' },
]

const SCHEMA = {
  type: 'object',
  properties: {
    original_exploit_still_works: { type: 'boolean' },
    new_bypass: { type: 'string', description: 'A concrete bypass that works against HEAD, or "none found"' },
    breaks_anything: { type: 'boolean' },
    breakage_detail: { type: 'string', description: 'What legitimate flow breaks, with the caller you grepped' },
    default_behaviour_changed: { type: 'string', description: 'With no new env vars set, exactly what changes vs ece2cf3' },
    verdict: { type: 'string', enum: ['closed', 'partial', 'open', 'regression'] },
    reasoning: { type: 'string' },
  },
  required: ['original_exploit_still_works', 'new_bypass', 'breaks_anything', 'breakage_detail',
             'default_behaviour_changed', 'verdict', 'reasoning'],
}

const CONTEXT = `Repo ${REPO}, branch audit/security-hardening. Next.js 16 App Router + React 19 + TS,
Firestore (firebase-admin), GCP Cloud Run/Build/SQL/Secret Manager, Razorpay. LIVE multi-tenant PaaS.
${BASE} is the pre-audit baseline; HEAD has all fixes. Inspect with: git diff ${BASE} HEAD -- <path>
Currently: 519/519 tests pass, eslint clean, tsc --noEmit clean on source.
Note src/proxy.ts replaces middleware.ts in Next 16. checkProjectAccess() returns allowed:true for ANY
team membership, so role gating must be explicit.`

const LENSES = [
  { k: 'bypass', t: `Your lens: FIND A BYPASS. Re-derive the original exploit against HEAD, then hunt for a
NEW route to the same impact: an unguarded sibling handler, a code path that recomputes the value
without the guard, an env flag defaulting permissive, an encoding/parsing trick, a guard placed after
the dangerous call, or a legacy/backfill window. Report the most concrete one you can actually trace.` },
  { k: 'breakage', t: `Your lens: FIND THE BREAKAGE. The constraint is that nothing in the live product may
break. Check every legitimate flow through the changed code: existing tenants with LEGACY data (no
ownership labels, no metadata.resourceName, pre-existing duplicate slugs), the dashboard callers in
src/components, MOCK_DB/dev paths, and API response shapes. State exactly what happens with NO new env
vars set. A fix that fails closed on legacy data IS breakage - say so.` },
]

const out = await pipeline(
  ITEMS,
  (f) => parallel(LENSES.map((L) => () => agent(
`${CONTEXT}

FINDING ${f.id} — ${f.t}
ORIGINAL DEFECT: ${f.orig}
Files changed for it: ${f.files}

${L.t}

Read the diffs and the current files. Cite line numbers. Be concrete; a vague concern is not a finding.`,
    { label: `recheck:${L.k}:${f.id}`, phase: 'Recheck', schema: SCHEMA }))
  ).then((v) => {
    const ok = v.filter(Boolean)
    if (!ok.length) return null
    const worst = ok.some(r => r.verdict === 'regression') ? 'regression'
                : ok.some(r => r.verdict === 'open') ? 'open'
                : ok.some(r => r.verdict === 'partial') ? 'partial' : 'closed'
    return { id: f.id, worst,
      still_works: ok.some(r => r.original_exploit_still_works),
      breaks: ok.some(r => r.breaks_anything),
      reviews: ok }
  })
)
const res = out.filter(Boolean)
return {
  closed: res.filter(r => r.worst === 'closed').map(r => r.id),
  partial: res.filter(r => r.worst === 'partial').map(r => r.id),
  open: res.filter(r => r.worst === 'open' || r.worst === 'regression').map(r => r.id),
  breaks: res.filter(r => r.breaks).map(r => r.id),
  details: res,
}
