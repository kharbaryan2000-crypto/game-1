// ═══════════════════════════════════════════════════
//  HOLOBOX AQUA ARENA — FULL GAME ENGINE
//  Realistic 3D Pool for HoloBox Technology
//  6 Phases: Scene, Water, Throw, Targets, UI, FX
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
    poolTile: 0x0a3355,
    poolWall: 0x062040,
    waterTop: 0x00bbee,
    waterBot: 0x003366,
    white:    0xffffff,
};

// ─── CONFIG ─────────────────────────────────────
const POOL = { w: 10, d: 7, depth: 2.2, wallThick: 0.25 };
const GRAVITY   = -14;
const MAX_TGTS  = 7;
const GAME_SEC  = 90;
const MAX_LIVES = 5;
const COMBO_MS  = 3500;

// ─── STATE ──────────────────────────────────────
const S = {
    on: false,
    score: 0, combo: 1, maxCombo: 1,
    lives: MAX_LIVES, timer: GAME_SEC, wave: 1,
    hits: 0, throws: 0,
    objType: 'ball',
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
const $ = {};  // DOM cache

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
    $.objBtns  = document.querySelectorAll('.obj-btn');
    $.hud      = id('hud');
    $.objSel   = id('object-selector');
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
    // Pure black for holobox — no fog needed
    scene.background = new THREE.Color(0x000000);

    cam = new THREE.PerspectiveCamera(
        55, innerWidth / innerHeight, 0.1, 150
    );
    cam.position.set(0, 8, 12);
    cam.lookAt(0, -0.5, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $.container.appendChild(renderer.domElement);

    // Subtle orbit for "R" key
    controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 8;
    controls.maxDistance = 22;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enabled = false;

    clock = new THREE.Clock();

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x0a1a30, 0.6));

    const dir = new THREE.DirectionalLight(0x88ccff, 0.7);
    dir.position.set(4, 12, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 30;
    dir.shadow.camera.left = -8;
    dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8;
    dir.shadow.camera.bottom = -8;
    scene.add(dir);

    // Pool underwater lights
    const uw1 = new THREE.PointLight(C.cyan, 1.8, 12);
    uw1.position.set(-3, -1.5, -1);
    scene.add(uw1);

    const uw2 = new THREE.PointLight(C.blue, 1.2, 12);
    uw2.position.set(3, -1.5, 1);
    scene.add(uw2);

    const uw3 = new THREE.PointLight(C.magenta, 0.5, 10);
    uw3.position.set(0, -0.5, -2);
    scene.add(uw3);

    // Rim lights
    const rim1 = new THREE.PointLight(C.cyan, 0.6, 18);
    rim1.position.set(-6, 3, 5);
    scene.add(rim1);
    const rim2 = new THREE.PointLight(C.magenta, 0.4, 18);
    rim2.position.set(6, 3, -5);
    scene.add(rim2);
}

// ═══════════════════════════════════════════════
//  PHASE 1 — POOL CONSTRUCTION
// ═══════════════════════════════════════════════
function buildPool() {
    poolGrp = new THREE.Group();

    const hw = POOL.w / 2, hd = POOL.d / 2, dep = POOL.depth, wt = POOL.wallThick;

    // ── Floor Tiles ──
    const tileMat = new THREE.MeshPhysicalMaterial({
        color: C.poolTile,
        roughness: 0.25,
        metalness: 0.4,
        emissive: C.cyan,
        emissiveIntensity: 0.04,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(POOL.w, POOL.d), tileMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -dep;
    floor.receiveShadow = true;
    poolGrp.add(floor);

    // Tile grid lines on floor
    const gridW = new THREE.GridHelper(POOL.w, 16, C.cyan, C.cyan);
    gridW.position.y = -dep + 0.01;
    gridW.material.transparent = true;
    gridW.material.opacity = 0.07;
    poolGrp.add(gridW);

    // ── Walls ──
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: C.poolWall,
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 0.7,
        emissive: C.cyan,
        emissiveIntensity: 0.03,
        side: THREE.DoubleSide,
    });

    // Back wall
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(POOL.w, dep), wallMat);
    bw.position.set(0, -dep / 2, -hd);
    poolGrp.add(bw);
    // Front wall
    const fw = new THREE.Mesh(new THREE.PlaneGeometry(POOL.w, dep), wallMat);
    fw.position.set(0, -dep / 2, hd);
    fw.rotation.y = Math.PI;
    poolGrp.add(fw);
    // Left wall
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(POOL.d, dep), wallMat);
    lw.position.set(-hw, -dep / 2, 0);
    lw.rotation.y = Math.PI / 2;
    poolGrp.add(lw);
    // Right wall
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(POOL.d, dep), wallMat);
    rw.position.set(hw, -dep / 2, 0);
    rw.rotation.y = -Math.PI / 2;
    poolGrp.add(rw);

    // ── Pool Rim / Ledge ──
    const rimMat = new THREE.MeshPhysicalMaterial({
        color: 0x112244,
        roughness: 0.1,
        metalness: 0.85,
        emissive: C.cyan,
        emissiveIntensity: 0.08,
    });

    // Rim pieces (top edge of pool)
    const rimH = 0.12, rimW = 0.35;
    // Back rim
    const br = new THREE.Mesh(new THREE.BoxGeometry(POOL.w + rimW * 2, rimH, rimW), rimMat);
    br.position.set(0, rimH / 2, -hd - rimW / 2);
    br.castShadow = true;
    poolGrp.add(br);
    // Front rim
    const fr = new THREE.Mesh(new THREE.BoxGeometry(POOL.w + rimW * 2, rimH, rimW), rimMat);
    fr.position.set(0, rimH / 2, hd + rimW / 2);
    fr.castShadow = true;
    poolGrp.add(fr);
    // Left rim
    const lr = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, POOL.d), rimMat);
    lr.position.set(-hw - rimW / 2, rimH / 2, 0);
    lr.castShadow = true;
    poolGrp.add(lr);
    // Right rim
    const rr = new THREE.Mesh(new THREE.BoxGeometry(rimW, rimH, POOL.d), rimMat);
    rr.position.set(hw + rimW / 2, rimH / 2, 0);
    rr.castShadow = true;
    poolGrp.add(rr);

    // ── Rim Glow Strips (LED-like) ──
    const stripMat = new THREE.MeshBasicMaterial({
        color: C.cyan, transparent: true, opacity: 0.25,
    });
    [
        [0, 0.02, -hd - 0.02, POOL.w + 0.5, 0.04, 0.04, 0],
        [0, 0.02, hd + 0.02, POOL.w + 0.5, 0.04, 0.04, 0],
        [-hw - 0.02, 0.02, 0, 0.04, 0.04, POOL.d, 0],
        [hw + 0.02, 0.02, 0, 0.04, 0.04, POOL.d, 0],
    ].forEach(([x, y, z, w, h, d]) => {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stripMat);
        s.position.set(x, y, z);
        poolGrp.add(s);
    });

    // ── Corner Pillars ──
    const pillarMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a1a33,
        emissive: C.cyan,
        emissiveIntensity: 0.12,
        roughness: 0.05,
        metalness: 0.9,
    });
    const pillarH = 3;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sz]) => {
        const pil = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, pillarH, 8),
            pillarMat
        );
        pil.position.set(sx * (hw + 0.3), pillarH / 2 - 0.1, sz * (hd + 0.3));
        pil.castShadow = true;
        poolGrp.add(pil);

        // Top orb
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 12, 12),
            new THREE.MeshBasicMaterial({ color: C.cyan })
        );
        orb.position.set(sx * (hw + 0.3), pillarH - 0.1, sz * (hd + 0.3));
        poolGrp.add(orb);

        // Orb glow
        const og = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.1 })
        );
        og.position.copy(orb.position);
        poolGrp.add(og);
    });

    scene.add(poolGrp);
}

// ═══════════════════════════════════════════════
//  PHASE 2 — WATER + HOLOGRAPHIC EFFECT
// ═══════════════════════════════════════════════
function buildWater() {
    const geo = new THREE.PlaneGeometry(POOL.w - 0.1, POOL.d - 0.1, 80, 60);

    waterMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime:    { value: 0 },
            uCol1:    { value: new THREE.Color(0x00ccff) },
            uCol2:    { value: new THREE.Color(0x0055aa) },
            uColH:    { value: new THREE.Color(0xff00ff) },
            uOpacity: { value: 0.58 },
        },
        vertexShader: /* glsl */`
            uniform float uTime;
            varying vec2 vUv;
            varying float vH;
            void main(){
                vUv = uv;
                vec3 p = position;
                float w1 = sin(p.x*2.5 + uTime*1.8)*0.09;
                float w2 = cos(p.y*3.0 + uTime*1.3)*0.07;
                float w3 = sin((p.x+p.y)*2.0 + uTime*2.2)*0.05;
                float w4 = sin(length(p.xy)*4.0 - uTime*2.5)*0.04;
                float w5 = cos(p.x*5.0 - uTime*3.0)*sin(p.y*4.0 + uTime*1.6)*0.03;
                p.z += w1+w2+w3+w4+w5;
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
                // base gradient
                float t = sin(uTime*0.4 + vUv.x*3.0)*0.5+0.5;
                vec3 col = mix(uCol1, uCol2, t);

                // holographic shimmer bands
                float band = sin(vUv.x*50.0 + uTime*4.0)*sin(vUv.y*50.0 - uTime*2.5);
                col += uColH * band * 0.07;

                // caustic pattern
                float c1 = sin(vUv.x*25.0 + uTime*1.8)*sin(vUv.y*22.0 + uTime*1.4);
                float c2 = cos(vUv.x*18.0 - uTime*2.1)*cos(vUv.y*20.0 + uTime*1.1);
                float caustic = max(c1,0.0)*0.12 + max(c2,0.0)*0.08;
                col += vec3(caustic*0.4, caustic*0.8, caustic);

                // wave peak brightness
                col *= 0.7 + vH*3.5;

                // edge glow
                float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
                float eg = smoothstep(0.0, 0.1, edge);
                col = mix(uCol1*1.8, col, eg);

                // subtle scanline
                float scan = 0.96 + 0.04*sin(vUv.y*200.0 + uTime*6.0);
                col *= scan;

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

    // ── Caustic light projection on pool floor ──
    const causGeo = new THREE.PlaneGeometry(POOL.w - 0.3, POOL.d - 0.3, 1, 1);
    causticMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
        },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main(){
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform float uTime;
            varying vec2 vUv;
            void main(){
                float c1 = sin(vUv.x*16.0+uTime*1.5)*sin(vUv.y*14.0+uTime*1.1);
                float c2 = cos(vUv.x*12.0-uTime*1.8)*cos(vUv.y*15.0+uTime*0.9);
                float c3 = sin((vUv.x+vUv.y)*10.0+uTime*2.0);
                float c = max(c1,0.0)*0.5 + max(c2,0.0)*0.3 + max(c3,0.0)*0.2;
                vec3 col = vec3(c*0.15, c*0.5, c*0.7);
                gl_FragColor = vec4(col, c*0.35);
            }
        `,
        transparent: true,
        depthWrite: false,
    });
    causticPlane = new THREE.Mesh(causGeo, causticMat);
    causticPlane.rotation.x = -Math.PI / 2;
    causticPlane.position.y = -POOL.depth + 0.02;
    scene.add(causticPlane);
}

// ═══════════════════════════════════════════════
//  AVATAR (Holographic Figure at Pool Edge)
// ═══════════════════════════════════════════════
function buildAvatar() {
    avatarGrp = new THREE.Group();

    const glowMat = (col, emI = 0.35, op = 0.8) => new THREE.MeshPhysicalMaterial({
        color: col, emissive: col, emissiveIntensity: emI,
        transparent: true, opacity: op,
        roughness: 0.15, metalness: 0.6,
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8), glowMat(C.cyan));
    torso.position.y = 0.4;
    avatarGrp.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), glowMat(C.cyan, 0.45, 0.85));
    head.position.y = 1.0;
    avatarGrp.add(head);

    // Visor
    const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshBasicMaterial({ color: C.magenta, transparent: true, opacity: 0.55 })
    );
    visor.position.set(0, 1.05, 0.1);
    visor.rotation.x = -0.2;
    avatarGrp.add(visor);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.45, 4, 6);
    const la = new THREE.Mesh(armGeo, glowMat(C.cyan, 0.3, 0.7));
    la.position.set(-0.32, 0.55, 0); la.rotation.z = 0.35;
    avatarGrp.add(la);
    const ra = new THREE.Mesh(armGeo, glowMat(C.cyan, 0.3, 0.7));
    ra.position.set(0.32, 0.55, 0); ra.rotation.z = -0.35;
    ra.name = 'rArm';
    avatarGrp.add(ra);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.06, 0.4, 4, 6);
    const ll = new THREE.Mesh(legGeo, glowMat(C.cyan, 0.25, 0.65));
    ll.position.set(-0.1, -0.1, 0);
    avatarGrp.add(ll);
    const rl = new THREE.Mesh(legGeo, glowMat(C.cyan, 0.25, 0.65));
    rl.position.set(0.1, -0.1, 0);
    avatarGrp.add(rl);

    // Base ring
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.02, 6, 32),
        new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.25 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.25;
    ring.name = 'baseRing';
    avatarGrp.add(ring);

    avatarGrp.position.set(0, 0.35, POOL.d / 2 + 1);
    scene.add(avatarGrp);
}

// ── Ambient floating dust/particles ──
let ambientPts;
function buildAmbientDust() {
    const N = 300;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 16;
        pos[i * 3 + 1] = Math.random() * 8 - 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: C.cyan, size: 0.035,
        transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    ambientPts = new THREE.Points(geo, mat);
    scene.add(ambientPts);
}

// ═══════════════════════════════════════════════
//  PHASE 3 — THROWABLE OBJECTS
// ═══════════════════════════════════════════════
function makeProjectile(type, pos, vel) {
    let mesh;
    const gc = type === 'ball' ? C.cyan : type === 'ring' ? C.magenta : C.green;

    const gm = (c) => new THREE.MeshPhysicalMaterial({
        color: c, emissive: c, emissiveIntensity: 0.55,
        transparent: true, opacity: 0.88,
        roughness: 0.08, metalness: 0.7,
    });

    if (type === 'ball') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), gm(gc));
        // inner glow
        mesh.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 8, 8),
            new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.12 })
        ));
    } else if (type === 'ring') {
        mesh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 24), gm(gc));
    } else {
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(
            new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), gm(gc)
        ));
        const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.06, 0.12, 6),
            new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.8 })
        );
        tip.position.y = 0.22;
        mesh.add(tip);
    }

    mesh.position.copy(pos);
    mesh.castShadow = true;
    scene.add(mesh);

    S.projectiles.push({
        mesh, type, vel: vel.clone(),
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

    const speed = 7 + S.power * 20;
    const vel = dir.normalize().multiplyScalar(speed);
    vel.y += 2.5 + S.power * 3.5;

    makeProjectile(S.objType, origin, vel);

    // Arm animation
    const arm = avatarGrp.getObjectByName('rArm');
    if (arm) {
        arm.rotation.z = -1.6;
        arm.rotation.x = -0.6;
        setTimeout(() => { arm.rotation.z = -0.35; arm.rotation.x = 0; }, 280);
    }

    snd('throw');
}

// ═══════════════════════════════════════════════
//  PHASE 4 — TARGETS + COLLISION
// ═══════════════════════════════════════════════
function spawnTarget() {
    if (S.targets.length >= MAX_TGTS) return;

    const hw = POOL.w * 0.38, hd = POOL.d * 0.38;
    const x = (Math.random() - 0.5) * hw * 2;
    const z = (Math.random() - 0.5) * hd * 2;
    const y = 0.5 + Math.random() * 2.8;

    const kinds = ['sphere', 'torus', 'octa', 'box', 'star'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const cols = [C.magenta, C.orange, C.gold, C.green, C.red, C.cyan];
    const col = cols[Math.floor(Math.random() * cols.length)];

    let mesh, hr;
    const mat = new THREE.MeshPhysicalMaterial({
        color: col, emissive: col, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.82,
        roughness: 0.08, metalness: 0.55,
    });

    if (kind === 'sphere')     { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), mat); hr = 0.5; }
    else if (kind === 'torus') { mesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 24), mat); hr = 0.55; }
    else if (kind === 'octa')  { mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat); hr = 0.5; }
    else if (kind === 'box')   { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), mat); hr = 0.5; }
    else { // star = dodecahedron
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), mat); hr = 0.5;
    }

    // glow aura
    mesh.add(new THREE.Mesh(
        new THREE.SphereGeometry(hr * 0.9, 8, 8),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.06 })
    ));

    mesh.position.set(x, y, z);
    scene.add(mesh);

    const pts = kind === 'torus' ? 200 : kind === 'octa' ? 150 : kind === 'star' ? 180 : 100;

    S.targets.push({
        mesh, kind, hr, alive: true, age: 0, pts, col,
        baseY: y,
        fSpd: 0.4 + Math.random() * 1.2,
        fOff: Math.random() * Math.PI * 2,
        rSpd: new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            (Math.random() - 0.5) * 2.5,
            (Math.random() - 0.5) * 2.5
        ),
    });
}

function collisions() {
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
        const p = S.projectiles[i];
        if (!p.alive) continue;

        for (let j = S.targets.length - 1; j >= 0; j--) {
            const tg = S.targets[j];
            if (!tg.alive) continue;

            if (p.mesh.position.distanceTo(tg.mesh.position) < tg.hr + 0.22) {
                tg.alive = false;
                p.alive = false;

                // Combo
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

    // combo pop
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

// ── Procedural Audio ──
function initAudio() { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function snd(type) {
    if (!audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        if (type === 'throw') {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(900, t);
            o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
            g.gain.setValueAtTime(0.1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            o.connect(g).connect(audioCtx.destination);
            o.start(t); o.stop(t + 0.2);
        } else if (type === 'hit') {
            [1100, 1500, 2000].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(f, t + i * 0.04);
                g.gain.setValueAtTime(0.12, t + i * 0.04);
                g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.35);
                o.connect(g).connect(audioCtx.destination);
                o.start(t + i * 0.04); o.stop(t + i * 0.04 + 0.35);
            });
        } else if (type === 'splash') {
            const n = audioCtx.sampleRate * 0.28;
            const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.12));
            const src = audioCtx.createBufferSource(); src.buffer = buf;
            const flt = audioCtx.createBiquadFilter();
            flt.type = 'lowpass'; flt.frequency.setValueAtTime(2800, t); flt.frequency.exponentialRampToValueAtTime(150, t + 0.25);
            const g = audioCtx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            src.connect(flt).connect(g).connect(audioCtx.destination); src.start(t);
        } else if (type === 'miss') {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
            g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.3);
        } else if (type === 'over') {
            [700, 500, 350, 180].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.22);
                g.gain.setValueAtTime(0.09, t + i * 0.22); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.22 + 0.4);
                o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.4);
            });
        } else if (type === 'wave') {
            [500, 700, 900, 1300].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.09);
                g.gain.setValueAtTime(0.1, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.3);
                o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.3);
            });
        }
    } catch (_) {}
}

// ── Particle Effects ──
function burstParticles(pos, col, count = 25) {
    const N = count;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        arr[i*3]=pos.x; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z;
        vels.push(new THREE.Vector3(
            (Math.random()-.5)*9, (Math.random()-.5)*9, (Math.random()-.5)*9
        ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: col, size: 0.13,
        transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
        sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 1.1 });
}

function splashParticles(pos) {
    const N = 22;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        arr[i*3]=pos.x+(Math.random()-.5)*.25;
        arr[i*3+1]=pos.y;
        arr[i*3+2]=pos.z+(Math.random()-.5)*.25;
        vels.push(new THREE.Vector3(
            (Math.random()-.5)*2.5, 3+Math.random()*5, (Math.random()-.5)*2.5
        ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: C.cyan, size: 0.07,
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 0.7 });
}

function trailParticle(pos, col) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array([pos.x, pos.y, pos.z]);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color: col, size: 0.06,
        transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ pts, vels: [new THREE.Vector3()], age: 0, life: 0.4 });
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

    // Ambient dust drift
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

// ── Post-Processing ──
function initPostFX() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        1.4, 0.55, 0.25
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
}

// ═══════════════════════════════════════════════
//  PHYSICS
// ═══════════════════════════════════════════════
function tickPhysics(dt) {
    const wY = 0; // water surface y
    const poolHW = POOL.w / 2, poolHD = POOL.d / 2;

    for (let i = S.projectiles.length - 1; i >= 0; i--) {
        const p = S.projectiles[i];
        if (!p.alive) continue;

        p.age += dt;
        p.vel.y += GRAVITY * dt;

        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt;
        p.mesh.position.z += p.vel.z * dt;

        // rotate
        if (p.type === 'ring') { p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 3; }
        else if (p.type === 'diver') { p.mesh.rotation.x += dt * 5; }
        else { p.mesh.rotation.x += dt * 3; p.mesh.rotation.y += dt * 2; }

        // trail
        p.trailT += dt;
        if (p.trailT > 0.04) {
            p.trailT = 0;
            const tc = p.type === 'ball' ? C.cyan : p.type === 'ring' ? C.magenta : C.green;
            trailParticle(p.mesh.position.clone(), tc);
        }

        // water hit
        if (p.mesh.position.y <= wY && !p.wet) {
            const px = p.mesh.position.x, pz = p.mesh.position.z;
            if (Math.abs(px) < poolHW && Math.abs(pz) < poolHD) {
                p.wet = true;
                p.vel.multiplyScalar(0.25);
                p.vel.y = Math.abs(p.vel.y) * 0.08;
                splashParticles(p.mesh.position.clone());
                snd('splash');
            }
        }

        // water drag
        if (p.wet) p.vel.multiplyScalar(1 - dt * 3.5);

        // bounds
        const gone = p.age > 5 ||
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

    // Water anim
    if (waterMat)   waterMat.uniforms.uTime.value = t;
    if (causticMat) causticMat.uniforms.uTime.value = t;

    // Avatar idle
    if (avatarGrp) {
        avatarGrp.position.y = 0.35 + Math.sin(t * 1.3) * 0.04;
        const br = avatarGrp.getObjectByName('baseRing');
        if (br) { br.rotation.z = t * 0.4; br.material.opacity = 0.18 + Math.sin(t * 2) * 0.08; }
    }

    // Target float + spin
    S.targets.forEach(tg => {
        if (!tg.alive) return;
        tg.age += dt;
        tg.mesh.position.y = tg.baseY + Math.sin(t * tg.fSpd + tg.fOff) * 0.25;
        tg.mesh.rotation.x += tg.rSpd.x * dt;
        tg.mesh.rotation.y += tg.rSpd.y * dt;
        tg.mesh.rotation.z += tg.rSpd.z * dt;
        const sc = 1 + Math.sin(t * 2.5 + tg.fOff) * 0.04;
        tg.mesh.scale.setScalar(sc);
    });

    // Pool pillar orbs pulse
    if (poolGrp) {
        poolGrp.children.forEach(c => {
            if (c.isMesh && c.geometry.type === 'SphereGeometry' && c.material.opacity !== undefined && c.material.opacity < 0.5) {
                c.material.opacity = 0.07 + Math.sin(t * 2 + c.position.x) * 0.05;
            }
        });
    }

    // Power bar
    if (S.charging) {
        const elapsed = (performance.now() - S.chargeT0) / 1000;
        S.power = Math.min(elapsed / 1.4, 1);
        $.powerFill.style.width = S.power * 100 + '%';
        $.powerPct.textContent = Math.round(S.power * 100) + '%';
    }

    if (S.on) {
        S.timer -= dt;
        if (S.timer <= 0) { S.timer = 0; gameOver(); return; }

        S.spawnCd += dt;
        const interval = Math.max(0.7, 2.2 - S.wave * 0.25);
        if (S.spawnCd >= interval) { spawnTarget(); S.spawnCd = 0; }

        S.waveCd += dt;
        if (S.waveCd >= 22) {
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
        if (avatarGrp && S.on) avatarGrp.rotation.y = S.mouse.x * 0.45;
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
        if (e.key === '1') pickObj('ball');
        if (e.key === '2') pickObj('ring');
        if (e.key === '3') pickObj('diver');
        if (e.key.toLowerCase() === 'r') controls.enabled = !controls.enabled;
    });

    $.objBtns.forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        pickObj(b.dataset.type);
    }));

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

function pickObj(type) {
    S.objType = type;
    $.objBtns.forEach(b => b.classList.toggle('active', b.dataset.type === type));
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
