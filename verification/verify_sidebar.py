from playwright.sync_api import Page, expect, sync_playwright

def test_dashboard_sidebar(page: Page):
    # Set the session cookie
    token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJ1c2VyIjp7ImlkIjoidGVzdC11c2VyLWlkIiwiZ2l0aHViSWQiOjEyMzQ1LCJnaXRodWJVc2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiYXZhdGFyVXJsIjoiaHR0cHM6Ly9hdmF0YXJzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzEyMzQ1P3Y9NCIsIm5hbWUiOiJUZXN0IFVzZXIifSwiYWNjZXNzVG9rZW4iOiJhY2Nlc3MtdG9rZW4iLCJleHBpcmVzQXQiOjE3NzA5NzM2NDEsImlhdCI6MTc3MDM2ODg0MSwiZXhwIjoxNzcwOTczNjQxfQ.dUul3v7EDD8CiwrJY_fvSJ6ey5McvSNMsNHWXXvCPaw"

    context = page.context
    context.add_cookies([{
        "name": "deployify_session",
        "value": token,
        "domain": "localhost",
        "path": "/",
        "httpOnly": True,
        "secure": False,
        "sameSite": "Lax"
    }])

    # Go to dashboard
    page.goto("http://localhost:3000/dashboard")

    # Expect title or content
    expect(page).to_have_url("http://localhost:3000/dashboard")

    # Check Sidebar Elements
    sidebar = page.locator("aside")

    # Navigation groups
    # Case insensitive by default for some selectors, but 'exact=True' failed before because of duplicates.
    # Platform group
    expect(sidebar.get_by_text("Platform")).to_be_visible()

    expect(sidebar.get_by_role("link", name="Overview")).to_be_visible()
    expect(sidebar.get_by_role("link", name="Deployments")).to_be_visible()
    expect(sidebar.get_by_role("link", name="Analytics")).to_be_visible()

    # Settings group
    # Use heading for the group title
    expect(sidebar.get_by_role("heading", name="Settings")).to_be_visible()
    expect(sidebar.get_by_role("link", name="Settings")).to_be_visible()
    expect(sidebar.get_by_role("link", name="Billing")).to_be_visible()

    # Check Header Breadcrumbs
    expect(page.get_by_label("Breadcrumb")).to_be_visible()
    expect(page.get_by_label("Breadcrumb").get_by_text("Dashboard")).to_be_visible()

    # Take screenshot
    page.screenshot(path="/home/jules/verification/sidebar_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_dashboard_sidebar(page)
        finally:
            browser.close()
