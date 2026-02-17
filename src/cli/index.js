#!/usr/bin/env node

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
const https = require('https');
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
        case 'deploy':
            handleDeploy().catch(err => console.error('Deployment failed:', err.message));
            break;
        case 'help':
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

    // 1. Get Git Remote URL
    let remoteUrl;
    try {
        remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
    } catch (e) {
        throw new Error('Not a git repository or no remote "origin" found. Please run this command from within a git repository connected to GitHub.');
    }

    // Parse owner/repo
    // Formats:
    // git@github.com:owner/repo.git
    // https://github.com/owner/repo.git
    // https://github.com/owner/repo

    let repoFullName;
    try {
        if (remoteUrl.startsWith('git@')) {
            const match = remoteUrl.match(/:([^\/]+\/[^\.]+)(\.git)?$/);
            if (match) repoFullName = match[1];
        } else {
            const url = new URL(remoteUrl);
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length >= 2) {
                // Remove .git if present
                const repo = pathParts[1].replace(/\.git$/, '');
                repoFullName = `${pathParts[0]}/${repo}`;
            }
        }
    } catch (e) {
        // Fallback or error
    }

    if (!repoFullName) {
        throw new Error(`Could not parse repository name from remote URL: ${remoteUrl}`);
    }

    console.log(`Deploying ${repoFullName} to ${instanceUrl}...`);

    // 2. Find Project
    const projectId = await findProjectByRepo(instanceUrl, token, repoFullName);

    if (!projectId) {
        console.error(`\nError: Project for repository "${repoFullName}" not found.`);
        console.error('Please create the project in the dashboard first.');
        return;
    }

    // 3. Trigger Deployment
    console.log('Triggering deployment...');
    const result = await triggerDeployment(instanceUrl, token, projectId);

    console.log('\nDeployment triggered successfully!');
    if (result.deployment) {
        console.log(`Deployment ID: ${result.deployment.id}`);
        console.log(`Status: ${result.deployment.status}`);
        console.log(`\nView logs and progress at: ${instanceUrl}/dashboard/${projectId}/deployments/${result.deployment.id}`);
    } else {
        console.log(result.message || 'Deployment queued.');
    }
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
                } catch (e) {
                    // Ignore error for specific team fetch
                }
            }
        }
    } catch (e) {
        // Ignore team fetch error
    }

    return null;
}

async function triggerDeployment(instanceUrl, token, projectId) {
    const response = await fetchJson(`${instanceUrl}/api/projects/${projectId}/deploy`, token, { method: 'POST' });
    return response;
}

function fetchJson(url, token, options = {}) {
    return new Promise((resolve, reject) => {
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            return reject(new Error(`Invalid URL: ${url}`));
        }

        const lib = urlObj.protocol === 'https:' ? https : http;

        const reqOptions = {
            method: options.method || 'GET',
            headers: {
                'Cookie': `deployify_session=${token}`, // Send session cookie
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const req = lib.request(url, reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                // Attempt to parse JSON regardless of status code to get error message
                let json;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    // If not JSON, use raw text if error
                    if (res.statusCode >= 400) {
                        return reject(new Error(`Request failed with status ${res.statusCode}: ${data.substring(0, 100)}`));
                    }
                }

                if (res.statusCode >= 400) {
                    const errorMessage = json && json.error ? json.error : `Request failed with status ${res.statusCode}`;
                    reject(new Error(errorMessage));
                } else {
                    resolve(json || {});
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

main();
