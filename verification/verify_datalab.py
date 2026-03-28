from playwright.sync_api import sync_playwright, expect
import time
import os

def verify_datalab_updates():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()

        project_id = "proj-1"
        try:
            page.goto(f"http://localhost:3000/dashboard/{project_id}/settings")

            # Wait for the Data Lab component to load
            expect(page.get_by_text("Managed Query Browser")).to_be_visible(timeout=30000)

            # Type a dummy query to enable the Run button
            page.fill("textarea", "SELECT * FROM users")

            # 1. Test SQL Query and Table View
            run_btn = page.get_by_role("button", name="Run Query")
            expect(run_btn).to_be_enabled()
            run_btn.click()
            expect(page.get_by_text("Query Executed Successfully")).to_be_visible()

            # 2. Test Copy Results (CSV/JSON) - check titles since names overlap
            expect(page.get_by_title("Copy Results as CSV")).to_be_visible()
            expect(page.get_by_title("Copy Results as JSON")).to_be_visible()

            # 3. Test View Switcher to Chart
            page.get_by_role("button", name="Chart").click()
            expect(page.get_by_text("Configure axes to visualize data")).to_be_visible()

            # Select axes
            page.select_option("select:has-text('SELECT X-AXIS')", label="NAME")
            page.select_option("select:has-text('SELECT Y-AXIS')", label="ID")

            # Check Pie Chart option
            pie_btn = page.get_by_role("button", name="PIE")
            expect(pie_btn).to_be_visible()
            pie_btn.click()

            # 4. Test Schema Discovery
            page.get_by_role("button", name="Discover Schema").click()
            expect(page.get_by_text("Schema Insight")).to_be_visible()

            # Check for estimated row counts (MOCK mode)
            expect(page.get_by_text("(1,250 ROWS)")).to_be_visible()

            page.screenshot(path="verification/datalab_final.png")
            print("Screenshot saved to verification/datalab_final.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_datalab_updates()
