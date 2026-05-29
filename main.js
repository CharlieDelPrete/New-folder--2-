/* ===========================
   PAPER PLANES — main.js
   Physics flight game + animations
=========================== */

"use strict";

// ===========================
// SCROLL FADE-IN ANIMATIONS
// ===========================
const fadeEls = document.querySelectorAll(
  '.science-card, .design-card, .section-title, .section-intro, .axis-list li'
);

fadeEls.forEach(el => el.classList.add('fade-in'));

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12 });

fadeEls.forEach(el => observer.observe(el));

// ===========================
// HERO PLANE PARALLAX
// ===========================
document.addEventListener('mousemove', (e) => {
  const plane = document.querySelector('.hero-plane');
  if (!plane) return;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const dx = (e.clientX - cx) / cx;
  const dy = (e.clientY - cy) / cy;
  plane.style.transform = `translateY(${dy * -12}px) rotate(${dx * 4}deg)`;
});

// ===========================
// PAPER PLANE PHYSICS GAME
// ===========================

const GAME_W = 900;
const GAME_H = 420;

// Plane types: each affects physics parameters
const PLANE_TYPES = {
  dart: {
    name: 'Dart',
    icon: '→',
    stat: 'Max Distance',
    mass: 0.004,        // kg (light)
    dragCoeff: 0.015,   // low drag
    liftCoeff: 0.22,
    stallAngle: 22,     // degrees
    color: '#faf7f2',
  },
  glider: {
    name: 'Glider',
    icon: '~',
    stat: 'Max Hang Time',
    mass: 0.003,
    dragCoeff: 0.02,
    liftCoeff: 0.38,    // high lift
    stallAngle: 18,
    color: '#c8e8ff',
  },
  delta: {
    name: 'Delta',
    icon: '▲',
    stat: 'Stunt / Loops',
    mass: 0.005,
    dragCoeff: 0.025,
    liftCoeff: 0.28,
    stallAngle: 30,     // wide stall range = maneuverable
    color: '#ffe8c8',
  },
};

// Physics constants
const G = 9.81;         // m/s²
const AIR_DENSITY = 1.225; // kg/m³
const WING_AREA = 0.02; // m²
const SCALE = 60;       // pixels per metre
const FPS = 60;
const DT = 1 / FPS;

// Obstacle/ring config
const RING_COUNT = 5;
const RING_SPACING = 130;

// Game state
let state = {
  phase: 'ready',      // ready | flying | landed
  plane: null,
  rings: [],
  ringsHit: 0,
  distance: 0,
  maxHeight: 0,
  hangTime: 0,
  bestDistance: parseFloat(localStorage.getItem('pb_distance') || '0'),
  animId: null,
  selectedType: 'dart',
  throwAngle: 15,       // degrees
  throwSpeed: 18,       // m/s
  turbulenceOn: false,
};

// ---- Build DOM ----
function buildGameUI() {
  const root = document.getElementById('game-root');
  root.innerHTML = `
    <div class="game-container">
      <div class="game-controls">
        <h3>TUNE YOUR PLANE</h3>

        <div class="control-group">
          <div class="control-label">Throw Angle <span class="control-value" id="angleVal">15°</span></div>
          <input type="range" id="angleSlider" min="0" max="45" value="15" step="1" />
        </div>

        <div class="control-group">
          <div class="control-label">Throw Power <span class="control-value" id="powerVal">18 m/s</span></div>
          <input type="range" id="powerSlider" min="8" max="30" value="18" step="0.5" />
        </div>

        <div class="control-group">
          <div class="control-label">Wing Weight <span class="control-value" id="weightVal">—</span></div>
          <input type="range" id="weightSlider" min="0.002" max="0.008" value="0.004" step="0.0005" />
        </div>

        <div class="control-group" style="margin-bottom:1rem;">
          <div class="control-label" style="margin-bottom:0.8rem;">Plane Type</div>
          <div class="plane-type-btns" id="planeTypeBtns">
            ${Object.entries(PLANE_TYPES).map(([key, p]) => `
              <button class="plane-btn ${key === 'dart' ? 'active' : ''}" data-type="${key}">
                <span>${p.icon}</span>
                <span class="plane-btn-name">${p.name}</span>
                <span class="plane-btn-stat">${p.stat}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="control-group" style="display:flex;align-items:center;gap:0.7rem;">
          <input type="checkbox" id="turbCheck" style="accent-color:var(--game-accent);cursor:pointer;width:14px;height:14px;" />
          <label for="turbCheck" style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.4);cursor:pointer;">Turbulence</label>
        </div>

        <button class="launch-btn" id="launchBtn">LAUNCH ✈</button>
        <button class="reset-btn" id="resetBtn">↺ Reset</button>
      </div>

      <div class="game-canvas-wrapper">
        <canvas id="gameCanvas" width="${GAME_W}" height="${GAME_H}"></canvas>
        <div class="game-stats-bar">
          <div class="stat-box">
            <span class="stat-box-label">Distance</span>
            <span class="stat-box-value" id="statDist">0.0 m</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Height</span>
            <span class="stat-box-value" id="statHeight">0.0 m</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Air Time</span>
            <span class="stat-box-value" id="statTime">0.0 s</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Rings ✓</span>
            <span class="stat-box-value" id="statRings">0 / ${RING_COUNT}</span>
          </div>
        </div>
        <div class="game-message" id="gameMsg">
          <h4>READY TO FLY</h4>
          <p>Adjust angle & power, then launch.</p>
        </div>
      </div>
    </div>
  `;

  // Events
  const angleSlider = document.getElementById('angleSlider');
  const powerSlider = document.getElementById('powerSlider');
  const weightSlider = document.getElementById('weightSlider');

  angleSlider.addEventListener('input', () => {
    state.throwAngle = parseFloat(angleSlider.value);
    document.getElementById('angleVal').textContent = state.throwAngle + '°';
    if (state.phase === 'ready') drawReady();
  });

  powerSlider.addEventListener('input', () => {
    state.throwSpeed = parseFloat(powerSlider.value);
    document.getElementById('powerVal').textContent = state.throwSpeed.toFixed(1) + ' m/s';
  });

  weightSlider.addEventListener('input', () => {
    const w = parseFloat(weightSlider.value);
    document.getElementById('weightVal').textContent = (w * 1000).toFixed(1) + ' g';
    state.customMass = w;
  });

  document.getElementById('planeTypeBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('.plane-btn');
    if (!btn) return;
    document.querySelectorAll('.plane-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedType = btn.dataset.type;
    if (state.phase === 'ready') drawReady();
  });

  document.getElementById('turbCheck').addEventListener('change', (e) => {
    state.turbulenceOn = e.target.checked;
  });

  document.getElementById('launchBtn').addEventListener('click', () => {
    if (state.phase === 'flying') return;
    startFlight();
  });

  document.getElementById('resetBtn').addEventListener('click', resetGame);

  // Init display
  document.getElementById('weightVal').textContent =
    (parseFloat(weightSlider.value) * 1000).toFixed(1) + ' g';

  drawReady();
}

// ---- Canvas helpers ----
function getCanvas() { return document.getElementById('gameCanvas'); }
function getCtx() { return getCanvas().getContext('2d'); }

// Convert sim coords to canvas coords
// sim: x = metres from launch, y = metres above ground
// canvas: origin at launch point left side, ground at bottom
const GROUND_PX = GAME_H - 60;
const LAUNCH_X_PX = 60;

function simToCanvas(x, y) {
  return {
    cx: LAUNCH_X_PX + x * SCALE,
    cy: GROUND_PX - y * SCALE,
  };
}

// ---- Draw background ----
function drawBackground(ctx) {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_PX);
  grad.addColorStop(0, '#0a1f35');
  grad.addColorStop(1, '#0d3a5c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GROUND_PX);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const starPositions = [
    [80,20],[180,40],[320,15],[500,30],[680,10],[820,25],
    [140,70],[450,55],[730,65],[880,35],[60,100],[290,90],
  ];
  starPositions.forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx, sy, 1, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ground
  const groundGrad = ctx.createLinearGradient(0, GROUND_PX, 0, GAME_H);
  groundGrad.addColorStop(0, '#1a3a1a');
  groundGrad.addColorStop(1, '#0f2210');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_PX, GAME_W, GAME_H - GROUND_PX);

  // Ground line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_PX);
  ctx.lineTo(GAME_W, GROUND_PX);
  ctx.stroke();

  // Distance markers
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '10px DM Mono, monospace';
  ctx.textAlign = 'center';
  for (let m = 1; m * SCALE < GAME_W - LAUNCH_X_PX; m++) {
    const px = LAUNCH_X_PX + m * SCALE;
    if (px > GAME_W) break;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(px, GROUND_PX);
    ctx.lineTo(px, GROUND_PX + 6);
    ctx.stroke();
    if (m % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText(m + 'm', px, GROUND_PX + 18);
    }
  }

  // Person / launcher at origin
  drawLauncher(ctx);
}

function drawLauncher(ctx) {
  const x = LAUNCH_X_PX - 10;
  const y = GROUND_PX;
  ctx.fillStyle = '#f0c840';
  // body
  ctx.fillRect(x, y - 30, 8, 20);
  // head
  ctx.beginPath();
  ctx.arc(x + 4, y - 34, 6, 0, Math.PI * 2);
  ctx.fill();
  // arm
  ctx.strokeStyle = '#f0c840';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 4, y - 22);
  const rad = (-(state.throwAngle || 15) * Math.PI / 180);
  ctx.lineTo(x + 4 + Math.cos(rad) * 18, y - 22 + Math.sin(rad) * 18);
  ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 10);
  ctx.lineTo(x, y);
  ctx.moveTo(x + 6, y - 10);
  ctx.lineTo(x + 8, y);
  ctx.stroke();
}

// ---- Draw rings ----
function drawRings(ctx, rings, cameraX) {
  rings.forEach((ring, i) => {
    const px = LAUNCH_X_PX + (ring.x - cameraX) * SCALE;
    const py = GROUND_PX - ring.y * SCALE;
    if (px < -30 || px > GAME_W + 30) return;

    ctx.save();
    ctx.strokeStyle = ring.hit ? 'rgba(100,255,100,0.5)' : 'rgba(240,200,64,0.8)';
    ctx.lineWidth = ring.hit ? 2 : 3;
    ctx.shadowColor = ring.hit ? '#64ff64' : '#f0c840';
    ctx.shadowBlur = ring.hit ? 6 : 12;
    ctx.beginPath();
    ctx.ellipse(px, py, 18, 24, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (!ring.hit) {
      ctx.fillStyle = 'rgba(240,200,64,0.6)';
      ctx.font = 'bold 10px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`R${i+1}`, px, py - 30);
    }
    ctx.restore();
  });
}

// ---- Draw plane ----
function drawPlane(ctx, px, py, angle, planeType) {
  const p = PLANE_TYPES[planeType];
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-angle * Math.PI / 180);

  const scale = 1;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  // Main body
  ctx.fillStyle = p.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.8;

  if (planeType === 'dart') {
    ctx.beginPath();
    ctx.moveTo(-22 * scale, 0);
    ctx.lineTo(22 * scale, -5 * scale);
    ctx.lineTo(16 * scale, 0);
    ctx.lineTo(22 * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(-22 * scale, 0);
    ctx.lineTo(16 * scale, 0);
    ctx.lineTo(4 * scale, 12 * scale);
    ctx.closePath();
    ctx.fill();
  } else if (planeType === 'glider') {
    // Wide wing
    ctx.beginPath();
    ctx.moveTo(-10 * scale, 0);
    ctx.lineTo(20 * scale, -4 * scale);
    ctx.lineTo(14 * scale, 0);
    ctx.lineTo(20 * scale, 4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Extra wide wings
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-10 * scale, 0);
    ctx.lineTo(10 * scale, -16 * scale);
    ctx.lineTo(14 * scale, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10 * scale, 0);
    ctx.lineTo(10 * scale, 16 * scale);
    ctx.lineTo(14 * scale, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else { // delta
    ctx.beginPath();
    ctx.moveTo(-18 * scale, 0);
    ctx.lineTo(20 * scale, -14 * scale);
    ctx.lineTo(14 * scale, 0);
    ctx.lineTo(20 * scale, 14 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// ---- Trajectory preview ----
function drawTrajectory(ctx) {
  const pType = PLANE_TYPES[state.selectedType];
  const mass = state.customMass || pType.mass;
  const angle = state.throwAngle;
  const speed = state.throwSpeed;

  const rad = angle * Math.PI / 180;
  let vx = speed * Math.cos(rad);
  let vy = speed * Math.sin(rad);
  let x = 0;
  let y = 1.5; // launch height in metres

  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(240,200,64,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(LAUNCH_X_PX, GROUND_PX - y * SCALE);

  for (let t = 0; t < 200; t++) {
    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);
    const flightAngle = Math.atan2(vy, vx) * 180 / Math.PI;
    const aoa = flightAngle;

    const lift = 0.5 * AIR_DENSITY * v2 * WING_AREA * pType.liftCoeff * Math.sin(Math.abs(aoa) * Math.PI / 180);
    const drag = 0.5 * AIR_DENSITY * v2 * WING_AREA * pType.dragCoeff;

    const liftX = -lift * (vy / (v + 0.001));
    const liftY = lift * (vx / (v + 0.001));
    const dragX = -drag * (vx / (v + 0.001));
    const dragY = -drag * (vy / (v + 0.001));

    const ax = (liftX + dragX) / mass;
    const ay = (liftY + dragY) / mass - G;

    vx += ax * DT;
    vy += ay * DT;
    x += vx * DT;
    y += vy * DT;

    if (y <= 0) break;

    const cx2 = LAUNCH_X_PX + x * SCALE;
    const cy2 = GROUND_PX - y * SCALE;
    if (cx2 > GAME_W) break;
    ctx.lineTo(cx2, cy2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---- Draw ready state ----
function drawReady() {
  const canvas = getCanvas();
  if (!canvas) return;
  const ctx = getCtx();

  ctx.clearRect(0, 0, GAME_W, GAME_H);
  drawBackground(ctx);

  // Draw rings at their initial positions
  const rings = buildRings();
  drawRings(ctx, rings, 0);

  // Trajectory preview
  drawTrajectory(ctx);

  // Plane at launch pos
  const launchY = GROUND_PX - 1.5 * SCALE;
  drawPlane(ctx, LAUNCH_X_PX, launchY, state.throwAngle, state.selectedType);
}

// ---- Build rings ----
function buildRings() {
  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
    rings.push({
      x: (i + 1) * (RING_SPACING / SCALE),  // metres
      y: 1.5 + Math.random() * 3,            // metres above ground
      hit: false,
    });
  }
  return rings;
}

// ---- Start flight simulation ----
function startFlight() {
  if (state.animId) cancelAnimationFrame(state.animId);

  const pType = PLANE_TYPES[state.selectedType];
  const mass = state.customMass || pType.mass;
  const angle = state.throwAngle;
  const speed = state.throwSpeed;
  const rad = angle * Math.PI / 180;

  state.rings = buildRings();
  state.ringsHit = 0;
  state.phase = 'flying';

  const plane = {
    x: 0,            // metres
    y: 1.5,          // metres (launch height)
    vx: speed * Math.cos(rad),
    vy: speed * Math.sin(rad),
    angle: angle,    // display angle
    trail: [],
  };

  state.plane = plane;
  state.distance = 0;
  state.maxHeight = 0;
  state.hangTime = 0;

  document.getElementById('launchBtn').disabled = true;
  hideMessage();

  const startTime = performance.now();
  let lastTime = startTime;
  let totalTime = 0;

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    totalTime += dt;

    const p = plane;
    const v2 = p.vx * p.vx + p.vy * p.vy;
    const v = Math.sqrt(v2);

    // Angle of attack
    const flightAngle = Math.atan2(p.vy, p.vx) * 180 / Math.PI;
    const aoa = Math.max(-pType.stallAngle, Math.min(pType.stallAngle, flightAngle));
    const aoaRad = Math.abs(aoa) * Math.PI / 180;

    // Forces
    let liftMag = 0.5 * AIR_DENSITY * v2 * WING_AREA * pType.liftCoeff * Math.sin(aoaRad);
    const dragMag = 0.5 * AIR_DENSITY * v2 * WING_AREA * pType.dragCoeff;

    // Stall: lift drops off above stall angle
    if (Math.abs(flightAngle) > pType.stallAngle) {
      liftMag *= 0.3;
    }

    // Lift is perpendicular to velocity
    const normX = -p.vy / (v + 0.001);
    const normY = p.vx / (v + 0.001);
    const liftX = liftMag * normX;
    const liftY = liftMag * normY;

    // Drag opposes velocity
    const dragX = -dragMag * (p.vx / (v + 0.001));
    const dragY = -dragMag * (p.vy / (v + 0.001));

    // Turbulence
    let turbX = 0, turbY = 0;
    if (state.turbulenceOn) {
      turbX = (Math.random() - 0.5) * 0.8;
      turbY = (Math.random() - 0.5) * 0.8;
    }

    const ax = (liftX + dragX) / mass + turbX;
    const ay = (liftY + dragY - mass * G) / mass + turbY;

    p.vx += ax * dt;
    p.vy += ay * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Display angle tracks velocity
    p.angle = Math.atan2(p.vy, p.vx) * 180 / Math.PI;

    // Record trail
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 90) p.trail.shift();

    // Stats
    state.distance = Math.max(state.distance, p.x);
    state.maxHeight = Math.max(state.maxHeight, p.y);
    state.hangTime = totalTime;

    // Ring collision
    state.rings.forEach(ring => {
      if (!ring.hit) {
        const dx = Math.abs(p.x - ring.x) * SCALE;
        const dy = Math.abs(p.y - ring.y) * SCALE;
        if (dx < 20 && dy < 26) {
          ring.hit = true;
          state.ringsHit++;
          showRingPop(ring);
        }
      }
    });

    // Camera follows plane
    const targetCamX = Math.max(0, p.x - 5);
    const camX = targetCamX;

    // Render
    render(camX);

    // Update stats
    document.getElementById('statDist').textContent = p.x.toFixed(1) + ' m';
    document.getElementById('statHeight').textContent = p.y.toFixed(1) + ' m';
    document.getElementById('statTime').textContent = totalTime.toFixed(1) + ' s';
    document.getElementById('statRings').textContent = `${state.ringsHit} / ${RING_COUNT}`;

    // End condition
    if (p.y <= 0 || p.x * SCALE > GAME_W * 4) {
      p.y = 0;
      state.phase = 'landed';
      render(camX);
      handleLanding(totalTime);
      return;
    }

    state.animId = requestAnimationFrame(tick);
  }

  state.animId = requestAnimationFrame(tick);
}

function render(camX) {
  const ctx = getCtx();
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  drawBackground(ctx);
  drawRings(ctx, state.rings, camX);

  if (state.plane) {
    const p = state.plane;

    // Trail
    if (p.trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(240,200,64,0.15)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      p.trail.forEach((pt, i) => {
        const { cx, cy } = simToCanvas(pt.x - camX, pt.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const { cx, cy } = simToCanvas(p.x - camX, p.y);
    drawPlane(ctx, cx, cy, p.angle, state.selectedType);
  }
}

function handleLanding(totalTime) {
  const dist = state.distance;
  document.getElementById('launchBtn').disabled = false;

  let title = '';
  let msg = '';

  if (dist < 2) {
    title = 'NOSE DIVE!';
    msg = 'Too steep. Try a shallower angle.';
  } else if (dist < 5) {
    title = 'SHORT FLIGHT';
    msg = `${dist.toFixed(1)}m — not bad, but you can do better!`;
  } else if (dist < 10) {
    title = 'GOOD FLIGHT!';
    msg = `${dist.toFixed(1)}m — solid throw. Keep tuning.`;
  } else {
    title = '✈ EXCELLENT!';
    msg = `${dist.toFixed(1)}m — that's some serious glide!`;
  }

  // Personal best
  if (dist > state.bestDistance) {
    state.bestDistance = dist;
    try { localStorage.setItem('pb_distance', dist.toFixed(2)); } catch(e) {}
    msg += ` 🏆 New personal best!`;
  }

  if (state.ringsHit > 0) {
    msg += ` Hit ${state.ringsHit}/${RING_COUNT} rings!`;
  }

  showMessage(title, msg);
}

// ---- Ring pop effect ----
function showRingPop(ring) {
  // brief flash on stats bar
  const el = document.getElementById('statRings');
  if (!el) return;
  el.style.color = '#64ff64';
  setTimeout(() => { el.style.color = ''; }, 400);
}

// ---- Message helpers ----
function showMessage(title, body) {
  const el = document.getElementById('gameMsg');
  if (!el) return;
  el.innerHTML = `<h4>${title}</h4><p>${body}</p>`;
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
}

function hideMessage() {
  const el = document.getElementById('gameMsg');
  if (!el) return;
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
}

function resetGame() {
  if (state.animId) cancelAnimationFrame(state.animId);
  state.phase = 'ready';
  state.plane = null;
  state.rings = [];
  state.ringsHit = 0;
  state.distance = 0;
  state.maxHeight = 0;
  state.hangTime = 0;
  document.getElementById('launchBtn').disabled = false;
  document.getElementById('statDist').textContent = '0.0 m';
  document.getElementById('statHeight').textContent = '0.0 m';
  document.getElementById('statTime').textContent = '0.0 s';
  document.getElementById('statRings').textContent = `0 / ${RING_COUNT}`;
  showMessage('READY TO FLY', 'Adjust angle & power, then launch.');
  drawReady();
}

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  buildGameUI();
});

// Redraw ready state on resize
window.addEventListener('resize', () => {
  if (state.phase === 'ready') drawReady();
});