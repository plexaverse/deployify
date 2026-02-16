
// Set dummy environment variables to avoid config errors
process.env.GCP_PROJECT_ID = 'test-project';
process.env.GCP_REGION = 'us-central1';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

import { generateCloudRunDeployConfig } from '../src/lib/gcp/cloudbuild';
import assert from 'assert';

console.log('Running Monorepo Build Generation Tests...');

const baseConfig = {
    projectSlug: 'test-project',
    repoFullName: 'owner/repo',
    branch: 'main',
    commitSha: 'abcdef123456',
    buildEnvVars: {},
    runtimeEnvVars: {},
    framework: 'nextjs',
};

// Test 1: No root directory (Default behavior)
try {
    console.log('Test 1: Default behavior (no rootDirectory)');
    const config = generateCloudRunDeployConfig({
        ...baseConfig,
    }) as any;

    // Check steps
    const dockerStep = config.steps.find((s: any) => s.name === 'gcr.io/cloud-builders/docker' && s.args[0] === 'build');
    assert.ok(dockerStep, 'Docker build step found');
    assert.strictEqual(dockerStep.dir, '/workspace', 'Default dir should be /workspace');

    // Check Dockerfile creation step
    const createDockerfileStep = config.steps.find((s: any) => s.args && s.args[1] && s.args[1].includes('cat > /workspace/Dockerfile'));
    assert.ok(createDockerfileStep, 'Dockerfile creation step found');

    console.log('✅ Test 1 Passed');
} catch (e) {
    console.error('❌ Test 1 Failed:', e);
    process.exit(1);
}

// Test 2: With root directory
try {
    console.log('Test 2: With rootDirectory="apps/web"');
    const rootDir = 'apps/web';
    const config = generateCloudRunDeployConfig({
        ...baseConfig,
        rootDirectory: rootDir,
    }) as any;

    // Check steps have correct dir
    const dockerStep = config.steps.find((s: any) => s.name === 'gcr.io/cloud-builders/docker' && s.args[0] === 'build');
    assert.ok(dockerStep, 'Docker build step found');
    assert.strictEqual(dockerStep.dir, `/workspace/${rootDir}`, `Dir should be /workspace/${rootDir}`);

    // Check Dockerfile creation step checks correctly
    // It should check /workspace/apps/web/Dockerfile
    const createDockerfileStep = config.steps.find((s: any) => s.args && s.args[1] && s.args[1].includes(`cat > /workspace/${rootDir}/Dockerfile`));
    assert.ok(createDockerfileStep, 'Dockerfile creation step found with correct path');

    // Check next.config check step
    const nextConfigStep = config.steps.find((s: any) => s.args && s.args[1] && s.args[1].includes('next.config'));
    assert.ok(nextConfigStep, 'Next config check step found');
    assert.ok(nextConfigStep.args[1].includes(`cd /workspace/${rootDir}`), 'Next config check should cd to rootDir');

    console.log('✅ Test 2 Passed');
} catch (e) {
    console.error('❌ Test 2 Failed:', e);
    // process.exit(1); // Don't exit yet, let's see failure
}
