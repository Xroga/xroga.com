// OpenUI 1.1.0 auto-mounts a development inspector. Keep this internal
// authenticated surface independent of third-party development scripts.
if (process.env.NODE_ENV === 'development') {
  Reflect.set(globalThis, Symbol.for('openui.devtools.autoMount'), true);
}
