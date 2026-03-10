import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Bypass proxy/auth if necessary, but MOCK_DB=true usually allows direct access
        BASE_URL = "http://localhost:3000"

        print("Navigating to Overview...")
        await page.goto(f"{BASE_URL}/dashboard/mock-id-1")
        await page.wait_for_selector("text=Mock Project")
        await page.screenshot(path="verification/overview_v2.png")

        print("Navigating to Settings...")
        # Try clicking the link in the Tabs nav
        settings_link = page.get_by_label("Tabs").get_by_role("link", name="Settings")
        await settings_link.click()

        await page.wait_for_url("**/settings")
        await asyncio.sleep(1) # Wait for animations/data
        await page.screenshot(path="verification/settings_v2.png")

        print("Done.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
