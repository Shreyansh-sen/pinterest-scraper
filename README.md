# Pinterest Scraper

A Node.js Pinterest image scraper using Playwright that downloads images from Pinterest URLs with advanced rate limiting to avoid bans.

## Features

- ✅ Scrape images from Pinterest URLs
- ✅ Auto-scroll to load more images
- ✅ Download images locally
- ✅ **Advanced rate limiting** - Random delays, user agent rotation
- ✅ **Ban prevention** - Stealth headers, realistic behavior
- ✅ Duplicate prevention
- ✅ Error handling and retries
- ✅ Resume capability

## Installation

```bash
npm install
```

## How to Run

### Option 1: Single URL
```bash
node src/index.js "https://www.pinterest.com/search/pins/?q=nature"
```

### Option 2: Multiple URLs
```bash
node src/index.js "https://www.pinterest.com/search/pins/?q=nature" "https://www.pinterest.com/search/pins/?q=cats" "https://www.pinterest.com/search/pins/?q=landscape"
```

### Option 3: Using npm script
```bash
npm start "https://www.pinterest.com/search/pins/?q=nature"
```

## Rate Limiting & Ban Prevention

This scraper includes multiple features to avoid getting banned:

1. **Random Delays** - Between 2-4 seconds between scrolls, 0.5-1.5 seconds between downloads
2. **User Agent Rotation** - Randomly selects different browser user agents
3. **Stealth Headers** - Mimics real browser behavior
4. **Realistic Viewport** - Uses standard desktop viewport size (1366x768)
5. **Connection Timeouts** - Respects server response times
6. **Smart Image Stopping** - Stops scrolling if no new images found
7. **Early Exit** - Exits after 100 images to reduce server load

### Customizing Rate Limits

Edit `src/index.js` and modify in `main()` function:

```javascript
// Increase delays to be even safer
const imageUrls = await scrapeImages(url, 10, { min: 4000, max: 6000 });

// Increase download delays
await downloadAllImages(imageUrls, { min: 2000, max: 4000 });
```

## Downloaded Files

All images are saved in the `downloads/` directory:
```
downloads/
  ├── image_1_1712595201234.jpg
  ├── image_2_1712595201234.jpg
  └── ...
```

## Configuration Options

### In `src/index.js`:
- `maxScrolls` - Number of scrolls to perform (default: 10)
- `scrollDelay` - Delay between scrolls in ms (default: 2000-4000ms)
- `downloadDelay` - Delay between downloads in ms (default: 500-1500ms)

## Important Notes

⚠️ **Legal Disclaimer**:
- Respect Pinterest's Terms of Service
- Only scrape content you have permission to download
- Do not use for commercial purposes without permission
- Check local copyright laws

## Best Practices

✅ Do:
- Space out your requests over time
- Limit concurrent sessions
- Respect robots.txt
- Use appropriate delays between requests

❌ Don't:
- Run multiple instances simultaneously
- Make rapid consecutive requests
- Download copyrighted content without permission
- Abuse the service

## Troubleshooting

**Issue**: Getting blocked/redirected
- Solution: Increase delays in the configuration

**Issue**: Few images downloaded
- Solution: Manually increase `maxScrolls` parameter

**Issue**: Connection timeout
- Solution: Check your internet connection and retry

## Example Usage

```bash
# Download nature images
node src/index.js "https://www.pinterest.com/search/pins/?q=nature"

# Download from multiple categories
node src/index.js \
  "https://www.pinterest.com/search/pins/?q=travel" \
  "https://www.pinterest.com/search/pins/?q=food" \
  "https://www.pinterest.com/search/pins/?q=design"
```

## Performance

- Typical rate: 1-2 images per second
- Auto-stops at 100 images per search
- Memory efficient streaming downloads
- Progress displayed in real-time
