import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 1200})
        await page.goto("http://localhost:3000/dashboard/proj-123/storage")
        await page.get_by_role("button", name="Connect Database").click()
        await page.get_by_role("combobox").first.select_option("supabase")

        # Verify "SSL Required" text
        ssl_text = page.locator("text=SSL Required")
        await ssl_text.wait_for()
        print(f"SSL Label found: {await ssl_text.is_visible()}")

        # Take a larger screenshot
        await page.screenshot(path="ssl_toggle_full.png", full_page=True)
        print("Full page screenshot saved to ssl_toggle_full.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
