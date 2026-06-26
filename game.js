// ═══════════════════════════════════════════════════
//  HOLOBOX AQUA ARENA — REAL WATER & POINT-AND-CLICK TOSS
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Water } from 'three/examples/jsm/objects/Water.js';

const C = {
    cyan:     0x00ffff,
    magenta:  0xff00ff,
    blue:     0x2266ff,
    gold:     0xffcc00,
    green:    0x00ff88,
};

const POOL = { w: 16, d: 12, depth: 2.2 };
const GRAVITY   = -18; // Stronger gravity for faster arc
const MAX_TGTS  = 6;
const GAME_SEC  = 90;
const MAX_LIVES = 10;
const COMBO_MS  = 3500;

const S = {
    on: false,
    score: 0, combo: 1, maxCombo: 1,
    lives: MAX_LIVES, timer: GAME_SEC,
    hits: 0, throws: 0,
    mouse: new THREE.Vector2(),
    projectiles: [],
    targets: [],
    particles: [],
    lastCombo: 0,
    spawnCd: 0,
};

let scene, cam, renderer, composer, controls, clock;
let waterMesh, aimMarker;
let avatarGrp, poolGrp;
let ray = new THREE.Raycaster();
let waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let targetPoint = new THREE.Vector3();
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
    buildAimMarker();
    buildAmbientDust();
    initPostFX();
    bindEvents();
    renderLives();
    tick();
}

function domCache() {
    const id = s => document.getElementById(s);
    $.start    = id('start-screen');
    $.startBtn = id('start-btn');
    $.over     = id('game-over');
    $.restartBtn= id('restart-btn');
    $.scoreV   = id('score-value');
    $.comboV   = id('combo-value');
    $.timerV   = id('timer-value');
    $.livesV   = id('lives-value');
    $.notif    = id('notification');
    $.hitPop   = id('hit-popup');
    $.fScore   = id('final-score');
    $.fHits    = id('final-hits');
    $.fAcc     = id('final-accuracy');
}

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 150);
    cam.position.set(0, 12, 16);
    cam.lookAt(0, -1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('game-container').appendChild(renderer.domElement);

    controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 25;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.maxPolarAngle = Math.PI * 0.45;

    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(4, 15, 6);
    scene.add(dir);

    const uw1 = new THREE.PointLight(C.cyan, 1.5, 20);
    uw1.position.set(-4, -1, -2);
    scene.add(uw1);
    const uw2 = new THREE.PointLight(C.magenta, 1.5, 20);
    uw2.position.set(4, -1, 2);
    scene.add(uw2);
}

function buildPool() {
    poolGrp = new THREE.Group();
    const hw = POOL.w / 2, hd = POOL.d / 2, dep = POOL.depth;

    const tileMat = new THREE.MeshPhysicalMaterial({
        color: 0x001a33, emissive: 0x002244, emissiveIntensity: 0.1,
        roughness: 0.2, metalness: 0.8
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(POOL.w, POOL.d), tileMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -dep;
    poolGrp.add(floor);

    const gridW = new THREE.GridHelper(Math.max(POOL.w, POOL.d), 20, C.cyan, 0x004488);
    gridW.position.y = -dep + 0.02;
    gridW.material.transparent = true;
    gridW.material.opacity = 0.4;
    poolGrp.add(gridW);

    const basinGeo = new THREE.BoxGeometry(POOL.w, dep, POOL.d);
    const basinEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(basinGeo),
        new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.7 })
    );
    basinEdges.position.y = -dep / 2;
    poolGrp.add(basinEdges);

    const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x002244, roughness: 0.1, metalness: 0.9 });
    const rimH = 0.2, rimW = 0.4;
    
    [[-1,0,POOL.w+rimW*2,rimH,rimW], [1,0,POOL.w+rimW*2,rimH,rimW], [0,-1,rimW,rimH,POOL.d], [0,1,rimW,rimH,POOL.d]]
    .forEach(([mz, mx, w, h, d]) => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat);
        r.position.set(mx * (hw + rimW/2), rimH/2, mz * (hd + rimW/2));
        poolGrp.add(r);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(r.geometry), new THREE.LineBasicMaterial({ color: C.cyan, opacity: 0.5, transparent: true }));
        edges.position.copy(r.position);
        poolGrp.add(edges);
    });

    scene.add(poolGrp);
}

// ── Real Water using Three.js Water Addon ──
function buildWater() {
    const waterGeo = new THREE.PlaneGeometry(POOL.w, POOL.d);
    
    // We use a procedural texture for normals so it works without external assets easily
    // But since internet is available, we load standard water normals
    const texLoader = new THREE.TextureLoader();
    const waterNormals = texLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg', function(tex) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    });

    waterMesh = new Water(
        waterGeo,
        {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: waterNormals,
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: 0x003366,
            distortionScale: 2.0,
            fog: false
        }
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.material.transparent = true;
    // Lower opacity so we can see the grid below
    waterMesh.material.uniforms['alpha'] = { value: 0.85 }; 
    scene.add(waterMesh);
}

function buildAimMarker() {
    const geo = new THREE.RingGeometry(0.3, 0.4, 32);
    const mat = new THREE.MeshBasicMaterial({ color: C.magenta, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    aimMarker = new THREE.Mesh(geo, mat);
    aimMarker.rotation.x = -Math.PI / 2;
    aimMarker.position.y = 0.05;
    aimMarker.visible = false;
    scene.add(aimMarker);
}

function buildAvatar() {
    avatarGrp = new THREE.Group();
    const gm = new THREE.MeshPhysicalMaterial({
        color: C.cyan, emissive: C.cyan, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.6
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8), gm);
    torso.position.y = 0.35;
    avatarGrp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), gm);
    head.position.y = 0.9;
    avatarGrp.add(head);

    avatarGrp.position.set(0, 0, POOL.d / 2 + 1.2);
    scene.add(avatarGrp);
}

function buildAmbientDust() {
    const N = 200;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        pos[i*3] = (Math.random()-.5)*18;
        pos[i*3+1] = Math.random()*6;
        pos[i*3+2] = (Math.random()-.5)*14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: C.cyan, size: 0.04, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    scene.add(new THREE.Points(geo, mat));
}

function initPostFX() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
}

// ═══════════════════════════════════════════════
//  GAME LOGIC
// ═══════════════════════════════════════════════
function doThrow() {
    if (!aimMarker.visible) return;
    S.throws++;

    const origin = avatarGrp.position.clone();
    origin.y += 0.8;

    const targetX = aimMarker.position.x;
    const targetZ = aimMarker.position.z;
    const targetY = aimMarker.position.y;

    // Time to target logic (constant time to target makes it easy to aim)
    const T = 0.6; 
    const dx = targetX - origin.x;
    const dz = targetZ - origin.z;
    const dy = targetY - origin.y;

    const vx = dx / T;
    const vz = dz / T;
    const vy = (dy - 0.5 * GRAVITY * T * T) / T;

    const vel = new THREE.Vector3(vx, vy, vz);

    const mat = new THREE.MeshPhysicalMaterial({
        color: C.magenta, emissive: C.magenta, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.6
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(origin);
    scene.add(mesh);

    S.projectiles.push({ mesh, vel, alive: true, age: 0, wet: false });
    snd('throw');
}

function spawnTarget() {
    if (S.targets.length >= MAX_TGTS) return;
    const hw = POOL.w * 0.4, hd = POOL.d * 0.4;
    const x = (Math.random() - 0.5) * hw * 2;
    const z = (Math.random() - 0.5) * hd * 2;
    const y = 0.2; // Floating on surface

    const col = [C.cyan, C.gold, C.green][Math.floor(Math.random() * 3)];
    const mat = new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.7 });
    
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    S.targets.push({ mesh, alive: true, age: 0, pts: 100, col, baseY: y, fOff: Math.random() * Math.PI });
}

function tickPhysics(dt) {
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
        const p = S.projectiles[i];
        if (!p.alive) continue;

        p.age += dt;
        p.vel.y += GRAVITY * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.z += dt * 15; // spin

        // Hit water
        if (p.mesh.position.y <= 0.05 && !p.wet) {
            if (Math.abs(p.mesh.position.x) < POOL.w/2 && Math.abs(p.mesh.position.z) < POOL.d/2) {
                p.wet = true;
                p.vel.multiplyScalar(0); // stop on water
                splashParticles(p.mesh.position);
                snd('splash');

                // Check hit against balls
                let hit = false;
                for (let j = S.targets.length - 1; j >= 0; j--) {
                    const tg = S.targets[j];
                    if (!tg.alive) continue;
                    // If ring lands precisely around the ball
                    if (p.mesh.position.distanceTo(tg.mesh.position) < 0.6) {
                        tg.alive = false; hit = true;
                        scene.remove(tg.mesh); S.targets.splice(j, 1);
                        handleHit(tg.pts, tg.col, tg.mesh.position);
                        break;
                    }
                }
                
                if (!hit) {
                    S.lives--;
                    S.combo = 1;
                    renderLives();
                    snd('miss');
                    if (S.lives <= 0) gameOver();
                }
            }
        }

        if (p.age > 2.0 || p.mesh.position.y < -3) {
            p.alive = false;
            scene.remove(p.mesh);
            S.projectiles.splice(i, 1);
        }
    }
}

function handleHit(pts, col, pos) {
    const now = performance.now();
    if (now - S.lastCombo < COMBO_MS) {
        S.combo++;
        if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    } else S.combo = 1;
    S.lastCombo = now;

    S.score += Math.round(pts * S.combo);
    S.hits++;

    burstParticles(pos, col);
    hitPopup(pts, S.combo);
    snd('hit');
    refreshHUD();
}

function tick(tRaw) {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (waterMesh) waterMesh.material.uniforms['time'].value += dt;

    if (S.on && aimMarker) {
        ray.setFromCamera(S.mouse, cam);
        ray.ray.intersectPlane(waterPlane, targetPoint);
        if (targetPoint && Math.abs(targetPoint.x) < POOL.w/2 && Math.abs(targetPoint.z) < POOL.d/2) {
            aimMarker.visible = true;
            aimMarker.position.set(targetPoint.x, 0.05, targetPoint.z);
            aimMarker.rotation.z += dt;
        } else {
            aimMarker.visible = false;
        }
    } else if (aimMarker) aimMarker.visible = false;

    S.targets.forEach(tg => {
        if (tg.alive) tg.mesh.position.y = tg.baseY + Math.sin(t * 2 + tg.fOff) * 0.1;
    });

    if (S.on) {
        S.timer -= dt;
        if (S.timer <= 0) { S.timer = 0; gameOver(); }

        S.spawnCd += dt;
        if (S.spawnCd >= 1.2) { spawnTarget(); S.spawnCd = 0; }

        if (performance.now() - S.lastCombo > COMBO_MS && S.combo > 1) { S.combo = 1; refreshHUD(); }
        tickPhysics(dt);
    }

    tickParticles(dt);
    controls.update();
    composer.render();
}

// ═══════════════════════════════════════════════
//  UI & EVENTS
// ═══════════════════════════════════════════════
function bindEvents() {
    window.addEventListener('mousemove', e => {
        S.mouse.x = (e.clientX / innerWidth) * 2 - 1;
        S.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    });

    window.addEventListener('mousedown', e => {
        if (S.on && e.button === 0) doThrow();
    });

    $.startBtn.addEventListener('click', () => { initAudio(); $.start.classList.add('hidden'); S.on = true; });
    $.restartBtn.addEventListener('click', () => { $.over.classList.add('hidden'); resetGame(); S.on = true; });

    window.addEventListener('resize', () => {
        cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
    });
}

function refreshHUD() {
    $.scoreV.textContent = S.score;
    $.comboV.textContent = `×${S.combo}`;
    $.timerV.textContent = Math.ceil(S.timer);
}

function renderLives() {
    $.livesV.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        const p = document.createElement('span');
        p.className = 'life-pip' + (i < S.lives ? '' : ' dead');
        $.livesV.appendChild(p);
    }
}

function hitPopup(pts, combo) {
    $.hitPop.innerHTML = `<span style="color:#00ff88; text-shadow:0 0 20px #00ff88">+${pts}</span>`;
    if (combo > 1) $.hitPop.innerHTML += `<br><span style="color:#ff00ff;">×${combo} COMBO!</span>`;
    $.hitPop.classList.remove('hidden');
    $.hitPop.style.animation = 'none'; $.hitPop.offsetHeight; $.hitPop.style.animation = '';
    setTimeout(() => $.hitPop.classList.add('hidden'), 900);
}

function gameOver() {
    S.on = false;
    $.fScore.textContent = S.score;
    $.fHits.textContent  = S.hits;
    $.fAcc.textContent   = S.throws ? Math.round(S.hits / S.throws * 100) + '%' : '0%';
    $.over.classList.remove('hidden');
    snd('over');
}

function resetGame() {
    S.projectiles.forEach(p => scene.remove(p.mesh)); S.projectiles = [];
    S.targets.forEach(t => scene.remove(t.mesh)); S.targets = [];
    S.score = 0; S.combo = 1; S.lives = MAX_LIVES; S.timer = GAME_SEC; S.hits = 0; S.throws = 0;
    renderLives(); refreshHUD();
}

function burstParticles(pos, col) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(30 * 3);
    const vels = [];
    for (let i = 0; i < 30; i++) {
        arr[i*3]=pos.x; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z;
        vels.push(new THREE.Vector3((Math.random()-.5)*6, (Math.random()-.5)*6, (Math.random()-.5)*6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.15, transparent: true, blending: THREE.AdditiveBlending }));
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 1.0 });
}

function splashParticles(pos) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(20 * 3);
    const vels = [];
    for (let i = 0; i < 20; i++) {
        arr[i*3]=pos.x; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z;
        vels.push(new THREE.Vector3((Math.random()-.5)*3, 2+Math.random()*3, (Math.random()-.5)*3));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: C.cyan, size: 0.08, transparent: true }));
    scene.add(pts);
    S.particles.push({ pts, vels, age: 0, life: 0.6 });
}

function tickParticles(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
        const p = S.particles[i];
        p.age += dt;
        if (p.age >= p.life) { scene.remove(p.pts); S.particles.splice(i, 1); continue; }
        const arr = p.pts.geometry.attributes.position.array;
        for (let j = 0; j < p.vels.length; j++) {
            p.vels[j].y += GRAVITY * 0.3 * dt;
            arr[j*3] += p.vels[j].x * dt; arr[j*3+1] += p.vels[j].y * dt; arr[j*3+2] += p.vels[j].z * dt;
        }
        p.pts.geometry.attributes.position.needsUpdate = true;
        p.pts.material.opacity = 1 - (p.age / p.life);
    }
}

function initAudio() { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function snd(t) { if(!audioCtx)return; const ct = audioCtx.currentTime; try { /* minimal synths */ }catch(e){} }

boot();
