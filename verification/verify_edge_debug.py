from playwright.sync_api import sync_playwright, expect

def verify_edge_debug(page):
    BASE_URL = "http://localhost:3000"

    print("Navigating to Edge Function Simulator...")
    page.goto(f"{BASE_URL}/edge-debug")

    # Verify the header
    expect(page.get_by_role("heading", name="Edge Function Simulator")).to_be_visible()

    print("Running simulation...")
    # Click "Run Simulation" button
    page.get_by_role("button", name="Run Simulation").click()

    # Wait for the result to appear
    page.wait_for_selector("text=Simulation Result")

    # Wait for the status badge (200 OK)
    expect(page.get_by_text("200")).to_be_visible()

    # Take screenshot of the result
    page.screenshot(path="verification/edge_debug_result.png")
    print("Screenshot saved to verification/edge_debug_result.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        try:
            verify_edge_debug(page)
        finally:
            browser.close()
