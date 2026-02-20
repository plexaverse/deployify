import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateCloudRunDeployConfig } from './cloudbuild';

// Mock config if needed, or rely on default values since we are testing structure
// Assuming generateCloudRunDeployConfig is pure enough or relies on config which is static

describe('generateCloudRunDeployConfig', () => {
    it('should include health check probes when healthCheckPath is provided', () => {
        const buildConfig = {
            projectSlug: 'test-project',
            repoFullName: 'owner/repo',
            branch: 'main',
            commitSha: '1234567',
            healthCheckPath: '/health',
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = generateCloudRunDeployConfig(buildConfig);

        // Find the 'gcloud run deploy' step
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deployStep = result.steps.find((step: any) =>
            step.args && step.args.includes('run') && step.args.includes('deploy')
        );

        assert.ok(deployStep, 'Deploy step not found');

        // Check for probe flags
        const args = deployStep.args;
        assert.ok(args.includes('--startup-probe-path'), '--startup-probe-path flag missing');
        assert.ok(args.includes('/health'), '/health value missing');
        assert.ok(args.includes('--liveness-probe-path'), '--liveness-probe-path flag missing');

        // Verify position or value specifically if needed
        const startupIndex = args.indexOf('--startup-probe-path');
        assert.strictEqual(args[startupIndex + 1], '/health');

        const livenessIndex = args.indexOf('--liveness-probe-path');
        assert.strictEqual(args[livenessIndex + 1], '/health');
    });

    it('should NOT include health check probes when healthCheckPath is missing', () => {
        const buildConfig = {
            projectSlug: 'test-project',
            repoFullName: 'owner/repo',
            branch: 'main',
            commitSha: '1234567',
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = generateCloudRunDeployConfig(buildConfig);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deployStep = result.steps.find((step: any) =>
            step.args && step.args.includes('run') && step.args.includes('deploy')
        );

        assert.ok(deployStep, 'Deploy step not found');

        const args = deployStep.args;
        assert.ok(!args.includes('--startup-probe-path'), '--startup-probe-path flag should not be present');
        assert.ok(!args.includes('--liveness-probe-path'), '--liveness-probe-path flag should not be present');
    });
});
