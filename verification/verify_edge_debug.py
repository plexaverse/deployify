from playwright.sync_api import sync_playwright, expect

def test_edge_debug_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Edge Debug Page
        page.goto("http://localhost:3000/edge-debug")

        # Expect title or header
        expect(page.get_by_role("heading", name="Edge Function Simulator")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/edge_debug.png")

        browser.close()

if __name__ == "__main__":
    test_edge_debug_page()
