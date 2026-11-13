
====================================================================================================
## authn-session-1
====================================================================================================

--- lens: breaks | closes=partially verdict=fix-first ---
BYPASS:
STILL EXPLOITABLE in 3 requests, no env vars involved.

Step 1 — enumerate (unchanged). GET /api/gcp/discover?projectId=<attacker's own project> still returns EVERY tenant's instance in the shared platform GCP project. src/lib/gcp/resource-ownership.ts:206 `if (process.env.GCP_DISCOVERY_SCOPE !== 'owned') return true;` — unset, so isDiscoveryVisible() is a pure no-op. Attacker reads the victim's `prod-db`, its region, databaseVersion and connectionName.

Step 2 — claim the name. POST /api/projects/<attacker's project>/storage with body {"type":"cloud-sql-postgres","name":"prod-db"}. `provision` defaults to false (src/app/api/projects/[id]/storage/route.ts:126), so the whole `if (provision)` block is skipped: no GCP call, no plan gate (checkStorageProvisionGate is inside that block), and NOTHING verifies the name refers to a resource the attacker owns. The config is persisted with metadata.resourceName === undefined.

Step 3 — the guard grants it. src/lib/gcp/resource-ownership.ts:33-35 `baseResourceName()` falls back to `storage.name.toLowerCase().replace(/\s+/g,'-')` → 'prod-db' lands in resolveOwnedResourceNames(). DELETE /api/gcp/discover?projectId=<attacker>&resourceId=prod-db&resourceType=cloud-sql hits line 170-172 and returns `{owned:true, via:'storage-config'}`. The victim's Cloud SQL instance is deleted and the audit event at route.ts:157-168 records `ownershipVia:'storage-config'`, i.e. it looks like a legitimate reclaim.

Shortcut: `resourceName` is a SERVER_OWNED_METADATA_KEY but STORAGE_METADATA_STRICT defaults to warn-only (storage/route.ts:109-112), so the attacker can also just POST metadata.resourceName="<victim instance>" directly.

The fix's own test encodes the hole: src/lib/gcp/resource-ownership.test.ts:43 asserts `owned.has('main-postgres')` derived purely from a connector's display name.

GCP_RECLAIM_INUSE_GUARD=enforce (resource-ownership.ts:145) is the only thing that blocks this, but it is opt-in, is documented in env.example:260-266 as a product-UX guard rather than the security control, and once enabled it denies the `storage-config` grant that is today the ONLY grant that works — see default_behaviour_changed. So the two flags are mutually exclusive: the hole is open or legitimate reclaim is dead.

Secondary: `region` is attacker-controlled and interpolated raw into the Redis label-lookup URL at resource-ownership.ts:97 (`.../locations/${region}/instances/...`), a path/query injection into the ownership decision. Not independently exploitable for a cross-tenant delete because src/lib/gcp/memorystore.ts:98 interpolates the same poisoned `region` into the delete URL, so both land on the same confused path — but it should be validated.

New leak added by the fix: src/lib/gcp/discovery.ts:106-110 and 141-146 now put `deployifyProjectId` and `managedBy` into metadata for every Cloud SQL and Redis instance, and GET is unscoped by default, so every tenant can now read every other tenant's Deployify project id on top of the pre-existing instance-name leak.

--- lens: closes | closes=partially verdict=fix-first ---
BYPASS:
CONFIRMED, executed against HEAD's real `checkResourceOwnership()` (PoC printed `{"owned":true,"via":"storage-config"}`).

BYPASS 1 — self-granting ownership (2 requests, or 3 clicks in the shipped UI):
The new guard asks "is resourceId in `resolveOwnedResourceNames(project)`?" (src/lib/gcp/resource-ownership.ts:170). That set is built ENTIRELY from attacker-controlled data — src/lib/gcp/resource-ownership.ts:33-34 `baseResourceName()` = `metadata.resourceName ?? storage.name.toLowerCase().replace(/\s+/g,'-')`. `storage.name` is an unvalidated request-body string with no uniqueness or namespacing anywhere in the platform.
  1. `GET /api/gcp/discover?projectId=<attacker-project>` — still returns EVERY Cloud SQL / Redis / Firestore instance in the shared platform project (src/lib/gcp/discovery.ts:98-124); `isDiscoveryVisible()` is a no-op unless `GCP_DISCOVERY_SCOPE=owned`, which is not set in .env.local and is not even documented in env.example. Attacker reads `victim-prod-db`.
  2. `POST /api/projects/<attacker-project>/storage {"type":"cloud-sql-postgres","name":"Victim Prod DB","provision":false}` — no GCP call, no collision check, 200 OK (src/app/api/projects/[id]/storage/route.ts:127-130, 160).
  3. `DELETE /api/gcp/discover?projectId=<attacker-project>&resourceId=victim-prod-db&resourceType=cloud-sql&region=us-central1` → `owned:true via 'storage-config'` → victim's instance deleted, and the audit log records it as legitimately owned.
Step 2-3 are a first-class UI flow: src/components/StorageSection.tsx:639-641 `handleApplyDiscovery()` does `setName(resource.name.toUpperCase())` from any discovered (i.e. any tenant's) resource, and :669 `handleReclaimResource()` fires the DELETE. Discover → Apply → Save → Reclaim.
Note the irony: `GCP_RECLAIM_INUSE_GUARD=enforce` (src/lib/gcp/resource-ownership.ts:145) is the only thing that closes this, by turning a storage-config name match into a DENY — but it defaults off and env.example:266 ships it commented out.

BYPASS 2 — whole-project claim via `providerProjectId` (also executed: `{"owned":true,"via":"registered-provider-project"}`). src/lib/gcp/resource-ownership.ts:159-162 grants ownership of EVERY resource in a non-platform GCP project if the caller's own project lists it in `providerProjectId`. That field is a plain unvalidated body field written straight through in POST (route.ts:127, 241) and PATCH (route.ts:424, 519) with zero proof the caller controls that GCP project. Attacker PATCHes `providerProjectId:"<victim-byo-gcp>"` onto their own connector, then `DELETE …&gcpProjectId=<victim-byo-gcp>&resourceId=<anything>` deletes any resource the platform SA can reach there. The same clause also makes `isDiscoveryVisible()` return true unconditionally for non-platform projects (line 214), so even after enabling `GCP_DISCOVERY_SCOPE=owned` the GET leaks every BYO tenant's inventory.

UNGUARDED SIBLING PATHS (same root cause, no ownership check added at all — these are worse than deletion, they are data theft):
- `POST /api/projects/[id]/storage/[storageId]/replica` line 56-62: `masterInstanceName = metadata.resourceName ?? slug(storage.name)` fed straight to `createReadReplica()`. Attacker names a connector after a victim instance and gets a live READ REPLICA of another tenant's database. HEAD's diff on this file only changed the Firestore write to a transaction; no guard. Bonus: the replica name is then recorded in `metadata.replicas`, which src/lib/gcp/resource-ownership.ts:58-61 treats as owned.
- `POST /api/projects/[id]/storage/[storageId]/migrate-region` line 41-44: same derivation into `migrateInstanceToRegion()` — unchanged in HEAD.
- `DELETE /api/projects/[id]/storage?storageId=…&deleteResource=true` (route.ts:352-365): deletes `metadata.resourceName ?? slug(name)` with NO ownership check. PATCH merges client metadata over stored metadata (route.ts:527-533) with no server override of `resourceName`/`provisioned`, and `sanitizeClientMetadata()` is warn-only by default (`STORAGE_METADATA_STRICT=false`, env.example:107) — so one PATCH sets `metadata:{resourceName:"victim-prod-db",provisioned:true}` and one DELETE removes the victim's instance without touching the new guard at all.

Minor: `resourceId` is interpolated unencoded into the delete URLs (cloudsql.ts:849, memorystore.ts:98, firestore-admin.ts:87) while the guard's label lookup DOES `encodeURIComponent` (resource-ownership.ts:87,97) — and connector names are only whitespace-slugified, so `/` and `..` survive into the owned set, permitting path traversal out of the target project.

====================================================================================================
## injection-db-1
====================================================================================================

--- lens: closes | closes=fully verdict=ship ---
BYPASS:
No bypass at default configuration. Every bypass I found requires a non-default env var or a Razorpay account misconfiguration:

(1) `BILLING_VERIFY_TIER_MODE=monitor` or `=off` (src/lib/billing/order-registry.ts:52-54) restores the vulnerable code verbatim — `grantedTier` stays the client's `tierId` (src/app/api/billing/verify/route.ts:51, written at :129). Documented as the rollback switch, but it is a one-env-var re-open of a critical.

(2) `MOCK_DB=true` forces the mode to `off` (order-registry.ts:50) AND `getSession()` hands an *unauthenticated* caller a `MOCK_SESSION` whose tier is already `enterprise` (src/lib/auth.ts:70-98). In any deploy where MOCK_DB leaked in, the original exploit works exactly as written. Nothing in the repo sets MOCK_DB for prod, so this is config-dependent.

(3) Amount half of the finding, still open at defaults: `getPaymentCorroborationMode()` defaults to `'monitor'` (order-registry.ts:71-73), so `corroboratePayment` only logs. Even at `enforce`, `corroboratePayment` deliberately accepts `status === 'authorized'` (order-registry.ts:296 rejects only `'failed'`). If the Razorpay account has auto-capture off, an authorized-then-voided payment yields a real 30-day grant that is never revoked (no `refund.*`/`payment.failed` webhook handler in src/app/api/billing/webhook/route.ts:30-83, and `BILLING_ENTITLEMENT_MODE` defaults to `audit`, so `currentPeriodEnd` is not enforced either). This is not tier substitution — the tier still comes from the paid order — so it cannot escalate pro -> enterprise.

(4) Not exploitable, checked and ruled out: forging a signature for a higher-tier order (HMAC needs `RAZORPAY_KEY_SECRET`, payments.ts:49-64); poisoning the registry (`recordBillingOrder` is only called from checkout with `tier.id` from `TIERS`, checkout/route.ts:87-93; `claimOrderPayment`'s lazy-migrate copies from `intent`, never from the body; `markOrderFulfilled` writes `fulfilledTierId`, which `resolveOrderIntent` never reads); poisoning the Razorpay `notes` fallback (notes are set server-side, checkout/route.ts:82); prototype pollution via `tierId` (`isTierType` uses `Object.prototype.hasOwnProperty.call`, order-registry.ts:36); reusing another user's leaked triple (`intent.userId !== session.user.id` -> 400, verify/route.ts:67-77); replaying the same triple for repeated 30-day extensions (`claimOrderPayment` + `isPaymentFulfilled`, verify/route.ts:105-119); a sibling grant path (`grep` for writers of `subscription:` finds only verify/route.ts:137,150 and webhook/route.ts:63-71 — the webhook is HMAC-gated and reads tier from Razorpay-side `payment.notes`, not from a client body); a `doc()`-path trick via a slash in `orderId` (throws inside the try, falls to the Razorpay fetch, then `null` -> 400 — fail-closed, and the signature would not match anyway).

--- lens: breaks | closes=fully verdict=fix-first ---
BYPASS:
YES — via the sibling endpoint the same patch edited: /Users/asangborkar/Documents/Plexaverse/deployify/src/app/api/billing/webhook/route.ts.

Line 36-38 still does `const notes = payment.notes; const userId = notes?.userId; const tierId = notes?.tierId;` and line 65 writes `tier: tierId as 'free'|'pro'|'team'|'enterprise'` straight from that. It never calls `resolveOrderIntent(orderId)` — it passes `intent: null` into `claimOrderPayment` (line 53), so the new ledger only de-duplicates redeliveries; it never binds the tier.

Those are the PAYMENT entity's notes, not the server-created ORDER's notes (checkout/route.ts:82 sets the order notes). Razorpay Checkout accepts a `notes` field in its browser options and attaches it to the payment. Concrete attack: call POST /api/billing/checkout {tierId:'pro'} to get a legitimate 1500 INR order, then instead of letting src/app/billing/page.tsx:127-166 build the options, run from the console:
  new window.Razorpay({key, order_id:'<pro order>', amount:150000, notes:{userId:'<own id>', tierId:'enterprise'}, handler(){}}).open()
Pay 1500 INR. Razorpay then delivers a genuinely-signed payment.captured whose payload.payment.entity.notes says tierId 'enterprise'. verifyWebhookSignature passes (it is a real Razorpay delivery), claimOrderPayment returns 'claimed' (verify was never called, so no claim exists), and webhook/route.ts:63-71 grants enterprise for a pro payment — the exact escalation of injection-db-1, at 1/10th the price. Caveat: this depends on Razorpay letting checkout-supplied `notes` override the order's notes on the payment entity; worth confirming against a test-mode capture before treating it as confirmed.

Weaker residual that definitely works: with no env vars set, getPaymentCorroborationMode() returns 'monitor' (order-registry.ts:71), so corroboratePayment's wrong-order / failed / short-paid checks (lines 289-308) only log — nothing enforces that money was actually taken. Even under BILLING_VERIFY_PAYMENT_MODE=enforce, status 'authorized' is deliberately accepted (lines 274-275, 296), so an authorized-but-never-captured payment still buys 30 days.

Fix for the main one is one line of reuse: in the webhook, resolve the tier with resolveOrderIntent(orderId) instead of notes.tierId, exactly as verify now does.

====================================================================================================
## tenancy-data-1
====================================================================================================

--- lens: closes | closes=partially verdict=fix-first ---
BYPASS:
WORKING BYPASS (2 API calls, no deployment needed). The new guard asks "does another *project document* have slug == base?" (planServiceDeletion -> isContested -> listProjectIdsBySlug, src/lib/gcp/service-ownership.ts:120-127, src/lib/db.ts:1215-1223). But the Cloud Run namespace is strictly larger than the project-slug namespace: preview services are `dfy-<slug>-pr-<N>` (src/lib/gcp/cloudrun.ts:252-254) and branch services are `dfy-<slug>-<slugify(branch)>` (src/lib/utils.ts getProjectSlugForDeployment). Those names are NOT any project's slug, so `listProjectIdsBySlug` returns empty and they come back UNCONTESTED.

Exploit: victim project slug "acme" has an open PR #7, so `dfy-acme-pr-7` is running.
1. POST /api/projects {name: "acme pr 7", repoFullName: <any repo attacker can read/admin>, region: <victim's region>}. slugify("acme pr 7") == "acme-pr-7". claimProjectSlug (src/lib/slug-registry.ts:127) succeeds because no project doc holds that slug, so no suffix is appended.
2. DELETE /api/projects/<attacker's own id>. resolveOwnedServiceNames unconditionally adds generateServiceName(project.slug) == "dfy-acme-pr-7" (service-ownership.ts:57). ownSlugContested == false; base "acme-pr-7" uncontested -> deletable. src/app/api/projects/[id]/route.ts:386-388 calls deleteService("dfy-acme-pr-7", token, victimRegion) and route.ts:379-382 also calls deleteProjectImages("dfy-acme-pr-7") because the "production" name cleared, wiping the victim's Artifact Registry package too.

Empirically proven by driving planServiceDeletion with a stubbed listProjectIdsBySlug:
  attacker slug "acme-pr-7"   -> {"deletable":["dfy-acme-pr-7"],"skipped":[],"via":"unique-slug"}
  attacker slug "acme-staging"-> {"deletable":["dfy-acme-staging"],"skipped":[],"via":"unique-slug"}  (victim's `staging` branch service)
  attacker slug "acme-st" + branch deployment "aging" -> {"deletable":["dfy-acme-st","dfy-acme-st-aging"],...}
  control, attacker duplicates slug "acme" -> {"deletable":[],"skipped":[{"name":"dfy-acme",...}]}  (correctly caught)

The label check that could have caught this is dead in the default config: cloudbuild.ts:104-109 only stamps `deployify-project-id` when CLOUD_RUN_OWNERSHIP_LABELS === 'true' (default off), and service-ownership.ts:139 only consults the label on the *contested* branch, which this bypass never enters.

SIBLING UNGUARDED PATH: src/app/api/webhooks/github/route.ts:300 calls deleteService(getPreviewServiceName(project.slug, pr.number), ...) with no ownership guard at all — planServiceDeletion was not applied there. An attacker with slug "acme" who opens then closes PR #7 on their own repo deletes `dfy-acme-pr-7`, i.e. the *production* service of any victim whose slug is "acme-pr-7".

Region is still fully attacker-controlled for targeting: isValidGcpRegion (src/lib/utils.ts:185-191) only blocks path injection, and VALIDATE_PROJECT_REGION=false disables even that.

Kill switches that reopen the wider hole: CLOUD_RUN_OWNERSHIP_MODE=off (service-ownership.ts:112) skips contention entirely (still exact names only), MOCK_DB=true returns all candidates.

--- lens: breaks | closes=fully verdict=fix-first ---
BYPASS:
Residual, same class, narrower: /Users/asangborkar/Documents/Plexaverse/deployify/src/app/api/webhooks/github/route.ts:300 still calls deleteService(getPreviewServiceName(project.slug, prNumber), gcpAccessToken, project.region) on PR-closed with NO ownership guard — it is the one deleteService call site the new guard does not cover (the only other is projects/[id]/route.ts:387). For a PRE-EXISTING legacy duplicate-slug pair (the new create-time registry blocks new collisions but does not backfill old ones), an attacker whose project shares the victim's slug can close PR #N on their own repo and destroy the victim's dfy-<slug>-pr-N preview service. Requires a legacy collision and reaches preview services only, not production. Two operator switches also relax the new check, neither restoring the prefix wildcard: MOCK_DB=true (src/lib/gcp/service-ownership.ts:110) and CLOUD_RUN_OWNERSHIP_MODE=off (:113) both return every derived candidate as deletable with no contention check.

====================================================================================================
## tenancy-data-2
====================================================================================================

--- lens: breaks | closes=partially verdict=fix-first ---
BYPASS:
Derived resource names are not in the registry. `claimProjectSlug` (src/lib/slug-registry.ts:120-155) only reserves the bare production slug, but `getProjectSlugForDeployment` (src/lib/utils.ts:76-91) derives preview/branch resource slugs as `${project.slug}-pr-${n}` and `${project.slug}-${slugify(branch)}`, and `generateServiceName` (src/lib/utils.ts:53-57) turns those into `dfy-<derived>`. Concrete attack, live with the shipped defaults: victim tenant owns project slug `acme` and has a PR-7 preview running as Cloud Run service `dfy-acme-pr-7`. Attacker creates a project named "acme pr 7" -> `slugify` -> `acme-pr-7`. `slugUsedByAnyProject('acme-pr-7')` is false (no PROJECT row carries that slug -- only a derived service exists) and `projectSlugs/acme-pr-7` does not exist, so the claim succeeds and the project is created. Attacker then deploys production: `generateServiceName('acme-pr-7')` = `dfy-acme-pr-7`, and src/lib/gcp/cloudbuild.ts:446 runs `gcloud run deploy dfy-acme-pr-7` (create-or-update, no ownership precondition anywhere on the deploy path), overwriting the victim's live preview service with the attacker's image, and src/lib/gcp/cloudbuild.ts:494 then grants `allUsers` roles/run.invoker on it. The attacker's image also lands in the victim's Artifact Registry path (src/lib/gcp/cloudbuild.ts:163). `findSlugSquatConflict` (src/lib/slug-registry.ts:170-190) cannot catch this: it is inert unless PROJECT_SLUG_RESOLUTION_MODE=oldest-wins, and even then it only compares exact `slug` equality, never derived names. Same trick works for branch deployments (`acme staging` -> `dfy-acme-staging`). Secondary variant: `generateServiceName` truncates at 59 chars while the registry keys the full slug, so two registry-distinct slugs sharing the first 59 characters collapse onto one Cloud Run service. Also unclosed: duplicate slugs ALREADY in Firestore -- `getProjectBySlugGlobal` (src/lib/db.ts:680-701) still returns `docs[0]` under the default 'legacy' mode, so an existing hostname hijack keeps working; it is only logged.

--- lens: closes | closes=partially verdict=fix-first ---
BYPASS:
Two working bypasses that reproduce the original impact (cross-tenant Cloud Run service overwrite + shared build-cache + artifact-image collision).

BYPASS 1 — 59-char truncation collision (restores the *production* takeover verbatim).
The registry keys on the RAW slug string (src/lib/slug-registry.ts:113-120 `where('slug','==',slug)`, and the transaction doc id is the raw slug at :144-150), but every global resource keys on a TRUNCATED transform of it: `generateServiceName()` does `resourceSlug.substring(0,59)` (src/lib/utils.ts:53-57) and `getProjectSlugForDeployment()` truncates to 59 (src/lib/utils.ts:87-89). Nothing in POST /api/projects validates the length of `name` or of `slugify(name)` (src/app/api/projects/route.ts:74, 167-188).
  - Victim slug = 59 chars, e.g. `aaaa…a` (59 'a').
  - Attacker POSTs name = those same 59 chars + one more char (60 chars). `slugUsedByAnyProject('aaa…ab')` -> false, registry doc `projectSlugs/aaa…ab` is free -> claim succeeds unsuffixed (src/lib/slug-registry.ts:143-153).
  - Attacker deploys: `generateServiceName()` truncates to 59 -> `dfy-<59 a's>` — byte-identical to the victim's production service (src/lib/gcp/cloudbuild.ts:148), the same image path `<region>-docker.pkg.dev/…/dfy-<59a>:latest` (cloudbuild.ts:163-164) and the same build-cache object `gs://<proj>_deployify_cache/<59a>.tgz` (cloudbuild.ts:294 restore, :434 write).
  - `--update-env-vars` merge semantics (cloudbuild.ts:~177) still leave the victim's runtime env on the service, readable from the attacker's image. Region is attacker-chosen at create. Result: full cross-tenant production takeover, exactly the original finding.

BYPASS 2 — derived-name namespace is unguarded (no length trick needed).
The registry only makes *project slugs* unique among *project slugs*. Preview and branch services are named from a derived string: `<slug>-pr-<n>` and `<slug>-<slugify(branch)>` (src/lib/utils.ts:76-91, src/lib/gcp/cloudrun.ts:252-253). Those derived names are never reserved.
  - Attacker creates a project literally named `acme-store-pr-7` (or `acme-store-main`). No project's `slug` equals that string, no registry doc exists -> claimed unsuffixed. Their *production* service is `dfy-acme-store-pr-7` = the victim's PR-7 preview service; same cache key, same artifact package. Preview env vars (usually production-grade credentials) persist on the service through `--update-env-vars` merge, and cache poisoning injects attacker-controlled files into the victim's build workspace.
  - The reverse also yields the victim's *production* service whenever the victim slug contains a hyphen: attacker takes slug `acme`, pushes a branch named `store`, deploy type is `branch` (src/app/api/projects/[id]/deploy/route.ts:133-134, `branch` is unvalidated body input), derived slug = `acme-store` -> `dfy-acme-store` = victim's production service.
  - This also defeats the deletion guard: `planServiceDeletion` asks "does another project claim slug `acme-store-pr-7`?" (src/lib/gcp/service-ownership.ts:132-136). Nobody does, so it is judged uncontested and the label check is never reached — the attacker deleting their own project deletes the victim's preview service and, for the production-name case, `deleteProjectImages` on the victim's package (src/app/api/projects/[id]/route.ts:380-383).

BYPASS 3 — pre-existing duplicates are untouched by default, and the documented remediation is itself incomplete. `getSlugResolutionMode()` defaults to `'legacy'` (slug-registry.ts:60-63), so `pickSlugOwner` still returns `docs[0]` for hostname routing (src/lib/db.ts:695) — the id-grinding hostname race in the original finding is unchanged for slugs that already collide — and `findSlugSquatConflict` returns null immediately (slug-registry.ts:177-178), so the deploy-time guard is inert. Even after an operator sets `PROJECT_SLUG_RESOLUTION_MODE=oldest-wins`, the guard exists only in the manual deploy route (src/app/api/projects/[id]/deploy/route.ts:59); the git-push and PR webhook paths call `submitCloudBuild` with no squat check at all (src/app/api/webhooks/github/route.ts:107-110, 235, 646, 675), and a push is the primary deploy trigger — so the squatter still deploys over the older project's service.

====================================================================================================
## ai-cost-abuse-1
====================================================================================================

--- lens: closes | closes=partially verdict=fix-first ---
BYPASS:
Set IAM_SELF_REMEDIATION_ENABLED=true (the fix's own documented opt-in, env.example:94-99) and the defect is fully back through the branch the new allowlist never touches: POST /api/projects/{id}/storage/{storageId}/remediate with body {"riskId":"broad_secret_access"} on ANY connector whose metadata.provisioned is truthy hits src/lib/gcp/remediation-utils.ts:285-288, which calls revokeProjectRole(gcpProjectId, saEmail, 'roles/secretmanager.secretAccessor') and 'roles/secretmanager.admin' against the shared platform SA with hard-coded role names — resolveRevocableRoles is never consulted, no metadata is needed, and remediateRisk never verifies the risk actually exists (the only precondition is metadata.provisioned). Any non-viewer team member on any project with one provisioned connector drops secret reads for every tenant at once; /api/infrastructure/remediate (src/app/api/infrastructure/remediate/route.ts:68) fans it out over many connectors in one request. The overprivileged path with the flag on is also still tenant-drivable: EXCESSIVE_PROJECT_ROLES (src/lib/gcp/iam.ts:13-19) still allows roles/owner, roles/editor, roles/secretmanager.secretAccessor and roles/secretmanager.admin, and metadata.excessiveRoles remains attacker-writable because sanitizeClientMetadata is warn-only unless STORAGE_METADATA_STRICT=true (default false, src/app/api/projects/[id]/storage/route.ts:50-52 with the raw merge still at lines 527-533). Separately, ungated at every flag setting, the same handler keeps the identical flaw class on non-IAM mutations: tenant-writable metadata.resourceName feeds updateInstanceSettings/updateConnectionPooler at remediation-utils.ts:81, 110, 126, 173, 189, and cloudsql.ts:426-444 resolves that name inside the platform project with no ownership check — so a tenant can still force a pooler restart (connection_saturation_risk) or a maintenance-window change (metadata.maintenanceRecommendation, line 190, not even in SERVER_OWNED_METADATA_KEYS) on another tenant's Cloud SQL instance.

--- lens: breaks | closes=partially verdict=ship ---
BYPASS:
Set IAM_SELF_REMEDIATION_ENABLED=true (which env.example:99 and the code comment at src/lib/gcp/remediation-utils.ts:41-46 present as the intended operator end-state) and the identical platform-wide DoS returns, because the allowlist does not constrain the dangerous roles: (1) POST /api/projects/{id}/storage/{sid}/remediate with {"riskId":"broad_secret_access"} never consults resolveRevocableRoles at all — src/lib/gcp/remediation-utils.ts:287-289 hardcodes revokeProjectRole(... 'roles/secretmanager.secretAccessor') and ('roles/secretmanager.admin') on the shared platform SA, gated only on storage.metadata?.provisioned (line 272), which is still tenant-settable because sanitizeClientMetadata is warn-only by default (src/app/api/projects/[id]/storage/route.ts:50-53, STORAGE_METADATA_STRICT unset). Stripping secretAccessor kills secret reads for every tenant. (2) {"riskId":"overprivileged_service_account"} with metadata.excessiveRoles:["roles/editor"] passes the allowlist (EXCESSIVE_PROJECT_ROLES, src/lib/gcp/iam.ts:13-19) and is revoked from the shared SA; with excessiveRoles absent the fallback still revokes roles/owner + roles/editor (src/lib/gcp/iam.ts:22). The allowlist only blocks arbitrary roles (roles/run.admin, roles/cloudbuild.builds.editor) and projectIamAdmin self-lockout. Neither remediate route adds a role gate — src/middleware/rbac.ts:8-34 returns allowed:true for ANY team membership, so a `viewer` can fire it. Net: the fix's real defense is one env flag, not the allowlist.
