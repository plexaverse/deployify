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
            print("Navigating to Dashboard...")
            page.goto("http://localhost:3000/dashboard")
            page.wait_for_timeout(5000)
            page.screenshot(path="verification/dashboard_final_v132.png")

            # Print page text to debug
            content = page.content()
            if "ADD NEW" in content:
                print("Found ADD NEW in page content")
            else:
                print("ADD NEW NOT FOUND in page content")
                # Print some visible text to see where we are
                print(f"Page title: {page.title()}")

            print("Navigating to New Project page...")
            page.goto("http://localhost:3000/dashboard/new")
            page.wait_for_timeout(5000)
            page.screenshot(path="verification/new_project_final_v132.png")

            print("Done.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify()
