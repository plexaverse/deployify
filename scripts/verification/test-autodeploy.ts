
import { shouldAutoDeploy } from '../src/lib/utils';
import type { Project } from '../src/types';
import * as assert from 'assert';

console.log('Verifying Auto-deploy Logic...');

// Helper to create a partial project for testing
const createProject = (overrides: Partial<Project>): Project => ({
    id: 'test-id',
    name: 'test-project',
    defaultBranch: 'main',
    ...overrides
} as Project);

// Test 1: No autodeployBranches configured (default behavior)
console.log('Test 1: Default behavior (no configuration)...');
const projectDefault = createProject({});

assert.strictEqual(shouldAutoDeploy(projectDefault, 'main'), true, 'Should deploy default branch');
assert.strictEqual(shouldAutoDeploy(projectDefault, 'dev'), false, 'Should not deploy non-default branch');
console.log('✅ Passed');

// Test 2: Empty autodeployBranches list
console.log('Test 2: Empty configuration list...');
const projectEmpty = createProject({ autodeployBranches: [] });

assert.strictEqual(shouldAutoDeploy(projectEmpty, 'main'), true, 'Should fallback to default branch if list is empty (or behavior decision check)');
// Wait, my implementation was:
// if (project.autodeployBranches && project.autodeployBranches.length > 0) { check list } else { check default branch }
// So if empty, it falls back to default branch.
assert.strictEqual(shouldAutoDeploy(projectEmpty, 'dev'), false, 'Should not deploy non-default branch');
console.log('✅ Passed');

// Test 3: Specific branches configured
console.log('Test 3: Specific branches configured...');
const projectSpecific = createProject({ autodeployBranches: ['main', 'staging', 'feature/*'] });
// Note: My implementation checks for exact match, no wildcards yet unless I implemented them?
// Checking implementation: return project.autodeployBranches.includes(branch);
// So no wildcards.

const projectSpecificExact = createProject({ autodeployBranches: ['main', 'staging'] });

assert.strictEqual(shouldAutoDeploy(projectSpecificExact, 'main'), true, 'Should deploy configured branch (main)');
assert.strictEqual(shouldAutoDeploy(projectSpecificExact, 'staging'), true, 'Should deploy configured branch (staging)');
assert.strictEqual(shouldAutoDeploy(projectSpecificExact, 'dev'), false, 'Should not deploy unconfigured branch');
console.log('✅ Passed');

// Test 4: Configured branches NOT including default branch
console.log('Test 4: Configured branches NOT including default branch...');
const projectNoMain = createProject({ autodeployBranches: ['staging'] });

assert.strictEqual(shouldAutoDeploy(projectNoMain, 'main'), false, 'Should NOT deploy default branch if not in list');
assert.strictEqual(shouldAutoDeploy(projectNoMain, 'staging'), true, 'Should deploy configured branch');
console.log('✅ Passed');

console.log('🎉 All Auto-deploy Logic tests passed!');
