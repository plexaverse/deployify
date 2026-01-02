# Deployify 🚀 version 0.1

A self-hosted Vercel-like deployment platform for Next.js applications using Google Cloud Platform.

![Deployify](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![GCP](https://img.shields.io/badge/GCP-Cloud%20Run-4285F4)

## Features

- 🔐 **GitHub OAuth** - Sign in with your GitHub account
- 📦 **Git-Push Deploys** - Automatic deployments on every push
- 🔍 **Preview Deployments** - Unique URL for every pull request
- 🛡️ **Security Built-in** - Rate limiting, WAF, security headers
- 📊 **Dashboard** - Beautiful dark-themed UI to manage projects
- 💰 **Cost Efficient** - Pay only for what you use on GCP

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Firebase/Firestore
- **Deployment**: Cloud Run
- **Build**: Cloud Build
- **Registry**: Artifact Registry

## Quick Start

### Prerequisites

- Node.js 20+
- GCP Account with billing enabled
- GitHub Account

### 1. Clone and Install

```bash
cd deployify
npm install
```

### 2. Set Up Environment Variables

Copy the example env file and fill in your values:

```bash
cp env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_WEBHOOK_SECRET` | Secret for webhook signature verification |
| `GCP_PROJECT_ID` | Your GCP project ID |
| `JWT_SECRET` | Secret for session tokens |

### 3. Set Up GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Deployify
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `http://localhost:3000/api/auth/callback`
4. Copy the Client ID and Client Secret to `.env.local`

### 4. Set Up GCP

Run these commands to set up your GCP project:

```bash
# Create project
gcloud projects create your-project-id --name="Deployify"

# Link billing
gcloud billing projects link your-project-id --billing-account=YOUR_BILLING_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  --project=your-project-id

# Create Artifact Registry repo
gcloud artifacts repositories create deployify-images \
  --repository-format=docker \
  --location=asia-south1 \
  --project=your-project-id

# Create Firestore database
gcloud firestore databases create \
  --location=asia-south1 \
  --project=your-project-id
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
deployify/
├── src/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── auth/         # GitHub OAuth
│   │   │   ├── projects/     # Project CRUD
│   │   │   ├── repos/        # GitHub repos
│   │   │   └── webhooks/     # Webhook handler
│   │   ├── dashboard/        # Dashboard pages
│   │   ├── login/            # Login page
│   │   └── page.tsx          # Landing page
│   ├── lib/
│   │   ├── auth.ts           # Auth utilities
│   │   ├── config.ts         # Configuration
│   │   ├── db.ts             # Database operations
│   │   ├── firebase.ts       # Firebase client
│   │   ├── github.ts         # GitHub API client
│   │   ├── gcp/              # GCP integrations
│   │   └── security/         # Security utilities
│   ├── types/                # TypeScript types
│   └── middleware.ts         # Edge middleware
├── templates/
│   └── Dockerfile.nextjs     # Template for user apps
├── Dockerfile                # For deploying Deployify
└── env.example               # Environment template
```

## Deploy to Cloud Run

Build and deploy Deployify itself:

```bash
# Build the image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/deployify

# Deploy to Cloud Run
gcloud run deploy deployify \
  --image gcr.io/YOUR_PROJECT_ID/deployify \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_APP_URL=https://your-deployify-url.run.app"
```

## Security Features

- **Rate Limiting**: 100 req/min per IP (30 for auth routes)
- **Security Headers**: X-Frame-Options, CSP, HSTS, etc.
- **Webhook Verification**: HMAC-SHA256 signature validation
- **Session Management**: JWT with 7-day expiry
- **CSRF Protection**: State token for OAuth flow

## Estimated Costs

| Usage Level | Monthly Cost |
|------------|--------------|
| Low (10K req/day) | ₹200-500 |
| Medium (100K req/day) | ₹1,000-2,000 |
| High (500K req/day) | ₹3,000-5,000 |

## Contributing

Contributions are welcome! Please read our contributing guidelines first.

## License

MIT License - see [LICENSE](LICENSE) for details.
