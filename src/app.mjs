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

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "fs";
import Handlebars from "handlebars";
import * as cheerio from "cheerio";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// AWS S3 Configuration
const BUCKET_NAME = "filesbucketforgetmybill"; // Replace with your bucket name
const REGION = "ap-south-1"; // Change to your AWS region
const UPLOAD_TO_S3 = true; // Set false to save locally

const s3 = new S3Client({ region: REGION });

// const VALID_API_KEY = process.env.API_KEY || "your-secure-api-key";

// function isValidUrl(url) {
//   try {
//     if (!url || typeof url !== "string") {
//       throw new Error("Invalid or missing URL.");
//     }

//     new URL(url); // Validate the URL format

//     return url;
//   } catch (error) {
//     console.error("Error navigating to URL:", error.message);
//     throw error; // Re-throw to handle it in the calling function
//   }
// }
// filesbucketforgetmybill

async function getPresignedUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  // Set expiration (e.g., 5 minutes)
  return await getSignedUrl(s3, command, { expiresIn: 300 });
}

// async function rewriteHtmlAssets(html, templateId) {
//   // Load the HTML into Cheerio for parsing
//   const $ = cheerio.load(html);

//   // Update <link> tags (typically CSS)
//   $("link[href]").each(async (i, el) => {
//     const origHref = $(el).attr("href");
//     if (origHref && !origHref.startsWith("http")) {
//       // Build the S3 key. Adjust logic as needed.
//       const assetKey = `templates/${templateId}/${origHref}`;
//       const presignedUrl = await getPresignedUrl(assetKey);
//       $(el).attr("href", presignedUrl);
//     }
//   });

//   // Update <script> tags
//   $("script[src]").each(async (i, el) => {
//     const origSrc = $(el).attr("src");
//     if (origSrc && !origSrc.startsWith("http")) {
//       const assetKey = `templates/${templateId}/${origSrc}`;
//       const presignedUrl = await getPresignedUrl(assetKey);
//       $(el).attr("src", presignedUrl);
//     }
//   });

//   // Update <img> tags
//   $("img[src]").each(async (i, el) => {
//     const origSrc = $(el).attr("src");
//     if (origSrc && !origSrc.startsWith("http")) {
//       const assetKey = `templates/${templateId}/${origSrc}`;
//       const presignedUrl = await getPresignedUrl(assetKey);
//       $(el).attr("src", presignedUrl);
//     }
//   });

//   // Cheerio’s manipulation using async calls can be tricky; one approach is to map all promises and wait for them.
//   // For simplicity, assume you handle async replacements appropriately.
//   return $.html();
// }

export async function rewriteHtmlAssets(html, templateId) {
  const $ = cheerio.load(html);

  // Define the selectors and their attributes to rewrite.
  const assetSelectors = [
    { tag: "link", attr: "href" },
    { tag: "script", attr: "src" },
    { tag: "img", attr: "src" },
  ];

  // Array to hold all asynchronous replacement promises.
  let promises = [];

  assetSelectors.forEach(({ tag, attr }) => {
    // Select each element of the given tag that has the attribute.
    $(`${tag}[${attr}]`).each((i, el) => {
      const origUrl = $(el).attr(attr);
      // Check if the URL is relative (doesn't start with http or https).
      if (origUrl && !origUrl.startsWith("http")) {
        // Construct the S3 key. Adjust the logic if your file structure is different.
        const assetKey = `templates/${templateId}/${origUrl}`;

        // Push the promise to get a pre-signed URL and update the attribute.
        const promise = getPresignedUrl(assetKey)
          .then((presignedUrl) => {
            $(el).attr(attr, presignedUrl);
          })
          .catch((err) => {
            console.error(`Failed to get pre-signed URL for ${assetKey}`, err);
          });
        promises.push(promise);
      }
    });
  });

  // Wait until all asset URL replacements are complete.
  await Promise.all(promises);

  return $.html();
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

  // Take a data

  try {
    const templateId = event.body?.templateId ?? "template_1234";

    const templateKey = `templates/${templateId}/index.html`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: templateKey,
    });

    const res = await s3.send(command);
    const template = await res.Body.transformToString();

    const compile = Handlebars.compile(template);

    const htmlWithData = compile(event.body.data ?? {});
    const finalHtml = await rewriteHtmlAssets(htmlWithData, templateId);
    // const url = isValidUrl(event.body?.url);

    const executablePath = await chromium.executablePath();
    // Launch Puppeteer in AWS Lambda
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath || "/opt/bin/chromium",
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    // await page.goto(url, { waitUntil: "networkidle2" });
    // Now use finalHtml with Puppeteer:
    await page.setContent(finalHtml, { waitUntil: "networkidle2" });

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
      body: JSON.stringify({
        message: "PDF generated successfully",
        pdfURL,
      }),
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
