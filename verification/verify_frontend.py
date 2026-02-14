import requests
import time
import sys
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"

def create_project():
    print("Creating project...")
    res = requests.post(f"{BASE_URL}/api/projects", json={
        "name": "Frontend Test Project",
        "repoFullName": "test/repo-frontend",
        "framework": "nextjs"
    })
    if res.status_code != 201:
        print(f"Failed to create project: {res.text}")
        sys.exit(1)
    return res.json()['project']['id']

def run_playwright(project_id):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        url = f"{BASE_URL}/dashboard/{project_id}/settings"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for page load
        page.wait_for_load_state("networkidle")

        # Find "Add Variable" button (Open Form)
        print("Clicking Add Variable (Open)...")
        # Use .first because there are two buttons with same text eventually,
        # but initially only one. When form opens, there are two.
        # But initially only one. So .first is safe.
        page.get_by_role("button", name="Add Variable").first.click()

        # Fill form
        print("Filling form...")
        # Now get_by_label works because we added htmlFor/id
        page.get_by_label("Key").fill("UI_TEST_KEY")
        page.get_by_label("Value").fill("ui_test_value")
        page.get_by_label("Group (Optional)").fill("UI Group")

        # Submit
        print("Submitting...")
        # The submit button is the second one visible (inside the form)
        page.get_by_role("button", name="Add Variable").last.click()

        # Wait for "UI Group" text to appear
        print("Waiting for group to appear...")
        try:
            page.get_by_text("UI Group").wait_for(timeout=5000)
        except:
            print("Timeout waiting for group. Taking screenshot anyway.")

        # Take screenshot
        page.screenshot(path="verification/frontend_verification.png")
        print("Screenshot saved to verification/frontend_verification.png")

        browser.close()

def delete_project(project_id):
    print(f"Deleting project {project_id}...")
    requests.delete(f"{BASE_URL}/api/projects/{project_id}")

if __name__ == "__main__":
    pid = None
    try:
        pid = create_project()
        run_playwright(pid)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if pid:
            delete_project(pid)
