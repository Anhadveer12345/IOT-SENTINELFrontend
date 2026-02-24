// data.js — Device pool & feature generation

const API_URL = 'https://backend-iot-sentinel-2.onrender.com';

// ── Auth Helpers ──────────────────────────────
function getToken() { return localStorage.getItem('iot_token'); }
function getApiKey() { return localStorage.getItem('iot_api_key'); }
function getUser() { return JSON.parse(localStorage.getItem('iot_user') || 'null'); }

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ── Device Types ──────────────────────────────
const DEVICE_TYPES = [
  'Temperature Sensor', 'Humidity Sensor', 'Pressure Sensor',
  'Motion Detector', 'GPS Tracker', 'Smart Meter',
  'Industrial PLC', 'Network Gateway', 'Camera Module',
  'Vibration Sensor', 'Gas Detector', 'Light Sensor',
  'RFID Reader', 'Accelerometer', 'Barometer'
];
const PROTOCOLS = ['MQTT', 'CoAP', 'HTTP', 'TCP', 'UDP'];
const ATTACK_TYPES = [
  'Normal', 'Normal', 'Normal', 'Normal', 'Normal',
  'DoS', 'MITM', 'Spoofing', 'Replay_Attack',
  'Eavesdropping', 'Port_Scan', 'ARP_Spoofing'
];

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max)); }

function generateMAC() {
  return Array.from({ length: 6 }, () =>
    randInt(0, 256).toString(16).padStart(2, '0').toUpperCase()
  ).join(':');
}

function generateFeatures(attackType) {
  const isAttack = attackType !== 'Normal';
  return {
    packet_size: isAttack ? rand(500, 1400) : rand(100, 300),
    inter_arrival_time: isAttack ? rand(0.01, 0.2) : rand(0.5, 2.0),
    flow_duration: isAttack ? rand(1, 10) : rand(20, 60),
    packets_per_sec: isAttack ? rand(500, 2000) : rand(5, 30),
    bytes_per_sec: isAttack ? rand(50000, 200000) : rand(1000, 5000),
    tcp_flags: isAttack ? randInt(0, 255) : randInt(16, 32),
    syn_count: isAttack ? rand(50, 200) : rand(0, 3),
    ack_count: isAttack ? rand(10, 50) : rand(30, 60),
    dst_port: isAttack ? randInt(0, 1024) : randInt(1024, 65535),
    protocol: randInt(0, 5),
    signal_strength: isAttack ? rand(-95, -75) : rand(-70, -55),
    snr: isAttack ? rand(2, 10) : rand(20, 35),
    freq_drift: isAttack ? rand(50, 200) : rand(0, 5),
    tx_power: isAttack ? rand(5, 15) : rand(18, 23),
    channel_utilization: isAttack ? rand(60, 95) : rand(15, 45),
    traffic_entropy: isAttack ? rand(3, 4.5) : rand(1, 2),
    burst_count: isAttack ? rand(10, 40) : rand(0, 2),
    idle_time: isAttack ? rand(0.01, 0.1) : rand(1, 5),
    retransmissions: isAttack ? rand(5, 20) : rand(0, 1),
    payload_entropy: isAttack ? rand(5.5, 7.5) : rand(2, 4)
  };
}

function generateTimeSeries(attackType, steps = 10) {
  return Array.from({ length: steps }, () => generateFeatures(attackType));
}

function generateDevicePool(count = 24) {
  return Array.from({ length: count }, (_, i) => {
    const attackType = ATTACK_TYPES[randInt(0, ATTACK_TYPES.length)];
    return {
      id: `DEV-${String(i + 1).padStart(4, '0')}`,
      mac: generateMAC(),
      type: DEVICE_TYPES[randInt(0, DEVICE_TYPES.length)],
      ip: `192.168.${randInt(0, 4)}.${randInt(1, 255)}`,
      protocol: PROTOCOLS[randInt(0, PROTOCOLS.length)],
      attackType,
      features: generateFeatures(attackType),
      timeSeries: generateTimeSeries(attackType),
      rfScore: null, cnnScore: null, lstmScore: null, meanScore: null,
      status: 'idle', lastAuth: null, lstmData: null
    };
  });
}

function generateLSTMSeries(device, points = 30) {
  const isAttack = device.attackType !== 'Normal';
  const base = isAttack ? 65 : 25;
  return Array.from({ length: points }, (_, i) => {
    const noise = isAttack ? (Math.random() - 0.5) * 35 : (Math.random() - 0.5) * 8;
    return Math.max(0, base + noise + Math.sin(i * 0.5) * (isAttack ? 10 : 4));
  });
}