import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkSecurityPosture } from './security-auditor';
import type { StorageConfig } from '@/types';

describe('Security Auditor', () => {
    const mockStorage: StorageConfig = {
        id: 'test-db',
        type: 'cloud-sql-postgres',
        name: 'Test Database',
        status: 'active',
        environment: 'both',
        createdAt: new Date(),
        updatedAt: new Date(),
        ssl: true,
        metadata: {
            iamAuth: true,
            deletionProtection: true,
            region: 'us-central1'
        }
    };

    it('should return a perfect score for a hardened connector', () => {
        const posture = checkSecurityPosture(mockStorage, 'us-central1');
        assert.strictEqual(posture.score, 100);
        assert.strictEqual(posture.grade, 'A');
        assert.strictEqual(posture.risks.length, 0);
    });

    it('should flag unencrypted connections', () => {
        const weakStorage = { ...mockStorage, ssl: false };
        const posture = checkSecurityPosture(weakStorage as StorageConfig, 'us-central1');
        assert.strictEqual(posture.score, 75);
        assert.ok(posture.risks.some(r => r.id === 'unencrypted_connection'));
    });

    it('should flag legacy password auth for Cloud SQL', () => {
        const legacyStorage = {
            ...mockStorage,
            metadata: { ...mockStorage.metadata, iamAuth: false, password: 'some-password' }
        };
        const posture = checkSecurityPosture(legacyStorage as StorageConfig, 'us-central1');
        assert.ok(posture.score < 100);
        assert.ok(posture.risks.some(r => r.id === 'password_auth_used'));
    });

    it('should flag disabled deletion protection', () => {
        const riskyStorage = {
            ...mockStorage,
            metadata: { ...mockStorage.metadata, deletionProtection: false }
        };
        const posture = checkSecurityPosture(riskyStorage as StorageConfig, 'us-central1');
        assert.ok(posture.risks.some(r => r.id === 'deletion_protection_disabled'));
    });

    it('should flag regional mismatch', () => {
        const posture = checkSecurityPosture(mockStorage, 'europe-west1');
        assert.ok(posture.risks.some(r => r.id === 'regional_mismatch'));
    });

    it('should flag unmanaged firewall policy for external connectors', () => {
        const externalStorage: StorageConfig = {
            ...mockStorage,
            type: 'supabase',
            metadata: {
                ...mockStorage.metadata,
                firewallSynced: false
            }
        };
        const posture = checkSecurityPosture(externalStorage, 'us-central1');
        assert.strictEqual(posture.score, 85);
        assert.ok(posture.risks.some(r => r.id === 'unmanaged_firewall_policy'));
    });
});
