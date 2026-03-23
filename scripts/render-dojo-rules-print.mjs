import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "generated", "dojo-rules-print");
const htmlPath = path.join(outputDir, "index.html");
const pdfPath = path.join(outputDir, "pump-dojo-rules-print.pdf");
const previewPath = path.join(outputDir, "pump-dojo-rules-preview.png");

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1980 },
    deviceScaleFactor: 2,
  });

  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, {
    waitUntil: "load",
  });

  await page.emulateMedia({ media: "print" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const firstPage = page.locator(".page").first();
  await firstPage.screenshot({
    path: previewPath,
  });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });

  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Preview: ${previewPath}`);
} finally {
  await browser.close();
}
