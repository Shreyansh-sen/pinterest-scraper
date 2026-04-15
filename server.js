import fs from "fs";
import path from "path";
import express from "express";
import { chromium } from "playwright";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const sharedOutputsDir = path.join(workspaceRoot, "shared_outputs");
const generatedVideosDir = path.join(sharedOutputsDir, "generated_videos");
const generatedImagesDir = path.join(sharedOutputsDir, "generated_images");
const wallpaperPipelineUrl = process.env.WALLPAPER_PIPELINE_URL || "http://127.0.0.1:2000";
const nodeEnv = process.env.NODE_ENV || "development";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));
app.use("/generated-videos", express.static(generatedVideosDir));
app.use("/generated-images", express.static(generatedImagesDir));

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

if (!fs.existsSync(generatedVideosDir)) {
  fs.mkdirSync(generatedVideosDir, { recursive: true });
}

if (!fs.existsSync(generatedImagesDir)) {
  fs.mkdirSync(generatedImagesDir, { recursive: true });
}

// Download image from URL
async function downloadImage(url, filename, retries = 3) {
  return new Promise((resolve) => {
    const filepath = path.join(downloadsDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      resolve(true);
      return;
    }

    // Upgrade URL to best quality
    let finalUrl = url;
    if (url.includes('pinimg')) {
      finalUrl = url.replace(/\/(\d+)x(\d+)\//g, '/orig/')
                   .replace(/\?.*$/, '');
    }

    const protocol = finalUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    const request = protocol.get(finalUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        if (retries > 0) {
          downloadImage(response.headers.location, filename, retries - 1).then(resolve);
        } else {
          resolve(false);
        }
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    });

    request.on("error", (err) => {
      if (fs.existsSync(filepath)) fs.unlink(filepath, () => {});
      resolve(false);
    });

    request.on("timeout", () => {
      request.destroy();
      if (fs.existsSync(filepath)) fs.unlink(filepath, () => {});
      resolve(false);
    });
  });
}

// Random delay
function getRandomDelay(min = 1000, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
];

// Download video from URL
async function downloadVideo(url, filename, retries = 3) {
  return new Promise((resolve) => {
    const filepath = path.join(downloadsDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      resolve(true);
      return;
    }

    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    const request = protocol.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        if (retries > 0) {
          downloadVideo(response.headers.location, filename, retries - 1).then(resolve);
        } else {
          resolve(false);
        }
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    });

    request.on("error", (err) => {
      if (fs.existsSync(filepath)) fs.unlink(filepath, () => {});
      resolve(false);
    });

    request.on("timeout", () => {
      request.destroy();
      if (fs.existsSync(filepath)) fs.unlink(filepath, () => {});
      resolve(false);
    });
  });
}

// Scrape images and videos
async function scrapeMedia(url, maxScrolls = 10) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

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
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});

    const initialWait = getRandomDelay(3000, 5000);
    await page.waitForTimeout(initialWait);

    const imageUrls = new Set();
    const videoUrls = new Set();
    let scrollCount = 0;
    let previousMediaCount = 0;

    while (scrollCount < maxScrolls) {
      const media = await page.evaluate(() => {
        const imgs = [];
        const vids = [];

        // Extract images
        document.querySelectorAll("img").forEach((img) => {
          let src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset');

          if (src && typeof src === 'string' && src.includes('pinimg')) {
            src = src.split(' ')[0];
            src = src.replace(/\/\d+x\d+\//g, '/736x/');
            if (src.includes('/236x/') || src.includes('/474x/')) {
              src = src.replace(/\/\d+x\d+\//g, '/1200x/');
            }
            if (src.length > 50 && !src.includes('null')) {
              imgs.push(src);
            }
          }
        });

        document.querySelectorAll("picture").forEach((picture) => {
          const sources = picture.querySelectorAll("source");
          sources.forEach((source) => {
            let srcset = source.getAttribute('srcset');
            if (srcset) {
              const urls = srcset.split(',').map(s => s.trim());
              const bestUrl = urls[urls.length - 1].split(' ')[0];
              if (bestUrl && bestUrl.length > 50) {
                imgs.push(bestUrl);
              }
            }
          });

          const img = picture.querySelector('img');
          if (img && img.src && img.src.length > 50) {
            imgs.push(img.src);
          }
        });

        // Extract videos from video tags
        document.querySelectorAll("video").forEach((video) => {
          const sources = video.querySelectorAll("source");
          sources.forEach((source) => {
            const src = source.getAttribute('src');
            if (src && src.length > 50) {
              vids.push(src);
            }
          });

          if (video.src && video.src.length > 50) {
            vids.push(video.src);
          }
        });

        // Extract videos from data attributes
        document.querySelectorAll("[data-video], [data-mp4], [data-video-url]").forEach((el) => {
          const videoUrl = el.getAttribute('data-video') || el.getAttribute('data-mp4') || el.getAttribute('data-video-url');
          if (videoUrl && videoUrl.length > 50) {
            vids.push(videoUrl);
          }
        });

        const uniqueImgs = [...new Set(imgs)];
        const uniqueVids = [...new Set(vids)];

        return {
          images: uniqueImgs.filter(url => {
            if (!url) return false;
            if (url.includes('/75x75/')) return false;
            if (url.includes('/100x/')) return false;
            if (url === 'null' || url === 'undefined') return false;
            return url.length > 50;
          }),
          videos: uniqueVids.filter(url => {
            if (!url) return false;
            if (url === 'null' || url === 'undefined') return false;
            return url.length > 50;
          })
        };
      });

      media.images.forEach((img) => imageUrls.add(img));
      media.videos.forEach((vid) => videoUrls.add(vid));

      const currentMediaCount = imageUrls.size + videoUrls.size;
      const newMedia = currentMediaCount - previousMediaCount;

      if (newMedia === 0 && scrollCount > 2) {
        break;
      }

      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      const delay = getRandomDelay(2000, 4000);
      await page.waitForTimeout(delay);

      scrollCount++;
      previousMediaCount = currentMediaCount;

      if (currentMediaCount > 100) {
        break;
      }
    }

    await context.close();
    await browser.close();

    const filteredImages = Array.from(imageUrls).filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

    const filteredVideos = Array.from(videoUrls).filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

    return { images: filteredImages, videos: filteredVideos };
  } catch (error) {
    await context.close();
    await browser.close();
    return { images: [], videos: [] };
  }
}

// API Routes
app.post("/api/scrape", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    console.log(`Scraping: ${url}`);
    const media = await scrapeMedia(url);

    if (media.images.length === 0 && media.videos.length === 0) {
      return res.status(404).json({ error: "No images or videos found" });
    }

    res.json({ images: media.images, videos: media.videos });
  } catch (error) {
    console.error("Scrape error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/download", async (req, res) => {
  try {
    const { url, index, type } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const isVideo = type === 'video';
    const extension = isVideo ? 'mp4' : 'jpg';
    const filename = `${type}_${index}_${Date.now()}.${extension}`;
    const downloadFunc = isVideo ? downloadVideo : downloadImage;
    const success = await downloadFunc(url, filename);

    if (success) {
      res.json({ success: true, filename, path: `/downloads/${filename}`, type });
    } else {
      res.status(500).json({ error: `Failed to download ${type}` });
    }
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/generate-videos", async (req, res) => {
  try {
    const imageUrls = req.body?.imageUrls || req.body?.image_urls || [];

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: "imageUrls must be a non-empty array" });
    }

    const response = await fetch(`${wallpaperPipelineUrl}/api/batch-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_urls: imageUrls }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || "Failed to generate videos" });
    }

    res.json(data);
  } catch (error) {
    console.error("Generate videos error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Clear application state endpoint
app.post("/api/clear-state", (req, res) => {
  try {
    // This endpoint clears any server-side state
    // The browser-side state will be cleared by JavaScript
    console.log("Clearing application state");
    res.json({ success: true, message: "State cleared" });
  } catch (error) {
    console.error("Clear state error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📱 Open your browser and navigate to http://localhost:${PORT}`);
});
