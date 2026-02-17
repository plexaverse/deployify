
import { getDockerfile } from '../src/lib/dockerfiles';
import assert from 'assert';

console.log('Running Dockerfile generation tests...');

// Next.js Monorepo Test
try {
    const nextDockerfile = getDockerfile({
        framework: 'nextjs',
        buildEnvSection: '',
        rootDirectory: 'apps/web',
        // @ts-ignore
        outputDirectory: '.next',
    } as any);

    // Verify key parts of the Dockerfile
    // 1. Should change directory or reference rootDirectory
    // For now, let's look for specific patterns we expect
    // We expect COPY commands to reference apps/web for source but copy to root/standard paths for destination
    if (!nextDockerfile.includes('COPY --from=builder /app/apps/web/public ./public')) {
        console.error('Next.js Dockerfile missing correct public copy');
        console.log(nextDockerfile);
        process.exit(1);
    }
    if (!nextDockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./')) {
        console.error('Next.js Dockerfile missing correct standalone copy');
        console.log(nextDockerfile);
        process.exit(1);
    }
    if (!nextDockerfile.includes('COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static')) {
        console.error('Next.js Dockerfile missing correct static copy');
        console.log(nextDockerfile);
        process.exit(1);
    }
    // CMD check
    if (!nextDockerfile.includes('CMD ["node", "server.js"]')) {
        console.error('Next.js Dockerfile missing correct CMD');
        console.log(nextDockerfile);
        process.exit(1);
    }

    console.log('✅ Next.js Monorepo Dockerfile test passed');
} catch (e) {
    console.error('Next.js test failed:', e);
    // It is expected to fail before implementation
}

// Vite Monorepo Test
try {
    const viteDockerfile = getDockerfile({
        framework: 'vite',
        buildEnvSection: '',
        rootDirectory: 'apps/frontend',
        outputDirectory: 'dist',
    } as any);

    if (!viteDockerfile.includes('COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html')) {
        console.error('Vite Dockerfile missing correct dist copy');
        console.log(viteDockerfile);
        process.exit(1);
    }

    console.log('✅ Vite Monorepo Dockerfile test passed');
} catch (e) {
    console.error('Vite test failed:', e);
}
