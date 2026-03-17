from playwright.sync_api import Page, expect, sync_playwright
import os

def record_cuj(page: Page):
    # Navigate to Dashboard
    print("Navigating to Dashboard...")
    page.goto("http://localhost:3000/dashboard")
    page.wait_for_timeout(1000)

    # Check for personal projects title
    expect(page.get_by_text("Personal Projects")).to_be_visible()

    # Click on a mock project
    print("Clicking on project...")
    page.get_by_text("MOCK PROJECT").first.click()
    page.wait_for_timeout(1000)

    # Verify Project Overview
    expect(page.get_by_text("Project Overview")).to_be_visible()
    print("Project overview visible.")

    # Navigate to Settings
    print("Navigating to Settings...")
    page.get_by_role("link", name="SETTINGS").first.click()
    page.wait_for_timeout(1000)
    expect(page.get_by_text("Project Configuration")).to_be_visible()

    # Capture final state
    page.screenshot(path="verification/cuj_final.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            record_video_dir="verification/video"
        )
        page = context.new_page()
        try:
            record_cuj(page)
        finally:
            context.close()
            browser.close()
