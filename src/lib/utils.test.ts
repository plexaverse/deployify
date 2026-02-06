import { test } from 'node:test';
import assert from 'node:assert';
import { slugify, shouldAutoDeploy } from './utils';
import type { Project } from '@/types';

test('slugify', async (t) => {
    await t.test('converts simple string to slug', () => {
        assert.strictEqual(slugify('Hello World'), 'hello-world');
    });

    await t.test('converts feature branch to slug', () => {
        assert.strictEqual(slugify('feature/new-ui'), 'feature-new-ui');
    });

    await t.test('removes special characters', () => {
        assert.strictEqual(slugify('v1.0.0+beta'), 'v1-0-0-beta');
    });

    await t.test('handles multiple spaces and dashes', () => {
        assert.strictEqual(slugify(' foo -- bar '), 'foo-bar');
    });
});

test('shouldAutoDeploy', async (t) => {
    const mockProject = {
        defaultBranch: 'main',
        autodeployBranches: [] as string[],
    } as Project;

    await t.test('deploys default branch when autodeployBranches is empty', () => {
        assert.strictEqual(shouldAutoDeploy(mockProject, 'main'), true);
        assert.strictEqual(shouldAutoDeploy(mockProject, 'dev'), false);
    });

    await t.test('deploys listed branches when autodeployBranches is populated', () => {
        const projectWithBranches = {
            ...mockProject,
            autodeployBranches: ['main', 'staging', 'dev'],
        } as Project;

        assert.strictEqual(shouldAutoDeploy(projectWithBranches, 'main'), true);
        assert.strictEqual(shouldAutoDeploy(projectWithBranches, 'staging'), true);
        assert.strictEqual(shouldAutoDeploy(projectWithBranches, 'dev'), true);
        assert.strictEqual(shouldAutoDeploy(projectWithBranches, 'feature/x'), false);
    });

    await t.test('respects autodeployBranches even if default branch is not listed', () => {
        const projectWithoutMain = {
            ...mockProject,
            defaultBranch: 'main',
            autodeployBranches: ['staging'],
        } as Project;

        // Default branch should ALWAYS deploy
        assert.strictEqual(shouldAutoDeploy(projectWithoutMain, 'main'), true);
        assert.strictEqual(shouldAutoDeploy(projectWithoutMain, 'staging'), true);
    });
});
