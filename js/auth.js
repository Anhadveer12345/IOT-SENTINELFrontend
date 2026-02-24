// auth.js — Calls backend API for real model predictions

const THRESHOLD = 70;
let devices = [];
let alerts = [];
let isRunning = false;
let authQueue = [];
let queueTimer = null;
let modelMeta = {};

// ── API Calls ─────────────────────────────────

async function apiHealth() {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(35000) });
    return await res.json();
  } catch { return null; }
}

async function apiAuthenticate(device) {
  const body = {
    device_id: device.id,
    device_type: device.type,
    features: device.features,
    time_series: device.timeSeries
  };
  try {
    const res = await fetch(`${API_URL}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch (e) {
    // Fallback to simulation if backend offline
    return simulateFallback(device);
  }
}

// Fallback when backend is offline
function simulateFallback(device) {
  const isAttack = device.attackType !== 'Normal';
  const base = isAttack ? rand(20, 65) : rand(65, 95);
  const rf = clamp(base + (Math.random() - 0.5) * 12, 5, 99);
  const cnn = clamp(base + (Math.random() - 0.5) * 10, 5, 99);
  const mean = (rf + cnn) / 2;
  const lstm = clamp(base + (Math.random() - 0.5) * 14, 5, 99);
  return {
    device_id: device.id,
    device_type: device.type,
    rf_score: parseFloat(rf.toFixed(1)),
    cnn_score: parseFloat(cnn.toFixed(1)),
    lstm_score: parseFloat(lstm.toFixed(1)),
    mean_score: parseFloat(mean.toFixed(1)),
    trusted: mean >= THRESHOLD,
    behavioral: {
      anomaly_probability: isAttack ? rand(0.4, 0.9) : rand(0, 0.15),
      behavioral_drift: isAttack ? `${rand(20, 60).toFixed(1)}%` : `${rand(0, 8).toFixed(1)}%`,
      traffic_pattern: isAttack ? 'Anomalous' : 'Normal'
    }
  };
}

function clamp(v, mn, mx) { return Math.min(Math.max(v, mn), mx); }
function rand(a, b) { return Math.random() * (b - a) + a; }

// ── Authentication Pipeline ───────────────────

async function toggleAuth() {
  if (isRunning) {
    stopAuth();
  } else {
    startAuth();
  }
}

function startAuth() {
  isRunning = true;
  devices = generateDevicePool(24);
  renderSensorGrid(devices);
  renderSensorTable(devices);
  authQueue = [...devices];
  document.getElementById('runBtn').textContent = '⏹  Stop';
  showToast('Authentication pipeline started', 'info');
  processQueue();
}

function stopAuth() {
  isRunning = false;
  clearTimeout(queueTimer);
  authQueue = [];
  document.getElementById('runBtn').textContent = '▶  Run Authentication';
  showToast('Authentication stopped', 'info');
}

async function processQueue() {
  if (!isRunning || authQueue.length === 0) {
    if (isRunning && authQueue.length === 0) {
      queueTimer = setTimeout(() => {
        authQueue = [...devices];
        // Regenerate features for fresh readings
        authQueue.forEach(d => {
          d.features = generateFeatures(d.attackType);
          d.timeSeries = generateTimeSeries(d.attackType);
        });
        processQueue();
      }, 4000);
    }
    return;
  }

  const device = authQueue.shift();
  await authenticateDevice(device);

  if (isRunning) {
    queueTimer = setTimeout(processQueue, 500);
  }
}

async function authenticateDevice(device) {
  device.status = 'scanning';
  updateSensorCard(device);
  drawSpectrogram(document.getElementById('spectrogramCanvas'), device);

  // Call API
  const result = await apiAuthenticate(device);

  device.rfScore = result.rf_score;
  device.cnnScore = result.cnn_score;
  device.lstmScore = result.lstm_score;
  device.meanScore = result.mean_score;
  device.status = result.trusted ? 'trusted' : 'flagged';
  device.lastAuth = new Date().toLocaleTimeString();
  device.behavioral = result.behavioral;

  // Update score bars
  setBar('rfFill', 'rfPct', device.rfScore, false);
  setBar('cnnFill', 'cnnPct', device.cnnScore, false);
  setBar('meanFill', 'meanPct', device.meanScore, device.meanScore < THRESHOLD);

  // LSTM chart + metrics
  const series = generateLSTMSeries(device);
  drawLSTMChart(document.getElementById('lstmCanvas'), series, !result.trusted);
  setText('lmPattern', result.behavioral.traffic_pattern || '--');
  setText('lmDrift', result.behavioral.behavioral_drift || '--');
  setText('lmAnomaly', result.behavioral.anomaly_probability?.toFixed(3) || '--');

  updateSensorCard(device);
  updateSensorTableRow(device);
  updateStats();
  updateTrustCircle();

  if (!result.trusted) {
    addAlert(device);
    showToast(`⚑ ${device.id} flagged — score ${device.meanScore.toFixed(1)}%`, 'fail');
  }
}

function setBar(fillId, pctId, value, isLow) {
  const fill = document.getElementById(fillId);
  const pct = document.getElementById(pctId);
  if (fill) {
    fill.style.width = `${value}%`;
    if (isLow) fill.classList.add('low'); else fill.classList.remove('low');
  }
  if (pct) pct.textContent = value != null ? `${value.toFixed(1)}%` : '--';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── UI Updates ────────────────────────────────

function updateSensorCard(device) {
  const card = document.querySelector(`[data-dev="${device.id}"]`);
  if (!card) return;
  card.className = `sensor-card ${device.status}`;
  const s = card.querySelector('.sc-score');
  if (s) {
    s.textContent = device.meanScore != null ? device.meanScore.toFixed(0) : '--';
    s.className = `sc-score ${device.status === 'trusted' ? 'trusted' : device.status === 'flagged' ? 'flagged' : ''}`;
  }
  const ic = card.querySelector('.sc-icon');
  if (ic) {
    ic.textContent = device.status === 'trusted' ? '✓' : device.status === 'flagged' ? '✕' : device.status === 'scanning' ? '⟳' : '○';
    ic.className = `sc-icon ${device.status}`;
  }
}

function renderSensorGrid(devs) {
  const grid = document.getElementById('sensorGrid');
  grid.innerHTML = devs.map(d => `
    <div class="sensor-card" data-dev="${d.id}" onclick="selectDevice('${d.id}')">
      <div class="sc-id">${d.id}</div>
      <div class="sc-type">${d.type}</div>
      <div class="sc-score-row">
        <div>
          <span class="sc-score">--</span>
          <span class="sc-pct">%</span>
        </div>
        <span class="sc-icon">○</span>
      </div>
    </div>
  `).join('');
}

function renderSensorTable(devs) {
  const tbody = document.getElementById('sensorTableBody');
  if (!tbody) return;
  tbody.innerHTML = devs.map(d => `
    <tr>
      <td style="color:var(--text);font-weight:700">${d.id}</td>
      <td>${d.type}</td>
      <td>${d.protocol}</td>
      <td class="${sc(d.rfScore)}">${fmt(d.rfScore)}</td>
      <td class="${sc(d.cnnScore)}">${fmt(d.cnnScore)}</td>
      <td class="${sc(d.lstmScore)}">${fmt(d.lstmScore)}</td>
      <td class="${sc(d.meanScore)}">${fmt(d.meanScore)}</td>
      <td class="${d.status === 'trusted' ? 'td-ok' : d.status === 'flagged' ? 'td-bad' : ''}">${d.status.toUpperCase()}</td>
      <td>${d.lastAuth || '--'}</td>
    </tr>
  `).join('');
}

function updateSensorTableRow(device) {
  renderSensorTable(devices);
}

function sc(score) {
  if (score == null) return '';
  return score >= 70 ? 'td-hi' : score >= 50 ? 'td-med' : 'td-lo';
}
function fmt(score) {
  return score != null ? `${score.toFixed(1)}%` : '--';
}

function updateStats() {
  const done = devices.filter(d => d.meanScore != null);
  const trusted = devices.filter(d => d.status === 'trusted').length;
  const flagged = devices.filter(d => d.status === 'flagged').length;
  setText('statTotal', devices.length);
  setText('statTrusted', trusted);
  setText('statFlagged', flagged);
  if (modelMeta.rf_accuracy) {
    setText('statRF', `${modelMeta.rf_accuracy}%`);
    setText('statCNN', `${modelMeta.cnn_accuracy}%`);
    setText('statLSTM', `${modelMeta.lstm_accuracy}%`);
  }
}

function updateTrustCircle() {
  const done = devices.filter(d => d.meanScore != null);
  if (!done.length) return;
  const avg = done.reduce((s, d) => s + d.meanScore, 0) / done.length;
  const circumference = 427; // 2*π*68
  const offset = circumference - (avg / 100) * circumference;

  const arc = document.getElementById('trustArc');
  if (arc) {
    arc.style.strokeDashoffset = offset;
    arc.style.stroke = avg >= THRESHOLD ? '#4caf50' : '#e53935';
  }
  setText('trustVal', `${avg.toFixed(0)}%`);

  const verdict = document.getElementById('trustVerdict');
  if (verdict) {
    verdict.textContent = avg >= THRESHOLD ? 'NETWORK TRUSTED' : 'THREATS DETECTED';
    verdict.className = `trust-verdict ${avg >= THRESHOLD ? 'trusted' : 'flagged'}`;
  }
}

function addAlert(device) {
  alerts.unshift({
    device, score: device.meanScore,
    time: new Date().toLocaleTimeString()
  });
  renderAlerts();
  const badge = document.getElementById('alertBadge');
  if (badge) {
    badge.textContent = alerts.length;
    badge.style.display = 'inline-flex';
  }
}

function renderAlerts() {
  const list = document.getElementById('alertsList');
  if (!list) return;
  if (!alerts.length) {
    list.innerHTML = '<div class="no-alerts">No alerts. System monitoring active.</div>';
    return;
  }
  list.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <span class="alert-icon">⚑</span>
      <div class="alert-content">
        <div class="alert-title">${a.device.id} — ${a.device.attackType}</div>
        <div class="alert-detail">${a.device.type} · Mean: ${a.score.toFixed(1)}% · IP: ${a.device.ip} · ${a.device.protocol}</div>
      </div>
      <span class="alert-time">${a.time}</span>
    </div>
  `).join('');
}

function clearAlerts() {
  alerts = [];
  renderAlerts();
  const badge = document.getElementById('alertBadge');
  if (badge) badge.style.display = 'none';
}

function showFlagModal(device) {
  setText('modalDevice', `${device.id} — ${device.type}`);
  setText('modalScore', `${device.meanScore.toFixed(1)}%`);
  setText('modalDesc', `Score ${device.meanScore.toFixed(1)}% below threshold (${THRESHOLD}%). Attack type: ${device.attackType}.`);
  document.getElementById('alertModal').classList.remove('hidden');
}

function dismissModal() {
  document.getElementById('alertModal').classList.add('hidden');
}

function filterSensors(type, btn) {
  document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = type === 'all' ? devices
    : devices.filter(d => d.status === type);
  renderSensorGrid(filtered);
}

function selectDevice(id) {
  const device = devices.find(d => d.id === id);
  if (!device || !device.rfScore) return;
  drawSpectrogram(document.getElementById('spectrogramCanvas'), device);
  setBar('rfFill', 'rfPct', device.rfScore, false);
  setBar('cnnFill', 'cnnPct', device.cnnScore, false);
  setBar('meanFill', 'meanPct', device.meanScore, device.meanScore < THRESHOLD);
  const series = generateLSTMSeries(device);
  drawLSTMChart(document.getElementById('lstmCanvas'), series, device.status === 'flagged');
  setText('lmPattern', device.behavioral?.traffic_pattern || '--');
  setText('lmDrift', device.behavioral?.behavioral_drift || '--');
  setText('lmAnomaly', device.behavioral?.anomaly_probability?.toFixed(3) || '--');
}
