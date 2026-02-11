from playwright.sync_api import sync_playwright

def verify_empty_states():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a large viewport to see all sections
        context = browser.new_context(viewport={"width": 1280, "height": 1200})
        page = context.new_page()

        # Console logging
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

        # Mock API responses

        # 1. Dashboard: No projects
        page.route("**/api/projects", lambda route: route.fulfill(
            status=200,
            body='{"projects": []}',
            headers={"content-type": "application/json"}
        ))

        # Mock Teams (empty)
        page.route("**/api/teams", lambda route: route.fulfill(
            status=200,
            body='{"teams": []}',
            headers={"content-type": "application/json"}
        ))

        # 2. Project Detail: No deployments
        # Mock Project Detail
        page.route("**/api/projects/test-project", lambda route: route.fulfill(
            status=200,
            body='{"project": {"id": "test-project", "name": "Test Project", "repoUrl": "https://github.com/test/repo", "repoFullName": "test/repo", "defaultBranch": "main", "productionUrl": null, "deployments": []}}',
            headers={"content-type": "application/json"}
        ))

        # Mock Deployments list
        page.route("**/api/projects/test-project/deployments", lambda route: route.fulfill(
            status=200,
            body='{"deployments": []}',
            headers={"content-type": "application/json"}
        ))

        # 3. Settings: No domains, No env vars
        page.route("**/api/projects/test-project/domains", lambda route: route.fulfill(
            status=200,
            body='{"domains": []}',
            headers={"content-type": "application/json"}
        ))

        page.route("**/api/projects/test-project/env", lambda route: route.fulfill(
            status=200,
            body='{"envVariables": []}',
            headers={"content-type": "application/json"}
        ))

        # --- Verify Dashboard ---
        print("Navigating to Dashboard...")
        try:
            page.goto("http://localhost:3000/")
            page.wait_for_selector("text=No projects found", timeout=10000)
            page.screenshot(path="verification/dashboard_empty.png")
            print("Screenshot saved: verification/dashboard_empty.png")
        except Exception as e:
            print(f"Error verification dashboard: {e}")
            page.screenshot(path="verification/dashboard_error.png")

        # --- Verify Project Detail (Deployments) ---
        print("Navigating to Project Detail...")
        try:
            page.goto("http://localhost:3000/dashboard/test-project")
            # Wait for "Ready to deploy" or similar text from EmptyState
            page.wait_for_selector("text=Ready to deploy", timeout=10000)
            page.screenshot(path="verification/deployment_empty.png")
            print("Screenshot saved: verification/deployment_empty.png")
        except Exception as e:
            print(f"Error verification deployment: {e}")
            page.screenshot(path="verification/deployment_error.png")

        # --- Verify Settings (Domains & Env Vars) ---
        print("Navigating to Project Settings...")
        try:
            # Note: The settings page is at /dashboard/[id]/settings based on file structure
            page.goto("http://localhost:3000/dashboard/test-project/settings")

            # Wait for Domains section
            page.wait_for_selector("text=No domains configured", timeout=10000)
            # Wait for Env Vars section
            page.wait_for_selector("text=No environment variables yet", timeout=10000)

            page.screenshot(path="verification/settings_empty.png")
            print("Screenshot saved: verification/settings_empty.png")
        except Exception as e:
            print(f"Error verification settings: {e}")
            page.screenshot(path="verification/settings_error.png")

        browser.close()

if __name__ == "__main__":
    verify_empty_states()
