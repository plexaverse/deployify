from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1200})
        page = context.new_page()

        # Navigate to settings page (where Data Lab is)
        # Mocking auth is handled by MOCK_DB=true returning a MOCK_SESSION
        try:
            print("Navigating to Data Lab...")
            page.goto("http://localhost:3000/dashboard/mock-id/settings")

            # Wait for project to load
            page.wait_for_selector("h1:has-text('Project Settings')")

            # Scroll to Data Lab
            print("Scrolling to Data Lab...")
            datalab_section = page.locator("h3:has-text('Managed Query Browser')")
            datalab_section.scroll_into_view_if_needed()

            # 1. Discover Schema
            print("Discovering Schema...")
            page.click("button:has-text('Discover Schema')")
            page.wait_for_selector("span:has-text('Schema Insight')")

            # Take screenshot of schema with PK/FK
            page.screenshot(path="verification/schema_insight.png")

            # 2. Test Dynamic Parameters
            print("Testing Dynamic Parameters UI...")
            # Click on 'users' table in schema insight to populate query
            page.click("button:has-text('users')")

            # Edit query to include a parameter
            # We need to find the textarea inside QueryEditor
            textarea = page.locator("textarea")
            textarea.fill("SELECT * FROM users WHERE id = :user_id")

            # Wait for parameter input to appear
            page.wait_for_selector("span:has-text('Query Parameters')")
            page.wait_for_selector("label:has-text(':user_id')")

            # Fill parameter
            page.fill("input[placeholder='VALUE FOR USER_ID']", "123")

            # Take screenshot of parameters
            page.screenshot(path="verification/dynamic_params.png")

            # 3. Run Query
            print("Running Query...")
            page.click("button:has-text('Run Query')")

            # Wait for success
            page.wait_for_selector("text=Query Executed Successfully")

            # Final screenshot
            page.screenshot(path="verification/final_state.png")

            print("Verification successful!")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    # Give the dev server a moment to start
    time.sleep(10)
    run()
