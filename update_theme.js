const fs = require('fs');

let css = `
* { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
body {
    background: #ffffff;
    font-family: 'Rajdhani', sans-serif;
    color: #002244;
    overflow: hidden;
    width: 100vw; height: 100vh;
}
#game-container { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1; }

.hidden { display: none !important; }

/* ── UI Common ── */
button {
    font-family: 'Orbitron', sans-serif;
    background: rgba(0, 150, 255, 0.1);
    border: 2px solid #0088ff;
    color: #0066cc;
    padding: 15px 40px;
    font-size: 1.5rem;
    font-weight: 700;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    border-radius: 4px;
}
button:hover {
    background: #0088ff;
    color: #ffffff;
    box-shadow: 0 0 20px #0088ff;
}

/* ── Start Screen ── */
#start-screen {
    position: absolute; inset: 0; z-index: 100;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(10px);
}
.start-content { text-align: center; }
.holo-logo { font-family: 'Orbitron', sans-serif; font-size: 5rem; font-weight: 900; line-height: 1; margin-bottom: 20px; }
.logo-line.top { color: #0088ff; display: block; letter-spacing: 15px; }
.logo-line.bottom { color: #ff0088; display: block; letter-spacing: 25px; }
.start-divider { height: 2px; width: 200px; background: #0088ff; margin: 30px auto; }
.start-instructions { margin-bottom: 40px; text-align: left; display: inline-block; font-size: 1.2rem; }
.inst-row { margin: 15px 0; display: flex; align-items: center; gap: 15px; }
kbd {
    background: #0088ff; color: white; padding: 5px 12px; border-radius: 4px;
    font-family: 'Orbitron', sans-serif; font-size: 0.9rem;
}

/* ── HUD ── */
#hud {
    position: absolute; top: 0; left: 0; width: 100vw; padding: 20px 40px;
    display: flex; justify-content: space-between; z-index: 10; pointer-events: none;
}
.hud-panel { display: flex; gap: 30px; align-items: center; }
.hud-item { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.8); border: 1px solid #0088ff; padding: 10px 20px; border-radius: 8px; }
.hud-label { font-size: 0.9rem; font-weight: 700; color: #004488; letter-spacing: 2px; margin-bottom: 5px; }
.hud-value { font-family: 'Orbitron', sans-serif; font-size: 1.8rem; font-weight: 900; color: #0066cc; }
.hud-value.combo { color: #ff0088; }
.hud-value.timer { color: #00aa44; font-size: 2.2rem; }

.life-pip { display: inline-block; width: 12px; height: 12px; background: #0088ff; border-radius: 50%; margin: 0 4px; }
.life-pip.dead { background: transparent; border: 1px solid #0088ff; }

/* ── Popups & Notifications ── */
#notification, #hit-popup {
    position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
    font-family: 'Orbitron', sans-serif; font-size: 3rem; font-weight: 900;
    color: #ff0088; text-shadow: 0 0 10px rgba(255,0,136,0.5); z-index: 50; pointer-events: none;
    animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes popIn { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.5); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* ── Game Over ── */
#game-over {
    position: absolute; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);
}
.go-content { text-align: center; }
.go-title { font-family: 'Orbitron', sans-serif; font-size: 4rem; color: #ff0088; margin-bottom: 40px; }
.go-stats { display: flex; gap: 40px; margin-bottom: 50px; justify-content: center; }
.go-stat { display: flex; flex-direction: column; align-items: center; }
.go-stat-val { font-family: 'Orbitron', sans-serif; font-size: 3rem; color: #0066cc; }
.go-stat-lbl { font-size: 1rem; color: #004488; font-weight: 700; letter-spacing: 2px; }
`;
fs.writeFileSync('style.css', css);

let game = fs.readFileSync('game.js', 'utf8');

// 1. White Background
game = game.replace(/scene\.background = new THREE\.Color\(0x000000\);/, 'scene.background = new THREE.Color(0xffffff);');

// 2. Brighten Ambient Light
game = game.replace(/scene\.add\(new THREE\.AmbientLight\(0xffffff, 0\.6\)\);/, 'scene.add(new THREE.AmbientLight(0xffffff, 1.2));');

// 3. Brighten Pool Colors and Lights
game = game.replace(/poolTile:\s*0x004488,/, 'poolTile: 0x00aaff,');
game = game.replace(/poolWall:\s*0x002244,/, 'poolWall: 0x0088ff,');

game = game.replace(/color: 0x001a33,/g, 'color: 0x00aaff,');
game = game.replace(/emissive: 0x002244,/g, 'emissive: 0x0077ff,');
game = game.replace(/color: 0x002244,/g, 'color: 0x33aaff,');

game = game.replace(/new THREE\.PointLight\(C\.cyan, 1\.5, 20\)/g, 'new THREE.PointLight(C.cyan, 3.5, 30)');
game = game.replace(/new THREE\.PointLight\(C\.magenta, 1\.5, 20\)/g, 'new THREE.PointLight(C.magenta, 3.5, 30)');
game = game.replace(/waterColor: 0x003366,/, 'waterColor: 0x00aaff,');

// 4. Epic Splash
const oldSplash = `function splashParticles(pos) {
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
}`;

const newSplash = `function splashParticles(pos) {
    const N = 80;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        arr[i*3]=pos.x; arr[i*3+1]=pos.y; arr[i*3+2]=pos.z;
        vels.push(new THREE.Vector3((Math.random()-.5)*8, 4+Math.random()*6, (Math.random()-.5)*8));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, blending: THREE.NormalBlending });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    S.particles.push({ mesh: pts, vels, age: 0, life: 1.5 });

    const ringGeo = new THREE.RingGeometry(0.1, 0.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ripple = new THREE.Mesh(ringGeo, ringMat);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(pos.x, 0.05, pos.z);
    scene.add(ripple);
    S.particles.push({ mesh: ripple, isRipple: true, age: 0, life: 1.2 });
}`;
game = game.replace(oldSplash, newSplash);

const oldTick = `function tickParticles(dt) {
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
}`;

const newTick = `function tickParticles(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
        const p = S.particles[i];
        p.age += dt;
        const obj = p.pts || p.mesh;
        if (p.age >= p.life) { 
            scene.remove(obj); 
            if(obj.geometry) obj.geometry.dispose(); 
            if(obj.material) obj.material.dispose(); 
            S.particles.splice(i, 1); 
            continue; 
        }
        
        if (p.isRipple) {
            obj.scale.setScalar(1 + p.age * 6);
            obj.material.opacity = 0.9 * (1 - p.age / p.life);
        } else {
            const arr = obj.geometry.attributes.position.array;
            for (let j = 0; j < p.vels.length; j++) {
                p.vels[j].y += GRAVITY * 0.4 * dt;
                arr[j*3] += p.vels[j].x * dt; arr[j*3+1] += p.vels[j].y * dt; arr[j*3+2] += p.vels[j].z * dt;
            }
            obj.geometry.attributes.position.needsUpdate = true;
            obj.material.opacity = 1 - (p.age / p.life);
        }
    }
}`;
game = game.replace(oldTick, newTick);

const oldReset = `S.particles.forEach(p => { scene.remove(p.pts); S.particles.splice(i, 1); continue;`;
// Wait, resetGame has:
const actualReset = `S.particles.forEach(p => { scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); });`;
const newReset = `S.particles.forEach(p => { const o = p.pts || p.mesh; scene.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });`;
game = game.replace(actualReset, newReset);

fs.writeFileSync('game.js', game);
