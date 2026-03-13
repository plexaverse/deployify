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
        await asyncio.sleep(5)
        await page.screenshot(path="verification/dashboard_final_v132.png")

        content = await page.content()
        if "ADD NEW" in content:
            print("Found ADD NEW in page content")
        else:
            print("ADD NEW NOT FOUND in page content")
            print(f"Page title: {await page.title()}")

        print("Navigating to New Project page...")
        await page.goto(f"{BASE_URL}/dashboard/new")
        await asyncio.sleep(5)
        await page.screenshot(path="verification/new_project_final_v132.png")

        print("Done.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
