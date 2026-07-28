# Final design-system contract

- Themes: White, Gray, Black, and Beige.
- Preferences: accent, font, density, reduced motion, and high contrast.
- Controls: keyboard focus must remain visible; icon-only controls require accessible names and tooltips.
- Motion: decorative motion respects reduced-motion; activity animation may represent only real backend state.
- Responsive widths verified by the production browser gate: 390, 768, 1366, and 1920 pixels.
- Private pages are not listed in the sitemap and remain protected by middleware.

The existing component and CSS system is retained. This is a behavior and consistency contract, not a replacement UI kit.
