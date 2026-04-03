import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_monitoring_alerts():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Add auth cookie to bypass login in mock mode
        context = browser.new_context()
        context.add_cookies([{
            'name': 'deployify_session',
            'value': 'mock-token',
            'domain': 'localhost',
            'path': '/'
        }])

        page = context.new_page()

        # Navigate to storage page for mock project
        # In mock mode, any project ID works, but audit-id is standard for tests
        page.goto("http://localhost:3000/dashboard/audit-id/storage")

        # Wait for storage configs to load
        page.wait_for_selector("text=Primary Postgres")

        # 1. Take initial screenshot
        page.screenshot(path="scripts/verification/storage_initial.png")
        print("Captured initial storage view")

        # 2. Open Alerts Modal for Primary Postgres
        # We look for the BellOff icon button
        # In mock data, alertSettings is likely undefined initially
        alerts_btn = page.locator("button[title='Manage Alerts']").first
        alerts_btn.click()

        # Wait for modal
        expect(page.get_by_text("Resource Monitoring Alerts")).to_be_visible()

        # 3. Enable alerts and adjust thresholds
        page.get_by_label("Enable Automated Alerts").check()

        # Capture modal state
        page.screenshot(path="scripts/verification/alerts_modal.png")
        print("Captured alerts modal")

        # 4. Save alert settings
        page.get_by_role("button", name="Save Alert Settings").click()

        # Wait for modal to close
        expect(page.get_by_text("Resource Monitoring Alerts")).not_to_be_visible()

        # 5. Trigger a sync to show "active alerts" (simulated via mock)
        # We need to click the sync button (Activity icon for provisioning or Check Connection)
        # Actually, if it's already active, it's the "Check Connection" button
        sync_btn = page.locator("button[title='Check Connection']").first
        sync_btn.click()

        # Wait for sync to complete (icon might spin/pulse)
        time.sleep(2)

        # In mock mode, sync returns data.activeAlerts if we set it up.
        # Let's check if the ALERT badge appeared.
        # Note: Since the real sync API in mock mode doesn't know about our UI state,
        # and we haven't modified the mock sync response to dynamicially trigger alerts,
        # it might not show an alert unless we force it in the mock.

        # Capture final state
        page.screenshot(path="scripts/verification/storage_final.png")
        print("Captured final storage view")

        browser.close()

if __name__ == "__main__":
    verify_monitoring_alerts()
