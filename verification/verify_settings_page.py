from playwright.sync_api import Page, expect, sync_playwright

def test_settings_page(page: Page):
    # 1. Go to dashboard (should authenticate via mock session)
    print("Navigating to dashboard...")
    page.goto("http://localhost:3000/dashboard")

    # 2. Check for "Settings" link in sidebar
    # Wait for hydration
    page.wait_for_timeout(2000)

    print("Clicking Settings link...")
    # Click on "Settings"
    # Wait for sidebar to be visible if needed

    settings_link = page.get_by_role("link", name="Settings")
    settings_link.click()

    # 3. Verify URL is /dashboard/settings
    print("Verifying URL...")
    expect(page).to_have_url("http://localhost:3000/dashboard/settings")

    # 4. Verify "Personal Workspace" card content
    print("Verifying content...")
    # Specifically look for the heading
    expect(page.get_by_role("heading", name="Personal Workspace")).to_be_visible()
    expect(page.get_by_text("You are currently viewing your personal workspace")).to_be_visible()

    # 5. Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_settings_page(page)
            print("Test passed!")
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
            raise
        finally:
            browser.close()
