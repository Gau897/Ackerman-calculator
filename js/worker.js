/**
 * worker.js
 * Web Worker for Ackermann computation.
 * Keeps the main thread responsive during long calculations.
 *
 * Message protocol:
 *   Incoming: { type: 'compute', m, n, mode, maxCalls }
 *             { type: 'cancel' }
 *
 *   Outgoing: { type: 'progress', calls, depth, elapsed }
 *             { type: 'result', result, calls, maxDepth, timeMs, cacheHits, aborted }
 *             { type: 'error', message }
 */

'use strict';

// ─── Inline the engine (Workers can't import relative modules without bundler) ──

const closedForms = {
  0: (n) => n + 1n,
  1: (n) => n + 2n,
  2: (n) => 2n * n + 3n,
  3: (n) => (2n ** (n + 3n)) - 3n
};

let cancelled = false;

// ─── Iterative Engine (worker-local copy) ────────────────────────────────────
function computeIterative(m, n, maxCalls, onProgress) {
  const start = Date.now();
  let calls = 0;
  let maxDepth = 0;
  let lastProgress = Date.now();

  const stack = [];
  let curM = BigInt(m);
  let curN = BigInt(n);

  while (true) {
    if (cancelled) {
      return { result: null, calls, maxDepth, timeMs: Date.now() - start, aborted: true, cancelled: true };
    }

    calls++;
    const depth = stack.length + 1;
    if (depth > maxDepth) maxDepth = depth;

    // Send progress every ~150ms
    const now = Date.now();
    if (now - lastProgress >= 150) {
      onProgress({ calls, depth: maxDepth, elapsed: now - start });
      lastProgress = now;
    }

    if (calls >= maxCalls) {
      return { result: null, calls, maxDepth, timeMs: Date.now() - start, aborted: true };
    }

    if (curM === 0n) {
      curN = curN + 1n;
      if (stack.length === 0) break;
      curM = stack.pop();
    } else if (curN === 0n) {
      curM = curM - 1n;
      curN = 1n;
    } else {
      stack.push(curM - 1n);
      curN = curN - 1n;
    }
  }

  return { result: curN, calls, maxDepth, timeMs: Date.now() - start, aborted: false };
}

// ─── Memoized Engine ─────────────────────────────────────────────────────────
function computeMemoized(m, n, maxCalls, onProgress) {
  const start = Date.now();
  let calls = 0;
  let cacheHits = 0;
  let maxDepth = 0;
  let lastProgress = Date.now();

  const memo = new Map();
  const stack = [];
  let curM = BigInt(m);
  let curN = BigInt(n);

  while (true) {
    if (cancelled) {
      return { result: null, calls, maxDepth, timeMs: Date.now() - start, cacheHits, aborted: true, cancelled: true };
    }

    calls++;
    const depth = stack.length + 1;
    if (depth > maxDepth) maxDepth = depth;

    const now = Date.now();
    if (now - lastProgress >= 150) {
      onProgress({ calls, depth: maxDepth, elapsed: now - start });
      lastProgress = now;
    }

    if (calls >= maxCalls) {
      return { result: null, calls, maxDepth, timeMs: Date.now() - start, cacheHits, aborted: true };
    }

    const key = `${curM},${curN}`;
    if (memo.has(key)) {
      cacheHits++;
      curN = memo.get(key);
      if (stack.length === 0) break;
      curM = stack.pop();
      continue;
    }

    if (curM === 0n) {
      const res = curN + 1n;
      memo.set(key, res);
      curN = res;
      if (stack.length === 0) break;
      curM = stack.pop();
    } else if (curN === 0n) {
      curM = curM - 1n;
      curN = 1n;
    } else {
      stack.push(curM - 1n);
      curN = curN - 1n;
    }
  }

  return { result: curN, calls, maxDepth, timeMs: Date.now() - start, cacheHits, aborted: false };
}

// ─── Pure Recursive (small inputs only) ─────────────────────────────────────
function computePure(m, n) {
  const start = Date.now();
  let calls = 0;
  let maxDepth = 0;

  function ack(m, n, depth) {
    calls++;
    if (depth > maxDepth) maxDepth = depth;
    if (m === 0n) return n + 1n;
    if (n === 0n) return ack(m - 1n, 1n, depth + 1);
    return ack(m - 1n, ack(m, n - 1n, depth + 1), depth + 1);
  }

  try {
    const result = ack(BigInt(m), BigInt(n), 1);
    return { result, calls, maxDepth, timeMs: Date.now() - start, aborted: false };
  } catch (e) {
    if (e instanceof RangeError) {
      return { result: null, calls, maxDepth, timeMs: Date.now() - start, aborted: true, error: 'Stack overflow — switch to Iterative mode.' };
    }
    throw e;
  }
}

// ─── Closed-Form ─────────────────────────────────────────────────────────────
function computeClosedForm(m, n, maxCalls, onProgress) {
  const start = Date.now();
  if (m in closedForms) {
    const result = closedForms[m](BigInt(n));
    return { result, calls: 1, maxDepth: 1, timeMs: Date.now() - start, cacheHits: 0, aborted: false, usedClosedForm: true };
  }
  const res = computeIterative(m, n, maxCalls, onProgress);
  res.usedClosedForm = false;
  return res;
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = function (e) {
  const { type, m, n, mode, maxCalls = 50_000_000 } = e.data;

  if (type === 'cancel') {
    cancelled = true;
    return;
  }

  if (type === 'compute') {
    cancelled = false;

    const onProgress = ({ calls, depth, elapsed }) => {
      self.postMessage({ type: 'progress', calls, depth, elapsed });
    };

    let result;
    try {
      switch (mode) {
        case 'pure':       result = computePure(m, n); break;
        case 'memoized':   result = computeMemoized(m, n, maxCalls, onProgress); break;
        case 'closedform': result = computeClosedForm(m, n, maxCalls, onProgress); break;
        default:           result = computeIterative(m, n, maxCalls, onProgress); break;
      }

      // BigInt cannot be serialized with postMessage natively on all browsers
      // Convert to string for transfer
      self.postMessage({
        type: 'result',
        result: result.result !== null ? result.result.toString() : null,
        calls: result.calls,
        maxDepth: result.maxDepth,
        timeMs: result.timeMs,
        cacheHits: result.cacheHits || 0,
        aborted: result.aborted || false,
        cancelled: result.cancelled || false,
        error: result.error || null,
        usedClosedForm: result.usedClosedForm || false
      });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};

