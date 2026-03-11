import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()
        BASE_URL = "http://localhost:3000"
        print("Navigating to Dashboard...")
        await page.goto(f"{BASE_URL}/dashboard")
        await page.wait_for_selector("text=Workspace Overview")
        await page.screenshot(path="verification/dashboard_v2.png")
        print("Done.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
