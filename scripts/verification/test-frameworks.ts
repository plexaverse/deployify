
import { getDockerfile, DockerfileConfig } from '../../src/lib/dockerfiles';
import * as assert from 'assert';

console.log('Verifying Dockerfile Generation...');

// Test 1: Next.js
const nextConfig: DockerfileConfig = {
    framework: 'nextjs',
    buildEnvSection: 'ENV TEST=1'
};
const nextDockerfile = getDockerfile(nextConfig);
assert.ok(nextDockerfile.includes('FROM node:20-alpine AS deps'), 'Next.js: Should start with deps stage');
assert.ok(nextDockerfile.includes('ENV NEXT_TELEMETRY_DISABLED=1'), 'Next.js: Should disable telemetry');
assert.ok(nextDockerfile.includes('ENV TEST=1'), 'Next.js: Should include env vars');
assert.ok(nextDockerfile.includes('CMD ["node", "server.js"]'), 'Next.js: Should run server.js');
console.log('✅ Next.js Dockerfile verified');

// Test 2: Vite
const viteConfig: DockerfileConfig = {
    framework: 'vite',
    buildEnvSection: 'ENV VITE_TEST=1',
    outputDirectory: 'dist'
};
const viteDockerfile = getDockerfile(viteConfig);
assert.ok(viteDockerfile.includes('FROM nginx:alpine'), 'Vite: Should use nginx');
assert.ok(viteDockerfile.includes('COPY --from=builder /app/dist /usr/share/nginx/html'), 'Vite: Should copy output to nginx');
assert.ok(viteDockerfile.includes('try_files $uri $uri/ /index.html'), 'Vite: Should configure SPA routing');
console.log('✅ Vite Dockerfile verified');

// Test 3: Astro
const astroConfig: DockerfileConfig = {
    framework: 'astro',
    buildEnvSection: 'ENV ASTRO_TEST=1',
    outputDirectory: 'dist'
};
const astroDockerfile = getDockerfile(astroConfig);
assert.ok(astroDockerfile.includes('FROM node:20-alpine AS runner'), 'Astro: Should have runner stage');
assert.ok(astroDockerfile.includes('CMD ["node", "./dist/server/entry.mjs"]'), 'Astro: Should run entry.mjs');
console.log('✅ Astro Dockerfile verified');

// Test 4: Remix
const remixConfig: DockerfileConfig = {
    framework: 'remix',
    buildEnvSection: 'ENV REMIX_TEST=1'
};
const remixDockerfile = getDockerfile(remixConfig);
assert.ok(remixDockerfile.includes('CMD ["npm", "start"]'), 'Remix: Should run npm start');
console.log('✅ Remix Dockerfile verified');

console.log('🎉 All Dockerfile tests passed!');
