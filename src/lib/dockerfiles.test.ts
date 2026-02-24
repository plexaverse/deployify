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
});
