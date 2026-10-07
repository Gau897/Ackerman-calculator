/**
 * tracer.js
 * Step-by-step call trace recorder for small Ackermann inputs.
 * Records each call and return to enable a playback viewer.
 *
 * Only activate for m ≤ 2, n ≤ 3. Cap at MAX_STEPS.
 */

const MAX_STEPS = 2000;

/**
 * Returns a full trace of A(m, n) for small inputs.
 * @param {number} m
 * @param {number} n
 * @returns {{ steps: Array, result: BigInt, truncated: boolean }}
 */
function traceAckermann(m, n) {
  const steps = [];
  let truncated = false;
  let stepCount = 0;

  function ack(m, n, depth) {
    if (stepCount >= MAX_STEPS) { truncated = true; return null; }

    steps.push({ type: 'call', m: Number(m), n: Number(n), depth, stepIndex: stepCount++ });

    let result;
    if (m === 0n) {
      result = n + 1n;
    } else if (n === 0n) {
      result = ack(m - 1n, 1n, depth + 1);
    } else {
      const inner = ack(m, n - 1n, depth + 1);
      if (inner === null) return null;
      result = ack(m - 1n, inner, depth + 1);
    }

    if (result !== null && stepCount < MAX_STEPS) {
      steps.push({ type: 'return', m: Number(m), n: Number(n), depth, value: Number(result), stepIndex: stepCount++ });
    }

    return result;
  }

  const result = ack(BigInt(m), BigInt(n), 0);
  return { steps, result, truncated };
}

/**
 * Computes stack depth samples over all steps for the bar graph.
 * @param {Array} steps
 * @returns {number[]} depths at each step
 */
function getDepthSamples(steps) {
  return steps.map(s => s.depth);
}

if (typeof module !== 'undefined') {
  module.exports = { traceAckermann, getDepthSamples, MAX_STEPS };
}

