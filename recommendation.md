# Deployify Product Recommendations

This document outlines the top 3 recommended features to enhance the Deployify platform, providing details for development and integration.

---

## 1. Intelligent Resource Optimization & Auto-Scaling

### Overview
While Deployify currently fetches basic metrics, users lack actionable insights into their resource utilization. This feature introduces a "Smart Scaling" engine that analyzes Cloud Monitoring data to provide cost-saving and performance-enhancing recommendations.

### Key Details
- **Automated Analysis**: Build a background worker that periodically queries `src/lib/gcp/monitoring.ts` for CPU, Memory, and Disk trends over 7-30 days.
- **Recommendation UI**: A new "Optimization" tab in the Project Dashboard displaying current vs. recommended tiers (e.g., switching from `db-custom-2-7680` to `db-g1-small` for low-traffic apps).
- **Auto-Pilot Mode**: Allow users to enable "Auto-Scaling" where Deployify automatically patches Cloud SQL tiers or Cloud Run concurrency limits during high-load events, using `src/lib/gcp/cloudsql.ts:updateInstanceSettings`.
- **Cost Impact**: Integration with GCP Billing API to show "Potential Monthly Savings" for each recommendation.

### Implementation Status: COMPLETED ✅
1. ✅ **[VERIFIED]** Enhanced `src/lib/gcp/monitoring.ts` with `getCloudSqlHistoricalMetrics` and `getMemorystoreHistoricalMetrics` for historical time-series aggregation.
2. ✅ **[VERIFIED]** Implemented `fetchSqlTierPricing` with `FALLBACK_COST_MAP` for real-time cost analysis and unauthenticated Billing API support.
3. ✅ **[VERIFIED]** Created `/api/projects/[id]/recommendations` endpoint using `getScalingRecommendations` for actionable insights.
4. ✅ **[VERIFIED]** Added `ResourceAdvisor` component leveraging scripe.io-inspired BentoGrid patterns.
5. ✅ **[VERIFIED]** Implemented **Auto-Pilot Mode** via a cron worker at `src/app/api/cron/optimize/route.ts` which automatically patches Cloud SQL tiers using `updateInstanceSettings`.

---

## 2. Full-Stack Preview Environments with Database Branching

### Overview
Currently, Deployify supports preview deployments for frontend code. This recommendation extends that to the data layer, allowing developers to test database migrations and schema changes in isolated environments for every Pull Request.

### Key Details
- **Ephemeral Databases**: Leverage `src/lib/gcp/cloudsql.ts:ensureEphemeralDatabase` to create per-PR database instances.
- **Data Seeding**: Implement a cloning mechanism that takes a recent snapshot of the production database to seed the preview environment, ensuring realistic testing.
- **Dynamic Connection Injection**: Automatically inject the temporary `DATABASE_URL` into the Cloud Run environment variables for the preview service.
- **Lifecycle Management**: Enhance `src/app/api/webhooks/route.ts` to trigger the deletion of these ephemeral databases (using `deleteDatabase`) when a PR is merged or closed.

### Implementation Status: COMPLETED ✅
1. ✅ **[VERIFIED]** Implemented Cloud SQL export/import seeding logic in `ensureEphemeralDatabase` with GCS staging support.
2. ✅ **[VERIFIED]** Integrated `waitForOperation` polling (5s intervals) to handle asynchronous GCP provisioning.
3. ✅ **[VERIFIED]** Updated deployment pipeline in `src/lib/deployment.ts` to orchestrate database branching during the `SYNCING` phase for preview environments.
4. ✅ **[VERIFIED]** Enhanced `anonymizeData` utility in `src/lib/gcp/seeding.ts` with MD5-based SQL data masking and custom salt support.

---

## 3. Global Edge Acceleration & Advanced Security (Deployify Edge)

### Overview
Transition Deployify from simple regional deployments to a global-first platform. By implementing Global Load Balancing (GLB) and Cloud Armor by default, apps will benefit from lower latency and enterprise-grade security.

### Key Details
- **Global Load Balancing**: Replace standard Cloud Run domain mappings with GCP Global External HTTP(S) Load Balancing using Serverless Network Endpoint Groups (NEGs).
- **Integrated WAF**: Move the simulated `src/lib/gcp/armor.ts` into a production-ready implementation that configures pre-configured WAF rules (SQLi, XSS protection).
- **Edge Caching**: Enable Cloud CDN at the Load Balancer level to cache static assets and Next.js ISR outputs at the edge.
- **Security Dashboard**: A "Shield" interface where users can view blocked threats and toggle security levels (Off, Detection, Prevention).

### Implementation Status: COMPLETED ✅
1. ✅ **[VERIFIED]** Developed `src/lib/gcp/loadbalancer.ts` to orchestrate Global Forwarding Rules, Target HTTPS Proxies, and Serverless NEGs.
2. ✅ **[VERIFIED]** Implemented Google-managed SSL certificate orchestration (`SSL_CERT_MANAGED`) for Load Balancers.
3. ✅ **[VERIFIED]** Upgraded `src/lib/gcp/armor.ts` to interface with the GCP Security Policies API including `sqli-v33-stable` and `xss-v33-stable` rules.
4. ✅ **[VERIFIED]** Created `ShieldSecurity` component to display real-time security insights using `getSecurityMetrics`.

---

## 4. Automated PR Merging & Quality Control

### Overview
To accelerate the development cycle, Deployify now includes an automated merge system that ensures only high-quality, approved code reaches the main branch without manual intervention.

### Key Details
- **GitHub Action Integration**: A cron-based GitHub Action (`.github/workflows/cron-auto-merge.yml`) runs every 15 minutes.
- **Strict Validation**: Automatically merges PRs only if they meet three criteria: `MERGEABLE` state, `SUCCESS` status checks (tests/build), and `APPROVED` review decision.
- **Auto-Pilot Synergy**: Works in tandem with the resource optimization and preview environments to provide a seamless "push-to-merge-to-optimize" flow.

### Implementation Status: COMPLETED ✅
1. ✅ **[VERIFIED]** Implemented `.github/workflows/cron-auto-merge.yml` with secure `GITHUB_TOKEN` and 15-minute schedule.
2. ✅ **[VERIFIED]** Security-hardened author validation for auto-merging trusted accounts (`asangzz`, `jules-google[bot]`, `jules[bot]`).
3. ✅ **[VERIFIED]** Configured `gh` CLI filters for strict quality gates including `mergeable == "MERGEABLE"` and `statusCheckRollup.state == "SUCCESS"`.
4. ✅ **[VERIFIED]** Verified 100% build and test pass rate using `pnpm test` and `npm run build`.
