// react-lang 1.1.0 auto-mounts a CDN-loaded inspector in development. Mark the
// initializer as handled before loading the pinned web entry in Workspace.
if (process.env.NODE_ENV === 'development') {
  const flags = globalThis as Record<symbol, unknown>;
  flags[Symbol.for('openui.devtools.autoMount')] = true;
}
