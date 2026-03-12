from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # 1. Verify Login Page
        try:
            page.goto("http://localhost:3000/login")
            page.wait_for_selector("text=Welcome back", timeout=10000)
            page.screenshot(path="verification/login_page.png")
            print("Captured login_page.png")
        except Exception as e:
            print(f"Login page error: {e}")

        # 2. Verify Join Page (mock token)
        try:
            page.goto("http://localhost:3000/join?token=mock-token")
            page.wait_for_timeout(2000)
            page.screenshot(path="verification/join_page_error.png")
            print("Captured join_page_error.png")
        except Exception as e:
            print(f"Join page error: {e}")

        # 3. Dashboard
        try:
            context.add_cookies([{"name": "session", "value": "mock-session", "domain": "localhost", "path": "/"}])
            page.goto("http://localhost:3000/dashboard")
            page.wait_for_timeout(3000)
            page.screenshot(path="verification/dashboard.png")
            print("Captured dashboard.png")
        except Exception as e:
            print(f"Dashboard error: {e}")

        # 4. New Project Page
        try:
            page.goto("http://localhost:3000/dashboard/new")
            page.wait_for_timeout(3000)
            page.screenshot(path="verification/new_project.png")
            print("Captured new_project.png")
        except Exception as e:
            print(f"New Project error: {e}")

        # 5. Import Project Page
        try:
            page.goto("http://localhost:3000/dashboard/new/import?repo=owner/repo")
            page.wait_for_timeout(3000)
            page.screenshot(path="verification/import_project.png")
            print("Captured import_project.png")
        except Exception as e:
            print(f"Import Project error: {e}")

        browser.close()

if __name__ == "__main__":
    run_verification()
