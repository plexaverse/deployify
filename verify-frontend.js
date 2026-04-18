const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to storage page (mocking project and storage IDs)
  // Since we are in mock mode, it should render something
  try {
    console.log('Navigating to storage page...');
    await page.goto('http://localhost:3000/dashboard/test-project/storage');
    await page.waitForTimeout(5000); // Wait for animations and mock data
    await page.screenshot({ path: 'storage-dashboard.png', fullPage: true });
    console.log('Screenshot saved to storage-dashboard.png');

    // If there is a Troubleshoot button, click it to verify the modal
    const troubleshootBtn = page.locator('button:has(svg.lucide-wrench)').first();
    if (await troubleshootBtn.isVisible()) {
        console.log('Clicking troubleshoot button...');
        await troubleshootBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'diagnostic-modal.png' });
        console.log('Screenshot saved to diagnostic-modal.png');
    }
  } catch (error) {
    console.error('Error during verification:', error);
  }

  await browser.close();
})();
