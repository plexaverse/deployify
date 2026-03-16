from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="verification/video")
        page = context.new_page()

        # Mock Project ID from memory
        project_id = "mock-id-1"

        print("Navigating to Settings...")
        page.goto(f"http://localhost:3000/dashboard/{project_id}/settings")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/settings_back.png")

        print("Navigating to Compare...")
        page.goto(f"http://localhost:3000/dashboard/{project_id}/deployments/compare")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/compare_back.png")

        print("Navigating to New Project...")
        page.goto("http://localhost:3000/dashboard/new")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/new_project_back.png")

        print("Navigating to Import Project...")
        page.goto("http://localhost:3000/dashboard/new/import")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/import_project_back.png")

        context.close()
        browser.close()

if __name__ == "__main__":
    run()
