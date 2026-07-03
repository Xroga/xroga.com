/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.postimg.cc' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'i.pinimg.com' },
      { protocol: 'https', hostname: 'cdn.simpleicons.org' },
      { protocol: 'https', hostname: 'www.google.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signin', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/signup', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      { source: '/sign-up', destination: '/auth/signup', permanent: true },
      { source: '/sign-in', destination: '/auth/login', permanent: true },
      { source: '/droga-ai', destination: '/droga', permanent: true },
      { source: '/drogaai', destination: '/droga', permanent: true },
      { source: '/roga', destination: '/droga', permanent: true },
      { source: '/roga-ai', destination: '/droga', permanent: true },
      { source: '/zroga', destination: '/droga', permanent: true },
      { source: '/zroga-ai', destination: '/droga', permanent: true },
      { source: '/xroga-ai', destination: '/', permanent: true },
      { source: '/ai-image-generator', destination: '/features/ai-image-generation', permanent: true },
      { source: '/ai-image-generation', destination: '/features/ai-image-generation', permanent: true },
      { source: '/ai-chat', destination: '/features/ai-chat', permanent: true },
      { source: '/talk-with-ai', destination: '/features/ai-voice-talk', permanent: true },
      { source: '/voice-ai', destination: '/features/ai-voice-talk', permanent: true },
      { source: '/github-deploy', destination: '/features/github-auto-deploy', permanent: true },
      { source: '/vercel-deploy', destination: '/features/vercel-netlify-deploy', permanent: true },
      { source: '/netlify-deploy', destination: '/features/vercel-netlify-deploy', permanent: true },
      { source: '/ai-debugging', destination: '/features/code-debugging', permanent: true },
      { source: '/build-apps', destination: '/features/build-websites-apps-games', permanent: true },
    ];
  },
};

export default nextConfig;
