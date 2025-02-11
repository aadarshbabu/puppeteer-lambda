/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

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

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

// AWS S3 Configuration
const BUCKET_NAME = "filesbucketforgetmybill"; // Replace with your bucket name
const REGION = "ap-south-1"; // Change to your AWS region
const UPLOAD_TO_S3 = true; // Set false to save locally

const s3 = new S3Client({ region: REGION });

const VALID_API_KEY = process.env.API_KEY || "your-secure-api-key";

function isValidUrl(url) {
  try {
    if (!url || typeof url !== "string") {
      throw new Error("Invalid or missing URL.");
    }

    new URL(url); // Validate the URL format

    return url;
  } catch (error) {
    console.error("Error navigating to URL:", error.message);
    throw error; // Re-throw to handle it in the calling function
  }
}

export const lambdaHandler = async (event, context) => {
  let browser;

  // Handle security.
  //   const apiKey = event.headers["x-api-key"];

  //   if (!apiKey || apiKey !== VALID_API_KEY) {
  //     return {
  //       statusCode: 403,
  //       body: JSON.stringify({ message: "Forbidden: Invalid API Key" }),
  //     };
  //   }

  const url = isValidUrl(event?.url);

  const executablePath = await chromium.executablePath();

  try {
    // Launch Puppeteer in AWS Lambda
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath || "/opt/bin/chromium",
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    // Generate PDF
    const pdfBuffer = await page.pdf({ format: "A4" });

    let pdfURL;

    if (UPLOAD_TO_S3) {
      // Upload PDF to S3 using AWS SDK v3
      const pdfKey = `generated-pdfs/report-${Date.now()}.pdf`;

      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: pdfKey,
        Body: pdfBuffer,
        ContentType: "application/pdf",
      };

      await s3.send(new PutObjectCommand(uploadParams));

      pdfURL = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${pdfKey}`;
    } else {
      // Save PDF locally in /tmp/ (Only writable directory in AWS Lambda)
      const localFilePath = `/tmp/report-${Date.now()}.pdf`;
      fs.writeFileSync(localFilePath, pdfBuffer);
      pdfURL = `File saved locally at ${localFilePath}`;
    }

    await browser.close();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "PDF generated successfully", pdfURL }),
    };
  } catch (error) {
    console.error("Error generating PDF:", error);
    if (browser) await browser.close();

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to generate PDF",
        error: error.message,
      }),
    };
  }
};
