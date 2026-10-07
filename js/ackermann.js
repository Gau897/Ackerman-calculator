/**
 * ackermann.js
 * Core computation engine for the Ackermann Function Calculator.
 *
 * Exports three computation modes:
 *   1. computePure(m, n)        - Classic recursive with depth/call tracking
 *   2. computeIterative(m, n)   - Explicit-stack simulation (no RangeError)
 *   3. computeMemoized(m, n)    - Iterative + memoization Map
 *   4. computeClosedForm(m, n)  - Uses closed-form shortcuts for m=0..3
 *
 * All return: { result, calls, maxDepth, timeMs, cacheHits?, aborted? }
 */

// ─── Closed-form shortcuts ────────────────────────────────────────────────────
// These bypass recursion entirely for m = 0, 1, 2, 3
const closedForms = {
  0: (n) => n + 1n,               // A(0, n) = n + 1
  1: (n) => n + 2n,               // A(1, n) = n + 2
  2: (n) => 2n * n + 3n,          // A(2, n) = 2n + 3
  3: (n) => (2n ** (n + 3n)) - 3n // A(3, n) = 2^(n+3) - 3
};

// ─── 1. Pure Recursive Engine ─────────────────────────────────────────────────
/**
 * Computes A(m, n) using classic recursion.
 * WARNING: Will hit JavaScript's call-stack limit for large inputs.
 * Use only for small values (m ≤ 3, n ≤ 8).
 *
 * @param {number} m - Row parameter
 * @param {number} n - Column parameter
 * @returns {{ result: BigInt, calls: number, maxDepth: number, timeMs: number }}
 */
function computePure(m, n) {
  let calls = 0;
  let maxDepth = 0;

  const start = performance.now();

  function ack(m, n, depth) {
    calls++;
    if (depth > maxDepth) maxDepth = depth;

    if (m === 0n) {
      // Base case: A(0, n) = n + 1
      return n + 1n;
    } else if (n === 0n) {
      // Base case: A(m, 0) = A(m-1, 1)
      return ack(m - 1n, 1n, depth + 1);
    } else {
      // Recursive case: A(m, n) = A(m-1, A(m, n-1))
      return ack(m - 1n, ack(m, n - 1n, depth + 1), depth + 1);
    }
  }

  try {
    const result = ack(BigInt(m), BigInt(n), 1);
    const timeMs = performance.now() - start;
    return { result, calls, maxDepth, timeMs, aborted: false };
  } catch (e) {
    const timeMs = performance.now() - start;
    if (e instanceof RangeError) {
      return { result: null, calls, maxDepth, timeMs, aborted: true, error: 'Stack overflow — use Iterative mode for large inputs.' };
    }
    throw e;
  }
}

// ─── 2. Iterative (Explicit-Stack) Engine ────────────────────────────────────
/**
 * Simulates the Ackermann recursion using an explicit stack array.
 * This avoids JavaScript's native call-stack limit entirely.
 *
 * The stack stores pending (m, n) pairs; when m=0 the result n+1 propagates
 * back up through the stack entries waiting for it.
 *
 * @param {number|BigInt} m
 * @param {number|BigInt} n
 * @param {number} [maxCalls=50_000_000] - Safety abort limit
 * @param {function} [progressCb] - Called every ~100k calls with { calls, depth }
 * @returns {{ result: BigInt, calls: number, maxDepth: number, timeMs: number, aborted?: boolean }}
 */
function computeIterative(m, n, maxCalls = 50_000_000, progressCb = null) {
  const start = performance.now();
  let calls = 0;
  let maxDepth = 0;
  let lastProgress = 0;

  // Stack holds BigInt m-values; current n travels as a register.
  // Algorithm: push m values onto stack, reduce with current n.
  const stack = [];
  let curM = BigInt(m);
  let curN = BigInt(n);

  while (true) {
    calls++;

    // Track max depth (stack length + 1 for current frame)
    const depth = stack.length + 1;
    if (depth > maxDepth) maxDepth = depth;

    // Progress callback every ~100k calls
    if (progressCb && calls - lastProgress >= 100_000) {
      progressCb({ calls, depth: maxDepth });
      lastProgress = calls;
    }

    // Safety abort
    if (calls >= maxCalls) {
      return {
        result: null,
        calls,
        maxDepth,
        timeMs: performance.now() - start,
        aborted: true,
        error: `Aborted after ${maxCalls.toLocaleString()} calls`
      };
    }

    if (curM === 0n) {
      // A(0, n) = n + 1 → result propagates back
      curN = curN + 1n;

      if (stack.length === 0) break; // Done!

      // Pop the waiting m value
      curM = stack.pop();
      // Now compute A(curM, curN) — curN is the result from the inner call
    } else if (curN === 0n) {
      // A(m, 0) = A(m-1, 1) — no stack push needed
      curM = curM - 1n;
      curN = 1n;
    } else {
      // A(m, n) = A(m-1, A(m, n-1))
      // Push m-1 (waiting for inner result), then compute A(m, n-1)
      stack.push(curM - 1n);
      curN = curN - 1n;
      // curM stays the same for the inner A(m, n-1) call
    }
  }

  return {
    result: curN,
    calls,
    maxDepth,
    timeMs: performance.now() - start,
    aborted: false
  };
}

// ─── 3. Memoized Engine ──────────────────────────────────────────────────────
/**
 * Iterative engine with memoization via a Map keyed by "m,n".
 * Cache hits avoid recomputing known values, dramatically reducing calls
 * for overlapping subproblems.
 *
 * @param {number} m
 * @param {number} n
 * @param {number} [maxCalls=50_000_000]
 * @param {function} [progressCb]
 * @returns {{ result, calls, maxDepth, timeMs, cacheHits, aborted? }}
 */
function computeMemoized(m, n, maxCalls = 50_000_000, progressCb = null) {
  const start = performance.now();
  let calls = 0;
  let cacheHits = 0;
  let maxDepth = 0;
  let lastProgress = 0;

  const memo = new Map();

  const stack = [];
  let curM = BigInt(m);
  let curN = BigInt(n);

  while (true) {
    calls++;

    const depth = stack.length + 1;
    if (depth > maxDepth) maxDepth = depth;

    if (progressCb && calls - lastProgress >= 100_000) {
      progressCb({ calls, depth: maxDepth });
      lastProgress = calls;
    }

    if (calls >= maxCalls) {
      return {
        result: null,
        calls,
        maxDepth,
        timeMs: performance.now() - start,
        cacheHits,
        aborted: true,
        error: `Aborted after ${maxCalls.toLocaleString()} calls`
      };
    }

    // Check memo cache first
    const key = `${curM},${curN}`;
    if (memo.has(key)) {
      cacheHits++;
      curN = memo.get(key);
      curM = 0n; // Trigger the m===0 propagation path
    }

    if (curM === 0n) {
      const resultN = memo.has(key) ? curN : curN + 1n;
      curN = resultN;

      if (stack.length === 0) break;

      const [prevM, prevN] = stack.pop();
      // Cache the result we just computed
      memo.set(`${prevM + 1n},${prevN}`, curN); // A(prevM+1, prevN) = curN
      curM = prevM;
    } else if (curN === 0n) {
      curM = curM - 1n;
      curN = 1n;
    } else {
      stack.push([curM - 1n, curN - 1n]);
      curN = curN - 1n;
    }
  }

  return {
    result: curN,
    calls,
    maxDepth,
    timeMs: performance.now() - start,
    cacheHits,
    aborted: false
  };
}

// ─── 4. Closed-Form Engine ───────────────────────────────────────────────────
/**
 * Uses closed-form formulas for m = 0, 1, 2, 3.
 * Falls back to iterative for m ≥ 4.
 * This is nearly instantaneous for m ≤ 3 and any reasonable n.
 *
 * @param {number} m
 * @param {number} n
 * @param {number} [maxCalls=50_000_000]
 * @param {function} [progressCb]
 */
function computeClosedForm(m, n, maxCalls = 50_000_000, progressCb = null) {
  const start = performance.now();

  if (m in closedForms) {
    const result = closedForms[m](BigInt(n));
    return {
      result,
      calls: 1,
      maxDepth: 1,
      timeMs: performance.now() - start,
      cacheHits: 0,
      aborted: false,
      usedClosedForm: true
    };
  }

  // For m ≥ 4, fall back to iterative
  const res = computeIterative(m, n, maxCalls, progressCb);
  res.usedClosedForm = false;
  return res;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────
/**
 * Main entry point. Routes to the correct engine based on mode.
 * @param {number} m
 * @param {number} n
 * @param {'pure'|'iterative'|'memoized'|'closedform'} mode
 * @param {number} maxCalls
 * @param {function} progressCb
 */
function compute(m, n, mode = 'iterative', maxCalls = 50_000_000, progressCb = null) {
  switch (mode) {
    case 'pure':       return computePure(m, n);
    case 'memoized':   return computeMemoized(m, n, maxCalls, progressCb);
    case 'closedform': return computeClosedForm(m, n, maxCalls, progressCb);
    case 'iterative':
    default:           return computeIterative(m, n, maxCalls, progressCb);
  }
}

// Export for both module and worker contexts
if (typeof module !== 'undefined') {
  module.exports = { compute, computePure, computeIterative, computeMemoized, computeClosedForm, closedForms };
}

