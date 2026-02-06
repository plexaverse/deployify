from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Set dummy cookie to bypass middleware
        context.add_cookies([{
            "name": "deployify_session",
            "value": "dummy",
            "domain": "localhost",
            "path": "/"
        }])

        page = context.new_page()

        # 1. Team Settings
        print("Navigating to Team Settings...")
        try:
            page.goto("http://localhost:3000/settings/team")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="verification/team_settings.png")
            print("Screenshot saved: verification/team_settings.png")
        except Exception as e:
            print(f"Error accessing team settings: {e}")

        # 2. Import Project
        print("Navigating to Import Project...")
        try:
            page.goto("http://localhost:3000/dashboard/new/import?repo=test/repo")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="verification/import_project.png")
            print("Screenshot saved: verification/import_project.png")
        except Exception as e:
            print(f"Error accessing import project: {e}")

        browser.close()

if __name__ == "__main__":
    verify_ui()
