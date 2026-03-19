from playwright.sync_api import Page, expect, sync_playwright
import os

def record_cuj(page: Page):
    # Navigate to Dashboard
    print("Navigating to Dashboard...")
    page.goto("http://localhost:3000/dashboard")

    # Check for personal projects title
    expect(page.get_by_text("Personal Projects")).to_be_visible(timeout=10000)
    print("Dashboard loaded.")

    # Click on a mock project
    print("Clicking on project...")
    project_card = page.get_by_text("MOCK PROJECT").first
    expect(project_card).to_be_visible()
    project_card.click()

    # Verify Project Overview
    expect(page.get_by_text("Project Overview")).to_be_visible(timeout=10000)
    print("Project overview visible.")

    # Navigate to Settings
    print("Navigating to Settings...")
    settings_link = page.get_by_role("link", name="SETTINGS").first
    expect(settings_link).to_be_visible()
    settings_link.click()

    expect(page.get_by_text("Project Configuration")).to_be_visible(timeout=10000)
    print("Settings page loaded.")

    # Capture final state
    page.screenshot(path="verification/cuj_final.png", full_page=True)
    print("Screenshot captured at verification/cuj_final.png")

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
        except Exception as e:
            print(f"Error during CUJ recording: {e}")
            page.screenshot(path="verification/cuj_error.png")
        finally:
            context.close()
            browser.close()
