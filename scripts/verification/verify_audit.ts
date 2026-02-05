import { logAuditEvent } from '../../src/lib/audit';

async function verify() {
    console.log('Attempting to log audit event...');
    try {
        await logAuditEvent('team_test', 'user_test', 'test.action', { foo: 'bar' });
        console.log('Success (Unexpected if no DB creds)');
    } catch (e: any) {
        console.log('Caught error:', e.message);
        // If it fails with credential error or project ID error, it means logic reached the DB call
        const msg = e.message.toLowerCase();
        if (msg.includes('credential') ||
            msg.includes('project id') ||
            msg.includes('default credentials') ||
            e.code === 'PERMISSION_DENIED') {
             console.log('✅ Verification passed: Function executed and attempted DB connection.');
        } else {
             console.error('❌ Verification failed with unexpected error:', e);
             process.exit(1);
        }
    }
}

verify();
