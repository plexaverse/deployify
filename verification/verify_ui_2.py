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

        # 2. Import Project (Full Page)
        print("Navigating to Import Project...")
        try:
            page.goto("http://localhost:3000/dashboard/new/import?repo=test/repo")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="verification/import_project_full.png", full_page=True)
            print("Screenshot saved: verification/import_project_full.png")
        except Exception as e:
            print(f"Error accessing import project: {e}")

        browser.close()

if __name__ == "__main__":
    verify_ui()
