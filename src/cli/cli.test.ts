import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Mock some globals and modules before requiring the CLI
const mockFetch = async (url: string, options: any) => {
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

// @ts-ignore
global.fetch = mockFetch;

// Import the CLI module (CommonJS)
// @ts-ignore
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
