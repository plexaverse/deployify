# Deployify Project Rules & Context

> **Purpose**: This document helps AI assistants quickly understand the Deployify project structure, conventions, and patterns for more effective assistance.

---

## 🎯 Project Overview

**Deployify** is a **self-hosted Vercel-like deployment platform** for Next.js applications using Google Cloud Platform (GCP).

**Tagline**: "Deploy like Vercel, Pay like raw GCP"

### Core Value Proposition
- Vercel-like developer experience (git-push deploys, preview URLs, etc.)
- Runs on your own GCP infrastructure (80% cost savings)
- Self-hosted and customizable

---

## 🏗️ Architecture

### Tech Stack
| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, TypeScript, Tailwind CSS, Framer Motion |
| **UI Components** | Aceternity UI-style (Spotlight, BentoGrid, TracingBeam, MovingBorder, BackgroundBeams) |
| **Backend** | Next.js API Routes |
| **Database** | Firebase/Firestore |
| **Container Registry** | GCP Artifact Registry |
| **Build Pipeline** | GCP Cloud Build |
| **Deployment Target** | GCP Cloud Run |
| **Auth** | GitHub OAuth + JWT Sessions (7-day expiry) |
| **Supported Frameworks** | Next.js, Vite (React, Vue, Svelte, etc.) |

### Directory Structure
```
deployify/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── auth/           # GitHub OAuth (github, callback, logout, debug)
│   │   │   ├── projects/       # Project CRUD + [id]/{deploy, domains, env}
│   │   │   ├── repos/          # GitHub repository listing
│   │   │   └── webhooks/       # GitHub webhook handler
│   │   ├── dashboard/          # Protected pages
│   │   │   ├── [id]/           # Project detail + settings
│   │   │   └── new/            # Create new project
│   │   ├── login/              # Login page
│   │   └── page.tsx            # Landing page (marketing)
│   ├── components/
│   │   ├── ui/                 # Aceternity-style animated components
│   │   ├── analytics/          # Analytics components
│   │   ├── DomainsSection.tsx  # Domain management UI
│   │   ├── EnvVariablesSection.tsx # Environment variables UI
│   │   ├── RegionSettings.tsx  # GCP region selector
│   │   ├── DeploymentTimeline.tsx # Visual deployment steps
│   │   └── DashboardSidebar.tsx # Responsive sidebar
│   ├── lib/
│   │   ├── auth.ts             # JWT auth utilities
│   │   ├── config.ts           # Environment config validation
│   │   ├── db.ts               # Firestore CRUD operations
│   │   ├── deployment.ts       # Deployment polling & notification logic
│   │   ├── dockerfiles.ts      # Dockerfile generation logic
│   │   ├── firebase.ts         # Firebase client initialization
│   │   ├── github.ts           # GitHub API client (Octokit)
│   │   ├── utils.ts            # Helper utilities
│   │   ├── gcp/
│   │   │   ├── cloudbuild.ts   # Cloud Build configuration & submission
│   │   │   ├── cloudrun.ts     # Cloud Run service management
│   │   │   └── domains.ts      # Custom domain management
│   │   └── security/           # Security utilities
│   ├── types/                  # TypeScript interfaces
│   └── middleware.ts           # Edge middleware (auth, rate limiting, security headers)
├── templates/
│   └── Dockerfile.nextjs       # Template for user app deployments
└── .Jules/
    └── palette.md              # Design learnings/patterns
```

---

## 📊 Data Models

### Core Entities (from `src/types/index.ts`)

```typescript
User          // GitHub OAuth user
Project       // Deployment project config (repo, build commands, region, emailNotifications, etc.)
Deployment    // Individual deployment record (status, commit, URLs)
EnvVar        // Environment variable (key, value, target: production/preview/all)
Domain        // Custom domain (status: pending/active/error)
```

### Deployment Statuses
`queued` → `building` → `deploying` → `ready` | `error` | `cancelled`

### Environment Variable Targets
- `build` - Available during build only
- `runtime` - Available at runtime only
- `both` - Available during both

---

## 🎨 Design System

### CSS Variables (from `globals.css`)
```css
--background: #0a0a0b      /* Dark background */
--primary: #6366f1         /* Indigo brand color */
--success/warning/error    /* Status colors */
--gradient-primary         /* Indigo → Purple → Pink gradient */
```

### Component Classes
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`
- `.card`, `.card-glass`
- `.input`
- `.badge`, `.badge-success`, `.badge-warning`, `.badge-error`, `.badge-info`

### Animations
- `animate-pulse-glow`, `animate-spin`, `animate-fade-in`, `animate-spotlight`

---

## 🔑 Key Conventions

### 1. API Routes Pattern
- **Always** return `{ success: boolean, data?: T, error?: string }`
- Use `getAuthFromRequest()` for protected routes
- Routes under `/api/projects/[id]/` for project-specific actions

### 2. Authentication Flow
1. User clicks "Connect GitHub" → `/api/auth/github`
2. GitHub redirects → `/api/auth/callback`
3. JWT token stored in `deployify_session` cookie
4. Middleware checks cookie for `/dashboard/*` routes
5. Layout verifies JWT validity server-side

### 3. Deployment Flow
1. GitHub webhook → `/api/webhooks/github`
2. Create deployment record in Firestore
3. Submit Cloud Build with generated config (using `src/lib/dockerfiles.ts`)
4. Cloud Build: clone → install → build → Docker → push → deploy Cloud Run
5. Update deployment status (poll or callback)

### 4. State Management
- **Client-side**: React `useState` + `useEffect` for data fetching
- **No global state library** - each page fetches its own data
- **Optimistic UI**: Copy-to-clipboard shows checkmark immediately

### 5. Error Handling
- Try-catch in API routes with descriptive error messages
- Console logging for debugging
- User-facing error states in UI components

---

## 🛡️ Security Features

1. **Rate Limiting**: 100 req/min (30 for auth routes)
2. **Security Headers**: X-Frame-Options, CSP, HSTS via middleware
3. **Webhook Verification**: HMAC-SHA256 signature validation
4. **Session Management**: JWT with 7-day expiry
5. **CSRF Protection**: State token for OAuth flow

---

## ⚙️ Required Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_WEBHOOK_SECRET` | Secret for webhook signature verification |
| `GCP_PROJECT_ID` | Your GCP project ID |
| `JWT_SECRET` | Secret for session tokens |
| `NEXT_PUBLIC_APP_URL` | Public app URL (for redirects) |

---

## 🚀 Common Tasks

### Adding a new API route
1. Create `src/app/api/[route]/route.ts`
2. Export `GET`, `POST`, `PUT`, `DELETE` functions
3. Use `getAuthFromRequest()` for auth
4. Return `NextResponse.json({ success: true, data: ... })`

### Adding a new dashboard page
1. Create `src/app/dashboard/[page]/page.tsx`
2. Mark as `'use client'` for interactivity
3. Fetch data via `/api/` routes
4. Use existing CSS classes (`.card`, `.btn`, etc.)

### Adding a new UI component
1. Create in `src/components/` or `src/components/ui/`
2. Follow Aceternity UI patterns for animations
3. Use Framer Motion for complex animations
4. Export from component file directly

### Modifying the build pipeline
1. Edit `src/lib/dockerfiles.ts` to modify Dockerfile templates
2. Edit `src/lib/gcp/cloudbuild.ts` for Cloud Build step configuration
3. `generateCloudRunDeployConfig()` creates the Cloud Build YAML
4. Test with a sample repository push

---

## 📝 Learnings (from `.Jules/palette.md`)

1. **Copy Feedback**: Use unique IDs, not values, for clipboard success states
2. **Accessibility**: Add `<label htmlFor>` for form sections, clear buttons for search
3. **OS Detection**: Defer `setState` in `useEffect` using `setTimeout(0)`
4. **Tab Interfaces**: Use proper ARIA roles (`tablist`, `tab`, `tabpanel`)
5. **Vertical Flow**: Use TracingBeam for narrative sections on landing pages

---

## 🔍 Quick Reference

### File Locations
| Need | Location |
|------|----------|
| Add project setting | `src/components/[Name]Section.tsx` |
| Modify auth | `src/lib/auth.ts`, `src/app/api/auth/` |
| Add database operation | `src/lib/db.ts` |
| Modify deployment | `src/lib/gcp/cloudbuild.ts` |
| Change styles | `src/app/globals.css` |
| Add type | `src/types/index.ts` |
| Add animated component | `src/components/ui/` |
| Add empty state | Use `src/components/EmptyState.tsx` |

### Running Commands
```bash
npm run dev      # Development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
```

---

*Last updated: February 2026*
