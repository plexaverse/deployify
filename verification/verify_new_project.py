from playwright.sync_api import sync_playwright
import os

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mock session cookie
        context = browser.new_context()
        context.add_cookies([{
            'name': 'deployify_session',
            'value': 'mock-session',
            'domain': 'localhost',
            'path': '/'
        }])
        page = context.new_page()

        try:
            print("Navigating to New Project page...")
            page.goto("http://localhost:3000/dashboard/new")
            page.wait_for_selector("text=Import Repository")
            page.wait_for_timeout(2000)
            page.screenshot(path="verification/new_project_verify.png")
            print("Done.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify()
