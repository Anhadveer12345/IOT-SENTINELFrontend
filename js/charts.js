// charts.js — Monochrome canvas rendering

function drawSpectrogram(canvas, device) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const isAttack = device?.attackType !== 'Normal';
  const cols = 180, rows = 18;
  const cw = W / cols, rh = H / rows;

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const freq = y / rows;
      let intensity;
      if (isAttack) {
        intensity = Math.random() * 0.7 + Math.sin(x * 0.4 + freq * 8) * 0.25;
      } else {
        const center = 0.3 + (device ? (parseInt(device.id.split('-')[1]) % 5) * 0.07 : 0.1);
        const dist = Math.abs(freq - center);
        intensity = Math.exp(-dist * dist * 40) * (0.6 + Math.random() * 0.4) + Math.random() * 0.04;
      }
      intensity = Math.min(1, Math.max(0, intensity));
      const v = Math.round(intensity * 255);
      ctx.fillStyle = isAttack
        ? `rgb(${Math.round(v * 0.9)}, ${Math.round(v * 0.3)}, ${Math.round(v * 0.3)})`
        : `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(x * cw, y * rh, cw + 0.5, rh + 0.5);
    }
  }

  // Frequency line (normal devices)
  if (!isAttack && device) {
    const center = 0.3 + (parseInt(device.id.split('-')[1]) % 5) * 0.07;
    const y = center * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawLSTMChart(canvas, series, isAttack) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(...series) + 8;
  const min = Math.max(0, Math.min(...series) - 8);
  const range = max - min || 1;
  const pts = series.map((v, i) => ({
    x: (i / (series.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 16) - 8
  }));

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Threshold
  const thY = H - ((70 - min) / range) * (H - 16) - 8;
  ctx.strokeStyle = 'rgba(255,160,0,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.moveTo(0, thY); ctx.lineTo(W, thY); ctx.stroke();
  ctx.setLineDash([]);

  // Fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isAttack ? 'rgba(229,57,53,0.2)' : 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = isAttack ? '#e53935' : '#e8e8e8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // End dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = isAttack ? '#e53935' : '#ffffff';
  ctx.fill();
}

function drawLineChart(canvasId, datasets, labels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { l: 30, r: 10, t: 10, b: 22 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  ctx.clearRect(0, 0, W, H);

  const allVals = datasets.flatMap(d => d.data);
  const max = Math.max(...allVals) * 1.15 || 50;
  const len = labels.length;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '8px Space Mono';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(((4 - i) / 4) * max), PAD.l - 4, y + 3);
  }

  datasets.forEach(ds => {
    const pts = ds.data.map((v, i) => ({
      x: PAD.l + (i / Math.max(len - 1, 1)) * cW,
      y: PAD.t + cH - ((v / max) * cH)
    }));

    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grad.addColorStop(0, ds.color.replace(')', ',0.15)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, PAD.t + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, PAD.t + cH);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = ds.color; ctx.lineWidth = 1.5; ctx.stroke();
  });

  // X labels
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '8px Space Mono'; ctx.textAlign = 'center';
  for (let i = 0; i < len; i += Math.max(1, Math.ceil(len / 6))) {
    const x = PAD.l + (i / Math.max(len - 1, 1)) * cW;
    ctx.fillText(labels[i], x, H - 4);
  }

  // Legend
  ctx.textAlign = 'left'; ctx.font = '8px Space Mono';
  datasets.forEach((ds, i) => {
    const lx = PAD.l + i * 90;
    ctx.fillStyle = ds.color;
    ctx.fillRect(lx, 2, 12, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(ds.label, lx + 16, 8);
  });
}

function drawBarChart(canvasId, entries, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(...entries.map(e => e[1])) || 1;
  const labelW = 100;

  entries.forEach(([label, count], i) => {
    const y = i * 28 + 8;
    const barW = ((count / max) * (W - labelW - 50));
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(labelW, y, barW, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px Space Mono'; ctx.textAlign = 'right';
    ctx.fillText(label.substring(0, 12), labelW - 6, y + 11);
    ctx.fillStyle = colors[i % colors.length];
    ctx.textAlign = 'left'; ctx.font = '9px Space Mono';
    ctx.fillText(count, labelW + barW + 5, y + 11);
  });
  ctx.textAlign = 'left';
}

function drawColumnChart(canvasId, entries) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { l: 8, r: 8, t: 12, b: 28 };
  ctx.clearRect(0, 0, W, H);

  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const max = Math.max(...entries.map(e => e[1])) || 1;
  const bw = cW / entries.length - 6;

  entries.forEach(([label, count], i) => {
    const x = PAD.l + i * (cW / entries.length) + 3;
    const bH = (count / max) * cH;
    const y = PAD.t + cH - bH;
    const shade = Math.round(60 + (i / entries.length) * 120);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, bw, bH);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '7px Space Mono'; ctx.textAlign = 'center';
    ctx.fillText(label.substring(0, 5), x + bw / 2, H - 14);
    ctx.fillText(count, x + bw / 2, y - 3);
  });
  ctx.textAlign = 'left';
}