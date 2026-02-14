import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Mock project details
    project_json = """
    {
        "project": {
            "id": "p1",
            "name": "Test Project",
            "repoFullName": "test/repo",
            "framework": "nextjs",
            "buildCommand": "npm run build",
            "installCommand": "npm install",
            "rootDirectory": "./",
            "outputDirectory": ".next",
            "productionUrl": "https://test.deployify.com",
            "createdAt": "2023-01-01T00:00:00Z",
            "updatedAt": "2023-01-01T00:00:00Z"
        }
    }
    """

    # Mock API routes
    page.route("**/api/projects/p1", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=project_json
    ))

    page.route("**/api/projects/p1/deployments", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"deployments": []}'
    ))

    page.route("**/api/projects/p1/domains", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"domains": []}'
    ))

    page.route("**/api/projects/p1/env", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"envVariables": []}'
    ))

    page.route("**/api/projects/p1/logs/stats", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"errorCount": 0}'
    ))

    # Mock analytics
    page.route("**/api/projects/p1/analytics/stats*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"stats": {"aggregate": {"visitors": {"value": 0}}}}'
    ))

    print("Navigating to project settings...")
    page.goto("http://localhost:3000/dashboard/p1/settings")

    # Wait for the settings page to load
    page.wait_for_selector("h1:has-text('Project Settings')", timeout=10000)

    # Scroll to Build Settings
    print("Scrolling to Build Settings...")
    page.locator("h2:has-text('Build Settings')").scroll_into_view_if_needed()
    time.sleep(1) # Wait for scroll

    print("Checking for Framework selector...")
    # Check if "Framework" label is visible
    expect_framework = page.get_by_text("Framework", exact=True)
    if expect_framework.is_visible():
        print("✅ 'Framework' label is visible.")
    else:
        print("❌ 'Framework' label is NOT visible.")

    # Select Docker option
    select = page.locator("select#framework")
    select.select_option(value="docker")
    print("Selected Docker.")

    # Take screenshot of the Build Settings area
    page.screenshot(path="verification/framework_settings_scrolled.png")
    print("Screenshot saved to verification/framework_settings_scrolled.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
