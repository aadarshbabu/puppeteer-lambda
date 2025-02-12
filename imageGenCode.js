// import chromium from "@sparticuz/chromium";
// import puppeteer from "puppeteer-core";

// export const lambdaHandler = async (event, context) => {
//   // Ensure Chromium is using the correct path
//   const executablePath = await chromium.executablePath();

//   const browser = await puppeteer.launch({
//     args: chromium.args,
//     defaultViewport: chromium.defaultViewport,
//     executablePath: executablePath || "/opt/bin/chromium",
//     headless: chromium.headless,
//   });

//   const page = await browser.newPage();
//   await page.goto("https://google.com");
//   const screenshot = await page.screenshot({ encoding: "base64" });

//   await browser.close();

//   return {
//     statusCode: 200,
//     body: JSON.stringify({ message: "Screenshot taken", screenshot }),
//   };
// };
