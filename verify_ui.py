from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    base_url = "http://localhost:3002"

    try:
        print(f"Navigating to {base_url}/dashboard")
        page.goto(f"{base_url}/dashboard", timeout=60000)
        page.wait_for_timeout(5000) # Wait for hydration and data fetching

        page.screenshot(path="dashboard.png")
        print("Dashboard screenshot taken")

        # Click on the first project card if exists
        project_link = page.locator("a[href^='/dashboard/']").first
        if project_link.count() > 0:
            print("Clicking project link")
            project_link.click()
            page.wait_for_load_state("networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            page.screenshot(path="project_dashboard.png")
            print("Project dashboard screenshot taken")

            project_url = page.url
            print(f"Project URL: {project_url}")

            # Deployments Page
            deployments_url = f"{project_url}/deployments"
            print(f"Navigating to {deployments_url}")
            page.goto(deployments_url, timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            page.screenshot(path="deployments_page.png")
            print("Deployments page screenshot taken")

            # Settings Page
            settings_url = f"{project_url}/settings"
            print(f"Navigating to {settings_url}")
            page.goto(settings_url, timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            page.screenshot(path="settings_page.png")
            print("Settings page screenshot taken")

        else:
            print("No projects found on dashboard. Mock DB might not be seeding projects?")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
