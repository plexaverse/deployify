import fs from 'fs';
import path from 'path';

function loadEnv(filePath: string) {
    if (fs.existsSync(filePath)) {
        console.log(`Loading environment from ${filePath}...`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1];
                    let value = match[2];
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }
}

async function main() {
    console.log('\x1b[36m%s\x1b[0m', 'Starting Pre-Launch Audit...\n');

    // Load environment variables
    loadEnv(path.join(process.cwd(), '.env'));
    loadEnv(path.join(process.cwd(), '.env.local'));

    let errors = 0;
    let warnings = 0;

    // ==========================================
    // 1. Environment Variables Check
    // ==========================================
    console.log('\x1b[1m%s\x1b[0m', '1. Checking Environment Variables...');
    let envExamplePath = path.join(process.cwd(), 'env.example');
    if (!fs.existsSync(envExamplePath)) {
        envExamplePath = path.join(process.cwd(), '.env.example');
    }

    let firebaseCredsAvailable = false;

    try {
        if (fs.existsSync(envExamplePath)) {
            const envContent = fs.readFileSync(envExamplePath, 'utf-8');
            const lines = envContent.split('\n');
            const requiredVars: string[] = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const match = trimmed.match(/^([^=]+)=/);
                    if (match) {
                        requiredVars.push(match[1]);
                    }
                }
            }

            const missingVars: string[] = [];
            for (const key of requiredVars) {
                if (!process.env[key]) {
                    missingVars.push(key);
                }
            }

            if (missingVars.length > 0) {
                console.error('\x1b[31mFAIL: Missing environment variables:\x1b[0m');
                missingVars.forEach(v => console.error(`  - ${v}`));
                console.log('\x1b[33m  (Hint: Copy env.example to .env.local and fill in the values)\x1b[0m');
                errors++;
            } else {
                console.log('\x1b[32mPASS: All required environment variables are set.\x1b[0m');
            }

            // Check if we have enough to try Firebase
            if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID)) {
                firebaseCredsAvailable = true;
            }

        } else {
            console.warn('\x1b[33mWARN: env.example not found, skipping env var check.\x1b[0m');
            warnings++;
        }
    } catch (error) {
        console.error('\x1b[31mERROR: Failed to check environment variables:\x1b[0m', error);
        errors++;
    }

    // ==========================================
    // 2. Firestore Indexes Check
    // ==========================================
    console.log('\n\x1b[1m%s\x1b[0m', '2. Checking Firestore Indexes...');
    const indexesPath = path.join(process.cwd(), 'firestore.indexes.json');

    try {
        if (fs.existsSync(indexesPath)) {
            const content = fs.readFileSync(indexesPath, 'utf-8');
            try {
                JSON.parse(content);
                console.log('\x1b[32mPASS: firestore.indexes.json is valid JSON.\x1b[0m');

                if (firebaseCredsAvailable) {
                    console.log('  Attempting to verify indexes with a live query...');
                    try {
                        // Dynamic import to avoid crash if deps are missing or env vars cause issues on load
                        const { initializeApp, getApps, cert } = await import('firebase-admin/app');
                        const { getFirestore } = await import('firebase-admin/firestore');

                        let app;
                        if (getApps().length === 0) {
                            app = initializeApp({
                                credential: cert({
                                    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID,
                                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                                })
                            });
                        } else {
                            app = getApps()[0];
                        }

                        const db = getFirestore(app);

                        // Attempt a query that requires an index: projects ordered by updatedAt desc
                        // Index in file: collectionGroup: "projects", fields: userId ASC, updatedAt DESC.
                        // So we need a query that uses this composite index.
                        // .where('userId', '==', 'audit-test').orderBy('updatedAt', 'desc')

                        await db.collection('projects')
                            .where('userId', '==', 'audit-test')
                            .orderBy('updatedAt', 'desc')
                            .limit(1)
                            .get();

                        console.log('\x1b[32mPASS: Live query requiring "projects" index succeeded (or index exists).\x1b[0m');

                    } catch (e: unknown) {
                        const error = e as { code?: number; details?: string; message?: string };
                        if (error.code === 9 && error.details && error.details.includes('index')) {
                             // FAILED_PRECONDITION is often code 9
                            console.error('\x1b[31mFAIL: Firestore index missing or not ready.\x1b[0m');
                            console.error(`  Error: ${error.message}`); // Fixed: accessing message directly might not work if not casted properly, but handled in catch block above
                            errors++;
                        } else if (error.code === 7) { // PERMISSION_DENIED
                             console.warn('\x1b[33mWARN: Permission denied when checking Firestore. Check service account roles.\x1b[0m');
                             warnings++;
                        } else {
                            // Other errors might be connectivity, auth, etc.
                             // eslint-disable-next-line @typescript-eslint/no-explicit-any
                             console.warn(`\x1b[33mWARN: Could not verify live index: ${(e as any).message}\x1b[0m`);
                             warnings++;
                        }
                    }

                } else {
                    console.warn('\x1b[33mWARN: Skipping live Firestore check (missing credentials).\x1b[0m');
                    warnings++;
                }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                console.error('\x1b[31mFAIL: firestore.indexes.json is invalid JSON.\x1b[0m');
                errors++;
            }
        } else {
             console.error('\x1b[31mFAIL: firestore.indexes.json not found.\x1b[0m');
             errors++;
        }
    } catch (error) {
        console.error('\x1b[31mERROR: Failed during Firestore check:\x1b[0m', error);
        errors++;
    }

    // ==========================================
    // 3. API Routes Check
    // ==========================================
    console.log('\n\x1b[1m%s\x1b[0m', '3. Checking API Routes...');
    const apiDir = path.join(process.cwd(), 'src/app/api');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
        // Check if server is up
        const serverUp = await fetch(baseUrl).then(() => true).catch(() => false);

        if (!serverUp) {
            console.warn(`\x1b[33mWARN: Server at ${baseUrl} is not reachable. Skipping API route checks.\x1b[0m`);
            console.warn('  (Hint: Run "npm run dev" or "npm start" in another terminal before running audit)');
            warnings++;
        } else {
            const routes = findRoutes(apiDir);
            console.log(`Found ${routes.length} API routes.`);

            let apiFailures = 0;
            for (const routeFile of routes) {
                // Convert file path to URL path
                let urlPath = path.relative(apiDir, routeFile);
                urlPath = urlPath.replace(/\\/g, '/'); // Windows fix
                urlPath = urlPath.replace('/route.ts', '');

                // Handle dynamic segments
                urlPath = urlPath
                    .replace(/\[\.\.\.[^\]]+\]/g, 'audit-slug')
                    .replace(/\[[^\]]+\]/g, 'audit-id');

                const url = `${baseUrl}/api/${urlPath}`;

                try {
                    const res = await fetch(url);
                    if (res.status >= 500) {
                        console.error(`\x1b[31mFAIL: ${url} returned ${res.status}\x1b[0m`);
                        apiFailures++;
                    }
                } catch (e: unknown) {
                    const error = e as Error;
                    console.error(`\x1b[31mFAIL: ${url} - ${error.message}\x1b[0m`);
                    apiFailures++;
                }
            }

            if (apiFailures > 0) {
                console.error(`\x1b[31m${apiFailures} API routes failed.\x1b[0m`);
                errors++;
            } else {
                console.log('\x1b[32mPASS: All API routes reachable (no 5xx errors).\x1b[0m');
            }
        }

    } catch (error) {
        console.error('\x1b[31mERROR: Failed during API check:\x1b[0m', error);
        errors++;
    }

    // ==========================================
    // Summary
    // ==========================================
    console.log('\n==========================================');
    if (errors > 0) {
        console.log(`\x1b[31mAUDIT FAILED with ${errors} errors and ${warnings} warnings.\x1b[0m`);
        process.exit(1);
    } else {
        if (warnings > 0) {
             console.log(`\x1b[33mAUDIT PASSED with ${warnings} warnings.\x1b[0m`);
        } else {
             console.log('\x1b[32mAUDIT PASSED PERFECTLY.\x1b[0m');
        }
        process.exit(0);
    }
}

function findRoutes(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findRoutes(filePath));
        } else {
            if (file === 'route.ts') {
                results.push(filePath);
            }
        }
    }
    return results;
}

main();
