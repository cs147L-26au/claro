import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGroundedPlan } from '../server/decision-plan.mjs';

const source = { title: 'Supplier contact page', url: 'https://supplier.example/contact' };
const input = { title: 'Choose a supplier', description: 'We need reliable weekly deliveries.', context: '', startDate: '2026-11-19', dueDate: '' };
const contact = (value = '(415) 555-0123', overrides = {}) => ({ label: 'Phone', kind: 'phone', value, sourceUrl: source.url, ...overrides });
function readyPlan(item = contact()) {
  return {
    status: 'ready', questions: [],
    recommendation: { name: 'Supplier', headline: 'Choose Supplier', reason: 'Suitable for weekly deliveries.', tradeoff: 'Confirm the quote first.',
      website: source.url, contacts: [item], specs: [] },
    durationDays: 1, scheduleReason: 'Request the quote today.',
    days: [{ day: 1, actions: [{ title: 'Request a quote', details: 'Confirm the weekly quantity and total delivered cost.', resources: [] }] }],
    sources: [source], assumptions: [],
  };
}
const research = text => ({ text, sources: [source] });
const rejectsContact = (plan, text) => assert.throws(() => validateGroundedPlan(plan, input, research(text)),
  error => error.status === 502 && /contact detail could not be verified/.test(error.message));

test('a phone followed by a numbered line remains verified', () => {
  const result = validateGroundedPlan(readyPlan(), input, research('Phone: (415) 555-0123.\n2. Weekly deliveries are available.'));
  assert.equal(result.recommendation.contacts[0].value, '(415) 555-0123');
});

test('phone evidence tolerates Unicode hyphens and horizontal spaces without changing digits', () => {
  const result = validateGroundedPlan(readyPlan(contact('+1 (415) 555-0123')), input,
    research('Phone: +1\u202f(415)\u00a0555\u20110123.'));
  assert.equal(result.recommendation.contacts[0].value, '+1 (415) 555-0123');
});

test('explicit user contacts preserve line boundaries and need no published source', () => {
  const result = validateGroundedPlan(readyPlan(contact('(415) 555-0123', { sourceUrl: '' })),
    { ...input, context: 'Our contact: (415) 555-0123.\n2. Ask for a quote.' }, research('Supplier details.'));
  assert.equal(result.recommendation.contacts[0].sourceUrl, '');
});

test('action resources use the same exact-digit phone evidence check', () => {
  const plan = readyPlan({ label: 'Supplier page', kind: 'link', value: source.url, sourceUrl: source.url });
  plan.days[0].actions[0].resources = [contact()];
  const result = validateGroundedPlan(plan, input, research('Phone: 415\u2011555\u20110123.\n2. Ask about delivery.'));
  assert.equal(result.days[0].actions[0].resources[0].value, '(415) 555-0123');
});

test('country codes are never inferred or removed', t => {
  t.mock.method(console, 'warn', () => {});
  rejectsContact(readyPlan(contact('415-555-0123')), 'Phone: +1 415-555-0123.');
  rejectsContact(readyPlan(contact('+1 415-555-0123')), 'Phone: 415-555-0123.');
});

test('separate lines are never joined into a new phone number', t => {
  t.mock.method(console, 'warn', () => {});
  rejectsContact(readyPlan(contact('415-555-0123')), 'Reference: 415-555\n0123 units requested.');
});

test('unverified contacts still fail and diagnostics contain only safe metadata', t => {
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const plan = readyPlan();
  rejectsContact(plan, 'Supplier website is available, but no phone is published.');
  assert.equal(plan.recommendation.contacts[0].value, '(415) 555-0123');
  assert.deepEqual(warnings, [['[claro:decision-plan] Contact verification failed', { kind: 'phone', hasSource: true }]]);
});

test('email and address checks retain their existing normalized-text behavior', () => {
  const plan = readyPlan(contact('sales@supplier.example', { kind: 'email', label: 'Email' }));
  plan.recommendation.contacts.push(contact('100 Example Street', { kind: 'text', label: 'Address' }));
  const result = validateGroundedPlan(plan, input, research('Email: SALES@SUPPLIER.EXAMPLE. Address: 100\nExample Street.'));
  assert.equal(result.recommendation.contacts.length, 2);
});
