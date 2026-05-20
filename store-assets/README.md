# Chrome Web Store Assets

- `store-icon-128.png` - flattened 128 x 128 store icon.
- `screenshot-main-1280x800.png` - real app screenshot captured from the current build.
- `small-promo-tile-440x280.png` - Chrome Web Store small promo tile.
- `marquee-promo-tile-1400x560.png` - Chrome Web Store marquee promo tile.

All PNG files in this folder are saved without an alpha channel.

Regenerate promo images from `screenshot-main-1280x800.png` with:

```powershell
powershell -ExecutionPolicy Bypass -File tools/generate-store-assets.ps1
```
