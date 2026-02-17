import time
from playwright.sync_api import sync_playwright

def verify_import_secrets():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1280, 'height': 800})

        # Add a dummy session cookie to bypass initial auth redirect (if any)
        context.add_cookies([
            {
                'name': 'deployify_session',
                'value': 'mock_session_token',
                'domain': 'localhost',
                'path': '/'
            }
        ])

        page = context.new_page()

        # Navigate to Import page with a repo query param
        print("Navigating to Import Project page...")
        page.goto("http://localhost:3000/dashboard/new/import?repo=user/my-repo")

        # Wait for the page to load
        page.wait_for_selector("text=Configure Project")

        print("Adding a secret environment variable...")

        # Fill in Key
        page.fill("input[placeholder='KEY']", "MY_SECRET_KEY")

        # Fill in Value
        page.fill("input[placeholder='Value']", "super-secret-value")

        # Check "Secret" checkbox
        # The checkbox has id="is-secret"
        page.check("#is-secret")

        # Select Target (optional, defaults to both)

        # Click Add button
        # Button text contains "Add"
        page.click("button:has-text('Add')")

        # Wait for the variable to appear in the list
        page.wait_for_selector("text=MY_SECRET_KEY")

        print("Verifying UI elements...")

        # Check if Shield icon is present next to the key
        # The shield icon is rendered if isSecret is true
        # We can look for the Shield component, which renders an svg.
        # Or check if the value is masked "••••••••"

        # Check for masked value
        page.wait_for_selector("text=••••••••")
        print("Found masked value.")

        # Take screenshot
        screenshot_path = "verification/import_secrets_ui.png"
        page.screenshot(path=screenshot_path)
        print(f"Captured screenshot: {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_import_secrets()
