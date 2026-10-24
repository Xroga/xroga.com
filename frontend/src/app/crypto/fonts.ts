import localFont from 'next/font/local';

// Exact families, complete variable-weight ranges and both editorial styles.
// Licensed, hash-pinned assets: docs/xroga/security/CRYPTO_FONT_REGISTER.json.
// Production and CI use the same files; no remote fetch or font-test mock.
export const manrope = localFont({
  src: '../fonts/crypto/ManropeVariable.woff2',
  weight: '200 800',
  display: 'swap',
  variable: '--font-manrope',
});

export const editorial = localFont({
  src: [
    { path: '../fonts/crypto/CormorantGaramondVariable.woff2', weight: '300 700', style: 'normal' },
    { path: '../fonts/crypto/CormorantGaramondVariable-Italic.woff2', weight: '300 700', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-editorial',
  adjustFontFallback: 'Times New Roman',
});
