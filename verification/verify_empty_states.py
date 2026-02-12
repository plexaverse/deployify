from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1280, 'height': 800}
    )

    # Mock session cookie - OMITTED to trigger MOCK_SESSION in dev
    # context.add_cookies([{
    #     "name": "deployify_session",
    #     "value": "mock_session_token",
    #     "domain": "localhost",
    #     "path": "/"
    # }])

    page = context.new_page()

    # Verify Dashboard Empty State
    print("Verifying Dashboard Empty State...")
    # Mock /api/projects to return empty list
    page.route("**/api/projects*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"success": true, "projects": []}'
    ))

    # DashboardHome is rendered at root "/" when logged in
    page.goto("http://localhost:3000/")
    try:
        page.wait_for_selector("text=No projects found", timeout=5000)
        page.screenshot(path="verification/empty_dashboard.png")
        print("Screenshot saved: verification/empty_dashboard.png")
    except Exception as e:
        print(f"Failed to find dashboard empty state: {e}")
        page.screenshot(path="verification/empty_dashboard_failed.png")

    # Verify Domains Empty State
    print("Verifying Domains Empty State...")

    # Mock getting a project
    page.route("**/api/projects/test-project", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"success": true, "project": {"id": "test-project", "name": "Test Project", "slug": "test-project", "repoUrl": "https://github.com/user/repo", "repoBranch": "main", "createdAt": "2024-01-01T00:00:00Z"}}'
    ))

    # Mock domains
    page.route("**/api/projects/test-project/domains", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"success": true, "domains": []}'
    ))

    # Mock env vars (for next step)
    page.route("**/api/projects/test-project/env-vars", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"success": true, "envVars": []}'
    ))

    # Navigate to Settings page where Domains and EnvVars are located
    page.goto("http://localhost:3000/dashboard/test-project/settings")

    try:
        page.wait_for_selector("text=No domains configured", timeout=5000)
        page.screenshot(path="verification/empty_domains.png")
        print("Screenshot saved: verification/empty_domains.png")
    except Exception as e:
        print(f"Failed to find domains empty state: {e}")
        page.screenshot(path="verification/empty_domains_failed.png")

    # Verify Env Vars Empty State
    print("Verifying Env Vars Empty State...")
    try:
        page.wait_for_selector("text=No environment variables yet", timeout=5000)
        page.screenshot(path="verification/empty_env_vars.png")
        print("Screenshot saved: verification/empty_env_vars.png")
    except Exception as e:
        print(f"Failed to find env vars empty state: {e}")
        page.screenshot(path="verification/empty_env_vars_failed.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
