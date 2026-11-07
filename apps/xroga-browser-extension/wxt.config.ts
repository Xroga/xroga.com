// Xroga modification: the distributable preview exposes only the reviewed local-read workflow.
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { permissionLists } from './src/ui/manifest-permissions';

// The autorun build (fixtures/autorun.mjs) keeps the optional permissions required, unless it is asked to build with the
// product's lists (WXT_PRODUCT_PERMISSIONS), to check the features without them.
const autorun = !!process.env.WXT_AUTORUN_URL;
const productPermissions = !autorun || !!process.env.WXT_PRODUCT_PERMISSIONS;
const localPreviewFiles = [
  'panel.html',
  'panel.css',
  'panel.mjs',
  'task.mjs',
  'read-page.mjs',
  'icon-16.png',
  'icon-32.png',
];

export default defineConfig({
  imports: false,
  // Unattended development builds (fixtures/autorun.mjs) go elsewhere, so dist/ stays a normal build.
  outDir: !autorun ? 'dist' : productPermissions ? '.output/autorun-product' : '.output/autorun',
  outDirTemplate: '',
  filterEntrypoints: autorun ? undefined : ['background'],
  alias: {
    '@src': 'src',
  },
  manifest: {
    // The name, description and the strings Chrome shows itself follow Chrome's language (public/_locales).
    name: autorun ? '__MSG_extName__' : 'Xroga Browser Automation',
    description: autorun
      ? '__MSG_extDescription__'
      : 'Review and collect the title, visible headings and links of a Chrome tab. Results stay on your device.',
    ...(autorun ? { default_locale: 'en' } : { version: '0.1.0', version_name: '0.1.0 development preview' }),
    minimum_chrome_version: '125',
    ...(autorun
      ? {
          host_permissions: ['<all_urls>'],
          ...permissionLists(productPermissions ? 'product' : 'autorun'),
          action: { default_icon: 'icon-32.png', default_title: '__MSG_actionTitle__' },
          icons: { 128: 'icon-128.png' },
        }
      : {
          permissions: ['activeTab', 'scripting', 'sidePanel'],
          action: { default_icon: 'icon-32.png', default_title: 'Open Xroga Browser Automation' },
          icons: { 16: 'icon-16.png', 32: 'icon-32.png' },
          side_panel: { default_path: 'panel.html' },
          // Chrome matches the path with its query. The listener validates the exact pathname.
          externally_connectable: { matches: ['https://xroga.com/workspace*'], ids: [] },
          content_security_policy: {
            extension_pages:
              "default-src 'self'; script-src 'self'; object-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'",
          },
        }),
    incognito: 'not_allowed',
    ...(autorun
      ? {
          commands: {
            'open-panel': { suggested_key: { default: 'Alt+Shift+N' }, description: '__MSG_commandOpenPanel__' },
            'open-test-panel': { description: 'Open the browser control test panel (developers)' },
          },
        }
      : {}),
  },
  // `pnpm zip` packs dist/ into dist-zip/, outside the folder Chrome loads.
  zip: {
    artifactTemplate: '../dist-zip/{{name}}-{{version}}.zip',
    exclude: ['**/*.map'],
  },
  hooks: {
    'zip:extension:start': async () => {
      if (autorun) throw new Error('Developer fixture builds cannot be packaged for distribution.');
      await mkdir('dist-zip', { recursive: true });
    },
    'build:publicAssets': (_wxt, files) => {
      if (autorun) return;
      files.splice(
        0,
        files.length,
        ...localPreviewFiles.map(file => ({
          absoluteSrc: resolve(import.meta.dirname, '../../chrome-extension', file),
          relativeDest: file,
        })),
      );
      for (const file of ['LICENSE', 'NOTICE', 'XROGA-PREVIEW.md']) {
        files.push({ absoluteSrc: resolve(import.meta.dirname, file), relativeDest: file });
      }
    },
    'config:resolved': wxt => {
      // WXT 0.21.4 still installs Unimport's Vite plugin with imports: false; clear its presets.
      wxt.config.imports.presets = [];
      wxt.config.imports.imports = [];
    },
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.background) (manifest.background as { type?: string }).type = 'module';
      // No panel by default: the worker enables it per tab with a path.
      if (autorun) delete (manifest as { side_panel?: unknown }).side_panel;
    },
  },
  vite: env => ({
    plugins: [react()],
    resolve: {
      alias: {
        '@xroga/runtime-background': resolve(
          import.meta.dirname,
          autorun ? 'src/xroga/fixture-background.ts' : 'src/xroga/preview-background.ts',
        ),
        // puppeteer-core 25 imports @puppeteer/browsers for the `channel` option, which is never used here.
        '@puppeteer/browsers': resolve(import.meta.dirname, 'src/browser-control/host/puppeteer-browsers-stub.ts'),
      },
      conditions: ['browser', 'module', 'import', 'default'],
      mainFields: ['browser', 'module', 'main'],
    },
    css: {
      postcss: {
        plugins: [tailwindcss({ config: resolve(import.meta.dirname, 'tailwind.config.ts') }), autoprefixer()],
      },
    },
    build: {
      sourcemap: env.mode === 'development',
      minify: env.mode === 'production',
    },
  }),
});
