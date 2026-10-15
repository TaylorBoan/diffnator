# 🔥 DiffNator - The Ultimate Visual Comparison Tool

A powerful, local-first web application for pixel-perfect comparison of websites, supporting live iframes, proxied content, and screenshots. Perfect for:
- 🎨 Visual regression testing
- 📱 Responsive design QA
- 🔄 Before/after comparisons
- 🌐 Cross-browser testing
- 💻 Local development vs production

## ✨ Features

> Local comparison: Live (iframe) supports side-by-side and overlay comparisons with synchronized scrolling, including matching nested scroll panels. Loopback pages are served through an origin-scoped local relay so each side retains its own assets and separate local/session storage. Remote direct iframes remain subject to browser origin restrictions; use Live (proxy) when appropriate.

### 🎭 Three Rendering Modes
- **Live (iframe)**: Direct iframe embedding for `localhost` and `file://` URLs
- **Live (proxy)**: Server-side proxy to bypass X-Frame-Options restrictions
- **Screenshot**: Puppeteer-based screenshots for sites that block all iframe methods

### 🔍 Comparison Modes
- **Overlay**: Stack two pages with opacity/swipe/blend controls
  - **Onion Skin**: Adjust opacity to see through layers
  - **Swipe**: Drag a handle to reveal differences
  - **Difference Blend**: Mix-blend-mode for visual diff
- **Side-by-Side**: Compare pages next to each other with bidirectional synchronized scrolling. Both sides use equal viewport widths, capped to the available half-window width.

### 🎯 Key Capabilities
- ✅ Compare `https://` URLs, `http://localhost`, and `file://` paths
- ✅ Adjustable viewport width (320px - 3840px) with range slider
- ✅ Synchronized scrolling in both overlay and side-by-side modes
- ✅ Collapsible control drawer for maximum comparison area
- ✅ Deep-linking support (share comparisons via URL)
- ✅ Natural page scrolling (no height constraints)
- ✅ Responsive design with touch support

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher

### Installation & Setup

```bash
# 1. Clone the repository
git clone https://github.com/Softinator-TechLabs/diffnator.git
cd diffnator

# 2. Install dependencies (includes Puppeteer + Chromium)
npm install

# 3. Start the server (includes web server + proxy)
npm start

# The app will be available at http://localhost:8086
```

**First-time setup**: The `npm install` will download Chromium (~170-250MB) for Puppeteer. This is normal and required for screenshot functionality.

### Available Commands

**Using npm:**
```bash
npm start          # Start the server (web server + proxy + screenshot service)
npm stop           # Stop all running server processes
npm restart        # Stop and restart the server
npm run dev        # Same as start (development mode)
npm run dev:visible # Start with visible browser (for debugging security checks)
npm run health     # Check if server is running
```

**Using the CLI helper (easier):**
```bash
./diffnator.sh start      # Start everything
./diffnator.sh stop       # Stop all services
./diffnator.sh restart    # Restart all services
./diffnator.sh status     # Check health
./diffnator.sh dev:visible # Debug mode with visible browser
```

## 📖 Usage

### Basic Comparison
1. Enter two URLs in the input fields
2. Select a **Render mode**:
   - `Live (iframe)` for direct embedding
   - `Live (proxy)` for sites that block iframes
   - `Screenshot` for full compatibility
3. Choose **Overlay** or **Side-by-side** comparison
4. Adjust viewport width using the slider
5. Click **Refresh** to reload

### URL Support

| URL Type | Live (iframe) | Live (proxy) | Screenshot |
|----------|--------------|--------------|------------|
| `http://localhost:3000` | ✅ Direct | ✅ Proxied | ✅ Captured |
| `https://example.com` | ⚠️ If allowed | ✅ Proxied | ✅ Captured |
| `file:///path/to/file.html` | ✅ Served | ✅ Served | ⚠️ Limited |

**Notes:**
- `file://` URLs are automatically served via HTTP to bypass browser security
- Screenshot mode uses a default 2000ms wait for content to load (adjustable via Wait field)
- Live modes support animations, hover effects, and interactive elements

### Overlay Modes
- **Onion (opacity)**: Slide the opacity control to blend pages
- **Swipe**: Drag the vertical handle to reveal differences
- **Difference Blend**: See visual differences highlighted

### Keyboard Shortcuts
### Overlay Scrolling & Interactivity
- Default: Smooth synced scrolling in Live (proxy) overlay. You can scroll while your mouse is over the viewport.
- Interact selector: choose who is interactive in overlay — `None`, `URL A (default)`, or `URL B`.
- With `None`, overlay captures scroll and forwards to both pages (best for performance).
- With `URL A` or `URL B`, clicks and inputs go to the selected page; the other still syncs scroll.
- Note: In Live (iframe), interactivity/scroll sync may vary by site. Use Side‑by‑side for full interactivity across both pages simultaneously.
- Click **☰** button to toggle control drawer
- Drag swipe handle in overlay mode

## 🔧 Advanced Configuration

### Environment Variables
```bash
# Run with visible Chrome (for CAPTCHA/security checks)
HEADLESS=false npm start

# Use custom port
PORT=9000 npm start
```

### Deep Linking
Share comparisons by copying the URL:
```
http://localhost:8086/?u1=https://example.com&u2=http://localhost:3000&w=1440&ra=proxy&rb=proxy&mode=sbs
```

Parameters:
- `u1` / `u2`: URLs to compare
- `w`: Viewport width (px)
- `dpr`: Device pixel ratio (1, 1.5, 2, 3)
- `wait`: Wait time before screenshot (ms)
- `ra` / `rb`: Render mode per URL (`iframe`, `proxy`, `screenshot`)
- `mode`: Comparison mode (`overlay`, `sbs`)
- `om`: Overlay mode (`onion`, `swipe`, `blend`)
- `opacity`: Opacity percentage (0-100)
- `swipe`: Swipe position percentage (0-100)

## 🎨 Use Cases

### Visual Regression Testing
Compare production vs staging environments:
```
u1=https://staging.example.com
u2=https://example.com
render=proxy
mode=overlay
om=blend
```

### Responsive Design QA
Test different viewport widths:
```
u1=http://localhost:3000
u2=http://localhost:3000
w=375 (then adjust to 1440)
mode=sbs
```

### Local File Comparison
Compare a saved HTML file with live site:
```
u1=file:///Users/you/Downloads/saved-page.html
u2=https://example.com
render=iframe
mode=overlay
```

## 🛠️ Technical Details

### Architecture
- **Frontend**: Vanilla JavaScript, CSS Grid/Flexbox
- **Backend**: Express.js + Puppeteer
- **Proxy System**: Server-side fetch with HTML rewriting

### Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Performance
- Optimized scroll sync with `requestAnimationFrame`
- Debounced event handlers (50ms)
- Efficient DOM updates

## 📝 Troubleshooting

### "Proxy fetch failed: Forbidden"
**Cause**: Some sites block server-side access (e.g., Revolut, banking sites).  
**Solution**: Switch to **Screenshot mode** which uses a headless browser.

### Screenshots appear blank or incomplete
**Cause**: Page needs more time to load dynamic content.  
**Solution**: Increase the **Wait (ms)** value (try 3000-5000ms for heavy sites).

### CAPTCHA or security checks blocking access
**Cause**: Site detects headless browser.  
**Solution**: Run with visible Chrome to manually solve:
```bash
HEADLESS=false npm start
```

### Port already in use
**Cause**: Another service is using the port (default: 8086).  
**Solution**: Use a different port:
```bash
PORT=9000 npm start
```

### High memory usage
**Cause**: Puppeteer keeps browser instances open.  
**Solution**: Restart the server periodically using `npm restart`, or reduce concurrent screenshot requests.

### Saved HTML files missing images
**Cause**: Images reference external CDNs with CORS restrictions.  
**Solution**: The app automatically proxies external assets in Live modes. If issues persist, try Screenshot mode.

### Windows: TimeoutError / ECONNREFUSED errors
**Symptoms**: 
- `TimeoutError: Navigation timeout of 45000 ms exceeded`
- `ECONNREFUSED` errors when trying to proxy localhost
- Puppeteer warnings about deprecated versions

**Solutions**:
1. **Update dependencies** (run in your project directory):
```bash
npm install puppeteer@latest cross-env --save
```

2. **Fix npm scripts for Windows** (already updated in latest version):
   - The `stop` and `restart` commands now work cross-platform
   - Use `npm start` instead of `npm run dev` on Windows

3. **Firewall/Network issues**:
   - Allow Node.js through Windows Firewall
   - **If comparing localhost URLs**: Ensure the local server is actually running on that port
     - DiffNator supports ANY localhost port (e.g., `http://localhost:8000`, `http://localhost:5173`, etc.)
     - Test your local server independently first: open it in a normal browser
     - Common ports: 3000 (React), 5173 (Vite), 8000 (Django), 4200 (Angular)
   - Check antivirus isn't blocking Chromium/Puppeteer
   - Try increasing timeouts in Settings (Wait: 3000-5000ms)

4. **Test with external URLs first**:
```
URL A: https://example.com
URL B: https://google.com
```
If this works, the issue is with your local server setup, not DiffNator.

**Examples of localhost URLs that work:**
- `http://localhost:3000` (React default)
- `http://localhost:5173` (Vite default)
- `http://localhost:8000` (Python/Django)
- `http://localhost:4200` (Angular)
- `http://127.0.0.1:ANY_PORT`

The `ECONNREFUSED` error means there's no server listening on that port - start your local dev server first!

5. **Windows-specific Node.js setup**:
```bash
# Run as Administrator if you see permission errors
npm install -g windows-build-tools
```

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🌟 Credits

Built with:
- [Express](https://expressjs.com/)
- [Puppeteer](https://pptr.dev/)
- Inspired by [diffsite](https://pianomister.github.io/diffsite/)

---

Made with ❤️ for designers and developers who care about pixel perfection.

**Quick Commands:**
- `npm start` - Start everything (web server + proxy + screenshots)
- `npm restart` - Restart all services
- `npm stop` - Stop all services

### Local iframe synchronization

Choose Live (iframe) for both localhost URLs, then Side-by-side. Scrolling either page mirrors the same scroll container on the other page, including application panels. Containers match by element ID or DOM structure; unrelated page layouts may not align. Scroll positions clamp at each container’s own end without moving the source backward.

Local iframe mode uses `/local/<origin>/...` paths and a runtime URL adapter for root-relative images, styles and fetch requests. The relay supports read-only GET/HEAD previews and does not forward browser cookies. Authenticated sessions, submissions, development WebSockets, and applications that require their original browser origin are outside this mode’s scope; open those pages directly. Remote direct iframes cannot synchronize unless they cooperate with the parent. Screenshot/live mixed modes render independently and do not synchronize their different scroll models.

Run `npm test` for local-relay validation and Chromium regression coverage of asset isolation, equal widths, nested/page scrolling, boundary behavior, refresh and swipe controls.

If the bundled Chromium is unavailable, set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome/Chromium executable when running `npm test`.
