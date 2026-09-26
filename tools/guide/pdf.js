// Print an HTML file to a Letter PDF with Chromium: node tools/guide/pdf.js in.html out.pdf
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
(async () => {
  const [src, dst] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.pdf({ path: dst, format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
  await browser.close();
})();
