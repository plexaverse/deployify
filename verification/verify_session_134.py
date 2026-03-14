from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Add auth cookie to bypass login if needed, or rely on MOCK_DB bypass
        context = browser.new_context()
        page = context.new_page()

        # 1. Billing Page (Invoice font-semibold)
        print("Verifying Billing Page...")
        page.goto("http://localhost:3000/billing")
        page.wait_for_selector("table")
        page.screenshot(path="verification/billing_v134.png")

        # 2. Project Overview (Commit message font-semibold)
        print("Verifying Project Overview...")
        page.goto("http://localhost:3000/dashboard/mock-id-1")
        page.wait_for_selector("h3")
        page.screenshot(path="verification/overview_v134.png")

        # 3. Deployments Page (Commit message font-semibold)
        print("Verifying Deployments Page...")
        page.goto("http://localhost:3000/dashboard/mock-id-1/deployments")
        page.wait_for_selector(".group")
        page.screenshot(path="verification/deployments_v134.png")

        # 4. New Project Page (Indicator labels font-semibold)
        print("Verifying New Project Page...")
        page.goto("http://localhost:3000/new")
        page.wait_for_selector("input")
        page.screenshot(path="verification/new_project_v134.png")

        browser.close()

if __name__ == "__main__":
    run()
