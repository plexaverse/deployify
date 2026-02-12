from playwright.sync_api import sync_playwright
import time

def verify_empty_states():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Verifying Empty States...")

        # 1. Dashboard Search Empty State
        # Mock projects list to return some projects so search bar appears and we can search for non-existent one
        page.route("**/api/projects", lambda route: route.fulfill(
            status=200,
            body='{"projects": [{"id": "p1", "name": "Project A", "repoFullName": "user/repo-a", "updatedAt": "2023-01-01T00:00:00Z"}]}',
            headers={"content-type": "application/json"}
        ))

        try:
            print("1. Testing Dashboard Search Empty State...")
            page.goto("http://localhost:3000/dashboard")
            page.wait_for_selector("input[placeholder='Search projects...']", timeout=10000)

            # Type something that doesn't exist
            page.fill("input[placeholder='Search projects...']", "NonExistentProject")

            # Wait for EmptyState component
            page.wait_for_selector("text=No projects found", timeout=5000)
            page.wait_for_selector("text=No projects match \"NonExistentProject\"", timeout=5000)

            # Check for the Clear Search button
            page.wait_for_selector("button:has-text('Clear search')", timeout=5000)

            print("✅ Dashboard Search Empty State Verified")
        except Exception as e:
            print(f"❌ Dashboard Search Empty State Failed: {e}")
            page.screenshot(path="verification/error_dashboard_search.png")

        # 2. Domains Empty State
        # Navigate to a project page (we need to mock the project and domains)
        page.route("**/api/projects/p1", lambda route: route.fulfill(
            status=200,
            body='{"project": {"id": "p1", "name": "Project A", "slug": "project-a", "repoFullName": "user/repo-a", "updatedAt": "2023-01-01T00:00:00Z"}}',
            headers={"content-type": "application/json"}
        ))
        page.route("**/api/projects/p1/domains", lambda route: route.fulfill(
            status=200,
            body='{"domains": []}',
            headers={"content-type": "application/json"}
        ))
        # Also need env vars route to not fail
        page.route("**/api/projects/p1/env", lambda route: route.fulfill(
            status=200,
            body='{"envVariables": []}',
            headers={"content-type": "application/json"}
        ))
        page.route("**/api/projects/p1/deployments", lambda route: route.fulfill(
            status=200,
            body='{"deployments": []}',
            headers={"content-type": "application/json"}
        ))

        try:
            print("2. Testing Domains and Env Vars Empty States...")
            # Navigate to project detail page
            page.goto("http://localhost:3000/dashboard/p1")

            # We need to find if the sections are here or in settings.
            # We'll check for "Domains" or "Environment Variables" headers.
            # If not found, we assume we need to go to settings or click a tab.

            found_on_dashboard = False
            try:
                page.wait_for_selector("text=Domains", timeout=3000)
                found_on_dashboard = True
            except:
                pass

            if not found_on_dashboard:
                print("Domains section not found on dashboard, trying Settings...")
                page.goto("http://localhost:3000/dashboard/p1/settings")

            # Wait for "No domains configured"
            page.wait_for_selector("text=No domains configured", timeout=5000)
            print("✅ Domains Empty State Verified")

            # Wait for "No environment variables yet"
            page.wait_for_selector("text=No environment variables yet", timeout=5000)
            print("✅ Env Vars Empty State Verified")

        except Exception as e:
            print(f"❌ Domains/Env Vars Empty State Failed: {e}")
            page.screenshot(path="verification/error_domains_env.png")

        browser.close()

if __name__ == "__main__":
    verify_empty_states()
