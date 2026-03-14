import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        BASE_URL = "http://localhost:3000"
        os.makedirs("verification", exist_ok=True)

        routes = [
            ("login", "/login"),
            ("dashboard_home", "/dashboard"),
            ("overview", "/dashboard/mock-id-1"),
            ("deployments", "/dashboard/mock-id-1/deployments"),
            ("analytics", "/dashboard/mock-id-1/analytics"),
            ("settings", "/dashboard/mock-id-1/settings"),
        ]

        for name, route in routes:
            print(f"Capturing {name} ({route})...")
            await page.goto(f"{BASE_URL}{route}")
            # Wait for any of the standard header elements
            try:
                await page.wait_for_selector("h1.text-3xl", timeout=5000)
            except:
                print(f"Timeout waiting for h1 on {route}")

            await asyncio.sleep(1) # Allow for any client-side rendering/framer-motion
            await page.screenshot(path=f"verification/final_{name}.png")

        print("Visual verification complete.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
