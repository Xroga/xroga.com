// Xroga modification: resolve the fixture or local preview worker at build time.
import { defineBackground } from 'wxt/utils/define-background';
// Listener registration must stay synchronous at service worker start.
// WXT strips side-effect imports when it evaluates entrypoint options at build time, so main() stays empty.
import '@xroga/runtime-background';

export default defineBackground({ main() {} });
