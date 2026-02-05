
import { parseLogEntry } from '../../src/lib/logging/parser';
import * as assert from 'assert';

console.log('Verifying Log Parser...');

// Test 1: Valid Log Entry
console.log('Testing Valid Log Entry...');
const validLog = {
    timestamp: '2023-10-27T10:00:00Z',
    severity: 'INFO',
    textPayload: 'System started',
    resource: {
        type: 'cloud_run_revision',
        labels: { service_name: 'test' }
    },
    logName: 'projects/test/logs/stdout',
    insertId: '123'
};
const parsedValid = parseLogEntry(JSON.stringify(validLog));
assert.ok(parsedValid, 'Should return a result');
assert.ok(!('error' in (parsedValid as any)), 'Should not be an error');
assert.strictEqual((parsedValid as any).textPayload, 'System started', 'Payload mismatch');
console.log('✅ Valid Log Entry verified');

// Test 2: Error Message from Server
console.log('Testing Error Message...');
const errorMsg = { error: 'Connection lost' };
const parsedError = parseLogEntry(JSON.stringify(errorMsg));
assert.ok(parsedError, 'Should return a result');
assert.ok('error' in (parsedError as any), 'Should be an error object');
assert.strictEqual((parsedError as any).error, 'Connection lost', 'Error message mismatch');
console.log('✅ Error Message verified');

// Test 3: Invalid JSON
console.log('Testing Invalid JSON...');
const parsedInvalid = parseLogEntry('invalid json');
assert.strictEqual(parsedInvalid, null, 'Should return null for invalid JSON');
console.log('✅ Invalid JSON verified');

console.log('🎉 All Log Parser tests passed!');
