import os
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()

    # Do NOT set invalid cookie. Let the app fall back to MOCK_SESSION in dev mode.
    # context.add_cookies([{
    #     "name": "deployify_session",
    #     "value": "mock-session-token",
    #     "domain": "localhost",
    #     "path": "/"
    # }])

    page = context.new_page()

    # 1. Test Dashboard Empty State (Search)
    # Mock projects to have some data first
    page.route("**/api/projects*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"projects": [{"id": "p1", "name": "Project 1", "repoFullName": "user/repo1", "defaultBranch": "main", "updatedAt": "2023-01-01T00:00:00Z"}]}'
    ))

    print("Navigating to dashboard...")
    page.goto("http://localhost:3000/dashboard")

    # Debug: print URL and title
    print(f"Current URL: {page.url}")
    print(f"Page Title: {page.title()}")

    # Wait for the H1. If it fails, take a screenshot.
    try:
        page.wait_for_selector("h1:has-text('Projects')", timeout=10000)
    except Exception as e:
        print("Failed to find Projects header. Taking screenshot...")
        page.screenshot(path="verification/failed_dashboard.png")
        raise e

    print("Testing search empty state...")
    page.fill("input[placeholder='Search projects...']", "Nonexistent Project")
    page.wait_for_selector("h3:has-text('No projects found')")
    page.screenshot(path="verification/dashboard_empty_search.png")
    print("✅ Dashboard empty search verified.")

    # 2. Test Project Detail Empty State (No Deployments)
    # Mock project detail
    page.route("**/api/projects/p1", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"project": {"id": "p1", "name": "Project 1", "repoFullName": "user/repo1", "defaultBranch": "main", "productionUrl": null}}'
    ))
    # Mock empty deployments
    page.route("**/api/projects/p1/deployments", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"deployments": []}'
    ))
    # Mock logs stats
    page.route("**/api/projects/p1/logs/stats", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"errorCount": 0}'
    ))

    print("Navigating to project detail (no deployments)...")
    page.goto("http://localhost:3000/dashboard/p1")
    page.wait_for_selector("h3:has-text('Ready to deploy')")
    page.screenshot(path="verification/project_empty_deployments.png")
    print("✅ Project empty deployments verified.")

    # 3. Test Compare Page
    # Mock deployments (2 deployments)
    deployments_json = '''
    {
        "deployments": [
            {
                "id": "d2", "projectId": "p1", "status": "ready", "type": "production",
                "gitBranch": "main", "gitCommitSha": "abcdef2", "gitCommitMessage": "Update 2",
                "createdAt": "2023-01-02T00:00:00Z", "buildDurationMs": 120000,
                "performanceMetrics": {"performanceScore": 0.95, "lcp": 1000, "cls": 0.01, "fid": 10, "tbt": 50}
            },
            {
                "id": "d1", "projectId": "p1", "status": "ready", "type": "production",
                "gitBranch": "main", "gitCommitSha": "abcdef1", "gitCommitMessage": "Initial commit",
                "createdAt": "2023-01-01T00:00:00Z", "buildDurationMs": 100000,
                "performanceMetrics": {"performanceScore": 0.90, "lcp": 1200, "cls": 0.05, "fid": 20, "tbt": 100}
            }
        ]
    }
    '''
    page.route("**/api/projects/p1/deployments", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=deployments_json
    ))

    print("Navigating to deployments page...")
    page.goto("http://localhost:3000/dashboard/p1/deployments")
    # Need to wait for deployments to load and button to appear
    page.wait_for_selector("a:has-text('Compare Deployments')")
    page.screenshot(path="verification/deployments_list.png")
    print("✅ Compare button found.")

    print("Navigating to compare page...")
    page.click("a:has-text('Compare Deployments')")
    page.wait_for_selector("h1:has-text('Compare Deployments')")
    page.wait_for_selector("h3:has-text('Comparison Results')")
    page.screenshot(path="verification/compare_page.png")
    print("✅ Compare page verified.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
