import time
import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda msg: print(f"PageError: {msg}"))

    # Mock API responses
    def handle_projects(route):
        route.fulfill(json={"projects": []})

    # 1. Test Dashboard Empty State (No Projects) -> OnboardingGuide
    page.route("**/api/projects", handle_projects)
    page.goto("http://localhost:3000/dashboard")

    expect(page.get_by_text("Welcome to Deployify")).to_be_visible()
    print("Verified: Dashboard Empty State (OnboardingGuide)")

    # 2. Test Search Empty State
    def handle_projects_with_data(route):
        route.fulfill(json={"projects": [
            {
                "id": "proj_1",
                "name": "my-app",
                "repoFullName": "user/my-app",
                "productionUrl": None,  # No production URL
                "defaultBranch": "main",
                "updatedAt": "2023-01-01T00:00:00Z",
                "latestDeployment": None # No deployment
            }
        ]})

    page.unroute("**/api/projects")
    page.route("**/api/projects", handle_projects_with_data)
    page.reload()

    # Search for something that doesn't exist
    page.get_by_placeholder("Search projects...").fill("nonexistent")
    expect(page.get_by_text('No projects match "nonexistent"')).to_be_visible()
    print("Verified: Dashboard Search Empty State")

    # 3. Test Project Detail Empty States (No Production, No Deployments)
    def handle_project_detail(route):
        route.fulfill(json={
            "project": {
                "id": "proj_1",
                "name": "my-app",
                "repoFullName": "user/my-app",
                "productionUrl": None,
                "defaultBranch": "main",
                "repoUrl": "https://github.com/user/my-app",
                "updatedAt": "2023-01-01T00:00:00Z",
            },
            "deployments": [],
            "errorCount": 0
        })

    page.route("**/api/projects/proj_1", handle_project_detail)
    page.route("**/api/projects/proj_1/domains", lambda r: r.fulfill(json={"domains": []}))

    # Click on project card (wait, search is active, need to clear it)
    page.get_by_placeholder("Search projects...").fill("")
    page.get_by_role("heading", name="my-app").click()

    expect(page).to_have_url(re.compile(r".*/dashboard/proj_1"))

    # Check No Production Deployment Empty State
    expect(page.get_by_text("No production deployment")).to_be_visible()
    expect(page.get_by_text("Push to main to deploy.")).to_be_visible()

    # Check No Deployments History Empty State
    expect(page.get_by_text("No deployments yet")).to_be_visible()
    expect(page.get_by_text("Trigger a deployment to see history here.")).to_be_visible()

    # Take screenshot of project detail page
    page.screenshot(path="verification/project_detail_empty.png")

    print("Verified: Project Detail Empty States")

    # 4. Test Settings Page (Domains Empty State)
    # Mock settings page project details (same as above)
    page.goto("http://localhost:3000/dashboard/proj_1/settings")

    # Check No Custom Domains Empty State
    expect(page.get_by_text("No custom domains")).to_be_visible()
    expect(page.get_by_text("Add a domain to use your own URL.")).to_be_visible()

    page.screenshot(path="verification/project_settings_empty.png")
    print("Verified: Project Settings Empty States (Domains)")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
