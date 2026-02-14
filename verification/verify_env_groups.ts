import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function main() {
    console.log('Starting verification...');

    // 1. Create a project
    console.log('Creating project...');
    const projectRes = await fetch(`${BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Env Group Test',
            repoFullName: 'test/repo',
            framework: 'nextjs',
        }),
    });

    if (!projectRes.ok) {
        console.error('Failed to create project:', await projectRes.text());
        process.exit(1);
    }

    const { project } = await projectRes.json();
    console.log(`Project created: ${project.id}`);

    try {
        // 2. Add Env Var with Group
        console.log('Adding env var with group...');
        const addEnvRes = await fetch(`${BASE_URL}/api/projects/${project.id}/env`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: 'TEST_VAR',
                value: 'test_value',
                group: 'TestGroup',
            }),
        });

        if (!addEnvRes.ok) {
            console.error('Failed to add env var:', await addEnvRes.text());
            process.exit(1);
        }

        const { envVariable } = await addEnvRes.json();
        assert.strictEqual(envVariable.group, 'TestGroup', 'Group mismatch in POST response');
        console.log('Env var added successfully with group.');

        // 3. Verify via GET
        console.log('Verifying via GET...');
        const listEnvRes = await fetch(`${BASE_URL}/api/projects/${project.id}/env`);
        if (!listEnvRes.ok) {
             console.error('Failed to list env vars:', await listEnvRes.text());
             process.exit(1);
        }

        const { envVariables } = await listEnvRes.json();
        const found = envVariables.find((e: any) => e.key === 'TEST_VAR');
        assert.ok(found, 'Env var not found');
        assert.strictEqual(found.group, 'TestGroup', 'Group mismatch in GET response');
        console.log('GET verification passed.');

        // 4. Update Env Var Group
        console.log('Updating env var group...');
        const updateEnvRes = await fetch(`${BASE_URL}/api/projects/${project.id}/env`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                envId: envVariable.id,
                group: 'UpdatedGroup',
            }),
        });

        if (!updateEnvRes.ok) {
            console.error('Failed to update env var:', await updateEnvRes.text());
            process.exit(1);
        }

        const { envVariable: updatedEnv } = await updateEnvRes.json();
        assert.strictEqual(updatedEnv.group, 'UpdatedGroup', 'Group mismatch in PUT response');
        console.log('Env var updated successfully.');

    } finally {
        // 5. Cleanup
        console.log('Cleaning up...');
        await fetch(`${BASE_URL}/api/projects/${project.id}`, {
            method: 'DELETE',
        });
        console.log('Done.');
    }
}

main().catch(console.error);
