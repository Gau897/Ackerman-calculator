/**
 * ui.js
 * Main UI controller — wires DOM events to the Web Worker and tracer.
 * Handles: input validation, progress updates, result display,
 *          theme toggle, keyboard shortcuts, examples, copy, CSV export,
 *          growth chart, comparison table, call-stack trace viewer.
 */

'use strict';

// ─── Worker setup ─────────────────────────────────────────────────────────────
let worker = null;
let workerBusy = false;

function getWorker() {
  if (!worker) {
    worker = new Worker('js/worker.js');
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      showError('Worker error: ' + e.message);
      setComputing(false);
    };
  }
  return worker;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── State ───────────────────────────────────────────────────────────────────
let currentM = 0, currentN = 0;
let growthChart = null;
let depthChart = null;
let traceSteps = [];
let traceIndex = 0;
let traceInterval = null;

// ─── Input Validation ────────────────────────────────────────────────────────
function validateInputs(m, n) {
  const errors = [];
  if (!Number.isInteger(m) || m < 0) errors.push('m must be a non-negative integer.');
  if (!Number.isInteger(n) || n < 0) errors.push('n must be a non-negative integer.');
  if (m > 10) errors.push('m > 10 is not supported (result would be incomprehensibly large).');
  if (n > 1000000) errors.push('n > 1,000,000 is impractical.');
  return errors;
}

function showValidationError(msg) {
  const el = $('validation-msg');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function showWarning(m, n) {
  const warn = $('warning-msg');
  if (m >= 4 || (m === 3 && n > 12)) {
    warn.textContent = `⚠️ A(${m},${n}) may take a very long time or exceed limits. Consider using Closed-Form or Iterative mode with a low call limit.`;
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

// ─── Computing State ─────────────────────────────────────────────────────────
function setComputing(on) {
  workerBusy = on;
  $('btn-calc').disabled = on;
  $('btn-stop').disabled = !on;
  $('progress-section').style.display = on ? 'block' : 'none';
  if (!on) {
    $('progress-bar-fill').style.width = '0%';
    $('progress-label').textContent = '';
  }
}

function updateProgress({ calls, depth, elapsed }) {
  $('progress-label').textContent =
    `Computing… ${calls.toLocaleString()} calls | depth ${depth.toLocaleString()} | ${(elapsed / 1000).toFixed(1)}s`;
  // Animate progress bar (indeterminate)
  const pct = Math.min(99, (calls / 500_000) * 100);
  $('progress-bar-fill').style.width = pct + '%';
}

// ─── Result Formatting ───────────────────────────────────────────────────────
function formatResult(str) {
  if (!str) return '—';
  if (str.length > 50) {
    // Scientific notation approximation
    const exp = str.length - 1;
    const mantissa = str[0] + '.' + str.substring(1, 5);
    return `≈ ${mantissa} × 10<sup>${exp}</sup><br><small>(${str.length.toLocaleString()} digits)</small>`;
  }
  // Add thousands separators for numbers ≤ 50 digits
  return BigInt(str).toLocaleString();
}

function showError(msg) {
  $('result-value').innerHTML = `<span class="error">${msg}</span>`;
}

// ─── Worker Message Handler ──────────────────────────────────────────────────
function handleWorkerMessage(e) {
  const data = e.data;

  if (data.type === 'progress') {
    updateProgress(data);
    return;
  }

  if (data.type === 'error') {
    showError(data.message);
    setComputing(false);
    return;
  }

  if (data.type === 'result') {
    setComputing(false);
    displayResults(data);
    $('progress-bar-fill').style.width = '100%';
    $('progress-label').textContent = 'Done!';
  }
}

// ─── Display Results ─────────────────────────────────────────────────────────
function displayResults(data) {
  if (data.cancelled) {
    $('result-value').innerHTML = '<span class="aborted">Cancelled by user.</span>';
    $('calls-value').textContent = data.calls.toLocaleString();
    $('depth-value').textContent = data.maxDepth.toLocaleString();
    $('time-value').textContent = data.timeMs ? data.timeMs.toFixed(1) + ' ms' : '—';
    animateCards();
    return;
  }

  if (data.aborted) {
    $('result-value').innerHTML = `<span class="aborted">⚠️ Aborted: ${data.error || 'limit reached'}</span>`;
  } else {
    $('result-value').innerHTML = formatResult(data.result);
  }

  $('calls-value').textContent = data.calls.toLocaleString();
  $('depth-value').textContent = data.maxDepth.toLocaleString();
  $('time-value').textContent = data.timeMs.toFixed(2) + ' ms';

  if (data.cacheHits) {
    $('cache-hits-value').textContent = data.cacheHits.toLocaleString();
    $('cache-row').style.display = '';
  } else {
    $('cache-row').style.display = 'none';
  }

  // Store full result string for copy/export
  window._lastResult = {
    m: currentM, n: currentN,
    result: data.result,
    calls: data.calls,
    maxDepth: data.maxDepth,
    timeMs: data.timeMs,
    cacheHits: data.cacheHits || 0
  };

  animateCards();
  highlightTableCell(currentM, currentN);

  // Trigger trace if small input
  if (currentM <= 2 && currentN <= 3) {
    buildTrace(currentM, currentN);
  } else {
    $('trace-section').style.display = 'none';
  }
}

function animateCards() {
  document.querySelectorAll('.result-card').forEach((card, i) => {
    card.style.animation = 'none';
    card.offsetHeight; // Reflow
    card.style.animation = `cardPop 0.4s ease ${i * 0.08}s both`;
  });
}

// ─── Calculate button ────────────────────────────────────────────────────────
function onCalculate() {
  const m = parseInt($('input-m').value, 10);
  const n = parseInt($('input-n').value, 10);
  const mode = $('mode-select').value;
  const maxCalls = parseInt($('max-calls').value, 10) || 50_000_000;

  const errors = validateInputs(m, n);
  if (errors.length) { showValidationError(errors.join(' ')); return; }
  showValidationError('');
  showWarning(m, n);

  currentM = m;
  currentN = n;

  setComputing(true);
  $('result-value').textContent = '…';
  $('calls-value').textContent = '…';
  $('depth-value').textContent = '…';
  $('time-value').textContent = '…';

  getWorker().postMessage({ type: 'compute', m, n, mode, maxCalls });
}

function onStop() {
  if (worker) worker.postMessage({ type: 'cancel' });
}

// ─── Copy / Export ───────────────────────────────────────────────────────────
function copyResult() {
  const r = window._lastResult;
  if (!r) return;
  const text = r.result || 'N/A';
  navigator.clipboard.writeText(text).then(() => {
    $('btn-copy').textContent = '✓ Copied!';
    setTimeout(() => { $('btn-copy').textContent = 'Copy Result'; }, 1500);
  });
}

function exportCSV() {
  const r = window._lastResult;
  if (!r) return;
  const rows = [
    ['m', 'n', 'result', 'total_calls', 'max_depth', 'time_ms', 'cache_hits'],
    [r.m, r.n, r.result || 'aborted', r.calls, r.maxDepth, r.timeMs.toFixed(2), r.cacheHits]
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ackermann_A${r.m}_${r.n}.csv`;
  a.click();
}

// ─── Theme Toggle ────────────────────────────────────────────────────────────
function toggleTheme() {
  const body = document.body;
  const isDark = body.getAttribute('data-theme') === 'dark';
  body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  $('theme-btn').textContent = isDark ? '🌙 Dark Mode' : '☀️ Light Mode';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
  $('theme-btn').textContent = saved === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

// ─── Examples ────────────────────────────────────────────────────────────────
function setExample(m, n) {
  $('input-m').value = m;
  $('input-n').value = n;
  onCalculate();
}

// ─── Comparison Table ─────────────────────────────────────────────────────────
const TABLE_VALUES = {
  // Precomputed A(m,n) for m=0..4, n=0..6
  0: [1, 2, 3, 4, 5, 6, 7],
  1: [2, 3, 4, 5, 6, 7, 8],
  2: [3, 5, 7, 9, 11, 13, 15],
  3: [5, 13, 29, 61, 125, 253, 509],
  4: ['13', '65533', '2^65536−3\n(19729 digits)', 'too large', 'too large', 'too large', 'too large']
};

function buildComparisonTable() {
  const tbody = $('comp-tbody');
  tbody.innerHTML = '';
  for (let m = 0; m <= 4; m++) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = m;
    tr.appendChild(th);
    for (let n = 0; n <= 6; n++) {
      const td = document.createElement('td');
      const val = TABLE_VALUES[m][n];
      if (typeof val === 'string' && val.includes('large')) {
        td.innerHTML = `<span class="huge">too large</span>`;
      } else if (typeof val === 'string' && val.includes('2^')) {
        td.innerHTML = `<span class="huge-val" title="${val}">2<sup>65536</sup>−3<br><small>(19,729 digits)</small></span>`;
      } else {
        td.textContent = val.toLocaleString ? val.toLocaleString() : val;
      }
      td.dataset.m = m;
      td.dataset.n = n;
      td.id = `cell-${m}-${n}`;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function highlightTableCell(m, n) {
  document.querySelectorAll('#comp-tbody td').forEach(td => td.classList.remove('highlight'));
  if (m <= 4 && n <= 6) {
    const cell = $(`cell-${m}-${n}`);
    if (cell) cell.classList.add('highlight');
  }
}

// ─── Growth Chart ─────────────────────────────────────────────────────────────
async function generateGrowthTable() {
  const mVal = parseInt($('growth-m').value, 10);
  const maxN = parseInt($('growth-max-n').value, 10) || 8;
  const tbody = $('growth-tbody');
  const btn = $('btn-growth');
  btn.disabled = true;
  btn.textContent = 'Computing…';
  tbody.innerHTML = '';

  const labels = [];
  const callData = [];
  const depthData = [];
  const rowsData = [];

  for (let n = 0; n <= maxN; n++) {
    // Use a mini inline engine for growth table (avoid worker overhead)
    const res = await computeGrowthPoint(mVal, n);
    labels.push(n);
    callData.push(res.calls);
    depthData.push(res.maxDepth);
    rowsData.push({ n, result: res.result, calls: res.calls, maxDepth: res.maxDepth });

    // Yield to browser
    await new Promise(r => setTimeout(r, 0));
  }

  // Fill table
  for (const row of rowsData) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.n}</td>
      <td>${formatResultShort(row.result)}</td>
      <td>${row.calls.toLocaleString()}</td>
      <td>${row.maxDepth.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  }

  renderGrowthChart(labels, callData, mVal);
  btn.disabled = false;
  btn.textContent = 'Generate Growth Table';
}

function formatResultShort(str) {
  if (!str) return '—';
  if (str.length > 20) return `…(${str.length} digits)`;
  return str;
}

async function computeGrowthPoint(m, n) {
  return new Promise((resolve) => {
    const w = new Worker('js/worker.js');
    w.onmessage = (e) => {
      if (e.data.type === 'result') {
        w.terminate();
        resolve({ result: e.data.result, calls: e.data.calls, maxDepth: e.data.maxDepth });
      }
    };
    w.postMessage({ type: 'compute', m, n, mode: 'iterative', maxCalls: 5_000_000 });
  });
}

function renderGrowthChart(labels, callData, m) {
  const ctx = $('growth-chart').getContext('2d');
  if (growthChart) growthChart.destroy();

  growthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `A(${m}, n) — Total Calls`,
        data: callData,
        borderColor: '#7c6aff',
        backgroundColor: 'rgba(124,106,255,0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#ff6b9d',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: 'var(--text-primary)' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.toLocaleString()} calls`
          }
        }
      },
      scales: {
        x: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border)' } },
        y: {
          type: 'logarithmic',
          ticks: {
            color: 'var(--text-secondary)',
            callback: (v) => v >= 1000 ? v.toExponential(0) : v
          },
          grid: { color: 'var(--border)' }
        }
      }
    }
  });
}

// ─── Call Stack Trace Viewer ─────────────────────────────────────────────────
function buildTrace(m, n) {
  // Use the tracer module inline (since we can't import in browser without bundler)
  const MAX_STEPS = 2000;
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

  try {
    ack(BigInt(m), BigInt(n), 0);
  } catch(e) { /* ignore */ }

  traceSteps = steps;
  traceIndex = 0;

  $('trace-section').style.display = 'block';
  $('trace-truncated').style.display = truncated ? 'block' : 'none';
  renderTraceStep(0);
  renderDepthGraph();
}

function renderTraceStep(idx) {
  if (idx < 0 || idx >= traceSteps.length) return;
  traceIndex = idx;
  const step = traceSteps[idx];
  const indent = '  '.repeat(step.depth);
  const log = $('trace-log');

  // Render all steps up to current
  const lines = traceSteps.slice(0, idx + 1).map(s => {
    const pad = '  '.repeat(s.depth);
    if (s.type === 'call') {
      return `${pad}→ call A(${s.m}, ${s.n})`;
    } else {
      return `${pad}← return ${s.value} [A(${s.m}, ${s.n})]`;
    }
  });

  log.textContent = lines.join('\n');
  log.scrollTop = log.scrollHeight;

  $('trace-counter').textContent = `Step ${idx + 1} / ${traceSteps.length}`;
  $('btn-trace-back').disabled = idx <= 0;
  $('btn-trace-fwd').disabled = idx >= traceSteps.length - 1;
}

function renderDepthGraph() {
  const ctx = $('depth-chart').getContext('2d');
  if (depthChart) depthChart.destroy();

  const depths = traceSteps.map(s => s.depth);
  const labels = traceSteps.map((_, i) => i);

  depthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Stack Depth',
        data: depths,
        backgroundColor: traceSteps.map(s =>
          s.type === 'call' ? 'rgba(124,106,255,0.7)' : 'rgba(255,107,157,0.5)'
        ),
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border)' } }
      }
    }
  });
}

function tracePlay() {
  if (traceInterval) { clearInterval(traceInterval); traceInterval = null; $('btn-trace-play').textContent = '▶ Play'; return; }
  $('btn-trace-play').textContent = '⏸ Pause';
  traceInterval = setInterval(() => {
    if (traceIndex >= traceSteps.length - 1) {
      clearInterval(traceInterval); traceInterval = null;
      $('btn-trace-play').textContent = '▶ Play';
      return;
    }
    renderTraceStep(traceIndex + 1);
  }, 120);
}

function traceReset() {
  if (traceInterval) { clearInterval(traceInterval); traceInterval = null; }
  $('btn-trace-play').textContent = '▶ Play';
  renderTraceStep(0);
}

// ─── Keyboard shortcut ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !workerBusy &&
      !['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)) {
    onCalculate();
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  buildComparisonTable();

  // Wire buttons
  $('btn-calc').addEventListener('click', onCalculate);
  $('btn-stop').addEventListener('click', onStop);
  $('btn-copy').addEventListener('click', copyResult);
  $('btn-export').addEventListener('click', exportCSV);
  $('theme-btn').addEventListener('click', toggleTheme);
  $('btn-growth').addEventListener('click', generateGrowthTable);

  // Input enter key
  [$('input-m'), $('input-n')].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') onCalculate(); });
  });

  // Trace controls
  $('btn-trace-back').addEventListener('click', () => renderTraceStep(traceIndex - 1));
  $('btn-trace-fwd').addEventListener('click', () => renderTraceStep(traceIndex + 1));
  $('btn-trace-play').addEventListener('click', tracePlay);
  $('btn-trace-reset').addEventListener('click', traceReset);

  // ARIA live region for results
  $('result-value').setAttribute('aria-live', 'polite');
});

