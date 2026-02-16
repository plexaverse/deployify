from playwright.sync_api import sync_playwright

def verify_env_vars_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        # Do NOT set dummy cookie.
        # In dev mode, missing cookie triggers MOCK_SESSION in src/lib/auth.ts
        # If we set an invalid cookie, it tries to verify it, fails, and returns null -> redirect to login.

        page = context.new_page()

        # Mock API responses
        # Mock Project Details
        page.route("**/api/projects/test-project", lambda route: route.fulfill(
            status=200,
            body='{"project": {"id": "test-project", "name": "Test Project", "slug": "test-project", "envVariables": [], "branchEnvironments": [], "autodeployBranches": []}}',
            headers={"content-type": "application/json"}
        ))

        # Handle both GET (list) and POST (create) for /env
        def handle_env(route):
            if route.request.method == "POST":
                print("Intercepted POST request to /env")
                print("Request body:", route.request.post_data)
                route.fulfill(
                    status=200,
                    body='{"envVariable": {"id": "new-env", "key": "TEST_KEY", "value": "test-value", "isSecret": false, "target": "both", "environment": "preview"}}',
                    headers={"content-type": "application/json"}
                )
            else:
                # GET - Initial load returns empty list.
                # Note: after POST, the UI optimistic update or re-fetch might occur.
                # If UI re-fetches, it will get empty list again unless we maintain state.
                # But our component does: set({ projectEnvVariables: [...projectEnvVariables, data.envVariable] });
                # So it relies on the POST response.
                route.fulfill(
                    status=200,
                    body='{"envVariables": []}',
                    headers={"content-type": "application/json"}
                )

        page.route("**/api/projects/test-project/env", handle_env)

        # Navigate to Settings Page
        print("Navigating to Project Settings...")
        try:
            page.goto("http://localhost:3000/dashboard/test-project/settings")

            # Wait for "Environment Variables" section to load
            page.wait_for_selector("text=Environment Variables", timeout=10000)

            # Take screenshot of initial state
            page.screenshot(path="verification/env_vars_initial.png")
            print("Screenshot saved: verification/env_vars_initial.png")

            # Click "Add Variable"
            page.click("text=Add Variable")

            # Wait for form to appear
            page.wait_for_selector("input[placeholder='API_KEY']")

            # Take screenshot of form showing new "Scope" radio buttons
            page.screenshot(path="verification/env_vars_form.png")
            print("Screenshot saved: verification/env_vars_form.png")

            # Fill the form
            page.fill("input[placeholder='API_KEY']", "TEST_KEY")
            page.fill("input[placeholder='secret-value']", "test-value")

            # Select "Preview" for Scope
            # Assuming the label text is "Preview"
            page.click("text=Preview")

            # Click "Add Variable" (submit)
            # There are two buttons with "Add Variable". 0 is toggle, 1 is submit.
            page.locator("button:has-text('Add Variable')").nth(1).click()

            # Wait for new row to appear in table
            page.wait_for_selector("text=TEST_KEY", timeout=5000)
             # Wait for "Preview" scope label in table
            page.wait_for_selector("text=Preview", timeout=5000)

            page.screenshot(path="verification/env_vars_added.png")
            print("Screenshot saved: verification/env_vars_added.png")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    verify_env_vars_ui()
