# CDN Strategy & Asset Pipeline

## Current state

### CDN
- **Netlify** provides automatic global CDN for all static assets (`dist/`)
  - Edge caching via `Cache-Control` headers set in `netlify.toml`
  - `/assets/*` → `public, max-age=31536000, immutable` (hashed filenames)
  - `/index.html` → `public, max-age=0, must-revalidate` (always fresh)
  - No additional CDN configuration needed for launch

### Cloudflare directory
The `cloudflare/` directory is a **separate Cloudflare Workers project** (not unused CDN config).
It contains:
- A Workers app with its own `package.json`, `wrangler.jsonc`, `vite.config.ts`
- Likely used for MCP server hosting or API proxying
- Not related to the main Loci frontend CDN strategy

No action needed — this is an independent service.

### Images
- **Zero static images in the app.** All UI is CSS + SVG icons.
- Favicon is an inline SVG data URI (no external file).
- The SvgIcon component renders inline SVGs for all 14 icon types.

If images are added later:
1. Run them through Squoosh (https://squoosh.app) or sharp for WebP/AVIF conversion
2. Use `<img loading="lazy">` for below-the-fold images
3. Add width/height attributes to prevent layout shift (CLS)
4. Consider a Netlify Image CDN transform for on-the-fly resizing

### Fonts
- Google Fonts served from `fonts.googleapis.com` / `fonts.gstatic.com`
- `preconnect` hints in `<head>` reduce font load latency
- Fonts are cached by the browser after first load
- No self-hosted font files (no `.woff2` files in the project)

### Future improvements
- [ ] Add `Cache-Control: public, max-age=86400` for `robots.txt` and `sitemap.xml`
- [ ] Consider self-hosting fonts to eliminate Google Fonts dependency (privacy + perf)
- [ ] If user-uploaded images are added (avatars, documents), route through Netlify Image CDN or imgproxy
