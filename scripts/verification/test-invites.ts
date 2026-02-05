import { teamInviteEmail } from '../../src/lib/email/templates';
import * as assert from 'assert';

console.log('Verifying Invite Logic...');

// Test 1: Email Template
console.log('Testing Email Template...');
const teamName = 'Acme Corp';
const inviteUrl = 'https://deployify.io/join?token=123';
const { subject, html } = teamInviteEmail(teamName, inviteUrl);

assert.strictEqual(subject, 'Join Acme Corp on Deployify', 'Subject mismatch');
assert.ok(html.includes('Acme Corp'), 'HTML should contain team name');
assert.ok(html.includes(inviteUrl), 'HTML should contain invite URL');
console.log('✅ Email Template verified');

console.log('🎉 All Invite tests passed!');
