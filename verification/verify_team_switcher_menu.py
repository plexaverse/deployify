from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()

    try:
        page.goto("http://localhost:3000/dashboard")
        expect(page.get_by_text("Personal Workspace")).to_be_visible(timeout=10000)

        # Click team switcher
        page.click("button:has-text('Personal Workspace')")

        # Verify menu is open
        expect(page.get_by_text("Create Team")).to_be_visible()

        # Screenshot menu
        page.screenshot(path="verification/team_switcher_menu.png")
        print("Screenshot saved to verification/team_switcher_menu.png")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
