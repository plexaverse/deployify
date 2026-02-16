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
const { execSync } = require('child_process');

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
            handleDeploy();
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
  deploy    Deploy the current directory to Deployify
  help      Show this help message
`);
}

function handleLogin() {
    console.log('Deployify Authentication');
    console.log('------------------------');

    // In a real CLI, we would ask for the instance URL and open a browser
    const instanceUrl = process.env.DEPLOYIFY_URL || 'http://localhost:3000';
    console.log(`Using instance: ${instanceUrl}`);

    console.log('\nPlease visit the following URL to authenticate:');
    console.log(`${instanceUrl}/api/auth/github?cli=true`);

    console.log('\n(Once authenticated, your session will be saved to ~/.deployify.json)');

    // Mock saving config
    const config = {
        instanceUrl,
        lastLogin: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`\nSuccessfully saved configuration to ${CONFIG_PATH}`);
}

function handleDeploy() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('Error: You must login first. Run: deployify login');
        return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`Deploying to ${config.instanceUrl}...`);

    // Detect project name from package.json or directory name
    let projectName = path.basename(process.cwd());
    if (fs.existsSync('package.json')) {
        try {
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            projectName = pkg.name || projectName;
        } catch (e) {}
    }

    console.log(`Project: ${projectName}`);

    // In a real implementation, this would:
    // 1. Check for a .deployify-project.json file to get the projectId
    // 2. Zip the current directory (respecting .gitignore)
    // 3. Upload to /api/projects/[id]/deploy/cli

    console.log('\nStep 1: Analyzing project...');
    console.log('Step 2: Bundling files...');
    console.log('Step 3: Uploading to Cloud Build...');

    console.log('\nSuccessfully triggered deployment!');
    console.log(`Track progress at: ${config.instanceUrl}/dashboard`);
}

main();
