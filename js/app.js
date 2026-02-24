// app.js — Navigation, init, analytics, device connect

let currentPage = 'dashboard';

// ── Check Login ───────────────────────────────
(function checkAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
  const user = getUser();
  if (user) {
    // Show user name in nav
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = user.name.toUpperCase();
  }
})();

// ── Navigation ────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    if (page) showPage(page);
  });
});

function showPage(page) {
  document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  currentPage = page;
  const el = document.getElementById(`page${page[0].toUpperCase() + page.slice(1)}`);
  if (el) el.classList.remove('hidden');
  const link = document.querySelector(`[data-page="${page}"]`);
  if (link) link.classList.add('active');
  if (page === 'analytics') renderAnalytics();
  if (page === 'sensors') renderSensorTable(devices);
  if (page === 'alerts') renderAlerts();
}

// ── Logout ────────────────────────────────────
async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST', headers: authHeaders()
    });
  } catch (e) { }
  localStorage.removeItem('iot_token');
  localStorage.removeItem('iot_user');
  localStorage.removeItem('iot_api_key');
  window.location.href = 'login.html';
}

// ── Load Real Devices from Backend DB ─────────
async function loadRealDevices() {
  try {
    const res = await fetch(`${API_URL}/devices`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data.devices && data.devices.length > 0) {
      devices = data.devices.map(d => ({
        id: d.device_id,
        type: d.device_type || 'Unknown',
        ip: d.ip || '--',
        protocol: d.protocol || '--',
        mac: d.mac || '--',
        attackType: 'Normal',
        features: generateFeatures('Normal'),
        timeSeries: generateTimeSeries('Normal'),
        rfScore: d.rf_score || null,
        cnnScore: d.cnn_score || null,
        lstmScore: d.lstm_score || null,
        meanScore: d.mean_score || null,
        status: d.trusted === 1 ? 'trusted' : d.trusted === 0 ? 'flagged' : 'idle',
        lastAuth: d.last_auth || null,
        behavioral: null
      }));
      renderSensorGrid(devices);
      renderSensorTable(devices);
      updateStats();
      updateTrustCircle();
      if (devices.length > 0) {
        showToast(`Loaded ${devices.length} registered device${devices.length > 1 ? 's' : ''}`, 'info');
      }
    } else {
      // No devices yet — show empty state
      devices = [];
      renderSensorGrid([]);
      renderSensorTable([]);
    }
  } catch (e) { }
}

// ── Connect Device Modal ──────────────────────
function showConnectModal() {
  document.getElementById('connectModal').classList.remove('hidden');
  document.getElementById('connectInstructions').classList.add('hidden');
  document.getElementById('connectDeviceId').value = '';
}

function closeConnectModal() {
  document.getElementById('connectModal').classList.add('hidden');
}

function generateConnectCode() {
  const id = document.getElementById('connectDeviceId').value.trim();
  const type = document.getElementById('connectDeviceType').value;

  if (!id) { showToast('Please enter a Device ID', 'fail'); return; }

  // Register device in backend
  fetch(`${API_URL}/devices/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ device_id: id, device_type: type })
  }).then(() => {
    loadRealDevices();
    showToast(`Device ${id} registered`, 'ok');
  }).catch(() => { });

  const apiKey = getApiKey();
  const code =
    `# IoT Sentinel — Device Agent
# Requirements: pip install requests
# Run: python sensor_agent.py

import requests, time, random, socket

DEVICE_ID   = "${id}"
DEVICE_TYPE = "${type}"
SERVER      = "${API_URL}"
API_KEY     = "${apiKey}"
INTERVAL    = 10  # seconds between readings

def get_features():
    return {
        "packet_size":         random.gauss(200, 50),
        "inter_arrival_time":  random.gauss(0.8, 0.1),
        "flow_duration":       30,
        "packets_per_sec":     random.gauss(15, 3),
        "bytes_per_sec":       random.gauss(3000, 500),
        "tcp_flags":           24,
        "syn_count":           1,
        "ack_count":           40,
        "dst_port":            1883,
        "protocol":            1,
        "signal_strength":     random.gauss(-65, 3),
        "snr":                 random.gauss(25, 2),
        "freq_drift":          2,
        "tx_power":            20,
        "channel_utilization": random.gauss(30, 5),
        "traffic_entropy":     random.gauss(1.5, 0.2),
        "burst_count":         1,
        "idle_time":           2,
        "retransmissions":     0.2,
        "payload_entropy":     3.0
    }

history = []
print(f"[Agent] {DEVICE_ID} starting...")

while True:
    try:
        f = get_features()
        history.append(f)
        if len(history) > 10:
            history.pop(0)
        r = requests.post(f"{SERVER}/authenticate", json={
            "device_id":   DEVICE_ID,
            "device_type": DEVICE_TYPE,
            "api_key":     API_KEY,
            "features":    f,
            "time_series": history,
            "ip": socket.gethostbyname(socket.gethostname())
        }, timeout=10)
        result = r.json()
        status = "TRUSTED" if result["trusted"] else "FLAGGED"
        print(f"Score: {result['mean_score']}% — {status}")
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(INTERVAL)`;

  document.getElementById('connectCode').textContent = code;
  document.getElementById('connectInstructions').classList.remove('hidden');
}

function copyConnectCode() {
  const code = document.getElementById('connectCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Script copied to clipboard', 'ok');
  }).catch(() => showToast('Copy failed — select manually', 'fail'));
}

// ── Analytics ─────────────────────────────────
function renderAnalytics() {
  const pts = 18;
  const now = Date.now();
  const labels = Array.from({ length: pts }, (_, i) => {
    const d = new Date(now - (pts - i) * 25000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  let ta = 0, fa = 0;
  const trusted = [], flagged = [];
  for (let i = 0; i < pts; i++) {
    ta += randInt(8, 14); fa += randInt(0, 4);
    trusted.push(ta); flagged.push(fa);
  }
  drawLineChart('historyChart', [
    { label: 'Trusted', data: trusted, color: 'rgb(76,175,80)' },
    { label: 'Flagged', data: flagged, color: 'rgb(229,57,53)' }
  ], labels);

  const rfT = Array.from({ length: pts }, () => rand(82, 94));
  const cnnT = Array.from({ length: pts }, () => rand(84, 96));
  const lstmT = Array.from({ length: pts }, () => rand(80, 93));
  drawLineChart('trendChart', [
    { label: 'RF', data: rfT, color: 'rgb(200,200,200)' },
    { label: 'CNN', data: cnnT, color: 'rgb(140,140,140)' },
    { label: 'LSTM', data: lstmT, color: 'rgb(100,100,100)' }
  ], labels);

  const demoDevs = devices.length ? devices : generateDevicePool(24);
  const attackCounts = {};
  demoDevs.forEach(d => { attackCounts[d.attackType] = (attackCounts[d.attackType] || 0) + 1; });
  drawBarChart('attackChart',
    Object.entries(attackCounts).sort((a, b) => b[1] - a[1]),
    ['#e8e8e8', '#c0c0c0', '#999', '#777', '#555', '#444', '#333']
  );
  const typeCounts = {};
  demoDevs.forEach(d => { const k = d.type.split(' ')[0]; typeCounts[k] = (typeCounts[k] || 0) + 1; });
  drawColumnChart('deviceChart', Object.entries(typeCounts).slice(0, 9));
}

function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

// ── Backend Health Check ──────────────────────
async function checkBackend() {
  const bar = document.getElementById('backendBar');
  const msg = document.getElementById('backendMsg');
  const health = await apiHealth();

  if (health) {
    bar.classList.add('connected'); bar.classList.remove('error');
    msg.textContent = `Backend connected · RF ${health.meta?.rf_accuracy}% · CNN ${health.meta?.cnn_accuracy}% · LSTM ${health.meta?.lstm_accuracy}% accuracy`;
    modelMeta = health.meta || {};
    updateStats();
    const dot = document.getElementById('statusDot');
    if (dot) dot.style.background = 'var(--green)';
    loadRealDevices();
  } else {
    bar.classList.add('error'); bar.classList.remove('connected');
    msg.textContent = 'Backend offline or waking up · Render free tier may take ~30s to start';
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'OFFLINE';
  }
}

// ── Placeholders ──────────────────────────────
function initPlaceholders() {
  ['spectrogramCanvas', 'lstmCanvas'].forEach(id => {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = '10px Space Mono'; ctx.textAlign = 'center';
    ctx.fillText(
      id === 'spectrogramCanvas' ? 'PRESS RUN TO GENERATE RF FINGERPRINT' : 'LSTM BEHAVIORAL PROFILE PENDING',
      c.width / 2, c.height / 2
    );
  });
}

// ── Empty Sensor Grid State ───────────────────
function renderEmptySensorGrid() {
  const grid = document.getElementById('sensorGrid');
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-bottom:12px">
        NO DEVICES REGISTERED
      </div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--text3);line-height:1.8">
        Click <strong style="color:var(--text2)">+ Connect Device</strong> to add your first sensor
      </div>
    </div>`;
}

// ── Entrance Animation ────────────────────────
function animateEntrance() {
  document.querySelectorAll('.panel, .stats-bar, .hero, .backend-bar').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(12px)';
    el.style.transition = `opacity 0.4s ease ${i * 0.04}s, transform 0.4s ease ${i * 0.04}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.opacity = '1'; el.style.transform = 'translateY(0)';
    }));
  });
}

// ── Toast ─────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'ok' || type === 'success' ? 'ok' : type === 'fail' || type === 'error' ? 'fail' : 'info'}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s,transform 0.3s';
    toast.style.opacity = '0'; toast.style.transform = 'translateX(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Init ──────────────────────────────────────
window.addEventListener('load', () => {
  initPlaceholders();
  renderEmptySensorGrid();
  animateEntrance();
  checkBackend();
});

setInterval(() => { if (currentPage === 'analytics') renderAnalytics(); }, 10000);
setInterval(checkBackend, 30000);