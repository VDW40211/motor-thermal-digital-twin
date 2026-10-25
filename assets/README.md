# Assets

This folder is a placeholder for future static assets:

- `favicon.ico` — browser tab icon
- `icon-192.png`, `icon-512.png` — PWA icons (if PWA support is added later)
- `og-image.png` — social media preview image
- `logo.svg` — application logo (if a brand identity is added)

Currently empty. GitHub does not track empty directories, so this file ensures the folder exists in the repository.

## Recommended Favicon

To add a favicon:
1. Create `favicon.ico` (32x32, .ico format) or `favicon.png` (32x32).
2. Place it in this folder.
3. Add to `<head>` in `index.html`:
   ```html
   <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
   ```
4. Commit and push — GitHub Pages will serve it.
