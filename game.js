// ═══════════════════════════════════════════════════
//  HOLOBOX AQUA ARENA — FULL GAME ENGINE
//  Clear Holographic Pool, Ring Toss on Floating Balls
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─── PALETTE ────────────────────────────────────
const C = {
    cyan:     0x00ffff,
    magenta:  0xff00ff,
    blue:     0x4488ff,
    green:    0x00ff88,
    orange:   0xff8800,
    red:      0xff2244,
    yellow:   0xffee00,
    gold:     0xffcc00,
    poolTile: 0x004488,
    poolWall: 0x002244,
    white:    0xffffff,
};

// ─── CONFIG ─────────────────────────────────────
const POOL = { w: 16, d: 12, depth: 2.2, wallThick: 0.25 };
const GRAVITY   = -14;
const MAX_TGTS  = 8;
const GAME_SEC  = 90;
const MAX_LIVES = 5;
const COMBO_MS  = 3500;

// ─── STATE ──────────────────────────────────────
const S = {
    on: false,
    score: 0, combo: 1, maxCombo: 1,
    lives: MAX_LIVES, timer: GAME_SEC, wave: 1,
    hits: 0, throws: 0,
    objType: 'ring', // Hardcoded to throw rings
    charging: false, chargeT0: 0, power: 0,
    mouse: new THREE.Vector2(),
    mouseXY: { x: 0, y: 0 },
    projectiles: [],
    targets: [],
    particles: [],
    lastCombo: 0,
    spawnCd: 0, waveCd: 0,
};

// ─── ENGINE REFS ────────────────────────────────
let scene, cam, renderer, composer, controls, clock;
let waterMesh, waterMat, causticPlane, causticMat;
let avatarGrp, poolGrp;
let ray = new THREE.Raycaster();
let audioCtx;
const $ = {};

// ═══════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════
function boot() {
    domCache();
    initScene();
    buildPool();
    buildWater();
    buildAvatar();
    buildAmbientDust();
    initPostFX();
    bindEvents();
    renderLives();
    tick();
}

function domCache() {
    const id = s => document.getElementById(s);
    $.container = id('game-container');
    $.start    = id('start-screen');
    $.startBtn = id('start-btn');
    $.over     = id('game-over');
    $.restartBtn= id('restart-btn');
    $.cross    = id('crosshair');
    $.scoreV   = id('score-value');
    $.comboV   = id('combo-value');
    $.timerV   = id('timer-value');
    $.waveV    = id('wave-value');
    $.livesV   = id('lives-value');
    $.powerMtr = id('power-meter');
    $.powerFill= id('power-fill');
    $.powerPct = id('power-pct');
    $.notif    = id('notification');
    $.hitPop   = id('hit-popup');
    $.hud      = id('hud');
    $.fScore   = id('final-score');
    $.fHits    = id('final-hits');
    $.fAcc     = id('final-accuracy');
    $.fCombo   = id('final-combo');
}

// ═══════════════════════════════════════════════
//  PHASE 1 — 3D SCENE + CAMERA
// ═══════════════════════════════════════════════
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 150);
    // Adjusted camera to capture larger pool
    cam.position.set(0, 15, 20);
    cam.lookAt(0, -1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // Lowered to prevent blowout
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $.container.appendChild(renderer.domElement);

    controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 8;
    controls.maxDistance = 35;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.enabled = true;

    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(4, 15, 6);
    scene.add(dir);

    // Adjusted underwater lights to be less blinding
    const uw1 = new THREE.PointLight(C.cyan, 1.5, 25);
    uw1.position.set(-4, -1, -2);
    scene.add(uw1);

    const uw2 = new THREE.PointLight(C.magenta, 1.5, 25);
    uw2.position.set(4, -1, 2);
    scene.add(uw2);
}

// ═══════════════════════════════════════════════
//  PHASE 1 — POOL CONSTRUCTION
// ═══════════════════════════════════════════════
function buildPool() {
    poolGrp = new THREE.Group();

    const hw = POOL.w / 2, hd = POOL.d / 2, dep = POOL.depth, wt = POOL.wallThick;

    // ── Floor ──
    const tileMat = new THREE.MeshPhysicalMaterial({
        color: 0x001133,
        emissive: 0x003366,
        emissiveIntensity: 0.2, // Subtle glow
        roughness: 0.2,
        metalness: 0.6,
        transparent: true,
        opacity: 0.8
    });

    const floorGeo = new THREE.PlaneGeometry(POOL.w, POOL.d);
    const floor = new THREE.Mesh(floorGeo, tileMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -dep;
    poolGrp.add(floor);

    // Floor Grid
    const gridW = new THREE.GridHelper(Math.max(POOL.w, POOL.d), 20, C.cyan, 0x004488);
    gridW.position.y = -dep + 0.02;
    gridW.material.transparent = true;
    gridW.material.opacity = 0.5;
    poolGrp.add(gridW);

    // ── Walls Basin with Edges ──
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x001133,
        emissive: 0x002244,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
    });

    const basinGeo = new THREE.BoxGeometry(POOL.w, dep, POOL.d);
    const basin = new THREE.Mesh(basinGeo, wallMat);
    basin.position.y = -dep / 2;
    poolGrp.add(basin);

    // Holographic glowing edges for the pool boundaries
    const basinEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(basinGeo),
        new THREE.LineBasicMaterial({ color: C.cyan, linewidth: 2, transparent: true, opacity: 0.8 })
    );
    basinEdges.position.y = -dep / 2;
    poolGrp.add(basinEdges);

    // ── Pool Rim / Ledge ──
    const rimMat = new THREE.MeshPhysicalMaterial({
        color: 0x002244,
        emissive: 0x004488,
        emissiveIntensity: 0.3,
        roughness: 0.1,
        metalness: 0.8,
    });

    const rimH = 0.2, rimW = 0.5;
    const br = new THREE.Mesh(new THREE.BoxGeometry(POOL.w + rimW * 2, rimH, rimW), rimMat);
    br.position.set(0, rimH / 2, -hd - rimW / 2);
    poolGrp.add(br);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(POOL.w + rimW * 2, rimH, rimW), rimMat);
    fr.position.set(0, rimH / 2, hd + rimW / 2);
    poolGrp.add(fr);
    const lr = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, POOL.d), rimMat);
    lr.position.set(-hw - rimW / 2, rimH / 2, 0);
    poolGrp.add(lr);
    const rr = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, POOL.d), rimMat);
    rr.position.set(hw + rimW / 2, rimH / 2, 0);
    poolGrp.add(rr);

    // Rim edges
    [br, fr, lr, rr].forEach(r => {
        const eLines = new THREE.LineSegments(new THREE.EdgesGeometry(r.geometry), new THREE.LineBasicMaterial({ color: C.cyan, opacity: 0.6, transparent: true }));
        eLines.position.copy(r.position);
        poolGrp.add(eLines);
    });

    // ── Corner Pillars ──
    const pillarMat = new THREE.MeshPhysicalMaterial({
        color: 0x001133,
        emissive: 0x003366,
        emissiveIntensity: 0.4,
    });
    const pillarH = 3.5;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sz]) => {
        const pilGeo = new THREE.CylinderGeometry(0.15, 0.15, pillarH, 8);
        const pil = new THREE.Mesh(pilGeo, pillarMat);
        pil.position.set(sx * (hw + 0.4), pillarH / 2, sz * (hd + 0.4));
        poolGrp.add(pil);
        
        const pilEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pilGeo), new THREE.LineBasicMaterial({ color: C.cyan, opacity: 0.5, transparent: true }));
        pilEdges.position.copy(pil.position);
        poolGrp.add(pilEdges);

        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 12, 12),
            new THREE.MeshBasicMaterial({ color: C.magenta })
        );
        orb.position.set(sx * (hw + 0.4), pillarH + 0.1, sz * (hd + 0.4));
        poolGrp.add(orb);

        const og = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 12, 12),
            new THREE.MeshBasicMaterial({ color: C.magenta, transparent: true, opacity: 0.15 })
        );
        og.position.copy(orb.position);
        poolGrp.add(og);
    });

    scene.add(poolGrp);
}

// ═══════════════════════════════════════════════
//  PHASE 2 — CLEAR HOLOGRAPHIC WATER
// ═══════════════════════════════════════════════
function buildWater() {
    const geo = new THREE.PlaneGeometry(POOL.w - 0.1, POOL.d - 0.1, 80, 60);

    waterMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime:    { value: 0 },
            uCol1:    { value: new THREE.Color(0x00ffff) },
            uCol2:    { value: new THREE.Color(0x0044cc) },
            uColH:    { value: new THREE.Color(0xff00ff) },
            uOpacity: { value: 0.35 }, // Much more transparent so bottom is clear
        },
        vertexShader: /* glsl */`
            uniform float uTime;
            varying vec2 vUv;
            varying float vH;
            void main(){
                vUv = uv;
                vec3 p = position;
                float w1 = sin(p.x*1.5 + uTime*1.2)*0.1;
                float w2 = cos(p.y*2.0 + uTime*0.9)*0.08;
                float w3 = sin((p.x+p.y)*1.5 + uTime*1.5)*0.06;
                p.z += w1+w2+w3;
                vH = p.z;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform float uTime;
            uniform vec3 uCol1, uCol2, uColH;
            uniform float uOpacity;
            varying vec2 vUv;
            varying float vH;
            void main(){
                float t = sin(uTime*0.4 + vUv.x*3.0)*0.5+0.5;
                vec3 col = mix(uCol1, uCol2, t);

                float band = sin(vUv.x*30.0 + uTime*3.0)*sin(vUv.y*30.0 - uTime*2.0);
                col += uColH * band * 0.05;

                // Subtle caustic reflection
                float c1 = sin(vUv.x*15.0 + uTime)*sin(vUv.y*15.0 + uTime);
                col += vec3(c1*0.1, c1*0.2, c1*0.25);

                // Wave peak brightness
                col *= 0.8 + vH*2.5;

                // Edge outline
                float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
                float eg = smoothstep(0.0, 0.05, edge);
                col = mix(uCol1*1.5, col, eg);

                gl_FragColor = vec4(col, uOpacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    waterMesh = new THREE.Mesh(geo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0; // water surface at y=0
    scene.add(waterMesh);
}

// ═══════════════════════════════════════════════
//  AVATAR
// ═══════════════════════════════════════════════
function buildAvatar() {
    avatarGrp = new THREE.Group();

    const glowMat = (col, emI = 0.35, op = 0.8) => new THREE.MeshPhysicalMaterial({
        color: col, emissive: col, emissiveIntensity: emI,
        transparent: true, opacity: op,
        roughness: 0.15, metalness: 0.6,
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8), glowMat(C.cyan));
    torso.position.y = 0.4;
    avatarGrp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), glowMat(C.cyan, 0.45, 0.85));
    head.position.y = 1.0;
    avatarGrp.add(head);

    const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshBasicMaterial({ color: C.magenta, transparent: true, opacity: 0.55 })
    );
    visor.position.set(0, 1.05, 0.1);
    visor.rotation.x = -0.2;
    avatarGrp.add(visor);

    const armGeo = new THREE.CapsuleGeometry(0.05, 0.45, 4, 6);
    const la = new THREE.Mesh(armGeo, glowMat(C.cyan, 0.3, 0.7));
    la.position.set(-0.32, 0.55, 0); la.rotation.z = 0.35;
    avatarGrp.add(la);
    const ra = new THREE.Mesh(armGeo, glowMat(C.cyan, 0.3, 0.7));
    ra.position.set(0.32, 0.55, 0); ra.rotation.z = -0.35;
    ra.name = 'rArm';
    avatarGrp.add(ra);

    const legGeo = new THREE.CapsuleGeometry(0.06, 0.4, 4, 6);
    const ll = new THREE.Mesh(legGeo, glowMat(C.cyan, 0.25, 0.65));
    ll.position.set(-0.1, -0.1, 0);
    avatarGrp.add(ll);
    const rl = new THREE.Mesh(legGeo, glowMat(C.cyan, 0.25, 0.65));
    rl.position.set(0.1, -0.1, 0);
    avatarGrp.add(rl);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.02, 6, 32),
        new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.25 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.25;
    ring.name = 'baseRing';
    avatarGrp.add(ring);

    avatarGrp.position.set(0, 0.35, POOL.d / 2 + 1.5);
    scene.add(avatarGrp);
}

// ── Ambient floating dust ──
let ambientPts;
function buildAmbientDust() {
    const N = 300;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 20;
        pos[i * 3 + 1] = Math.random() * 8 - 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: C.cyan, size: 0.035,
        transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    ambientPts = new THREE.Points(geo, mat);
    scene.add(ambientPts);
}

// ═══════════════════════════════════════════════
//  PHASE 3 — RINGS TO THROW
// ═══════════════════════════════════════════════
function makeProjectile(type, pos, vel) {
    // Only throwing rings now
    const gc = C.magenta;
    const gm = new THREE.MeshPhysicalMaterial({
        color: gc, emissive: gc, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.9,
        roughness: 0.1, metalness: 0.6,
    });

    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), gm);
    mesh.rotation.x = Math.PI / 2; // Flat frisbee-like

    mesh.position.copy(pos);
    scene.add(mesh);

    S.projectiles.push({
        mesh, type: 'ring', vel: vel.clone(),
        alive: true, age: 0, wet: false, trailT: 0,
    });
}

function doThrow() {
    if (S.power < 0.04) return;
    S.throws++;

    ray.setFromCamera(S.mouse, cam);
    const dir = ray.ray.direction.clone();

    const origin = avatarGrp.position.clone();
    origin.y += 0.9;

    const speed = 7 + S.power * 25;
    const vel = dir.normalize().multiplyScalar(speed);
    vel.y += 2.0 + S.power * 3.5;

    makeProjectile('ring', origin, vel);

    const arm = avatarGrp.getObjectByName('rArm');
    if (arm) {
        arm.rotation.z = -1.6;
        arm.rotation.x = -0.6;
        setTimeout(() => { arm.rotation.z = -0.35; arm.rotation.x = 0; }, 280);
    }

    snd('throw');
}

// ═══════════════════════════════════════════════
//  PHASE 4 — BALL TARGETS + COLLISION
// ═══════════════════════════════════════════════
function spawnTarget() {
    if (S.targets.length >= MAX_TGTS) return;

    const hw = POOL.w * 0.4, hd = POOL.d * 0.4;
    const x = (Math.random() - 0.5) * hw * 2;
    const z = (Math.random() - 0.5) * hd * 2;
    
    // Floating exactly on water surface
    const y = 0.25; 

    const cols = [C.cyan, C.orange, C.gold, C.green, C.yellow];
    const col = cols[Math.floor(Math.random() * cols.length)];

    const mat = new THREE.MeshPhysicalMaterial({
        color: col, emissive: col, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.85,
        roughness: 0.1, metalness: 0.5,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), mat);
    const hr = 0.5;

    // glow aura
    mesh.add(new THREE.Mesh(
        new THREE.SphereGeometry(hr * 0.8, 8, 8),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1 })
    ));

    mesh.position.set(x, y, z);
    scene.add(mesh);

    S.targets.push({
        mesh, hr, alive: true, age: 0, pts: 100, col,
        baseY: y,
        fSpd: 0.8 + Math.random() * 1.5,
        fOff: Math.random() * Math.PI * 2,
        rSpd: new THREE.Vector3(0, (Math.random() - 0.5) * 3.0, 0),
    });
}

function collisions() {
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
        const p = S.projectiles[i];
        if (!p.alive) continue;

        for (let j = S.targets.length - 1; j >= 0; j--) {
            const tg = S.targets[j];
            if (!tg.alive) continue;

            // A "Ringer" — ring toss lands near the ball
            if (p.mesh.position.distanceTo(tg.mesh.position) < tg.hr + 0.3) {
                tg.alive = false;
                p.alive = false;

                const now = performance.now();
                if (now - S.lastCombo < COMBO_MS) {
                    S.combo++;
                    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
                } else S.combo = 1;
                S.lastCombo = now;

                const pts = Math.round(tg.pts * S.combo);
                S.score += pts;
                S.hits++;

                burstParticles(tg.mesh.position.clone(), tg.col, 35);
                hitPopup(pts, S.combo);
                snd('hit');

                scene.remove(tg.mesh);
                scene.remove(p.mesh);
                S.targets.splice(j, 1);
                S.projectiles.splice(i, 1);

                refreshHUD();
                break;
            }
        }
    }
}

// ═══════════════════════════════════════════════
//  PHASE 5 — UI
// ═══════════════════════════════════════════════
function refreshHUD() {
    $.scoreV.textContent = S.score;
    $.comboV.textContent = `×${S.combo}`;
    $.waveV.textContent = S.wave;

    $.comboV.style.transform = 'scale(1.3)';
    setTimeout(() => $.comboV.style.transform = '', 180);

    const sec = Math.ceil(S.timer);
    $.timerV.textContent = sec;
    $.timerV.classList.remove('warn', 'crit');
    if (sec <= 10) $.timerV.classList.add('crit');
    else if (sec <= 20) $.timerV.classList.add('warn');
}

function renderLives() {
    $.livesV.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        const pip = document.createElement('span');
        pip.className = 'life-pip' + (i < S.lives ? '' : ' dead');
        $.livesV.appendChild(pip);
    }
}

function hitPopup(pts, combo) {
    const col = combo >= 4 ? '#ffcc00' : combo >= 2 ? '#ff8800' : '#00ff88';
    $.hitPop.innerHTML = `<span style="color:${col}; text-shadow:0 0 20px ${col}">+${pts}</span>`;
    if (combo > 1) $.hitPop.innerHTML += `<br><span style="font-size:1.2rem;color:#ff00ff;text-shadow:0 0 12px #ff00ff;">×${combo} COMBO!</span>`;
    $.hitPop.classList.remove('hidden');
    $.hitPop.style.animation = 'none';
    $.hitPop.offsetHeight;
    $.hitPop.style.animation = '';
    setTimeout(() => $.hitPop.classList.add('hidden'), 900);
}

function notify(txt, ms = 1500) {
    $.notif.textContent = txt;
    $.notif.classList.remove('hidden');
    $.notif.style.animation = 'none';
    $.notif.offsetHeight;
    $.notif.style.animation = '';
    setTimeout(() => $.notif.classList.add('hidden'), ms);
}

function gameOver() {
    S.on = false;
    const acc = S.throws > 0 ? Math.round(S.hits / S.throws * 100) : 0;
    $.fScore.textContent = S.score;
    $.fHits.textContent  = S.hits;
    $.fAcc.textContent   = acc + '%';
    $.fCombo.textContent = `×${S.maxCombo}`;
    $.over.classList.remove('hidden');
    snd('over');
}

// ═══════════════════════════════════════════════
//  PHASE 6 — SOUND + PARTICLES
// ═══════════════════════════════════════════════

function initAudio() { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function snd(type) {
    if (!audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        if (type === 'throw') {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(800, t);
            o.frequency.exponentialRampToValueAtTime(150, t + 0.2);
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            o.connect(g).connect(audioCtx.destination);
            o.start(t); o.stop(t + 0.2);
        } else if (type === 'hit') {
            [1200, 1600, 2200].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.05);
                g.gain.setValueAtTime(0.1, t + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.3);
                o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.3);
            });
        } else if (type === 'splash') {
            const n = audioCtx.sampleRate * 0.25;
            const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.1));
            const src = audioCtx.createBufferSource(); src.buffer = buf;
            const flt = audioCtx.createBiquadFilter();
            flt.type = 'lowpass'; flt.frequency.setValueAtTime(2500, t); flt.frequency.exponentialRampToValueAtTime(200, t + 0.2);
            const g = audioCtx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            src.connect(flt).connect(g).connect(audioCtx.destination); src.start(t);
        } else if (type === 'miss') {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
            g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.25);
        } else if (type === 'over') {
            [600, 450, 300, 150].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.2);
                g.gain.setValueAtTime(0.08, t + i * 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.4);
                o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.2); o.stop(t + i * 0.2 + 0.4);
            });
        } else if (type === 'wave') {
            [600, 800, 1000, 1400].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.1);
                g.gain.setValueAtTime(0.08, t + i * 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
                o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.3);
            });
        }
    } catch (_) {}
}

function burstParticles(pos, col, count = 25) {
    const N = count;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        arr[i*3]=pos.x; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z;
        vels.push(new THREE.Vector3((Math.random()-.5)*8, (Math.random()-.5)*8, (Math.random()-.5)*8));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: col, size: 0.12, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 1.0 });
}

function splashParticles(pos) {
    const N = 20;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        arr[i*3]=pos.x+(Math.random()-.5)*.3; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z+(Math.random()-.5)*.3;
        vels.push(new THREE.Vector3((Math.random()-.5)*3, 2.5+Math.random()*4, (Math.random()-.5)*3));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: C.cyan, size: 0.08, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 0.8 });
}

function trailParticle(pos, col) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array([pos.x, pos.y, pos.z]);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: col, size: 0.07, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels: [new THREE.Vector3()], age: 0, life: 0.35 });
}

function tickParticles(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
        const p = S.particles[i];
        p.age += dt;
        if (p.age >= p.life) {
            scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose();
            S.particles.splice(i, 1); continue;
        }
        const prog = p.age / p.life;
        const arr = p.pts.geometry.attributes.position.array;
        for (let j = 0; j < p.vels.length; j++) {
            p.vels[j].y += GRAVITY * 0.25 * dt;
            arr[j*3]   += p.vels[j].x * dt;
            arr[j*3+1] += p.vels[j].y * dt;
            arr[j*3+2] += p.vels[j].z * dt;
        }
        p.pts.geometry.attributes.position.needsUpdate = true;
        p.pts.material.opacity = (1 - prog);
        p.pts.material.size = p.pts.material.size * (1 - dt * 0.5);
    }

    if (ambientPts) {
        const t = clock.elapsedTime;
        const a = ambientPts.geometry.attributes.position.array;
        for (let i = 0; i < a.length / 3; i++) {
            a[i*3+1] += Math.sin(t + i * 0.7) * 0.0015;
            a[i*3]   += Math.cos(t * 0.4 + i * 1.1) * 0.001;
        }
        ambientPts.geometry.attributes.position.needsUpdate = true;
        ambientPts.material.opacity = 0.12 + Math.sin(t * 0.3) * 0.08;
    }
}

function initPostFX() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    
    // REDUCED BLOOM to fix excessive glare
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        0.55, 0.4, 0.25 // strength, radius, threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
}

// ═══════════════════════════════════════════════
//  PHYSICS
// ═══════════════════════════════════════════════
function tickPhysics(dt) {
    const wY = 0; 
    const poolHW = POOL.w / 2, poolHD = POOL.d / 2;

    for (let i = S.projectiles.length - 1; i >= 0; i--) {
        const p = S.projectiles[i];
        if (!p.alive) continue;

        p.age += dt;
        p.vel.y += GRAVITY * dt;

        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt;
        p.mesh.position.z += p.vel.z * dt;

        // Frisbee spin
        p.mesh.rotation.z += dt * 10;

        p.trailT += dt;
        if (p.trailT > 0.03) {
            p.trailT = 0;
            trailParticle(p.mesh.position.clone(), C.magenta);
        }

        if (p.mesh.position.y <= wY && !p.wet) {
            const px = p.mesh.position.x, pz = p.mesh.position.z;
            if (Math.abs(px) < poolHW && Math.abs(pz) < poolHD) {
                p.wet = true;
                p.vel.multiplyScalar(0.4);
                p.vel.y = Math.abs(p.vel.y) * 0.15; // Bounce slightly on water
                splashParticles(p.mesh.position.clone());
                snd('splash');
            }
        }

        if (p.wet) p.vel.multiplyScalar(1 - dt * 3.5);

        const gone = p.age > 4 ||
            Math.abs(p.mesh.position.x) > poolHW + 4 ||
            p.mesh.position.y < -POOL.depth - 2 ||
            Math.abs(p.mesh.position.z) > poolHD + 6;

        if (gone) {
            p.alive = false;
            scene.remove(p.mesh);
            S.projectiles.splice(i, 1);

            S.lives--;
            S.combo = 1;
            renderLives();
            snd('miss');
            refreshHUD();

            if (S.lives <= 0) { gameOver(); return; }
        }
    }
}

// ═══════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════
function tick() {
    requestAnimationFrame(tick);

    const dt = Math.min(clock.getDelta(), 0.05);
    const t  = clock.elapsedTime;

    if (waterMat) waterMat.uniforms.uTime.value = t;

    if (avatarGrp) {
        avatarGrp.position.y = 0.35 + Math.sin(t * 1.3) * 0.04;
        const br = avatarGrp.getObjectByName('baseRing');
        if (br) { br.rotation.z = t * 0.4; br.material.opacity = 0.18 + Math.sin(t * 2) * 0.08; }
    }

    // Bobbing Floating Balls
    S.targets.forEach(tg => {
        if (!tg.alive) return;
        tg.age += dt;
        tg.mesh.position.y = tg.baseY + Math.sin(t * tg.fSpd + tg.fOff) * 0.15;
        tg.mesh.rotation.y += tg.rSpd.y * dt;
        const sc = 1 + Math.sin(t * 2.5 + tg.fOff) * 0.05;
        tg.mesh.scale.setScalar(sc);
    });

    if (poolGrp) {
        poolGrp.children.forEach(c => {
            if (c.isMesh && c.geometry.type === 'SphereGeometry' && c.material.opacity !== undefined && c.material.opacity < 0.5) {
                c.material.opacity = 0.05 + Math.sin(t * 2 + c.position.x) * 0.05;
            }
        });
    }

    if (S.charging) {
        const elapsed = (performance.now() - S.chargeT0) / 1000;
        S.power = Math.min(elapsed / 1.2, 1); // faster charge
        $.powerFill.style.width = S.power * 100 + '%';
        $.powerPct.textContent = Math.round(S.power * 100) + '%';
    }

    if (S.on) {
        S.timer -= dt;
        if (S.timer <= 0) { S.timer = 0; gameOver(); return; }

        S.spawnCd += dt;
        const interval = Math.max(0.6, 2.0 - S.wave * 0.2);
        if (S.spawnCd >= interval) { spawnTarget(); S.spawnCd = 0; }

        S.waveCd += dt;
        if (S.waveCd >= 20) {
            S.wave++;
            S.waveCd = 0;
            notify(`WAVE ${S.wave}`);
            snd('wave');
        }

        if (performance.now() - S.lastCombo > COMBO_MS && S.combo > 1) {
            S.combo = 1;
            refreshHUD();
        }

        tickPhysics(dt);
        collisions();
        refreshHUD();
    }

    tickParticles(dt);
    controls.update();
    composer.render();
}

// ═══════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════
function bindEvents() {
    window.addEventListener('mousemove', e => {
        S.mouseXY.x = e.clientX;
        S.mouseXY.y = e.clientY;
        S.mouse.x = (e.clientX / innerWidth) * 2 - 1;
        S.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
        $.cross.style.left = e.clientX + 'px';
        $.cross.style.top  = e.clientY + 'px';
        if (avatarGrp && S.on) avatarGrp.rotation.y = S.mouse.x * 0.5;
    });

    window.addEventListener('mousedown', e => {
        if (!S.on || e.button !== 0) return;
        S.charging = true;
        S.chargeT0 = performance.now();
        S.power = 0;
        $.powerMtr.classList.add('show');
        $.cross.classList.add('charging');
    });

    window.addEventListener('mouseup', e => {
        if (!S.on || e.button !== 0 || !S.charging) return;
        S.charging = false;
        $.powerMtr.classList.remove('show');
        $.cross.classList.remove('charging');
        doThrow();
        S.power = 0;
        $.powerFill.style.width = '0%';
        $.powerPct.textContent = '0%';
    });

    window.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'r') controls.enabled = !controls.enabled;
    });

    $.startBtn.addEventListener('click', () => { initAudio(); startGame(); });
    $.restartBtn.addEventListener('click', () => { $.over.classList.add('hidden'); resetGame(); startGame(); });

    window.addEventListener('resize', () => {
        cam.aspect = innerWidth / innerHeight;
        cam.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
        composer.setSize(innerWidth, innerHeight);
    });

    window.addEventListener('contextmenu', e => e.preventDefault());
}

function startGame() {
    $.start.classList.add('hidden');
    S.on = true;
    notify('WAVE 1', 1200);
    snd('wave');
}

function resetGame() {
    S.projectiles.forEach(p => scene.remove(p.mesh));
    S.projectiles = [];
    S.targets.forEach(t => scene.remove(t.mesh));
    S.targets = [];
    S.particles.forEach(p => { scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); });
    S.particles = [];

    S.score = 0; S.combo = 1; S.maxCombo = 1;
    S.lives = MAX_LIVES; S.timer = GAME_SEC; S.wave = 1;
    S.hits = 0; S.throws = 0; S.lastCombo = 0;
    S.spawnCd = 0; S.waveCd = 0;

    renderLives();
    refreshHUD();
}

// ═══════════════════════════════════════════════
boot();
