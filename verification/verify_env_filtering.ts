
// Mock types locally if needed, but since we are running in tsx (if available) or node, we might not have access to aliases.
// I will just define the types and logic here to verify the ALGORITHM.

type EnvVariableTarget = 'build' | 'runtime' | 'both';

interface MockEnvVariable {
    id: string;
    key: string;
    value: string;
    isSecret: boolean;
    target: EnvVariableTarget;
    environment?: 'production' | 'preview' | 'both';
}

function filterEnvVars(
    allEnvVars: MockEnvVariable[],
    envTarget: 'production' | 'preview'
) {
    const buildEnvVars: Record<string, string> = {};
    const runtimeEnvVars: Record<string, string> = {};

    for (const env of allEnvVars) {
        if (env.environment && env.environment !== 'both' && env.environment !== envTarget) {
            continue;
        }

        if (env.target === 'build' || env.target === 'both') {
            buildEnvVars[env.key] = env.value;
        }
        if (env.target === 'runtime' || env.target === 'both') {
            runtimeEnvVars[env.key] = env.value;
        }
    }

    return { buildEnvVars, runtimeEnvVars };
}

// Test Data
const envVars: MockEnvVariable[] = [
    { id: '1', key: 'ALL_BOTH', value: 'val1', isSecret: false, target: 'both', environment: 'both' },
    { id: '2', key: 'PROD_ONLY', value: 'val2', isSecret: false, target: 'both', environment: 'production' },
    { id: '3', key: 'PREVIEW_ONLY', value: 'val3', isSecret: false, target: 'both', environment: 'preview' },
    { id: '4', key: 'BUILD_ONLY_PROD', value: 'val4', isSecret: false, target: 'build', environment: 'production' },
    { id: '5', key: 'RUNTIME_ONLY_PREVIEW', value: 'val5', isSecret: false, target: 'runtime', environment: 'preview' },
    { id: '6', key: 'LEGACY', value: 'val6', isSecret: false, target: 'both' }, // undefined environment should mean both
];

console.log('Testing Production Deployment Filtering...');
const prodResult = filterEnvVars(envVars, 'production');
console.log('Build Vars:', Object.keys(prodResult.buildEnvVars));
console.log('Runtime Vars:', Object.keys(prodResult.runtimeEnvVars));

// Expectations for Prod:
// ALL_BOTH, PROD_ONLY, BUILD_ONLY_PROD (build), LEGACY
// runtime: ALL_BOTH, PROD_ONLY, LEGACY

const expectedProdBuild = ['ALL_BOTH', 'PROD_ONLY', 'BUILD_ONLY_PROD', 'LEGACY'];
const expectedProdRuntime = ['ALL_BOTH', 'PROD_ONLY', 'LEGACY'];

const prodBuildPass = expectedProdBuild.every(k => k in prodResult.buildEnvVars) && Object.keys(prodResult.buildEnvVars).length === expectedProdBuild.length;
const prodRuntimePass = expectedProdRuntime.every(k => k in prodResult.runtimeEnvVars) && Object.keys(prodResult.runtimeEnvVars).length === expectedProdRuntime.length;

console.log('Prod Build Pass:', prodBuildPass);
console.log('Prod Runtime Pass:', prodRuntimePass);


console.log('\nTesting Preview Deployment Filtering...');
const previewResult = filterEnvVars(envVars, 'preview');
console.log('Build Vars:', Object.keys(previewResult.buildEnvVars));
console.log('Runtime Vars:', Object.keys(previewResult.runtimeEnvVars));

// Expectations for Preview:
// ALL_BOTH, PREVIEW_ONLY, LEGACY
// runtime: ALL_BOTH, PREVIEW_ONLY, RUNTIME_ONLY_PREVIEW, LEGACY

const expectedPreviewBuild = ['ALL_BOTH', 'PREVIEW_ONLY', 'LEGACY'];
const expectedPreviewRuntime = ['ALL_BOTH', 'PREVIEW_ONLY', 'RUNTIME_ONLY_PREVIEW', 'LEGACY'];

const previewBuildPass = expectedPreviewBuild.every(k => k in previewResult.buildEnvVars) && Object.keys(previewResult.buildEnvVars).length === expectedPreviewBuild.length;
const previewRuntimePass = expectedPreviewRuntime.every(k => k in previewResult.runtimeEnvVars) && Object.keys(previewResult.runtimeEnvVars).length === expectedPreviewRuntime.length;

console.log('Preview Build Pass:', previewBuildPass);
console.log('Preview Runtime Pass:', previewRuntimePass);

if (prodBuildPass && prodRuntimePass && previewBuildPass && previewRuntimePass) {
    console.log('\n✅ All tests passed!');
} else {
    console.error('\n❌ Tests failed!');
    process.exit(1);
}
