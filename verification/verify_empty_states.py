import time
from playwright.sync_api import sync_playwright

def verify_empty_states():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Mock API routes

        # 1. Projects list (return one project to enter dashboard)
        page.route("**/api/projects*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"projects": [{"id": "proj_123", "name": "Test Project", "repoFullName": "user/repo", "productionUrl": "https://test.com", "defaultBranch": "main", "updatedAt": "2023-01-01T00:00:00Z"}]}'
        ))

        # 2. Project details
        page.route("**/api/projects/proj_123", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"project": {"id": "proj_123", "name": "Test Project", "repoFullName": "user/repo", "productionUrl": "https://test.com", "defaultBranch": "main", "region": "us-central1"}}'
        ))

        # 3. Deployments (Empty)
        page.route("**/api/projects/proj_123/deployments", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"deployments": []}'
        ))

        # 4. Env Vars (Empty)
        page.route("**/api/projects/proj_123/env", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"envVariables": []}'
        ))

        # 5. Domains (Empty)
        page.route("**/api/projects/proj_123/domains", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"domains": []}'
        ))

        # Go to Dashboard
        print("Navigating to Dashboard...")
        page.goto("http://localhost:3000/dashboard")

        # Click on the project card
        print("Clicking project card...")
        page.click("text=Test Project")

        # Verify Deployments Empty State (It's on the main project dashboard usually, or separate tab?)
        # Let's check where deployments are listed. usually /dashboard/[id] has a summary or link.
        # But I modified src/app/dashboard/[id]/deployments/page.tsx.
        # So I need to navigate to that page.

        print("Navigating to Deployments page...")
        page.goto("http://localhost:3000/dashboard/proj_123/deployments")
        time.sleep(2) # Wait for animation/load
        page.screenshot(path="verification/empty_deployments.png")
        print("Captured empty_deployments.png")

        # Navigate to Settings/Env Vars (Where is EnvVariablesSection used?)
        # It's usually in Settings page. src/app/dashboard/[id]/settings/page.tsx?
        # Let's check file structure or guess.
        # I'll check if there is a settings link.

        print("Navigating to Settings page...")
        page.goto("http://localhost:3000/dashboard/proj_123/settings")
        time.sleep(2)
        page.screenshot(path="verification/empty_env_vars.png")
        print("Captured empty_env_vars.png")

        # Domains section is also likely in Settings or a separate tab.
        # I'll check /dashboard/proj_123/domains if it exists, or just look at settings screenshot which might contain both.

        # Check if Domains is a separate page
        # src/app/dashboard/[id]/domains/page.tsx exists?
        # I saw src/components/DomainsSection.tsx.

        # Let's try navigating to domains page if it exists
        try:
            page.goto("http://localhost:3000/dashboard/proj_123/domains")
            time.sleep(2)
            page.screenshot(path="verification/empty_domains.png")
            print("Captured empty_domains.png")
        except:
            print("Domains page might not exist or failed.")

        browser.close()

if __name__ == "__main__":
    verify_empty_states()
