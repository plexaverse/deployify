#!/usr/bin/env node

/**
 * Deployify CLI
 *
 * Usage:
 *  pnpm dlx deployify login
 *  pnpm dlx deployify deploy
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readline = require('readline');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exec, execSync } = require('child_process');

const VERSION = '0.1.0';
const args = process.argv.slice(2);
const command = args[0];

const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.deployify.json');

function main() {
    if (!command) {
        showHelp();
        return;
    }

    switch (command) {
        case 'version':
        case '--version':
        case '-v':
            console.log(`deployify v${VERSION}`);
            break;
        case 'login':
            handleLogin();
            break;
        case 'link':
            handleLink().catch(err => console.error('Link failed:', err.message));
            break;
        case 'deploy':
            handleDeploy().catch(err => console.error('Deployment failed:', err.message));
            break;
        case 'status':
            handleStatus().catch(err => console.error('Status check failed:', err.message));
            break;
        case 'storage':
            handleStorage(args).catch(err => console.error('Storage command failed:', err.message));
            break;
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
        default:
            console.log(`Unknown command: ${command}`);
            showHelp();
            break;
    }
}

function showHelp() {
    console.log(`
Deployify CLI v0.1.0

Usage:
  deployify <command> [options]

Commands:
  login     Authenticate with your Deployify instance
  link      Link the current directory to a Deployify project
  deploy    Deploy the current directory (must be a git repo) to Deployify
  status    Check the status of the latest deployment
  storage   Manage project database connectors
  help      Show this help message
`);
}

function handleLogin() {
    console.log('Deployify Authentication');
    console.log('------------------------');

    const instanceUrl = process.env.DEPLOYIFY_URL || 'http://localhost:3000';
    console.log(`Using instance: ${instanceUrl}`);

    const server = http.createServer((req, res) => {
        // Use try-catch for URL parsing
        try {
            const reqUrl = new URL(req.url, `http://${req.headers.host}`);

            if (reqUrl.pathname === '/callback') {
                const token = reqUrl.searchParams.get('token');
                if (token) {
                    // Save config
                    const config = {
                        instanceUrl,
                        token,
                        lastLogin: new Date().toISOString()
                    };
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h1>Login Successful!</h1><p>You can close this tab and return to the terminal.</p><script>window.close()</script>');

                    console.log(`\nSuccessfully logged in!`);
                    console.log(`Saved configuration to ${CONFIG_PATH}`);

                    res.on('finish', () => {
                         server.close();
                         process.exit(0);
                    });
                } else {
                    res.writeHead(400);
                    res.end('Missing token');
                    console.error('Callback received without token');

                    res.on('finish', () => {
                        server.close();
                        process.exit(1);
                   });
                }
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        } catch (e) {
            console.error('Error handling request:', e);
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    });

    server.listen(0, () => {
        const port = server.address().port;
        const authUrl = `${instanceUrl}/api/auth/github?cli=true&port=${port}`;

        console.log('\nPlease visit the following URL to authenticate:');
        console.log(authUrl);
        console.log('\nWaiting for authentication...');

        // Try to open browser
        const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
        try {
            exec(`${start} "${authUrl}"`);
        } catch {
            // Ignore error if browser can't be opened, user can click link
        }
    });
}

async function getProjectId(instanceUrl, token) {
    let projectId;

    // 1. Check for linked project
    const localConfigPath = path.join(process.cwd(), '.deployify', 'project.json');
    if (fs.existsSync(localConfigPath)) {
        try {
            const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
            if (localConfig.projectId) {
                projectId = localConfig.projectId;
            }
        } catch (e) {
            console.warn('Failed to read local project config:', e.message);
        }
    }

    // 2. Fallback to repo matching
    if (!projectId) {
        // Get Git Remote URL
        let remoteUrl;
        try {
            remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
        } catch {
            // Ignore error
        }

        let repoFullName;
        if (remoteUrl) {
            try {
                if (remoteUrl.startsWith('git@')) {
                    const match = remoteUrl.match(/:([^\/]+\/[^\.]+)(\.git)?$/);
                    if (match) repoFullName = match[1];
                } else {
                    const url = new URL(remoteUrl);
                    const pathParts = url.pathname.split('/').filter(p => p);
                    if (pathParts.length >= 2) {
                        const repo = pathParts[1].replace(/\.git$/, '');
                        repoFullName = `${pathParts[0]}/${repo}`;
                    }
                }
            } catch {
                // Fallback
            }
        }

        if (repoFullName) {
             projectId = await findProjectByRepo(instanceUrl, token, repoFullName);
        }
    }

    return projectId;
}

async function handleDeploy() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error('You must login first. Run: deployify login');
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { instanceUrl, token } = config;

    // 0. Check Git Status
    const gitStatus = getGitStatus();
    if (gitStatus) {
        console.warn('\n⚠️  Warning: You have uncommitted changes:');
        console.warn(gitStatus.split('\n').slice(0, 5).join('\n') + (gitStatus.split('\n').length > 5 ? '\n...' : ''));
        console.warn('These changes will NOT be deployed. Please commit and push them first.');
    }

    const currentBranch = getCurrentBranch();
    if (currentBranch) {
        if (isAheadOfRemote(currentBranch)) {
             console.warn(`\n⚠️  Warning: Your local branch '${currentBranch}' is ahead of remote.`);
             console.warn('Please push your changes to ensure they are deployed.');
        }
    } else {
        console.warn('\n⚠️  Warning: Could not determine current git branch.');
    }

    const projectId = await getProjectId(instanceUrl, token);

    if (!projectId) {
        console.error(`\nError: Could not find a project to deploy.`);
        console.error('No project is linked to this directory.');
        console.error('\nTo fix this, you can:');
        console.log('  1. Run `deployify link` to select an existing project');
        console.log('  2. Ensure you are in a git repository that is already connected to a project on Deployify');
        console.log('  3. Create a new project on the dashboard first: ' + instanceUrl + '/new');
        return;
    }

    console.log(`Using project: ${projectId}`);

    // 3. Trigger Deployment
    console.log(`Triggering deployment for branch '${currentBranch || 'default'}'...`);
    const result = await triggerDeployment(instanceUrl, token, projectId, currentBranch);

    console.log('\nDeployment triggered successfully!');
    if (result.deployment) {
        console.log(`Deployment ID: ${result.deployment.id}`);
        console.log(`Status: ${result.deployment.status}`);
        console.log(`\nView logs and progress at: ${instanceUrl}/dashboard/${projectId}/deployments/${result.deployment.id}`);
    } else {
        console.log(result.message || 'Deployment queued.');
    }
}

async function handleStatus() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error('You must login first. Run: deployify login');
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { instanceUrl, token } = config;

    const projectId = await getProjectId(instanceUrl, token);

    if (!projectId) {
        console.error('Error: Project not linked. Run: deployify link');
        return;
    }

    console.log(`Checking status for project: ${projectId}...`);
    const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/deployments?limit=1`, token);

    if (data.deployments && data.deployments.length > 0) {
        const d = data.deployments[0];
        console.log('\nLatest Deployment:');
        console.log(`ID:      ${d.id}`);
        console.log(`Status:  ${d.status.toUpperCase()}`);
        console.log(`Branch:  ${d.gitBranch}`);
        console.log(`Commit:  ${d.gitCommitMessage.trim()}`);
        console.log(`Author:  ${d.gitCommitAuthor}`);
        console.log(`Created: ${new Date(d.createdAt).toLocaleString()}`);
        if (d.status === 'ready' && d.url) {
            console.log(`URL:     ${d.url}`);
        }
    } else {
        console.log('No deployments found for this project.');
    }
}

async function handleLink() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error('You must login first. Run: deployify login');
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { instanceUrl, token } = config;

    console.log(`Fetching projects from ${instanceUrl}...`);

    let allProjects = [];

    // 1. Fetch personal projects
    try {
        const personalProjects = await fetchJson(`${instanceUrl}/api/projects`, token);
        if (personalProjects.projects) {
            allProjects = allProjects.concat(personalProjects.projects.map(p => ({ ...p, type: 'Personal' })));
        }
    } catch (e) {
        console.warn('Failed to fetch personal projects:', e.message);
    }

    // 2. Fetch team projects
    try {
        const teamsData = await fetchJson(`${instanceUrl}/api/teams`, token);
        if (teamsData.teams) {
            for (const team of teamsData.teams) {
                try {
                    const teamProjects = await fetchJson(`${instanceUrl}/api/projects?teamId=${team.id}`, token);
                    if (teamProjects.projects) {
                        allProjects = allProjects.concat(teamProjects.projects.map(p => ({ ...p, type: `Team: ${team.name}` })));
                    }
                } catch {
                    // Ignore error for specific team fetch
                }
            }
        }
    } catch {
        // Ignore team fetch error
    }

    if (allProjects.length === 0) {
        console.log('No projects found.');
        return;
    }

    console.log('\nSelect a project to link:');
    allProjects.forEach((p, index) => {
        console.log(`${index + 1}) ${p.name} (${p.repoFullName}) [${p.type}]`);
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    await new Promise((resolve) => {
        rl.question('\nEnter the number of the project: ', (answer) => {
            rl.close();
            const choice = parseInt(answer) - 1;
            if (isNaN(choice) || choice < 0 || choice >= allProjects.length) {
                console.error('Invalid selection.');
                resolve();
                return;
            }

            const selectedProject = allProjects[choice];
            const projectConfig = {
                projectId: selectedProject.id,
                name: selectedProject.name,
                orgId: selectedProject.teamId
            };

            const deployifyDir = path.join(process.cwd(), '.deployify');
            if (!fs.existsSync(deployifyDir)) {
                fs.mkdirSync(deployifyDir, { recursive: true });
            }

            const projectConfigPath = path.join(deployifyDir, 'project.json');
            fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2));
            console.log(`\nLinked to project ${selectedProject.name} (${selectedProject.id})`);
            console.log(`Configuration saved to ${projectConfigPath}`);

            // Add to .gitignore if needed
            try {
                const gitignorePath = path.join(process.cwd(), '.gitignore');
                let gitignoreContent = '';
                if (fs.existsSync(gitignorePath)) {
                    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                }

                if (!gitignoreContent.includes('.deployify')) {
                    fs.appendFileSync(gitignorePath, '\n.deployify\n');
                    console.log('Added .deployify to .gitignore');
                }
            } catch {
                // Ignore
            }

            resolve();
        });
    });
}

async function findProjectByRepo(instanceUrl, token, repoFullName) {
    // 1. Check personal projects
    try {
        const personalProjects = await fetchJson(`${instanceUrl}/api/projects`, token);
        if (personalProjects.projects) {
            const personalMatch = personalProjects.projects.find(p => p.repoFullName === repoFullName);
            if (personalMatch) return personalMatch.id;
        }
    } catch (e) {
        console.warn('Failed to fetch personal projects:', e.message);
    }

    // 2. Check team projects
    try {
        const teamsData = await fetchJson(`${instanceUrl}/api/teams`, token);
        if (teamsData.teams) {
            for (const team of teamsData.teams) {
                try {
                    const teamProjects = await fetchJson(`${instanceUrl}/api/projects?teamId=${team.id}`, token);
                    if (teamProjects.projects) {
                        const teamMatch = teamProjects.projects.find(p => p.repoFullName === repoFullName);
                        if (teamMatch) return teamMatch.id;
                    }
                } catch {
                    // Ignore error for specific team fetch
                }
            }
        }
    } catch {
        // Ignore team fetch error
    }

    return null;
}

async function triggerDeployment(instanceUrl, token, projectId, branch) {
    const body = branch ? { branch } : {};
    const response = await fetchJson(`${instanceUrl}/api/projects/${projectId}/deploy`, token, { method: 'POST', body });
    return response;
}

async function handleStorage(args) {
    const subcommand = args[1];
    const action = args[2];

    if (subcommand === '--help' || subcommand === '-h') {
        console.log(`
Usage: deployify storage <subcommand> [options]

Subcommands:
  list                                List all storage connectors
  validate <storage_id>              Validate a storage connection
  diagnose <storage_id>              Deep multi-layer connectivity diagnostic
  sync <storage_id>                  Sync provisioning status
  provision <type> <name>            Provision a new storage instance
  branch <storage_id> <identifier>   Provision a storage branch (PR # or branch name)
  tunnel <storage_id>                Create a secure local tunnel to your database
  backups <action> <storage_id>      Manage database backups
  migrations <action> <storage_id>   Manage database migrations
`);
        return;
    }

    if (subcommand === 'backups' && (action === '--help' || action === '-h')) {
        console.log(`
Usage: deployify storage backups <action> <storage_id> [options]

Actions:
  list <storage_id>                  List backups for an instance
  create <storage_id> [description]  Trigger a manual backup
  restore <storage_id> <backup_id>   Restore from a backup
`);
        return;
    }

    if (subcommand === 'migrations' && (action === '--help' || action === '-h')) {
        console.log(`
Usage: deployify storage migrations <action> <storage_id> [options]

Actions:
  list <storage_id>                  List migrations
  run <storage_id> [--backup] <cmd>  Run a migration command
  rollback <storage_id>              Run the configured rollback command
  status <storage_id> <op_name>      Track migration progress
  view <storage_id> <name>           View SQL content of a migration
`);
        return;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error('You must login first. Run: deployify login');
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { instanceUrl, token } = config;

    const projectId = await getProjectId(instanceUrl, token);

    if (!projectId) {
        throw new Error('Project not linked. Run: deployify link');
    }

    if (!subcommand || subcommand === 'list') {
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage`, token);
        if (data.storageConfigs && data.storageConfigs.length > 0) {
            console.log(`\nStorage Connectors for ${projectId}:`);
            console.log('--------------------------------------------------');
            data.storageConfigs.forEach(s => {
                const status = s.status === 'active' ? '✅ ACTIVE' : s.status === 'error' ? '❌ ERROR' : '⏳ ' + s.status.toUpperCase();
                console.log(`ID:     ${s.id}`);
                console.log(`Name:   ${s.name}`);
                console.log(`Type:   ${s.type.toUpperCase()}`);
                console.log(`Key:    ${s.envKey || 'DATABASE_URL'}`);
                console.log(`Status: ${status}`);
                if (s.lastError) console.log(`Error:  ${s.lastError}`);
                console.log('--------------------------------------------------');
            });
        } else {
            console.log('No storage connectors found for this project.');
        }
    } else if (subcommand === 'validate') {
        const storageId = args[2];
        if (!storageId) {
            throw new Error('Storage ID required: deployify storage validate <storage_id>');
        }
        console.log(`Validating connection for ${storageId}...`);
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/validate`, token, { method: 'POST' });
        if (data.valid) {
            console.log('✅ Connection successful!');
            if (data.latency) console.log(`Latency: ${data.latency}ms`);
        } else {
            console.log('❌ Connection failed');
            if (data.error) console.log(`Error: ${data.error}`);
        }
    } else if (subcommand === 'diagnose') {
        const storageId = args[2];
        if (!storageId) {
            throw new Error('Storage ID required: deployify storage diagnose <storage_id>');
        }
        console.log(`\n🔍 Starting multi-layer diagnostic for ${storageId}...`);
        console.log('--------------------------------------------------');

        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/diagnose`, token, { method: 'POST' });

        if (data.success && data.diagnostic) {
            const diag = data.diagnostic;
            diag.steps.forEach(step => {
                const icon = step.status === 'success' ? '✅' : step.status === 'failure' ? '❌' : '⏳';
                const latency = step.latency !== undefined ? ` (${step.latency}ms)` : '';
                console.log(`${icon} ${step.name.padEnd(25)} | ${step.status.toUpperCase()}${latency}`);
                if (step.error) console.log(`   Error: ${step.error}`);
                if (step.recommendation) console.log(`   Hint:  ${step.recommendation}`);
            });

            console.log('--------------------------------------------------');
            console.log(`Overall Latency: ${diag.overallLatency}ms`);

            if (diag.regionMismatch) {
                console.log(`\n⚠️  REGION MISMATCH DETECTED`);
                console.log(`   Service Region: ${diag.regionMismatch.serviceRegion}`);
                console.log(`   Storage Region: ${diag.regionMismatch.storageRegion}`);
            }

            console.log('\n✅ Diagnostic complete. See hints above for any failures.');
        } else {
            console.log(`❌ Diagnostic failed: ${data.error || 'Unknown error'}`);
        }
    } else if (subcommand === 'sync') {
        const storageId = args[2];
        if (!storageId) {
            throw new Error('Storage ID required: deployify storage sync <storage_id>');
        }
        console.log(`Syncing provisioning status for ${storageId}...`);
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/sync`, token);
        if (data.success) {
            console.log(`Status: ${data.status.toUpperCase()}`);
            if (data.error) console.log(`Error: ${data.error}`);
        } else {
            console.log(`❌ Sync failed: ${data.error || 'Unknown error'}`);
        }
    } else if (subcommand === 'provision') {
        const type = args[2];
        const name = args[3];
        if (!type || !name) {
            throw new Error('Usage: deployify storage provision <type> <name>');
        }
        console.log(`Provisioning new ${type} storage: ${name}...`);
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage`, token, {
            method: 'POST',
            body: { type, name, provision: true }
        });
        if (data.success) {
            console.log('✅ Provisioning started!');
            console.log(`Storage ID: ${data.storageConfig.id}`);
            console.log(`Status:     ${data.storageConfig.status.toUpperCase()}`);
            console.log('\nYou can poll for status using: deployify storage sync ' + data.storageConfig.id);
        } else {
            console.log(`❌ Provisioning failed: ${data.error || 'Unknown error'}`);
        }
    } else if (subcommand === 'branch') {
        const storageId = args[2];
        const identifier = args[3];
        if (!storageId || !identifier) {
            throw new Error('Usage: deployify storage branch <storage_id> <identifier>');
        }

        const isPr = /^\d+$/.test(identifier);
        const body = isPr ? { pullRequestNumber: parseInt(identifier) } : { branch: identifier };

        console.log(`Provisioning ephemeral branch for storage ${storageId} using identifier '${identifier}'...`);
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/branch`, token, {
            method: 'POST',
            body
        });

        if (data.success) {
            console.log('✅ Branching logic executed!');
            if (data.databaseName) console.log(`Database: ${data.databaseName}`);
            if (data.message) console.log(`Message:  ${data.message}`);
        } else {
            console.log(`❌ Branching failed: ${data.error || 'Unknown error'}`);
        }
    } else if (subcommand === 'tunnel') {
        const storageId = args[2];
        if (!storageId) {
            throw new Error('Usage: deployify storage tunnel <storage_id>');
        }

        console.log(`Initializing secure tunnel for storage ${storageId}...`);
        const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/diagnose`, token, { method: 'POST' });

        if (!data.success) {
            throw new Error(`Failed to retrieve connection details: ${data.error || 'Unknown error'}`);
        }

        // 1. Get connection string from secret (re-using sync logic for CLI if needed, but we prefer direct fetch for tunnel)
        // For security, the CLI tunnel should probably trigger a secure proxy download or use the Cloud SQL Auth Proxy
        const configs = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage`, token);
        const config = configs.storageConfigs.find(s => s.id === storageId);

        if (!config) throw new Error('Storage connector not found');

        console.log(`\nConnector: ${config.name} (${config.type.toUpperCase()})`);

        if (config.type.includes('cloud-sql')) {
            // For Cloud SQL, we help the user run the proxy
            const connStr = data.connectionString || ''; // We might need to adjust the API to return the connection name for tunnel
            const cloudSqlMatch = connStr.match(/\/cloudsql\/([a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+)/i);

            if (cloudSqlMatch) {
                const connectionName = cloudSqlMatch[1];
                const localPort = config.type.includes('postgres') ? 54321 : 33061;

                console.log(`\nTo connect locally, run the Cloud SQL Auth Proxy:`);
                console.log(`--------------------------------------------------`);
                console.log(`cloud-sql-proxy --port ${localPort} ${connectionName}`);
                console.log(`--------------------------------------------------`);
                console.log(`\nConnection string for your local tool (e.g. TablePlus, DBeaver):`);
                const protocol = config.type.includes('postgres') ? 'postgresql' : 'mysql';
                console.log(`${protocol}://deployify-sa@127.0.0.1:${localPort}/DATABASE_NAME`);
                console.log(`\nNote: Ensure you have authenticated with 'gcloud auth application-default login'`);
            } else {
                console.log('\nDirect connection string (VPN/VPC required):');
                console.log(connStr || 'Secret retrieval failed');
            }
        } else if (config.type === 'memorystore-redis') {
            console.log(`\nRedis instance is only accessible via VPC.`);
            console.log(`To connect locally, you must be on the project's authorized network or use a SSH bastion.`);
            if (config.metadata?.host) {
                console.log(`Internal IP: ${config.metadata.host}`);
            }
        } else {
            console.log(`\nConnection details for your local environment:`);
            console.log(`--------------------------------------------------`);
            // In a real CLI, we would decrypt the secret here using the user's token
            console.log(`Please use the connection string found in the dashboard for local development.`);
            console.log(`Visit: ${instanceUrl}/dashboard/${projectId}/storage`);
        }

    } else if (subcommand === 'backups') {
        const storageId = args[3];

        if (!action || !storageId) {
            console.log(`
Usage: deployify storage backups <action> <storage_id> [options]

Actions:
  list <storage_id>                  List backups for an instance
  create <storage_id> [description]  Trigger a manual backup
  restore <storage_id> <backup_id>   Restore from a backup
`);
            return;
        }

        if (action === 'list') {
            console.log(`Fetching backups for ${storageId}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/backups`, token);
            if (data.backups && data.backups.length > 0) {
                console.log(`\nBackups for ${storageId}:`);
                console.log('--------------------------------------------------');
                data.backups.forEach(b => {
                    const status = b.status === 'SUCCESSFUL' ? '✅ SUCCESS' : b.status === 'FAILED' ? '❌ FAILED' : '⏳ ' + b.status;
                    console.log(`ID:      ${b.id}`);
                    console.log(`Status:  ${status}`);
                    console.log(`Desc:    ${b.description || 'AUTOMATED'}`);
                    console.log(`Started: ${new Date(b.startTime).toLocaleString()}`);
                    console.log('--------------------------------------------------');
                });
            } else {
                console.log('No backups found for this storage connector.');
            }
        } else if (action === 'create') {
            const description = args.slice(4).join(' ') || `Manual backup via CLI at ${new Date().toISOString()}`;
            console.log(`Triggering manual backup for ${storageId}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/backups`, token, {
                method: 'POST',
                body: { description }
            });
            if (data.success) {
                console.log('✅ Backup operation triggered successfully!');
            } else {
                console.log(`❌ Failed to trigger backup: ${data.error || 'Unknown error'}`);
            }
        } else if (action === 'restore') {
            const backupId = args[4];
            if (!backupId) {
                throw new Error('Backup ID required: deployify storage backups restore <storage_id> <backup_id>');
            }
            console.log(`Restoring ${storageId} from backup ${backupId}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/backups/${backupId}/restore`, token, {
                method: 'POST'
            });
            if (data.success) {
                console.log('✅ Restore operation triggered successfully!');
                console.log('The instance will be unavailable while the restore is in progress.');
            } else {
                console.log(`❌ Restore failed: ${data.error || 'Unknown error'}`);
            }
        }
    } else if (subcommand === 'migrations') {
        const storageId = args[3];

        if (!action || !storageId) {
            console.log(`
Usage: deployify storage migrations <action> <storage_id> [options]

Actions:
  list <storage_id>                  List migrations
  run <storage_id> [--backup] <cmd>  Run a migration command
  status <storage_id> <op_name>      Track migration progress
  view <storage_id> <name>           View SQL content of a migration
`);
            return;
        }

        if (action === 'list') {
            console.log(`Fetching migrations for ${storageId}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/migrations`, token);
            if (data.migrations && data.migrations.length > 0) {
                console.log(`\nMigrations for ${storageId}:`);
                console.log('--------------------------------------------------');
                data.migrations.forEach(m => {
                    const statusIcon = m.status === 'SUCCESS' ? '✅' : m.status === 'FAILED' ? '❌' : '⏳';
                    const statusLabel = m.status.toUpperCase();
                    console.log(`${statusIcon} ${statusLabel.padEnd(8)} | ${m.name}`);
                    if (m.appliedAt) {
                        console.log(`            | Applied: ${new Date(m.appliedAt).toLocaleString()}`);
                    } else if (m.status === 'PENDING') {
                        console.log(`            | Status:  PENDING APPLICATION`);
                    }
                    if (m.provider) console.log(`            | Provider: ${m.provider.toUpperCase()}`);
                    console.log('--------------------------------------------------');
                });
            } else {
                console.log('No migrations found for this storage connector.');
            }
        } else if (action === 'run') {
            const runArgs = args.slice(4);
            const backupIdx = runArgs.indexOf('--backup');
            let takeBackup = false;
            if (backupIdx !== -1) {
                takeBackup = true;
                runArgs.splice(backupIdx, 1);
            }
            const command = runArgs.join(' ') || 'npx prisma migrate deploy';
            console.log(`Triggering migration for ${storageId} with command: ${command}${takeBackup ? ' (with pre-migration backup)' : ''}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/migrations`, token, {
                method: 'POST',
                body: { command, takeBackup }
            });
            if (data.success) {
                console.log('✅ Migration triggered successfully!');
                console.log(`Operation: ${data.operationName}`);
                console.log('\nYou can track progress using:');
                console.log(`  deployify storage migrations status ${storageId} "${data.operationName}"`);
            } else {
                console.log(`❌ Migration failed: ${data.error || 'Unknown error'}`);
            }
        } else if (action === 'rollback') {
            console.log(`Triggering rollback for ${storageId}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/migrations/rollback`, token, {
                method: 'POST'
            });
            if (data.success) {
                console.log('✅ Rollback triggered successfully!');
                console.log(`Operation: ${data.operationName}`);
                console.log('\nYou can track progress using:');
                console.log(`  deployify storage migrations status ${storageId} "${data.operationName}"`);
            } else {
                console.log(`❌ Rollback failed: ${data.error || 'Unknown error'}`);
            }
        } else if (action === 'status') {
            const operationName = args[4];
            if (!operationName) {
                throw new Error('Operation name required: deployify storage migrations status <storage_id> <operation_name>');
            }
            console.log(`Fetching status for operation: ${operationName}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/migrations?operationId=${encodeURIComponent(operationName)}`, token);
            if (data.success) {
                console.log(`\nStatus: ${data.status}`);
                if (data.error) console.log(`Error:  ${data.error}`);
                if (data.logs) {
                    console.log('\nLogs:');
                    console.log('--------------------------------------------------');
                    console.log(data.logs);
                    console.log('--------------------------------------------------');
                }
            } else {
                console.log(`❌ Failed to get status: ${data.error || 'Unknown error'}`);
            }
        } else if (action === 'view') {
            const migrationName = args[4];
            if (!migrationName) {
                throw new Error('Migration name required: deployify storage migrations view <storage_id> <migration_name>');
            }
            console.log(`Fetching SQL content for ${migrationName}...`);
            const data = await fetchJson(`${instanceUrl}/api/projects/${projectId}/storage/${storageId}/migrations/content?name=${encodeURIComponent(migrationName)}`, token);
            if (data.success) {
                console.log(`\nSQL Content for ${migrationName}:`);
                console.log('--------------------------------------------------');
                console.log(data.content);
                console.log('--------------------------------------------------');
            } else {
                console.log(`❌ Failed to fetch content: ${data.error || 'Unknown error'}`);
            }
        } else {
            console.log(`Unknown migration action: ${action}`);
            console.log('Usage:');
            console.log('  deployify storage migrations list <storage_id>');
            console.log('  deployify storage migrations run <storage_id> [--backup] <command>');
            console.log('  deployify storage migrations status <storage_id> <operation_name>');
            console.log('  deployify storage migrations view <storage_id> <migration_name>');
        }
    } else {
        console.log(`Unknown storage subcommand: ${subcommand}`);
        console.log('Usage:');
        console.log('  deployify storage list');
        console.log('  deployify storage validate <storage_id>');
        console.log('  deployify storage diagnose <storage_id>');
        console.log('  deployify storage sync <storage_id>');
        console.log('  deployify storage provision <type> <name>');
        console.log('  deployify storage migrations <list|run> <storage_id> [command]');
    }
}

async function fetchJson(url, token, options = {}) {
    const headers = {
        'Cookie': `deployify_session=${token}`, // Send session cookie
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const fetchOptions = {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    };

    try {
        const res = await fetch(url, fetchOptions);

        const contentType = res.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            // If not JSON, try to read text
            const text = await res.text();
            if (!res.ok) {
                 throw new Error(`Request failed with status ${res.status}: ${text.substring(0, 100)}`);
            }
            // If success but not JSON, return empty object or text?
            // Existing logic expected object.
            try {
                data = JSON.parse(text);
            } catch {
                data = {};
            }
        }

        if (!res.ok) {
            const errorMessage = (data && data.error) ? data.error : `Request failed with status ${res.status}`;
            throw new Error(errorMessage);
        }

        return data || {};
    } catch (e) {
        throw e;
    }
}

function getGitStatus() {
    try {
        // --porcelain gives a machine-readable output. If empty, clean.
        return execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return null;
    }
}

function getCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return null;
    }
}

function isAheadOfRemote(branch) {
    try {
        // Check if local branch is ahead of origin/branch
        // git rev-list --left-right --count origin/main...HEAD
        // Returns "0 1" if ahead by 1. "1 0" if behind by 1.
        // We assume 'origin' is the remote.
        const output = execSync(`git rev-list --left-right --count origin/${branch}...HEAD`).toString().trim();
        const [, ahead] = output.split(/\s+/).map(Number);
        return ahead > 0;
    } catch {
        // If upstream not configured or error, assume false or handle elsewhere
        return false;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    getProjectId,
    fetchJson,
    getCurrentBranch,
    getGitStatus,
    isAheadOfRemote
};
