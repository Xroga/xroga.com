import type { ProjectFile } from '../integrations/githubDeploy.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'xroga-mobile';
}

/**
 * Expo (React Native) scaffold for Android + iOS.
 * Ships to GitHub; run locally with Expo Go / EAS Build for store binaries.
 * Also includes a tiny web index for Vercel preview of the product story.
 */
export function buildExpoScaffold(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const name = opts.projectName.trim() || 'Xroga Mobile';
  const slug = slugify(name);

  return [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: slug,
          version: '1.0.0',
          main: 'expo-router/entry',
          scripts: {
            start: 'expo start',
            android: 'expo start --android',
            ios: 'expo start --ios',
            web: 'expo start --web',
          },
          dependencies: {
            expo: '~52.0.0',
            'expo-router': '~4.0.0',
            'expo-status-bar': '~2.0.0',
            react: '18.3.1',
            'react-native': '0.76.3',
            'react-native-safe-area-context': '4.12.0',
            'react-native-screens': '~4.1.0',
            '@react-navigation/native': '^7.0.0',
          },
          devDependencies: {
            '@babel/core': '^7.25.0',
            typescript: '^5.3.0',
            '@types/react': '~18.3.0',
          },
          private: true,
        },
        null,
        2,
      ),
    },
    {
      path: 'app.json',
      content: JSON.stringify(
        {
          expo: {
            name,
            slug,
            version: '1.0.0',
            orientation: 'portrait',
            scheme: slug,
            userInterfaceStyle: 'automatic',
            ios: {
              supportsTablet: true,
              bundleIdentifier: `com.xroga.${slug.replace(/-/g, '')}`,
            },
            android: {
              adaptiveIcon: {
                backgroundColor: '#0B1220',
              },
              package: `com.xroga.${slug.replace(/-/g, '')}`,
            },
            web: {
              bundler: 'metro',
            },
            plugins: ['expo-router'],
            extra: {
              eas: {
                projectId: 'REPLACE_WITH_EAS_PROJECT_ID',
              },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      path: '.eas/workflows/build-android.yml',
      content: `name: Build Android
on:
  workflow_dispatch: {}
jobs:
  build_android:
    name: Build Android
    type: build
    params:
      platform: android
      profile: production
`,
    },
    {
      path: '.eas/workflows/build-ios.yml',
      content: `name: Build iOS
on:
  workflow_dispatch: {}
jobs:
  build_ios:
    name: Build iOS
    type: build
    params:
      platform: ios
      profile: production
`,
    },
    {
      path: '.eas/workflows/publish-android.yml',
      content: `name: Publish Android
on:
  workflow_dispatch: {}
jobs:
  build_android:
    name: Build Android
    type: build
    params:
      platform: android
      profile: production
  submit_android:
    name: Submit Play Store
    type: submit
    needs: [build_android]
    params:
      platform: android
      profile: production
`,
    },
    {
      path: '.eas/workflows/publish-ios.yml',
      content: `name: Publish iOS
on:
  workflow_dispatch: {}
jobs:
  build_ios:
    name: Build iOS
    type: build
    params:
      platform: ios
      profile: production
  submit_ios:
    name: Submit App Store
    type: submit
    needs: [build_ios]
    params:
      platform: ios
      profile: production
`,
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          extends: 'expo/tsconfig.base',
          compilerOptions: {
            strict: true,
            paths: { '@/*': ['./*'] },
          },
          include: ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts'],
        },
        null,
        2,
      ),
    },
    {
      path: 'babel.config.js',
      content: `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
`,
    },
    {
      path: 'app/_layout.tsx',
      content: `import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B1220' },
          headerTintColor: '#F4F7FB',
          contentStyle: { backgroundColor: '#0B1220' },
        }}
      />
    </>
  );
}
`,
    },
    {
      path: 'app/index.tsx',
      content: `import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Xroga · Android + iOS</Text>
      <Text style={styles.title}>${name.replace(/`/g, "'")}</Text>
      <Text style={styles.body}>
        Built by Xroga AI. Open in Expo Go. Store builds need EAS setup on your Expo account — not automatic.
        Code lives on your GitHub — keep updating the same repo.
      </Text>
      <Link href="/about" asChild>
        <Pressable style={styles.btn}>
          <Text style={styles.btnText}>About this app</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    backgroundColor: '#0B1220',
  },
  kicker: {
    color: '#3D9CF0',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
    marginBottom: 10,
  },
  title: {
    color: '#F4F7FB',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  body: {
    color: '#9DB0C7',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#3D9CF0',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: {
    color: '#041018',
    fontWeight: '700',
  },
});
`,
    },
    {
      path: 'app/about.tsx',
      content: `import { StyleSheet, Text, View } from 'react-native';

export default function AboutScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>How to run</Text>
      <Text style={styles.body}>1. npm install</Text>
      <Text style={styles.body}>2. npx expo start</Text>
      <Text style={styles.body}>3. Scan QR with Expo Go (Android / iOS)</Text>
      <Text style={styles.body}>4. For store builds: eas build -p android|ios</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, backgroundColor: '#0B1220' },
  title: { color: '#F4F7FB', fontSize: 28, fontWeight: '800', marginBottom: 16 },
  body: { color: '#9DB0C7', fontSize: 16, marginBottom: 8, lineHeight: 24 },
});
`,
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} — Android &amp; iOS via Expo</title>
  <style>
    body { margin:0; font-family: Georgia, "Segoe UI", sans-serif; color:#f4f7fb;
      background: radial-gradient(900px 500px at 20% -10%, #1a3a5c, transparent), #0b1220; }
    main { max-width: 720px; margin: 0 auto; padding: 4rem 1.25rem; }
    h1 { font-size: clamp(2rem,5vw,3rem); letter-spacing:-0.03em; }
    p { color:#9db0c7; line-height:1.6; }
    code { color:#3d9cf0; }
  </style>
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>This repo is an <strong>Expo</strong> app for <strong>Android + iOS</strong>, built by Xroga AI.</p>
    <p>Clone from GitHub → <code>npm i</code> → <code>npx expo start</code> → open in Expo Go.</p>
    <p>Vercel hosts this <strong>preview story page only</strong> — not the mobile app. Native binaries need Expo/EAS on your account after setup.</p>
  </main>
</body>
</html>
`,
    },
    {
      path: 'eas.json',
      content: JSON.stringify(
        {
          cli: { version: '>= 12.0.0', appVersionSource: 'remote' },
          build: {
            development: {
              developmentClient: true,
              distribution: 'internal',
            },
            preview: {
              distribution: 'internal',
            },
            production: {
              autoIncrement: true,
            },
          },
          submit: {
            production: {},
          },
        },
        null,
        2,
      ),
    },
    {
      path: '.env.example',
      content: `# Optional product keys (sync from Xroga Integrations when you add a backend API)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=

# Store publish (keep local / CI secrets — never commit real values)
# Save EXPO_TOKEN in Xroga → Publish (encrypted vault) or export locally:
# EXPO_TOKEN=
`,
    },
    {
      path: 'PUBLISH.md',
      content: `# Build / store handoff for ${name}

Xroga builds the Expo app and pushes it to **your GitHub**.
Free path = Expo Go / EAS binary. Store listing approval is still Apple/Google’s.

## What Xroga does
1. Generate Expo scaffold + push to your GitHub
2. After you Connect Expo in **Xroga → Publish**: auto-link/create EAS project, stamp \`app.json\`, start builds
3. **Sync to Expo** pushes Google Play JSON / App Store Connect API key into Expo via real GraphQL
4. With store creds synced, ship can start EAS **submit** workflows (review still external)

## What you still do for stores
1. Create an [Expo](https://expo.dev) account → Access tokens → Connect in **Xroga → Publish**
2. One-time: create the first app in [Play Console](https://play.google.com/console) / [App Store Connect](https://appstoreconnect.apple.com) (API cannot invent the first listing)
3. Save Play service-account JSON and/or ASC API key JSON in Publish → **Sync to Expo**
4. Ship again or click **Start Android/iOS EAS** — watch the run on expo.dev
5. Apple/Google store review is separate and not automatic

## Fees (you pay)
| You pay | Xroga pays |
|---------|------------|
| Google Play / Apple Developer fees | Nothing for stores |
| Expo EAS build minutes | Encrypted vault + workflow dispatch |
| Your GitHub | AI build usage on your Xroga plan |

## Advanced (CLI)

\`\`\`bash
npm i -g eas-cli
export EXPO_TOKEN=…
eas build -p android --profile production
eas submit -p android   # after Play credentials are on Expo
\`\`\`
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

**Android + iOS** app scaffolded by Xroga AI (Expo / React Native).

## Run on your phone
\`\`\`bash
npm install
npx expo start
\`\`\`
Scan the QR code with **Expo Go** (Android or iOS).

## Build for stores (handoff)
See **[PUBLISH.md](./PUBLISH.md)** — EAS workflows on **your** Expo account.  
App Store / Play approval is separate; Xroga does not publish to stores for you.

\`\`\`bash
npm i -g eas-cli
eas login
eas build -p android --profile production
eas build -p ios --profile production
\`\`\`

## Updates
Keep editing this same GitHub repo with Xroga — no rebuild from scratch.

${opts.userPrompt ? `## Prompt\n\n${opts.userPrompt.slice(0, 800)}\n` : ''}
`,
    },
  ];
}
