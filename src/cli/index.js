#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Deployify CLI
 *
 * Usage:
 *  pnpm dlx deployify login
 *  pnpm dlx deployify deploy
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { exec, execSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];

const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.deployify.json');

function main() {
    if (!command) {
        showHelp();
        return;
    }

    switch (command) {
        case 'login':
            handleLogin();
            break;
        case 'link':
            handleLink().catch(err => console.error('Link failed:', err.message));
            break;
        case 'deploy':
            handleDeploy().catch(err => console.error('Deployment failed:', err.message));
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            // Ignore error if browser can't be opened, user can click link
        }
    });
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

    let projectId;

    // 1. Check for linked project
    const localConfigPath = path.join(process.cwd(), '.deployify', 'project.json');
    if (fs.existsSync(localConfigPath)) {
        try {
            const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
            if (localConfig.projectId) {
                projectId = localConfig.projectId;
                console.log(`Using linked project: ${localConfig.name || projectId}`);
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
            // Ignore error here, will be handled if no projectId found
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
             console.log(`Deploying ${repoFullName} to ${instanceUrl}...`);
             projectId = await findProjectByRepo(instanceUrl, token, repoFullName);
        }
    }

    if (!projectId) {
        console.error(`\nError: Could not find a project to deploy.`);
        console.error('Either link a project using `deployify link` or ensure you are in a git repo connected to a Deployify project.');
        return;
    }

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
        return execSync('git status --porcelain').toString().trim();
    } catch {
        return null;
    }
}

function getCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
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

main();
