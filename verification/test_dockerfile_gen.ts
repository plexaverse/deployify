import { getDockerfile } from '../src/lib/dockerfiles';
import assert from 'assert';

console.log('Testing Dockerfile generation...');

// Test 1: Next.js with rootDirectory
const nextConfig = {
    framework: 'nextjs',
    buildEnvSection: '# ENV',
    restoreCache: true,
    rootDirectory: 'apps/web',
    buildCommand: 'npm run build'
};

const nextDockerfile = getDockerfile(nextConfig);

// Assertions
try {
    assert(nextDockerfile.includes('cd apps/web && npm run build'), 'Build command should cd into rootDirectory');
    assert(nextDockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./'), 'Standalone copy should use rootDirectory');
    assert(nextDockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static'), 'Static copy should use rootDirectory');
    assert(nextDockerfile.includes('COPY --from=builder /app/apps/web/public ./public'), 'Public copy should use rootDirectory');
    assert(nextDockerfile.includes('CMD ["node", "apps/web/server.js"]'), 'CMD should point to rootDirectory server.js');
    console.log('✅ Next.js Monorepo Dockerfile passed');
} catch (e) {
    console.error('❌ Next.js Monorepo Dockerfile failed:', e.message);
    console.log(nextDockerfile);
}

// Test 2: Astro with rootDirectory
const astroConfig = {
    framework: 'astro',
    buildEnvSection: '# ENV',
    outputDirectory: 'dist',
    rootDirectory: 'apps/docs',
    buildCommand: 'npm run build'
};

const astroDockerfile = getDockerfile(astroConfig);

try {
    assert(astroDockerfile.includes('cd apps/docs && npm run build'), 'Astro build command should cd into rootDirectory');
    assert(astroDockerfile.includes('COPY --from=builder /app/apps/docs/dist ./dist'), 'Astro runner copy should use rootDirectory');
    console.log('✅ Astro Monorepo Dockerfile passed');
} catch (e) {
    console.error('❌ Astro Monorepo Dockerfile failed:', e.message);
    console.log(astroDockerfile);
}

// Test 3: Remix with rootDirectory
const remixConfig = {
    framework: 'remix',
    buildEnvSection: '# ENV',
    rootDirectory: 'apps/remix-app',
    buildCommand: 'npm run build'
};

const remixDockerfile = getDockerfile(remixConfig);

try {
    assert(remixDockerfile.includes('cd apps/remix-app && npm run build'), 'Remix build command should cd into rootDirectory');
    assert(remixDockerfile.includes('COPY --from=builder /app/apps/remix-app/build ./build'), 'Remix build copy should use rootDirectory');
    assert(remixDockerfile.includes('COPY --from=builder /app/apps/remix-app/public ./public'), 'Remix public copy should use rootDirectory');
    assert(remixDockerfile.includes('COPY --from=builder /app/apps/remix-app/package.json ./package.json'), 'Remix package.json copy should use rootDirectory');
    console.log('✅ Remix Monorepo Dockerfile passed');
} catch (e) {
    console.error('❌ Remix Monorepo Dockerfile failed:', e.message);
    console.log(remixDockerfile);
}

// Test 4: Vite with rootDirectory
const viteConfig = {
    framework: 'vite',
    buildEnvSection: '# ENV',
    outputDirectory: 'dist',
    rootDirectory: 'apps/vite-app',
    buildCommand: 'npm run build'
};

const viteDockerfile = getDockerfile(viteConfig);

try {
    assert(viteDockerfile.includes('cd apps/vite-app && npm run build'), 'Vite build command should cd into rootDirectory');
    assert(viteDockerfile.includes('COPY --from=builder /app/apps/vite-app/dist /usr/share/nginx/html'), 'Vite nginx copy should use rootDirectory');
    console.log('✅ Vite Monorepo Dockerfile passed');
} catch (e) {
    console.error('❌ Vite Monorepo Dockerfile failed:', e.message);
    console.log(viteDockerfile);
}
