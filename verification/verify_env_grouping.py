import json
import time
from playwright.sync_api import sync_playwright, expect

def verify_env_grouping():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Increase viewport height to capture full tables
        context = browser.new_context(viewport={"width": 1280, "height": 1200})
        page = context.new_page()

        # Mock API responses

        # 1. Mock Project Details (needed for dashboard/settings page load)
        page.route("**/api/projects/test-project", lambda route: route.fulfill(
            status=200,
            body='{"project": {"id": "test-project", "name": "Test Project", "slug": "test-project", "envVariables": [], "branchEnvironments": [], "autodeployBranches": []}}',
            headers={"content-type": "application/json"}
        ))

        # 2. Mock Env Variables List (GET)
        # Return variables with different groups
        env_response = {
            "envVariables": [
                {"id": "1", "key": "DB_URL", "value": "postgres://...", "isSecret": True, "target": "runtime", "environment": "production", "group": "Database"},
                {"id": "2", "key": "DB_PASS", "value": "secret", "isSecret": True, "target": "runtime", "environment": "production", "group": "Database"},
                {"id": "3", "key": "API_KEY", "value": "12345", "isSecret": False, "target": "both", "environment": "both", "group": "API"},
                {"id": "4", "key": "NEXT_PUBLIC_ANALYTICS", "value": "UA-123", "isSecret": False, "target": "build", "environment": "production", "group": "General"}, # Explicit General
                {"id": "5", "key": "OLD_VAR", "value": "foo", "isSecret": False, "target": "both", "environment": "both"} # No group -> General
            ]
        }

        def handle_env(route):
            if route.request.method == "GET":
                route.fulfill(status=200, body=json.dumps(env_response), headers={"content-type": "application/json"})
            elif route.request.method == "POST":
                # Mock adding a new variable
                data = route.request.post_data_json
                print("Intercepted POST request to /env with data:", data)
                new_var = {
                    "id": "new-var",
                    "key": data.get("key"),
                    "value": data.get("value"),
                    "isSecret": data.get("isSecret"),
                    "target": data.get("target"),
                    "environment": data.get("environment"),
                    "group": data.get("group", "General")
                }
                # Update our mocked response for subsequent GETs (optimistic update handles it locally usually, but re-fetch happens)
                env_response["envVariables"].append(new_var)
                route.fulfill(status=200, body=json.dumps({"envVariable": new_var}), headers={"content-type": "application/json"})
            elif route.request.method == "DELETE":
                route.fulfill(status=200, body=json.dumps({"message": "Deleted"}), headers={"content-type": "application/json"})

        page.route("**/api/projects/test-project/env", handle_env)

        # Mock other calls to avoid errors
        page.route("**/api/projects/test-project/domains", lambda r: r.fulfill(status=200, body='{"domains": []}'))
        page.route("**/api/projects/test-project/deployments", lambda r: r.fulfill(status=200, body='{"deployments": []}'))
        page.route("**/api/projects/test-project/logs/stats", lambda r: r.fulfill(status=200, body='{"errorCount": 0}'))

        # Navigate
        print("Navigating to Project Settings...")
        # Note: 'test-project' ID is used in URL
        page.goto("http://localhost:3000/dashboard/test-project/settings")

        # Wait for Env Vars section
        page.wait_for_selector("text=Environment Variables", timeout=10000)

        # 3. Verify Group Headers exist
        print("Verifying group headers...")

        # Wait for headers
        try:
             # The text content is Database, API, General. CSS uppercases it.
             # We should check for existence of these texts.
             # Using regex to be safe about case if transformed in JS (it's not, just CSS).
             expect(page.get_by_text("Database", exact=True)).to_be_visible()
             expect(page.get_by_text("API", exact=True)).to_be_visible()
             expect(page.get_by_text("General", exact=True)).to_be_visible()
             print("Group headers found.")
        except Exception as e:
             print("Group headers verification failed:", e)

        page.screenshot(path="verification/env_groups_list.png")
        print("Screenshot saved: verification/env_groups_list.png")

        # 4. Add new variable with new group
        print("Adding new variable with group 'Auth'...")
        # Find the "Add Variable" button.
        page.click("text=Add Variable")

        page.fill("input[placeholder='API_KEY']", "AUTH_TOKEN")
        page.fill("input[placeholder='secret-value']", "xyz")
        page.fill("input[placeholder='e.g. Database, Auth, General']", "Auth")

        page.screenshot(path="verification/env_groups_form.png")
        print("Screenshot saved: verification/env_groups_form.png")

        # Click Add (inside form)
        # Use a specific locator for the submit button
        page.locator("button:has-text('Add Variable')").last.click()

        # Verify new group header "Auth" appears
        try:
            # Wait for "Auth" text to appear
            page.wait_for_selector("text=Auth", timeout=5000)
            print("Auth group header appeared.")

            # Wait for "AUTH_TOKEN"
            page.wait_for_selector("text=AUTH_TOKEN", timeout=5000)
            print("AUTH_TOKEN appeared.")
        except Exception as e:
            print("Failed to verify Auth group addition:", e)

        page.screenshot(path="verification/env_groups_after_add.png")
        print("Screenshot saved: verification/env_groups_after_add.png")

        browser.close()

if __name__ == "__main__":
    verify_env_grouping()
