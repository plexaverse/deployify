---
description: How to set up GitHub webhooks for Deployify after deployment
---

# Setting Up GitHub Webhooks for Deployify

After deploying Deployify to Cloud Run, follow these steps to enable automatic deployments:

## Step 1: Get Your Deployed URL

Your Deployify URL will look like:
```
https://deployify-xxxxx.asia-south1.run.app
```

## Step 2: Update Environment Variable

Update `NEXT_PUBLIC_APP_URL` in your Cloud Run environment to your deployed URL.

## Step 3: Add Webhook to Each Repository

For each repository you want to auto-deploy:

1. Go to: `https://github.com/OWNER/REPO/settings/hooks/new`

2. Fill in the form:
   | Field | Value |
   |-------|-------|
   | **Payload URL** | `https://YOUR-DEPLOYIFY-URL/api/webhooks/github` |
   | **Content type** | `application/json` |
   | **Secret** | Your `GITHUB_WEBHOOK_SECRET` value |

3. Select events:
   - Choose **"Let me select individual events"**
   - Check: ✅ **Pushes**
   - Check: ✅ **Pull requests**

4. Keep **"Active"** checked

5. Click **"Add webhook"**

## Step 4: Test the Webhook

Push a commit to your repository. Check:
- GitHub webhook delivery shows "200 OK"
- Deployify dashboard shows new deployment

## Troubleshooting

- **401 error**: Check `GITHUB_WEBHOOK_SECRET` matches
- **404 error**: Check the Payload URL is correct
- **500 error**: Check Deployify logs in Cloud Run
