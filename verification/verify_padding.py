from playwright.sync_api import sync_playwright

def verify_feature():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="verification/video")

        # Test 1: Login
        page1 = context.new_page()
        page1.goto("http://localhost:3000/login")
        page1.wait_for_timeout(1000)
        page1.screenshot(path="verification/login_padding.png")
        page1.close()

        # Test 2: Error
        page2 = context.new_page()
        page2.goto("http://localhost:3000/error")
        page2.wait_for_timeout(1000)
        page2.screenshot(path="verification/error_padding.png")
        page2.close()

        # Test 3: Not Found
        page3 = context.new_page()
        page3.goto("http://localhost:3000/404")
        page3.wait_for_timeout(1000)
        page3.screenshot(path="verification/notfound_padding.png")
        page3.close()

        # Test 4: Join
        page4 = context.new_page()
        page4.goto("http://localhost:3000/join")
        page4.wait_for_timeout(1000)
        page4.screenshot(path="verification/join_padding.png")
        page4.close()

        context.close()
        browser.close()

if __name__ == "__main__":
    verify_feature()
