
import { generateCloudRunDeployConfig } from '../src/lib/gcp/cloudbuild';
import assert from 'assert';

console.log('Running Cloud Build config generation tests...');

// Mock config
const buildConfig = {
    projectSlug: 'test-project',
    repoFullName: 'test/repo',
    branch: 'main',
    commitSha: 'abcdef123456',
    rootDirectory: 'apps/web',
    framework: 'nextjs',
};

try {
    const config = generateCloudRunDeployConfig(buildConfig as any) as any;

    // Check if the generated Dockerfile inside the steps contains the rootDirectory logic
    const dockerStep = config.steps.find((s: any) => s.name === 'gcr.io/cloud-builders/docker' && s.args[1].includes('cat > /workspace/Dockerfile'));

    if (!dockerStep) {
        console.error('Could not find Dockerfile generation step');
        process.exit(1);
    }

    const dockerfileContent = dockerStep.args[1];

    if (!dockerfileContent.includes('COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./')) {
        console.error('Generated Dockerfile content missing rootDirectory logic');
        console.log(dockerfileContent);
        process.exit(1);
    }

    console.log('✅ Cloud Build config generation test passed');
} catch (e) {
    console.error('Cloud Build test failed:', e);
    process.exit(1);
}
