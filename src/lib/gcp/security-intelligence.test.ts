import { test } from 'node:test';
import assert from 'node:assert';
import { detectSecurityThreats } from './monitoring';

test('detectSecurityThreats Logic', async (t) => {
    const mockStorage = {
        id: 'test-db',
        name: 'PROD-DB',
        type: 'cloud-sql-postgres'
    } as any;

    await t.test('should detect SQL injection patterns', async () => {
        const logs = [
            {
                timestamp: new Date().toISOString(),
                severity: 'INFO',
                textPayload: 'SELECT * FROM users WHERE id = 1 OR 1=1',
                insertId: '1'
            }
        ] as any;

        const report = await detectSecurityThreats(mockStorage, logs);
        assert.strictEqual(report.activeThreats.length, 1);
        assert.strictEqual(report.activeThreats[0].type, 'SQL_INJECTION');
        assert.strictEqual(report.activeThreats[0].severity, 'CRITICAL');
        assert.strictEqual(report.riskScore < 100, true);
    });

    await t.test('should detect brute force attempts', async () => {
        const logs = [
            {
                timestamp: new Date().toISOString(),
                severity: 'WARNING',
                textPayload: 'password authentication failed for user "admin"',
                insertId: '2'
            }
        ] as any;

        const report = await detectSecurityThreats(mockStorage, logs);
        assert.strictEqual(report.activeThreats.length, 1);
        assert.strictEqual(report.activeThreats[0].type, 'BRUTE_FORCE');
        assert.strictEqual(report.activeThreats[0].severity, 'HIGH');
    });

    await t.test('should extract source IP if present', async () => {
        const logs = [
            {
                timestamp: new Date().toISOString(),
                severity: 'INFO',
                textPayload: 'Failed login from 1.2.3.4',
                insertId: '3'
            }
        ] as any;

        // This requires 'password authentication failed' or similar to trigger brute force detection in current impl
        logs[0].textPayload = 'password authentication failed for user "postgres" from 1.2.3.4';

        const report = await detectSecurityThreats(mockStorage, logs);
        assert.strictEqual(report.activeThreats[0].sourceIp, '1.2.3.4');
    });

    await t.test('should return no threats for clean logs', async () => {
        const logs = [
            {
                timestamp: new Date().toISOString(),
                severity: 'INFO',
                textPayload: 'Database connection established',
                insertId: '4'
            }
        ] as any;

        const report = await detectSecurityThreats(mockStorage, logs);
        assert.strictEqual(report.activeThreats.length, 0);
        assert.strictEqual(report.riskScore, 100);
    });
});
