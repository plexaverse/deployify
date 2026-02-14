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
    try:
        page.goto("http://localhost:3000/dashboard/p1/settings", timeout=30000)
    except Exception as e:
        print(f"Navigation failed: {e}")
        # Try once more
        page.goto("http://localhost:3000/dashboard/p1/settings", timeout=30000)

    # Wait for the settings page to load
    try:
        page.wait_for_selector("h1:has-text('Project Settings')", timeout=10000)
    except Exception as e:
        print("Failed to load Project Settings page. Taking screenshot...")
        page.screenshot(path="verification/failed_settings_load.png")
        raise e

    print("Checking for Framework selector...")
    # Look for the label
    # The label text might be "Framework"
    try:
        label = page.get_by_text("Framework", exact=True)
        if label.count() > 0:
            print("✅ 'Framework' label found.")
        else:
            print("❌ 'Framework' label NOT found (exact match). Trying partial...")
            label = page.get_by_text("Framework")
            if label.count() > 0:
                 print("✅ 'Framework' label found (partial).")
    except:
        print("❌ Label check failed.")

    # Look for the select element with "Docker" option
    select = page.locator("select#framework")
    if select.count() > 0:
        print("✅ Select element found.")

        # Check options
        options = select.locator("option").all_inner_texts()
        print(f"Options found: {options}")

        if "Docker" in options:
            print("✅ 'Docker' option found.")
        else:
            print("❌ 'Docker' option NOT found.")

        # Select Docker
        select.select_option(value="docker")
        print("Selected Docker.")

    else:
        print("❌ Select element NOT found.")

    # Take screenshot
    page.screenshot(path="verification/framework_settings.png")
    print("Screenshot saved to verification/framework_settings.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
