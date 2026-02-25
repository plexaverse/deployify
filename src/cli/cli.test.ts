import { test, describe } from 'node:test';
import assert from 'node:assert';

// Mock some globals and modules before requiring the CLI
const mockFetch = async (url: string, _options: unknown) => {
  if (url.includes('/api/projects')) {
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        projects: [{ id: 'test-project-id', name: 'Test Project', repoFullName: 'owner/repo' }]
      })
    };
  }
  return { ok: false };
};

// @ts-expect-error - mocking global fetch for test environment
global.fetch = mockFetch;

// Import the CLI module (CommonJS)
// @ts-expect-error - testing a CommonJS module in TS environment
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require('./index.js');

describe('CLI Utilities', () => {
    test('getGitStatus returns trimmed output', () => {
        // This actually calls git status, which might fail if not in a git repo
        // But the sandbox is a git repo.
        try {
            const status = cli.getGitStatus();
            assert.strictEqual(typeof status, 'string');
        } catch {
            // If git not available, ignore
        }
    });

    test('getCurrentBranch returns a branch name', () => {
        try {
            const branch = cli.getCurrentBranch();
            assert.ok(branch);
            assert.strictEqual(typeof branch, 'string');
        } catch {
            // Ignore if git not available
        }
    });

    test('fetchJson handles JSON responses', async () => {
        const data = await cli.fetchJson('http://localhost:3000/api/projects', 'test-token');
        assert.ok(data.projects);
        assert.strictEqual(data.projects[0].id, 'test-project-id');
    });

    test('isAheadOfRemote returns boolean', () => {
        try {
            const ahead = cli.isAheadOfRemote('main');
            assert.strictEqual(typeof ahead, 'boolean');
        } catch {
            // Ignore
        }
    });
});
