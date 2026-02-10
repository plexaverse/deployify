from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a new context without setting any cookies initially
        # The app should fallback to MOCK_SESSION in development
        context = browser.new_context()
        page = context.new_page()

        # 1. Billing Page
        print("Navigating to Billing Page...")
        try:
            page.goto("http://localhost:3000/billing")
            # Wait for content to load
            page.wait_for_selector("h1", timeout=10000)
            # Wait for specific elements like UsageGauge or PricingCard
            # page.wait_for_selector(".card", timeout=5000)
            page.screenshot(path="verification/billing_page.png")
            print("Screenshot saved: verification/billing_page.png")
        except Exception as e:
            print(f"Error accessing billing page: {e}")
            page.screenshot(path="verification/billing_error.png")

        # 2. Project Settings Page
        # Assuming project ID 'project-123' works with mock data or fails gracefully
        # If fetchProjectDetails fails, we might see a loading spinner or error.
        print("Navigating to Project Settings...")
        try:
            page.goto("http://localhost:3000/dashboard/project-123/settings")
            page.wait_for_selector("h1", timeout=10000)
            page.screenshot(path="verification/project_settings.png")
            print("Screenshot saved: verification/project_settings.png")
        except Exception as e:
            print(f"Error accessing project settings: {e}")
            page.screenshot(path="verification/settings_error.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
