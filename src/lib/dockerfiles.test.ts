import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDockerfile } from './dockerfiles';

describe('Dockerfile Generation', () => {
    it('should generate correct Dockerfile for Next.js with rootDirectory', () => {
        const config = {
            framework: 'nextjs',
            buildEnvSection: '',
            rootDirectory: 'web',
            buildCommand: 'npm run build',
        };
        const dockerfile = getDockerfile(config);

        // Assertions for FIXED behavior (flattened structure)

        // 1. Copy public to ./public (at root)
        assert.ok(dockerfile.includes('COPY --from=builder /app/web/public ./public'), 'Should copy public folder to root ./public');

        // 2. Copy static to ./.next/static (at root)
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static'), 'Should copy static folder to root ./.next/static');

        // 3. Copy standalone to ./ (at root)
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./'), 'Should copy standalone to root ./');

        // 4. CMD should run server.js from root or web
        assert.ok(dockerfile.includes('CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f \\\"web/server.js\\\" ]; then node \\\"web/server.js\\\";'), 'Should run server.js from root or web');
    });

    it('should generate correct Dockerfile for Next.js without rootDirectory', () => {
        const config = {
            framework: 'nextjs',
            buildEnvSection: '',
            buildCommand: 'npm run build',
        };
        const dockerfile = getDockerfile(config);

        assert.ok(dockerfile.includes('COPY --from=builder /app/public ./public'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./'));
        assert.ok(dockerfile.includes('CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f \\\"./server.js\\\" ]; then node \\\"./server.js\\\";'));
    });

    it('should generate correct Dockerfile for Astro', () => {
        const config = {
            framework: 'astro',
            buildEnvSection: '',
            rootDirectory: 'docs',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nodejs:nodejs /app/docs/dist ./docs/dist'));
        assert.ok(dockerfile.includes('USER nodejs'));
        assert.ok(dockerfile.includes('CMD ["node", "./docs/dist/server/entry.mjs"]'));
    });

    it('should generate correct Dockerfile for Bun', () => {
        const config = {
            framework: 'bun',
            buildEnvSection: '',
            rootDirectory: 'api',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('RUN addgroup --system --gid 1001 bunjs && adduser --system --uid 1001 bunjs --ingroup bunjs'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=bunjs:bunjs /app/api/dist ./api/dist'));
        assert.ok(dockerfile.includes('USER bunjs'));
        assert.ok(dockerfile.includes('WORKDIR /app/api'));
        assert.ok(dockerfile.includes('CMD ["bun", "run", "start"]'));
    });

    it('should generate correct Dockerfile for SvelteKit', () => {
        const config = {
            framework: 'sveltekit',
            buildEnvSection: '',
            rootDirectory: 'app',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nodejs:nodejs /app/app/build ./app/build'));
        assert.ok(dockerfile.includes('USER nodejs'));
        assert.ok(dockerfile.includes('CMD ["node", "./app/build/index.js"]'));
    });

    it('should generate correct Dockerfile for Nuxt', () => {
        const config = {
            framework: 'nuxt',
            buildEnvSection: '',
            rootDirectory: 'web',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nodejs:nodejs /app/web/.output ./web/.output'));
        assert.ok(dockerfile.includes('USER nodejs'));
        assert.ok(dockerfile.includes('CMD ["node", "./web/.output/server/index.mjs"]'));
    });

    it('should generate correct Dockerfile for Remix', () => {
        const config = {
            framework: 'remix',
            buildEnvSection: '',
            rootDirectory: 'server',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs'));
        assert.ok(dockerfile.includes('COPY --from=builder --chown=nodejs:nodejs /app/server/build ./server/build'));
        assert.ok(dockerfile.includes('USER nodejs'));
        assert.ok(dockerfile.includes('WORKDIR /app/server'));
        assert.ok(dockerfile.includes('CMD ["npm", "start"]'));
    });

    it('should generate correct Dockerfile for Vite', () => {
        const config = {
            framework: 'vite',
            buildEnvSection: '',
        };
        const dockerfile = getDockerfile(config);
        assert.ok(dockerfile.includes('FROM nginx:alpine'));
        assert.ok(dockerfile.includes('COPY --from=builder /app/dist /usr/share/nginx/html'));
        assert.ok(dockerfile.includes('USER nginx'));
        assert.ok(dockerfile.includes('CMD ["nginx", "-g", "daemon off;"]'));
    });
});
