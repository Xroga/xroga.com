/** Vercel config for static AI-generated sites — no build step, serves index.html as live preview. */
export function vercelStaticSiteJson(): string {
  return JSON.stringify(
    {
      version: 2,
      buildCommand: null,
      installCommand: null,
      framework: null,
      outputDirectory: '.',
      cleanUrls: true,
      trailingSlash: false,
      headers: [
        {
          source: '/(.*)',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
        },
      ],
      routes: [
        { handle: 'filesystem' },
        { src: '/.*', dest: '/index.html' },
      ],
    },
    null,
    2
  );
}
