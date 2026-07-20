# Honest ship status

## Truth rules (enforced in code)
- **Built** ≠ **Shipped**. UI says “ship incomplete” until free-path artifacts / live URL pass.
- Web shipped = GitHub push + Vercel live URL check.
- Chrome shipped = GitHub push + `extension.zip` on Releases (download URL required).
- Electron shipped = GitHub push + release **triggered** (Actions zip may still be building — next step says wait).
- Expo “shipped” free path = GitHub only; next step always says EAS/stores not done.
- Critical structure issues block push.
- Verify is never force-green.

## Still not automatic (honest)
- Waiting for Electron Actions to finish building the zip
- EAS / App Store / Play submit
- CWS publish fee, code signing
- 710+ OAuth catalog (wishlist; ~7 live connects)
