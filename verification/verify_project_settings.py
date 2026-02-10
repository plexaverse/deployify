from playwright.sync_api import sync_playwright
import json
import time

def verify_project_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Do NOT set dummy cookie, rely on MOCK_SESSION fallback in dev mode

        page = context.new_page()

        # Mock API responses
        def handle_project(route):
            print("Intercepted /api/projects/123")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "project": {
                        "id": "123",
                        "userId": "233623958", # Match MOCK_USER ID
                        "name": "Test Project",
                        "slug": "test-project",
                        "repoFullName": "test/repo",
                        "productionUrl": "https://test-project.deployify.app",
                        "envVariables": [
                            {"id": "e1", "key": "API_KEY", "value": "secret", "isSecret": True, "target": "both", "environment": "all"},
                            {"id": "e2", "key": "PREVIEW_ONLY", "value": "val", "isSecret": False, "target": "runtime", "environment": "preview"}
                        ],
                        "domains": [],
                        "resources": {"cpu": 1, "memory": "256Mi"}
                    },
                    "deployments": []
                })
            )

        def handle_audit(route):
            print("Intercepted /api/projects/123/audit")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "logs": [
                        {
                            "id": "a1",
                            "action": "project_updated",
                            "userId": "233623958",
                            "createdAt": "2023-10-27T10:00:00Z",
                            "details": {"updates": {"name": "Test Project"}}
                        },
                        {
                            "id": "a2",
                            "action": "env_var_created",
                            "userId": "233623958",
                            "createdAt": "2023-10-27T10:05:00Z",
                            "details": {"envVarKey": "API_KEY"}
                        }
                    ]
                })
            )

        # Mock Routes
        page.route("**/api/projects/123", handle_project)
        page.route("**/api/projects/123/audit", handle_audit)

        # Helper for empty responses
        page.route("**/api/projects/123/domains", lambda r: r.fulfill(status=200, body=json.dumps({"domains": []})))
        page.route("**/api/projects/123/env", lambda r: r.fulfill(status=200, body=json.dumps({"envVariables": []})))

        print("Navigating to Project Settings...")
        try:
            # We use a non-existent ID '123' which we mock
            page.goto("http://localhost:3000/dashboard/123/settings")

            # Wait for content to load
            page.wait_for_selector("text=Project Settings", timeout=10000)

            # Take screenshot of Audit Logs section
            audit_section = page.locator("text=Audit Logs").first
            if audit_section.is_visible():
                audit_section.scroll_into_view_if_needed()
                time.sleep(1) # Wait for logs to render
                page.screenshot(path="verification/project_settings_audit.png")
                print("Screenshot saved: verification/project_settings_audit.png")
            else:
                print("Audit Logs section not found")
                page.screenshot(path="verification/project_settings_full.png", full_page=True)


            # Take screenshot of Env Vars section with new Environment column
            env_section = page.locator("text=Environment Variables").first
            if env_section.is_visible():
                env_section.scroll_into_view_if_needed()

                # Check for Environment header
                if page.locator("text=Environment (Where)").count() > 0 or page.locator("th:has-text('Environment')").count() > 0:
                    print("Found Environment column/header")

                # Click Add Variable to see the environment selector
                add_btn = page.locator("button:has-text('Add Variable')")
                if add_btn.is_visible():
                    add_btn.click()
                    time.sleep(0.5)
                    page.screenshot(path="verification/project_settings_env_form.png")
                    print("Screenshot saved: verification/project_settings_env_form.png")

        except Exception as e:
            print(f"Error accessing project settings: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    verify_project_settings()
