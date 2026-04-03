from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:3000/login")
    page.wait_for_timeout(1000)
    page.screenshot(path="/app/scripts/screenshots/login.png")

    page.goto("http://localhost:3000/dashboard/settings")
    page.wait_for_timeout(2000)
    page.screenshot(path="/app/scripts/screenshots/settings.png")

    page.goto("http://localhost:3000/dashboard/audit-id/settings")
    page.wait_for_timeout(2000)
    page.screenshot(path="/app/scripts/screenshots/project_settings.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/app/scripts/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
