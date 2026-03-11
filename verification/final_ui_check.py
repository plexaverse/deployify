from playwright.sync_api import Page, expect, sync_playwright
import os

def verify_ui(page: Page):
    # Enable bypass for dashboard routes in development
    page.context.add_cookies([{"name": "deployify_session", "value": "mock-session-id", "domain": "localhost", "path": "/"}])

    # 1. Verify Edge Function Simulator
    print("Verifying Edge Function Simulator...")
    page.goto("http://localhost:3000/edge-debug")
    # Wait for page load
    page.wait_for_selector("text=Edge Function Simulator")
    expect(page.get_by_text("Edge Function Simulator")).to_be_visible()
    expect(page.get_by_text("Source Code")).to_be_visible()
    expect(page.get_by_text("Execution Result")).to_be_visible()
    page.screenshot(path="verification/edge_debug_standardized.png", full_page=True)

    # 2. Verify Team Switcher
    print("Verifying Team Switcher...")
    page.goto("http://localhost:3000/dashboard")
    # Wait for dashboard to load
    page.wait_for_selector("text=Workspace Overview")
    expect(page.get_by_text("Workspace Overview")).to_be_visible()

    # Open team switcher
    # The button text is "Workspace" followed by the active team name (Personal in mock)
    page.get_by_role("button", name="Workspace Personal").click()

    expect(page.get_by_text("Personal Workspace")).to_be_visible()
    expect(page.get_by_text("Create Team")).to_be_visible()
    page.screenshot(path="verification/team_switcher_standardized.png")

    # 3. Verify Account Settings
    print("Verifying Account Settings...")
    page.goto("http://localhost:3000/dashboard/settings")
    page.wait_for_selector("text=Account Settings")
    expect(page.get_by_text("Account Settings")).to_be_visible()
    expect(page.get_by_text("Email address")).to_be_visible()
    expect(page.get_by_text("Role")).to_be_visible()
    page.screenshot(path="verification/account_settings_standardized.png", full_page=True)

if __name__ == "__main__":
    if not os.path.exists("verification"):
        os.makedirs("verification")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_ui(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_screenshot.png")
            # Log page content on error
            # print(page.content())
        finally:
            browser.close()
