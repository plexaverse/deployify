import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        BASE_URL = "http://localhost:3000"

        print("Navigating to Dashboard Home...")
        await page.goto(f"{BASE_URL}/dashboard")
        await page.wait_for_selector("text=Workspace Overview")
        await page.screenshot(path="verification/dashboard_home.png")

        print("Navigating to Project Overview...")
        await page.goto(f"{BASE_URL}/dashboard/mock-id-1")
        await page.wait_for_selector("text=Mock Project")
        await page.screenshot(path="verification/project_overview.png")

        print("Navigating to Deployments...")
        await page.click("text=Deployments")
        await page.wait_for_url("**/deployments")
        await page.screenshot(path="verification/deployments.png")

        print("Navigating to Analytics...")
        await page.goto(f"{BASE_URL}/dashboard/mock-id-1/analytics")
        await page.wait_for_selector("text=Project Insights")
        await page.screenshot(path="verification/analytics.png")

        print("Navigating to Settings...")
        await page.goto(f"{BASE_URL}/dashboard/mock-id-1/settings")
        await page.wait_for_selector("text=Project Configuration")
        await page.screenshot(path="verification/project_settings.png")

        print("Navigating to Billing...")
        await page.goto(f"{BASE_URL}/billing")
        await page.wait_for_selector("text=Billing & Usage")
        await page.screenshot(path="verification/billing.png")

        print("Done.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
