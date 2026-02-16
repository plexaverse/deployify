import time
import re
from playwright.sync_api import sync_playwright

def verify_empty_states():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Mock API routes - Specific routes first!

        # Deployments (Empty)
        page.route(re.compile(r".*/api/projects/proj_123/deployments"), lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"deployments": []}'
        ))

        # Env Vars (Empty)
        page.route(re.compile(r".*/api/projects/proj_123/env"), lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"envVariables": []}'
        ))

        # Domains (Empty)
        page.route(re.compile(r".*/api/projects/proj_123/domains"), lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"domains": []}'
        ))

        # Project details
        page.route(re.compile(r".*/api/projects/proj_123$"), lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"project": {"id": "proj_123", "name": "Test Project", "repoFullName": "user/repo", "productionUrl": "https://test.com", "defaultBranch": "main", "region": "us-central1"}}'
        ))

        # Projects list
        page.route(re.compile(r".*/api/projects(\?.*)?$"), lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"projects": [{"id": "proj_123", "name": "Test Project", "repoFullName": "user/repo", "productionUrl": "https://test.com", "defaultBranch": "main", "updatedAt": "2023-01-01T00:00:00Z"}]}'
        ))

        # Go to Dashboard
        print("Navigating to Dashboard...")
        page.goto("http://localhost:3000/dashboard")

        # Click on the project card
        print("Clicking project card...")
        # Wait for the card to be visible
        try:
            page.wait_for_selector("text=Test Project", timeout=5000)
            page.click("text=Test Project")
        except:
            print("Project card not found. Dashboard might not have loaded projects.")
            page.screenshot(path="verification/dashboard_fail.png")
            return

        # Verify Deployments Empty State
        print("Navigating to Deployments page...")
        page.goto("http://localhost:3000/dashboard/proj_123/deployments")
        time.sleep(2) # Wait for animation/load
        page.screenshot(path="verification/empty_deployments_retry.png")
        print("Captured empty_deployments_retry.png")

        # Navigate to Settings (for Env Vars and Domains)
        print("Navigating to Settings page...")
        page.goto("http://localhost:3000/dashboard/proj_123/settings")
        time.sleep(2)
        page.screenshot(path="verification/empty_settings_retry.png")
        print("Captured empty_settings_retry.png")

        browser.close()

if __name__ == "__main__":
    verify_empty_states()
