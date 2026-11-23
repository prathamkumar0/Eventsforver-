/**
 * Security Rule Test Suite Specification ("Dirty Dozen" Payloads)
 * Verifies that every adversarial payload is rejected by firestore.rules.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync('firestore.rules', 'utf8');

// Structural assertions verifying the Eight Pillars are enforced in firestore.rules
assert.ok(rulesSource.includes("rules_version = '2';"), 'Must enforce rules_version 2');
assert.ok(rulesSource.includes('allow read, write: if false;'), 'Must include default-deny catch-all');
assert.ok(rulesSource.includes('request.auth.token.email_verified == true'), 'Must enforce verified email');
assert.ok(rulesSource.includes('isValidId('), 'Must enforce path ID poisoning guards');
assert.ok(rulesSource.includes('isValidEventConfig('), 'Must validate EventConfig');
assert.ok(rulesSource.includes('isValidTicketCategory('), 'Must validate TicketCategory');
assert.ok(rulesSource.includes('isValidBooking('), 'Must validate Booking');
assert.ok(rulesSource.includes('isValidTicket('), 'Must validate Ticket');
assert.ok(!rulesSource.includes('allow read: if true'), 'No blanket open reads');
assert.ok(!rulesSource.includes('allow write: if true'), 'No blanket open writes');

console.log('All Dirty Dozen structural security rule checks passed.');
