import time
from playwright.sync_api import sync_playwright

def verify_empty_states():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Define handlers
        def handle_deployments(route):
            print("Handling deployments request")
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"deployments": []}'
            )

        def handle_project_details(route):
            print("Handling project details request")
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"project": {"id": "proj_123", "name": "Test Project", "repoFullName": "user/repo", "productionUrl": "https://test.com", "defaultBranch": "main", "region": "us-central1"}}'
            )

        def handle_env_vars(route):
            print("Handling env vars request")
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"envVariables": []}'
            )

        def handle_domains(route):
            print("Handling domains request")
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"domains": []}'
            )

        # Register specific routes
        page.route("**/api/projects/proj_123/deployments", handle_deployments)
        page.route("**/api/projects/proj_123/env", handle_env_vars)
        page.route("**/api/projects/proj_123/domains", handle_domains)

        # This matches /api/projects/proj_123 but NOT /api/projects/proj_123/deployments if registered before?
        # Actually, let's make it strict.
        page.route("**/api/projects/proj_123", handle_project_details)


        # Direct navigation to Deployments Page
        print("Navigating to Deployments page...")
        page.goto("http://localhost:3000/dashboard/proj_123/deployments")

        # Wait for data to load (skeletons to disappear)
        # We look for "No deployments yet" text which is in the EmptyState
        try:
            page.wait_for_selector("text=No deployments yet", timeout=10000)
            page.screenshot(path="verification/empty_deployments_final.png")
            print("Captured empty_deployments_final.png")
        except:
            print("Timeout waiting for 'No deployments yet'")
            page.screenshot(path="verification/deployments_timeout.png")

        # Direct navigation to Settings Page (Env Vars)
        print("Navigating to Settings page...")
        page.goto("http://localhost:3000/dashboard/proj_123/settings")
        try:
            page.wait_for_selector("text=No environment variables yet", timeout=10000)
            page.screenshot(path="verification/empty_env_vars_final.png")
            print("Captured empty_env_vars_final.png")

            # Scroll down to check Domains
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)
            page.screenshot(path="verification/empty_settings_full.png")

        except:
             print("Timeout waiting for 'No environment variables yet'")
             page.screenshot(path="verification/settings_timeout.png")

        browser.close()

if __name__ == "__main__":
    verify_empty_states()
