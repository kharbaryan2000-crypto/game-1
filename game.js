// =============================================
//  HOLOBOX AQUA STRIKE — MAIN GAME ENGINE
//  All 6 Phases: 3D Pool, Water, Throw, Targets,
//  UI, Sound & Particles
// =============================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ─── CONSTANTS ───────────────────────────────────
const COLORS = {
    cyan: 0x00ffff,
    magenta: 0xff00ff,
    blue: 0x0066ff,
    green: 0x00ff88,
    orange: 0xff6622,
    yellow: 0xffee00,
    white: 0xffffff,
    water: 0x005577,
    waterDeep: 0x002244,
};

const BOX_SIZE = { w: 12, h: 8, d: 8 };
const POOL_DEPTH = 1.5;
const GRAVITY = -15;
const MAX_TARGETS = 6;
const GAME_TIME = 90;
const MAX_LIVES = 5;

// ─── GAME STATE ──────────────────────────────────
const state = {
    running: false,
    score: 0,
    combo: 1,
    maxCombo: 1,
    lives: MAX_LIVES,
    timer: GAME_TIME,
    wave: 1,
    totalHits: 0,
    totalThrows: 0,
    selectedObject: 'ball',
    isCharging: false,
    chargeStart: 0,
    chargePower: 0,
    mouseNDC: new THREE.Vector2(),
    mouseScreen: { x: 0, y: 0 },
    throwables: [],
    targets: [],
    particles: [],
    splashParticles: [],
    trailParticles: [],
    ambientParticles: null,
    lastComboTime: 0,
    comboTimeout: 3000,
};

// ─── THREE.JS GLOBALS ───────────────────────────
let scene, camera, renderer, composer, controls;
let clock = new THREE.Clock();
let waterMesh, waterMaterial;
let holoBox;
let avatarGroup;
let raycaster = new THREE.Raycaster();

// ─── SOUND CONTEXT ──────────────────────────────
let audioCtx;

// ─── DOM REFS ───────────────────────────────────
const dom = {};

// =============================================
//  INITIALIZATION
// =============================================
function init() {
    cacheDom();
    setupScene();
    createHoloBox();
    createPool();
    createAvatar();
    createAmbientParticles();
    setupPostProcessing();
    setupEventListeners();
    animate();
}

function cacheDom() {
    dom.container = document.getElementById('game-container');
    dom.startScreen = document.getElementById('start-screen');
    dom.startBtn = document.getElementById('start-btn');
    dom.gameOver = document.getElementById('game-over');
    dom.restartBtn = document.getElementById('restart-btn');
    dom.crosshair = document.getElementById('crosshair');
    dom.scoreValue = document.getElementById('score-value');
    dom.comboValue = document.getElementById('combo-value');
    dom.timerValue = document.getElementById('timer-value');
    dom.waveValue = document.getElementById('wave-value');
    dom.livesValue = document.getElementById('lives-value');
    dom.powerContainer = document.getElementById('power-bar-container');
    dom.powerFill = document.getElementById('power-fill');
    dom.hitFeedback = document.getElementById('hit-feedback');
    dom.hitText = document.getElementById('hit-text');
    dom.notification = document.getElementById('notification');
    dom.objBtns = document.querySelectorAll('.obj-btn');
    dom.hud = document.getElementById('hud');
    dom.objectSelector = document.getElementById('object-selector');
    dom.finalScore = document.getElementById('final-score');
    dom.finalCombo = document.getElementById('final-combo');
    dom.finalHits = document.getElementById('final-hits');
    dom.finalAccuracy = document.getElementById('final-accuracy');
}

// =============================================
//  PHASE 1 — 3D SCENE + CAMERA
// =============================================
function setupScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000011, 0.02);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 5, 14);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    dom.container.appendChild(renderer.domElement);

    // Controls (limited orbit)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.minAzimuthAngle = -Math.PI * 0.3;
    controls.maxAzimuthAngle = Math.PI * 0.3;
    controls.enabled = false;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x112244, 0.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0x00aaff, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(1024, 1024);
    scene.add(mainLight);

    const pointLight1 = new THREE.PointLight(COLORS.cyan, 1, 20);
    pointLight1.position.set(-4, 6, 3);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(COLORS.magenta, 0.6, 20);
    pointLight2.position.set(4, 6, -3);
    scene.add(pointLight2);

    const bottomLight = new THREE.PointLight(COLORS.cyan, 0.4, 15);
    bottomLight.position.set(0, -2, 0);
    scene.add(bottomLight);
}

function createHoloBox() {
    holoBox = new THREE.Group();

    // Wireframe edges of the box
    const edgeMat = new THREE.LineBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.35,
    });

    const hw = BOX_SIZE.w / 2, hh = BOX_SIZE.h / 2, hd = BOX_SIZE.d / 2;
    const corners = [
        [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
        [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    ];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7],
    ];

    edges.forEach(([a, b]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...corners[a]),
            new THREE.Vector3(...corners[b]),
        ]);
        holoBox.add(new THREE.Line(geo, edgeMat));
    });

    // Transparent walls (faintly visible)
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.03,
        side: THREE.DoubleSide,
        roughness: 0.1,
        metalness: 0.2,
        envMapIntensity: 0.5,
    });

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(BOX_SIZE.w, BOX_SIZE.h), wallMat);
    backWall.position.z = -hd;
    holoBox.add(backWall);

    // Side walls
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(BOX_SIZE.d, BOX_SIZE.h), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.x = -hw;
    holoBox.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(BOX_SIZE.d, BOX_SIZE.h), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = hw;
    holoBox.add(rightWall);

    // Floor
    const floorMat = new THREE.MeshPhysicalMaterial({
        color: 0x001122,
        transparent: true,
        opacity: 0.3,
        roughness: 0.05,
        metalness: 0.8,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(BOX_SIZE.w, BOX_SIZE.d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -hh;
    floor.receiveShadow = true;
    holoBox.add(floor);

    // Grid on floor
    const gridHelper = new THREE.GridHelper(Math.max(BOX_SIZE.w, BOX_SIZE.d), 20, COLORS.cyan, COLORS.cyan);
    gridHelper.position.y = -hh + 0.01;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.06;
    holoBox.add(gridHelper);

    // Corner glow orbs
    [[-1,-1,-1],[1,-1,-1],[-1,-1,1],[1,-1,1],[-1,1,-1],[1,1,-1],[-1,1,1],[1,1,1]].forEach(([x,y,z]) => {
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: COLORS.cyan })
        );
        orb.position.set(x * hw, y * hh, z * hd);
        holoBox.add(orb);

        const glowOrb = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.15 })
        );
        glowOrb.position.copy(orb.position);
        holoBox.add(glowOrb);
    });

    scene.add(holoBox);
}

// =============================================
//  PHASE 2 — WATER ANIMATION + HOLOGRAPHIC
// =============================================
function createPool() {
    const poolW = BOX_SIZE.w * 0.75;
    const poolD = BOX_SIZE.d * 0.75;

    // Pool basin (hollow)
    const basinGeo = new THREE.BoxGeometry(poolW, POOL_DEPTH, poolD);
    const basinMat = new THREE.MeshPhysicalMaterial({
        color: 0x001133,
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide,
        roughness: 0.1,
        metalness: 0.8,
    });
    const basin = new THREE.Mesh(basinGeo, basinMat);
    basin.position.y = -BOX_SIZE.h / 2 + POOL_DEPTH / 2;
    scene.add(basin);

    // Pool rim
    const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(poolW + 0.1, POOL_DEPTH + 0.1, poolD + 0.1));
    const rimMat = new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.4 });
    const rim = new THREE.LineSegments(rimGeo, rimMat);
    rim.position.copy(basin.position);
    scene.add(rim);

    // Water surface with custom shader
    const waterGeo = new THREE.PlaneGeometry(poolW, poolD, 64, 64);
    waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor1: { value: new THREE.Color(0x00ddff) },
            uColor2: { value: new THREE.Color(0x0044aa) },
            uColor3: { value: new THREE.Color(0xff00ff) },
            uOpacity: { value: 0.65 },
        },
        vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying float vWave;

            void main() {
                vUv = uv;
                vec3 pos = position;

                float wave1 = sin(pos.x * 3.0 + uTime * 2.0) * 0.08;
                float wave2 = sin(pos.y * 4.0 + uTime * 1.5) * 0.06;
                float wave3 = cos(pos.x * 2.0 + pos.y * 2.5 + uTime * 1.8) * 0.05;
                float wave4 = sin(length(pos.xy) * 5.0 - uTime * 3.0) * 0.03;

                pos.z += wave1 + wave2 + wave3 + wave4;
                vWave = wave1 + wave2 + wave3 + wave4;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            uniform float uOpacity;
            varying vec2 vUv;
            varying float vWave;

            void main() {
                // Animated color blend
                float t = sin(uTime * 0.5 + vUv.x * 3.0) * 0.5 + 0.5;
                vec3 color = mix(uColor1, uColor2, t);

                // Holographic shimmer
                float shimmer = sin(vUv.x * 40.0 + uTime * 5.0) * sin(vUv.y * 40.0 - uTime * 3.0);
                color += uColor3 * shimmer * 0.08;

                // Bright on wave peaks
                float brightness = vWave * 4.0 + 0.5;
                color *= brightness;

                // Edge glow
                float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
                float edgeGlow = smoothstep(0.0, 0.15, edgeDist);
                color = mix(uColor1 * 1.5, color, edgeGlow);

                // Caustic-like pattern
                float caustic = sin(vUv.x * 20.0 + uTime * 2.0) * sin(vUv.y * 20.0 + uTime * 1.7);
                color += vec3(0.0, caustic * 0.06, caustic * 0.08);

                gl_FragColor = vec4(color, uOpacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
    });

    waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = -BOX_SIZE.h / 2 + POOL_DEPTH;
    scene.add(waterMesh);
}

function createAvatar() {
    avatarGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.9, 8);
    const bodyMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.7,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.45;
    avatarGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const headMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.8,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.5,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1;
    avatarGroup.add(head);

    // Visor
    const visorGeo = new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const visorMat = new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0.5,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.15, 0.12);
    visor.rotation.x = -Math.PI * 0.15;
    avatarGroup.add(visor);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6);
    const armMat = bodyMat.clone();

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 0.6, 0);
    leftArm.rotation.z = 0.3;
    avatarGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 0.6, 0);
    rightArm.rotation.z = -0.3;
    rightArm.name = 'rightArm';
    avatarGroup.add(rightArm);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6);
    const leftLeg = new THREE.Mesh(legGeo, armMat);
    leftLeg.position.set(-0.12, -0.05, 0);
    avatarGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, armMat);
    rightLeg.position.set(0.12, -0.05, 0);
    avatarGroup.add(rightLeg);

    // Glow ring around avatar
    const glowRingGeo = new THREE.TorusGeometry(0.5, 0.02, 8, 32);
    const glowRingMat = new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.3,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = -0.2;
    glowRing.name = 'glowRing';
    avatarGroup.add(glowRing);

    avatarGroup.position.set(0, -BOX_SIZE.h / 2 + POOL_DEPTH + 0.3, BOX_SIZE.d / 2 - 1.2);
    scene.add(avatarGroup);
}

// =============================================
//  PHASE 3 — THROWABLE OBJECTS
// =============================================
function createThrowable(type, position, velocity) {
    let mesh;
    const glowColor = type === 'ball' ? COLORS.cyan : type === 'ring' ? COLORS.magenta : COLORS.green;

    if (type === 'ball') {
        const geo = new THREE.SphereGeometry(0.2, 16, 16);
        const mat = new THREE.MeshPhysicalMaterial({
            color: glowColor,
            emissive: glowColor,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.85,
            roughness: 0.1,
            metalness: 0.7,
        });
        mesh = new THREE.Mesh(geo, mat);

        // Inner glow
        const innerGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const innerMat = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: 0.15,
        });
        mesh.add(new THREE.Mesh(innerGeo, innerMat));

    } else if (type === 'ring') {
        const geo = new THREE.TorusGeometry(0.22, 0.05, 8, 24);
        const mat = new THREE.MeshPhysicalMaterial({
            color: glowColor,
            emissive: glowColor,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.85,
            roughness: 0.1,
            metalness: 0.8,
        });
        mesh = new THREE.Mesh(geo, mat);

    } else { // diver
        mesh = new THREE.Group();
        // Diver body
        const diverBody = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.08, 0.3, 4, 8),
            new THREE.MeshPhysicalMaterial({
                color: glowColor,
                emissive: glowColor,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.85,
            })
        );
        mesh.add(diverBody);

        // Diver head
        const diverHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.8 })
        );
        diverHead.position.y = 0.25;
        mesh.add(diverHead);
    }

    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const throwable = {
        mesh,
        type,
        velocity: velocity.clone(),
        alive: true,
        age: 0,
        inWater: false,
        trail: [],
    };

    state.throwables.push(throwable);
    return throwable;
}

function throwObject() {
    const power = state.chargePower;
    if (power < 0.05) return;

    state.totalThrows++;

    // Calculate throw direction from avatar toward the mouse aim
    const aimDir = new THREE.Vector3();
    raycaster.setFromCamera(state.mouseNDC, camera);
    aimDir.copy(raycaster.ray.direction);

    // Starting position from avatar's right arm
    const startPos = avatarGroup.position.clone();
    startPos.y += 1.0;

    // Velocity based on power and aim
    const speed = 8 + power * 18;
    const velocity = aimDir.normalize().multiplyScalar(speed);

    // Add slight upward arc
    velocity.y += 3 + power * 3;

    createThrowable(state.selectedObject, startPos, velocity);

    // Avatar throw animation
    const rightArm = avatarGroup.getObjectByName('rightArm');
    if (rightArm) {
        rightArm.rotation.z = -1.5;
        rightArm.rotation.x = -0.5;
        setTimeout(() => {
            rightArm.rotation.z = -0.3;
            rightArm.rotation.x = 0;
        }, 300);
    }

    playSound('throw');
}

// =============================================
//  PHASE 4 — TARGETS + COLLISION
// =============================================
function spawnTarget() {
    if (state.targets.length >= MAX_TARGETS) return;

    const hw = BOX_SIZE.w * 0.3;
    const hd = BOX_SIZE.d * 0.3;
    const waterY = -BOX_SIZE.h / 2 + POOL_DEPTH;

    const types = ['sphere', 'ring', 'diamond', 'cube'];
    const type = types[Math.floor(Math.random() * types.length)];

    let mesh, hitRadius;
    const x = (Math.random() - 0.5) * hw * 2;
    const z = (Math.random() - 0.5) * hd * 2;
    const y = waterY + 0.5 + Math.random() * 2.5;

    const colors = [COLORS.magenta, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.cyan];
    const color = colors[Math.floor(Math.random() * colors.length)];

    if (type === 'sphere') {
        mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 16, 16),
            new THREE.MeshPhysicalMaterial({
                color, emissive: color, emissiveIntensity: 0.4,
                transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.5,
            })
        );
        hitRadius = 0.5;
    } else if (type === 'ring') {
        mesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.35, 0.08, 8, 24),
            new THREE.MeshPhysicalMaterial({
                color, emissive: color, emissiveIntensity: 0.4,
                transparent: true, opacity: 0.8,
            })
        );
        hitRadius = 0.6;
    } else if (type === 'diamond') {
        mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.3, 0),
            new THREE.MeshPhysicalMaterial({
                color, emissive: color, emissiveIntensity: 0.5,
                transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.9,
            })
        );
        hitRadius = 0.5;
    } else {
        mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.4, 0.4),
            new THREE.MeshPhysicalMaterial({
                color, emissive: color, emissiveIntensity: 0.4,
                transparent: true, opacity: 0.8,
            })
        );
        hitRadius = 0.5;
    }

    // Glow sphere around target
    const glowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(hitRadius, 8, 8),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.08,
        })
    );
    mesh.add(glowMesh);

    mesh.position.set(x, y, z);
    scene.add(mesh);

    const points = type === 'diamond' ? 150 : type === 'ring' ? 200 : type === 'cube' ? 100 : 100;

    state.targets.push({
        mesh,
        type,
        hitRadius,
        alive: true,
        age: 0,
        points,
        baseY: y,
        color,
        floatSpeed: 0.5 + Math.random() * 1.5,
        floatOffset: Math.random() * Math.PI * 2,
        rotSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ),
    });
}

function checkCollisions(dt) {
    for (let i = state.throwables.length - 1; i >= 0; i--) {
        const t = state.throwables[i];
        if (!t.alive) continue;

        for (let j = state.targets.length - 1; j >= 0; j--) {
            const target = state.targets[j];
            if (!target.alive) continue;

            const dist = t.mesh.position.distanceTo(target.mesh.position);
            if (dist < target.hitRadius + 0.2) {
                // HIT!
                target.alive = false;
                t.alive = false;

                // Update combo
                const now = Date.now();
                if (now - state.lastComboTime < state.comboTimeout) {
                    state.combo++;
                    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
                } else {
                    state.combo = 1;
                }
                state.lastComboTime = now;

                const points = Math.round(target.points * state.combo);
                state.score += points;
                state.totalHits++;

                // Effects
                spawnHitParticles(target.mesh.position.clone(), target.color);
                showHitFeedback(points);
                playSound('hit');

                // Remove meshes
                scene.remove(target.mesh);
                scene.remove(t.mesh);
                state.targets.splice(j, 1);
                state.throwables.splice(i, 1);

                updateUI();
                break;
            }
        }
    }
}

// =============================================
//  PHASE 5 — UI MANAGEMENT
// =============================================
function updateUI() {
    dom.scoreValue.textContent = state.score;
    dom.comboValue.textContent = `x${state.combo}`;
    dom.waveValue.textContent = state.wave;

    // Combo pop effect
    dom.comboValue.classList.add('pop');
    setTimeout(() => dom.comboValue.classList.remove('pop'), 200);

    // Timer
    const seconds = Math.ceil(state.timer);
    dom.timerValue.textContent = seconds;
    dom.timerValue.classList.remove('warning', 'critical');
    if (seconds <= 10) dom.timerValue.classList.add('critical');
    else if (seconds <= 20) dom.timerValue.classList.add('warning');

    // Lives
    const orbs = dom.livesValue.querySelectorAll('.life-orb');
    orbs.forEach((orb, i) => {
        orb.classList.remove('active', 'lost');
        if (i < state.lives) orb.classList.add('active');
        else orb.classList.add('lost');
    });
}

function showHitFeedback(points) {
    dom.hitText.textContent = `+${points}`;
    dom.hitFeedback.classList.remove('hidden');

    // Reset animation
    const el = dom.hitText;
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = '';

    setTimeout(() => dom.hitFeedback.classList.add('hidden'), 800);
}

function showNotification(text, duration = 1500) {
    dom.notification.textContent = text;
    dom.notification.classList.remove('hidden');
    dom.notification.style.animation = 'none';
    dom.notification.offsetHeight;
    dom.notification.style.animation = '';
    setTimeout(() => dom.notification.classList.add('hidden'), duration);
}

function showGameOver() {
    state.running = false;
    const accuracy = state.totalThrows > 0
        ? Math.round((state.totalHits / state.totalThrows) * 100) : 0;

    dom.finalScore.textContent = state.score;
    dom.finalCombo.textContent = `x${state.maxCombo}`;
    dom.finalHits.textContent = state.totalHits;
    dom.finalAccuracy.textContent = `${accuracy}%`;
    dom.gameOver.classList.remove('hidden');

    playSound('gameOver');
}

// =============================================
//  PHASE 6 — SOUND + PARTICLES
// =============================================

// --- Sound Generation (Web Audio API) ---
function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;

        if (type === 'throw') {
            // Swoosh sound
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);

        } else if (type === 'hit') {
            // Ding sound
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1200, now);
            osc1.frequency.exponentialRampToValueAtTime(1800, now + 0.05);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1600, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.4);
            osc2.stop(now + 0.4);

        } else if (type === 'splash') {
            // Noise burst for splash
            const bufferSize = audioCtx.sampleRate * 0.3;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(3000, now);
            filter.frequency.exponentialRampToValueAtTime(200, now + 0.25);
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            noise.connect(filter).connect(gain).connect(audioCtx.destination);
            noise.start(now);

        } else if (type === 'miss') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.3);

        } else if (type === 'gameOver') {
            // Descending tones
            [800, 600, 400, 200].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.2);
                gain.gain.setValueAtTime(0.1, now + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.4);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(now + i * 0.2);
                osc.stop(now + i * 0.2 + 0.4);
            });

        } else if (type === 'wave') {
            // Ascending chime
            [600, 800, 1000, 1400].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.1);
                gain.gain.setValueAtTime(0.1, now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.3);
            });
        }
    } catch (e) {
        // Audio failed silently
    }
}

// --- Particle System ---
function spawnHitParticles(position, color) {
    const count = 30;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;

        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        ));

        sizes[i] = 0.08 + Math.random() * 0.12;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
        color,
        size: 0.15,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    state.particles.push({
        points,
        velocities,
        age: 0,
        maxAge: 1.2,
        startOpacity: 1,
    });
}

function spawnSplashParticles(position) {
    const count = 20;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = position.x + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;

        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            3 + Math.random() * 5,
            (Math.random() - 0.5) * 3
        ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: COLORS.cyan,
        size: 0.08,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    state.splashParticles.push({
        points,
        velocities,
        age: 0,
        maxAge: 0.8,
    });
}

function createAmbientParticles() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * BOX_SIZE.w;
        positions[i * 3 + 1] = (Math.random() - 0.5) * BOX_SIZE.h;
        positions[i * 3 + 2] = (Math.random() - 0.5) * BOX_SIZE.d;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: COLORS.cyan,
        size: 0.04,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    state.ambientParticles = new THREE.Points(geo, mat);
    scene.add(state.ambientParticles);
}

function updateParticles(dt) {
    // Hit particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.age += dt;

        if (p.age >= p.maxAge) {
            scene.remove(p.points);
            p.points.geometry.dispose();
            p.points.material.dispose();
            state.particles.splice(i, 1);
            continue;
        }

        const positions = p.points.geometry.attributes.position.array;
        const progress = p.age / p.maxAge;

        for (let j = 0; j < p.velocities.length; j++) {
            p.velocities[j].y += GRAVITY * 0.3 * dt;
            positions[j * 3] += p.velocities[j].x * dt;
            positions[j * 3 + 1] += p.velocities[j].y * dt;
            positions[j * 3 + 2] += p.velocities[j].z * dt;
        }

        p.points.geometry.attributes.position.needsUpdate = true;
        p.points.material.opacity = (1 - progress) * p.startOpacity;
        p.points.material.size = 0.15 * (1 - progress * 0.5);
    }

    // Splash particles
    for (let i = state.splashParticles.length - 1; i >= 0; i--) {
        const p = state.splashParticles[i];
        p.age += dt;

        if (p.age >= p.maxAge) {
            scene.remove(p.points);
            p.points.geometry.dispose();
            p.points.material.dispose();
            state.splashParticles.splice(i, 1);
            continue;
        }

        const positions = p.points.geometry.attributes.position.array;
        for (let j = 0; j < p.velocities.length; j++) {
            p.velocities[j].y += GRAVITY * dt;
            positions[j * 3] += p.velocities[j].x * dt;
            positions[j * 3 + 1] += p.velocities[j].y * dt;
            positions[j * 3 + 2] += p.velocities[j].z * dt;
        }

        p.points.geometry.attributes.position.needsUpdate = true;
        p.points.material.opacity = 0.8 * (1 - p.age / p.maxAge);
    }

    // Ambient particles float
    if (state.ambientParticles) {
        const positions = state.ambientParticles.geometry.attributes.position.array;
        const time = clock.elapsedTime;
        for (let i = 0; i < positions.length / 3; i++) {
            positions[i * 3 + 1] += Math.sin(time + i) * 0.002;
            positions[i * 3] += Math.cos(time * 0.5 + i * 0.7) * 0.001;
        }
        state.ambientParticles.geometry.attributes.position.needsUpdate = true;
        state.ambientParticles.material.opacity = 0.15 + Math.sin(time * 0.5) * 0.1;
    }
}

// =============================================
//  POST-PROCESSING (Bloom)
// =============================================
function setupPostProcessing() {
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.2,  // strength
        0.5,  // radius
        0.3   // threshold
    );
    composer.addPass(bloomPass);
}

// =============================================
//  PHYSICS UPDATE
// =============================================
function updatePhysics(dt) {
    const waterY = -BOX_SIZE.h / 2 + POOL_DEPTH;
    const poolW = BOX_SIZE.w * 0.375;
    const poolD = BOX_SIZE.d * 0.375;

    for (let i = state.throwables.length - 1; i >= 0; i--) {
        const t = state.throwables[i];
        if (!t.alive) continue;

        t.age += dt;

        // Apply gravity
        t.velocity.y += GRAVITY * dt;

        // Move
        t.mesh.position.x += t.velocity.x * dt;
        t.mesh.position.y += t.velocity.y * dt;
        t.mesh.position.z += t.velocity.z * dt;

        // Rotate
        if (t.type === 'ring') {
            t.mesh.rotation.x += dt * 5;
            t.mesh.rotation.z += dt * 3;
        } else if (t.type === 'diver') {
            t.mesh.rotation.x += dt * 4;
        } else {
            t.mesh.rotation.x += dt * 3;
            t.mesh.rotation.z += dt * 2;
        }

        // Check water collision
        if (t.mesh.position.y <= waterY && !t.inWater) {
            const px = t.mesh.position.x;
            const pz = t.mesh.position.z;

            if (Math.abs(px) < poolW && Math.abs(pz) < poolD) {
                t.inWater = true;
                t.velocity.multiplyScalar(0.3);
                t.velocity.y = Math.abs(t.velocity.y) * 0.1;
                spawnSplashParticles(t.mesh.position.clone());
                playSound('splash');
            }
        }

        // Water drag
        if (t.inWater) {
            t.velocity.multiplyScalar(1 - dt * 3);
        }

        // Check out of bounds / expired
        const hw = BOX_SIZE.w / 2 + 2;
        const hh = BOX_SIZE.h / 2 + 2;
        const hd = BOX_SIZE.d / 2 + 2;

        if (t.age > 5 ||
            Math.abs(t.mesh.position.x) > hw ||
            t.mesh.position.y < -hh ||
            Math.abs(t.mesh.position.z) > hd) {

            // Miss — lose a life if didn't hit anything
            if (!t.inWater || t.age > 4) {
                t.alive = false;
                scene.remove(t.mesh);
                state.throwables.splice(i, 1);

                state.lives--;
                state.combo = 1;
                playSound('miss');
                updateUI();

                if (state.lives <= 0) {
                    showGameOver();
                    return;
                }
            }
        }
    }
}

// =============================================
//  GAME LOOP
// =============================================
let targetSpawnTimer = 0;
let waveTimer = 0;

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // Update water shader
    if (waterMaterial) {
        waterMaterial.uniforms.uTime.value = time;
    }

    // Animate avatar
    if (avatarGroup) {
        avatarGroup.position.y = -BOX_SIZE.h / 2 + POOL_DEPTH + 0.3 + Math.sin(time * 1.5) * 0.05;
        const glowRing = avatarGroup.getObjectByName('glowRing');
        if (glowRing) {
            glowRing.rotation.z = time * 0.5;
            glowRing.material.opacity = 0.2 + Math.sin(time * 2) * 0.1;
        }
    }

    // Animate targets
    state.targets.forEach(target => {
        if (!target.alive) return;
        target.age += dt;
        target.mesh.position.y = target.baseY + Math.sin(time * target.floatSpeed + target.floatOffset) * 0.3;
        target.mesh.rotation.x += target.rotSpeed.x * dt;
        target.mesh.rotation.y += target.rotSpeed.y * dt;
        target.mesh.rotation.z += target.rotSpeed.z * dt;

        // Pulse glow
        const scale = 1 + Math.sin(time * 3 + target.floatOffset) * 0.05;
        target.mesh.scale.setScalar(scale);
    });

    // Animate holobox edges
    if (holoBox) {
        holoBox.children.forEach((child, i) => {
            if (child.isLine && child.material) {
                child.material.opacity = 0.25 + Math.sin(time * 1.5 + i * 0.5) * 0.1;
            }
        });
    }

    // Power bar charging
    if (state.isCharging) {
        const elapsed = (Date.now() - state.chargeStart) / 1000;
        state.chargePower = Math.min(elapsed / 1.5, 1);
        dom.powerFill.style.width = `${state.chargePower * 100}%`;
    }

    if (state.running) {
        // Timer countdown
        state.timer -= dt;
        if (state.timer <= 0) {
            state.timer = 0;
            showGameOver();
            return;
        }

        // Spawn targets
        targetSpawnTimer += dt;
        const spawnInterval = Math.max(0.8, 2.5 - state.wave * 0.3);
        if (targetSpawnTimer >= spawnInterval) {
            spawnTarget();
            targetSpawnTimer = 0;
        }

        // Wave progression
        waveTimer += dt;
        if (waveTimer >= 20) {
            state.wave++;
            waveTimer = 0;
            showNotification(`WAVE ${state.wave}`);
            playSound('wave');
        }

        // Combo timeout
        if (Date.now() - state.lastComboTime > state.comboTimeout && state.combo > 1) {
            state.combo = 1;
            updateUI();
        }

        updatePhysics(dt);
        checkCollisions(dt);
        updateUI();
    }

    updateParticles(dt);

    controls.update();
    composer.render();
}

// =============================================
//  EVENT HANDLERS
// =============================================
function setupEventListeners() {
    // Mouse move
    window.addEventListener('mousemove', (e) => {
        state.mouseScreen.x = e.clientX;
        state.mouseScreen.y = e.clientY;
        state.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        state.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Move crosshair
        dom.crosshair.style.left = e.clientX + 'px';
        dom.crosshair.style.top = e.clientY + 'px';

        // Aim avatar
        if (avatarGroup && state.running) {
            avatarGroup.rotation.y = state.mouseNDC.x * 0.5;
        }
    });

    // Mouse down — charge
    window.addEventListener('mousedown', (e) => {
        if (!state.running) return;
        if (e.button !== 0) return;

        state.isCharging = true;
        state.chargeStart = Date.now();
        state.chargePower = 0;
        dom.powerContainer.classList.add('visible');
        dom.crosshair.classList.add('charging');
    });

    // Mouse up — throw
    window.addEventListener('mouseup', (e) => {
        if (!state.running) return;
        if (e.button !== 0) return;
        if (!state.isCharging) return;

        state.isCharging = false;
        dom.powerContainer.classList.remove('visible');
        dom.crosshair.classList.remove('charging');

        throwObject();
        state.chargePower = 0;
        dom.powerFill.style.width = '0%';
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') selectObject('ball');
        if (e.key === '2') selectObject('ring');
        if (e.key === '3') selectObject('diver');
        if (e.key === 'r' || e.key === 'R') {
            controls.enabled = !controls.enabled;
        }
    });

    // Object selector buttons
    dom.objBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectObject(btn.dataset.type);
        });
    });

    // Start button
    dom.startBtn.addEventListener('click', () => {
        initAudio();
        startGame();
    });

    // Restart button
    dom.restartBtn.addEventListener('click', () => {
        dom.gameOver.classList.add('hidden');
        resetGame();
        startGame();
    });

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    // Prevent context menu
    window.addEventListener('contextmenu', (e) => e.preventDefault());
}

function selectObject(type) {
    state.selectedObject = type;
    dom.objBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

function startGame() {
    dom.startScreen.classList.add('hidden');
    dom.hud.style.display = 'flex';
    dom.objectSelector.style.display = 'flex';
    state.running = true;
    showNotification('WAVE 1', 1200);
    playSound('wave');
}

function resetGame() {
    // Clear throwables
    state.throwables.forEach(t => scene.remove(t.mesh));
    state.throwables = [];

    // Clear targets
    state.targets.forEach(t => scene.remove(t.mesh));
    state.targets = [];

    // Clear particles
    state.particles.forEach(p => {
        scene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
    });
    state.particles = [];

    state.splashParticles.forEach(p => {
        scene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
    });
    state.splashParticles = [];

    // Reset state
    state.score = 0;
    state.combo = 1;
    state.maxCombo = 1;
    state.lives = MAX_LIVES;
    state.timer = GAME_TIME;
    state.wave = 1;
    state.totalHits = 0;
    state.totalThrows = 0;
    state.lastComboTime = 0;
    targetSpawnTimer = 0;
    waveTimer = 0;

    updateUI();
}

// =============================================
//  BOOT
// =============================================
init();
