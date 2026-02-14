from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()

    # Navigate to dashboard (should use mock session)
    try:
        page.goto("http://localhost:3000/dashboard")

        # Wait for dashboard to load
        expect(page.get_by_text("Personal Workspace")).to_be_visible(timeout=10000)

        # Click team switcher
        page.click("button:has-text('Personal Workspace')")

        # Click Create Team
        page.click("text=Create Team")

        # Verify modal opens
        expect(page.get_by_text("Create New Team")).to_be_visible()
        expect(page.get_by_label("Team Name")).to_be_visible()
        expect(page.get_by_label("Team Slug")).to_be_visible()

        # Take screenshot of the modal
        page.screenshot(path="verification/create_team_modal.png")
        print("Screenshot saved to verification/create_team_modal.png")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
