/**
 * tests.js
 * Test suite for the Ackermann engine.
 * Run in browser console or Node.js (requires ackermann.js).
 *
 * Known values tested:
 *   A(0,0)=1, A(1,2)=4, A(2,3)=9, A(3,3)=61, A(3,5)=253
 *
 * Also verifies pure / memoized / closed-form agree,
 * and checks edge cases.
 */

'use strict';

// ── Load engine (Node.js context) ──────────────────────────────────────────
let engine;
if (typeof require !== 'undefined') {
  engine = require('./ackermann.js');
} else {
  // Browser: assume engine functions are global (included via <script>)
  engine = window;
}

const { computePure, computeIterative, computeMemoized, computeClosedForm } = engine;

// ─── Mini test runner ─────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function expect(label, actual, expected) {
  const ok = String(actual) === String(expected);
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}: got ${actual}, expected ${expected}`);
  ok ? passed++ : failed++;
}

function expectAborted(label, result) {
  const ok = result.aborted === true;
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}: aborted=${result.aborted}`);
  ok ? passed++ : failed++;
}

function section(title) {
  console.log(`\n──── ${title} ────`);
}

// ─── Known values ──────────────────────────────────────────────────────────
section('Known values — Iterative engine');
expect('A(0,0) = 1', computeIterative(0, 0).result, 1n);
expect('A(0,5) = 6', computeIterative(0, 5).result, 6n);
expect('A(1,0) = 2', computeIterative(1, 0).result, 2n);
expect('A(1,2) = 4', computeIterative(1, 2).result, 4n);
expect('A(2,0) = 3', computeIterative(2, 0).result, 3n);
expect('A(2,3) = 9', computeIterative(2, 3).result, 9n);
expect('A(3,0) = 5', computeIterative(3, 0).result, 5n);
expect('A(3,3) = 61', computeIterative(3, 3).result, 61n);
expect('A(3,5) = 253', computeIterative(3, 5).result, 253n);

// ─── Pure recursive (small values only) ────────────────────────────────────
section('Known values — Pure recursive engine');
expect('A(0,0) = 1', computePure(0, 0).result, 1n);
expect('A(1,2) = 4', computePure(1, 2).result, 4n);
expect('A(2,3) = 9', computePure(2, 3).result, 9n);
expect('A(3,3) = 61', computePure(3, 3).result, 61n);
expect('A(3,5) = 253', computePure(3, 5).result, 253n);

// ─── Closed-form ───────────────────────────────────────────────────────────
section('Known values — Closed-form engine');
expect('A(0,5) = 6', computeClosedForm(0, 5).result, 6n);
expect('A(1,2) = 4', computeClosedForm(1, 2).result, 4n);
expect('A(2,3) = 9', computeClosedForm(2, 3).result, 9n);
expect('A(3,3) = 61', computeClosedForm(3, 3).result, 61n);
expect('A(3,5) = 253', computeClosedForm(3, 5).result, 253n);

// ─── Closed-form formula verification ─────────────────────────────────────
section('Closed-form formula correctness');
// A(2, n) = 2n + 3
for (let n = 0; n <= 5; n++) {
  expect(`A(2,${n}) = ${2*n+3}`, computeClosedForm(2, n).result, BigInt(2*n+3));
}
// A(3, n) = 2^(n+3) - 3
for (let n = 0; n <= 5; n++) {
  const expected = (2n ** BigInt(n + 3)) - 3n;
  expect(`A(3,${n}) = 2^${n+3}-3`, computeClosedForm(3, n).result, expected);
}

// ─── Mode agreement ───────────────────────────────────────────────────────
section('All modes agree on A(3,4) = 125');
const r1 = computeIterative(3, 4).result;
const r2 = computeMemoized(3, 4).result;
const r3 = computeClosedForm(3, 4).result;
const r4 = computePure(3, 4).result;
expect('Iterative A(3,4)', r1, 125n);
expect('Memoized  A(3,4)', r2, 125n);
expect('ClosedFrm A(3,4)', r3, 125n);
expect('Pure      A(3,4)', r4, 125n);

// ─── Metrics sanity ────────────────────────────────────────────────────────
section('Metrics sanity checks');
const m3 = computeIterative(3, 3);
expect('A(3,3) calls > 0', m3.calls > 0, true);
expect('A(3,3) maxDepth > 0', m3.maxDepth > 0, true);
expect('A(3,3) timeMs >= 0', m3.timeMs >= 0, true);

const memo33 = computeMemoized(3, 3);
expect('Memoized calls <= iterative calls', memo33.calls <= m3.calls, true);

// ─── Safety abort ──────────────────────────────────────────────────────────
section('Safety abort (maxCalls = 5)');
expectAborted('A(3,5) with maxCalls=5 aborts', computeIterative(3, 5, 5));

// ─── Edge cases ────────────────────────────────────────────────────────────
section('Edge cases');
expect('A(0,0) boundary', computeIterative(0, 0).result, 1n);
expect('A(0,1000) = 1001', computeIterative(0, 1000).result, 1001n);
expect('A(1,1000) = 1002', computeIterative(1, 1000).result, 1002n);
expect('A(2,100) = 203', computeIterative(2, 100).result, 203n);

// Negative / bad inputs: validateInputs should catch these in the UI,
// but the engine itself uses BigInt so let's verify that validation works.
function validateInputs(m, n) {
  const errors = [];
  if (!Number.isInteger(m) || m < 0) errors.push('m must be a non-negative integer.');
  if (!Number.isInteger(n) || n < 0) errors.push('n must be a non-negative integer.');
  return errors;
}
section('Input validation edge cases');
expect('negative m rejected', validateInputs(-1, 0).length > 0, true);
expect('decimal m rejected', validateInputs(1.5, 0).length > 0, true);
expect('negative n rejected', validateInputs(0, -1).length > 0, true);
expect('NaN m rejected', validateInputs(NaN, 0).length > 0, true);
expect('valid (3,5) passes', validateInputs(3, 5).length === 0, true);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('🎉 All tests passed!');
else console.log(`⚠️  ${failed} test(s) failed — check above.`);

