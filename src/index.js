import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, "..", "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Download image from URL
async function downloadImage(url, filename, retries = 3) {
  return new Promise((resolve) => {
    const filepath = path.join(downloadsDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      console.log(`✓ Already exists`);
      resolve(true);
      return;
    }

    // Upgrade URL to best quality
    let finalUrl = url;
    if (url.includes('pinimg')) {
      // Replace with original/max size versions
      finalUrl = url.replace(/\/(\d+)x(\d+)\//g, '/orig/')
                   .replace(/\?.*$/, ''); // Remove query params
    }

    const protocol = finalUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    const request = protocol.get(finalUrl, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        if (retries > 0) {
          downloadImage(response.headers.location, filename, retries - 1).then(
            resolve
          );
        } else {
          resolve(false);
        }
        return;
      }

      // Check for valid status code
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        console.log(`✗ HTTP ${response.statusCode}`);
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        console.log(`✓ Downloaded`);
        resolve(true);
      });
    });

    request.on("error", (err) => {
      fs.unlink(filepath, () => {});
      console.log(`✗ ${err.message}`);
      resolve(false);
    });

    request.on("timeout", () => {
      request.destroy();
      fs.unlink(filepath, () => {});
      console.log(`✗ Timeout`);
      resolve(false);
    });
  });
}

// Random delay to avoid pattern detection
function getRandomDelay(min = 1000, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// User agents for rotation
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
];

// Extract image URLs from Pinterest page
async function scrapeImages(url, maxScrolls = 10, scrollDelay = { min: 2000, max: 4000 }) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  // Set random user agent in browser context
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  const context = await browser.newContext({
    userAgent: userAgent,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/",
    },
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();

  try {
    console.log(`\n📍 Scraping: ${url}`);
    console.log("⏳ Loading page...");
    console.log("⏳ Navigating to page...");
    
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(err => {
      console.warn("⚠️  Network idle timeout, continuing anyway...");
    });

    // Wait for images to load
    const initialWait = getRandomDelay(3000, 5000);
    console.log(`⏸️  Waiting ${initialWait}ms for images to load...`);
    await page.waitForTimeout(initialWait);

    const imageUrls = new Set();
    let scrollCount = 0;
    let previousImageCount = 0;

    // Scroll to load more images
    while (scrollCount < maxScrolls) {
      // Get all image URLs from img tags (multiple selector strategies)
      const images = await page.evaluate(() => {
        const imgs = [];
        
        // Strategy 1: Direct pinimg sources with highest quality
        document.querySelectorAll("img").forEach((img) => {
          let src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset');
          
          if (src && typeof src === 'string' && src.includes('pinimg')) {
            // Clean up and upgrade to max quality
            src = src.split(' ')[0]; // Handle srcset
            src = src.replace(/\/\d+x\d+\//g, '/736x/'); // Use 736p minimum
            if (src.includes('/236x/') || src.includes('/474x/')) {
              src = src.replace(/\/\d+x\d+\//g, '/1200x/'); // Upgrade thumbnails
            }
            if (src.length > 50 && !src.includes('null')) {
              imgs.push(src);
            }
          }
        });

        // Strategy 2: Look for image containers and extract from nested sources
        document.querySelectorAll("picture").forEach((picture) => {
          const sources = picture.querySelectorAll("source");
          sources.forEach((source) => {
            let srcset = source.getAttribute('srcset');
            if (srcset) {
              // Get the highest resolution URL
              const urls = srcset.split(',').map(s => s.trim());
              const bestUrl = urls[urls.length - 1].split(' ')[0];
              if (bestUrl && bestUrl.length > 50) {
                imgs.push(bestUrl);
              }
            }
          });
          
          // Also check img inside picture
          const img = picture.querySelector('img');
          if (img && img.src && img.src.length > 50) {
            imgs.push(img.src);
          }
        });

        // Strategy 3: Check for API-injected data in window object
        if (window.__initialState || window.__INITIAL_STATE__) {
          try {
            const state = window.__initialState || window.__INITIAL_STATE__;
            if (state && typeof state === 'string') {
              const matches = state.match(/https:\/\/[^"]*pinimg[^"]+/g) || [];
              matches.forEach(url => {
                if (url.length > 50) imgs.push(url);
              });
            }
          } catch (e) {
            // Ignore
          }
        }

        // Remove duplicates and filter low quality
        const uniqueUrls = [...new Set(imgs)];
        return uniqueUrls.filter(url => {
          if (!url) return false;
          if (url.includes('/75x75/')) return false; // Skip tiny
          if (url.includes('/100x/')) return false; // Skip small thumbs
          if (url === 'null' || url === 'undefined') return false;
          return url.length > 50;
        });
      });

      images.forEach((img) => imageUrls.add(img));

      const currentCount = imageUrls.size;
      const newImages = currentCount - previousImageCount;

      console.log(`📊 Scroll ${scrollCount + 1}/${maxScrolls} - Found ${currentCount} images (${newImages} new)`);

      // If no new images found, break early
      if (newImages === 0 && scrollCount > 2) {
        console.log("ℹ️  No new images found, stopping scroll...");
        break;
      }

      // Scroll down to load more images
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      // Random delay between scrolls to avoid detection
      const delay = getRandomDelay(scrollDelay.min, scrollDelay.max);
      console.log(`⏸️  Waiting ${delay}ms before next scroll...`);
      await page.waitForTimeout(delay);

      scrollCount++;
      previousImageCount = currentCount;

      // Stop if we have enough images
      if (currentCount > 100) {
        console.log("✅ Reached image limit, stopping...");
        break;
      }
    }

    await context.close();
    await browser.close();
    return Array.from(imageUrls).filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.error("❌ Scraping error:", error.message);
    await context.close();
    await browser.close();
    return [];
  }
}

// Download all images
async function downloadAllImages(imageUrls, downloadDelay = { min: 500, max: 1500 }) {
  console.log(`\n📥 Starting download of ${imageUrls.length} images...`);
  console.log("⚠️  Rate limiting enabled to avoid bans\n");

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `image_${i + 1}_${Date.now()}.jpg`;

    process.stdout.write(`[${i + 1}/${imageUrls.length}] Downloading... `);
    const success = await downloadImage(url, filename);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Random delay between downloads to avoid rate limiting
    if (i < imageUrls.length - 1) {
      const delay = getRandomDelay(downloadDelay.min, downloadDelay.max);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.log(`\n✅ Download complete!`);
  console.log(`📊 Success: ${successCount} | Failed: ${failCount}`);
  console.log(`📁 Images saved to: ${downloadsDir}`);
}

// Main function
async function main() {
  // Example usage - modify these URLs
  const pinURLs = process.argv.slice(2);

  if (pinURLs.length === 0) {
    // Default example URLs
    const exampleURLs = [
      "https://www.pinterest.com/search/pins/?q=nature",
      // Add more URLs here
    ];
    console.log("ℹ️  No URLs provided. Usage: node src/index.js <url1> <url2> ...");
    console.log("\nExample: node src/index.js 'https://www.pinterest.com/search/pins/?q=nature'");
    return;
  }

  for (const url of pinURLs) {
    const imageUrls = await scrapeImages(url);

    if (imageUrls.length > 0) {
      await downloadAllImages(imageUrls);
    } else {
      console.log("❌ No images found");
    }
  }
}

main().catch(console.error);
