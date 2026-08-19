const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id';
const socket = io(BACKEND_URL);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 15, 45);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x3a2b1a, 0.9);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfff3d6, 0.7);
dirLight.position.set(15, 25, 10);
scene.add(dirLight);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------
// World state
// ------------------------------------------------------------------
let currentDimension = 'overworld';
let blocksData = {};   // "x,y,z" -> mesh
let blockObjects = []; // flat array of all block meshes (for raycasting)
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

// ------------------------------------------------------------------
// Procedural textures (16x16 canvas, pixelated) — pattern per block type
// so it actually reads as grass / dirt / stone / wood / brick instead of noise.
// ------------------------------------------------------------------
function rand(min, max) { return min + Math.random() * (max - min); }
function clamp255(v) { return Math.max(0, Math.min(255, v)); }

function makeCanvas(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');

    const px = (x, y, r, g, b) => {
        ctx.fillStyle = `rgb(${clamp255(r) | 0},${clamp255(g) | 0},${clamp255(b) | 0})`;
        ctx.fillRect(x, y, 1, 1);
    };

    if (currentDimension === 'nether' && type !== 'leaves') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const speck = Math.random() < 0.1 ? -40 : 0;
            px(x, y, rand(140, 170) + speck, rand(30, 50), rand(30, 50));
        }
        return canvas;
    }
    if (currentDimension === 'end' && type !== 'leaves') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            px(x, y, rand(70, 95), rand(40, 55), rand(110, 135));
        }
        return canvas;
    }

    if (type === 'grass_top') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            px(x, y, rand(45, 65), rand(130, 175), rand(35, 55));
        }
    } else if (type === 'grass_side') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            if (y < 4) px(x, y, rand(50, 65), rand(120, 160), rand(40, 55));
            else px(x, y, rand(95, 120), rand(65, 85), rand(35, 50));
        }
    } else if (type === 'dirt') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            px(x, y, rand(100, 128), rand(68, 90), rand(38, 55));
        }
    } else if (type === 'stone') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const dark = Math.random() < 0.12 ? -30 : 0;
            const base = rand(115, 135) + dark;
            px(x, y, base, base, base + 3);
        }
    } else if (type === 'wood_side') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const stripe = Math.sin(x * 1.4) > 0.3 ? -18 : 0;
            px(x, y, rand(90, 105) + stripe, rand(62, 75) + stripe, rand(32, 42) + stripe);
        }
    } else if (type === 'wood_top') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const d = Math.hypot(x - 8, y - 8);
            const ring = Math.sin(d * 1.5) > 0.35 ? -18 : 0;
            px(x, y, rand(155, 172) + ring, rand(120, 135) + ring, rand(65, 78) + ring);
        }
    } else if (type === 'cobblestone') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const cellX = Math.floor(x / 4), cellY = Math.floor(y / 4);
            const seed = Math.sin(cellX * 12.9898 + cellY * 78.233) * 43758.5453;
            const cellShade = ((seed - Math.floor(seed)) * 40) - 20;
            const edge = (x % 4 === 0 || y % 4 === 0) ? -22 : 0;
            const base = 108 + cellShade + edge;
            px(x, y, base, base, base + 2);
        }
    } else if (type === 'bricks') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            const row = Math.floor(y / 4);
            const offset = (row % 2 === 0) ? 0 : 4;
            const isMortar = (y % 4 === 0) || ((x + offset) % 8 === 0);
            if (isMortar) px(x, y, rand(160, 178), rand(155, 172), rand(148, 165));
            else px(x, y, rand(140, 165), rand(52, 68), rand(38, 50));
        }
    } else if (type === 'leaves') {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            px(x, y, rand(35, 50), rand(95, 130), rand(35, 50));
        }
    } else {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
            px(x, y, rand(110, 130), rand(110, 130), rand(110, 130));
        }
    }
    return canvas;
}

function generateTexture(type) {
    const tex = new THREE.CanvasTexture(makeCanvas(type));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
}

let materials = {};
function rebuildMaterials() {
    materials = {
        grass: [generateTexture('grass_side'), generateTexture('grass_side'), generateTexture('grass_top'), generateTexture('dirt'), generateTexture('grass_side'), generateTexture('grass_side')],
        dirt: generateTexture('dirt'),
        wood: [generateTexture('wood_side'), generateTexture('wood_side'), generateTexture('wood_top'), generateTexture('wood_top'), generateTexture('wood_side'), generateTexture('wood_side')],
        stone: generateTexture('stone'),
        cobblestone: generateTexture('cobblestone'),
        bricks: generateTexture('bricks'),
        leaves: generateTexture('leaves'),
    };
}
rebuildMaterials();

// Hotbar preview icons (reuse the same canvas generator)
const HOTBAR_PREVIEW_TYPE = { grass: 'grass_top', dirt: 'dirt', wood: 'wood_side', stone: 'stone', cobblestone: 'cobblestone', bricks: 'bricks' };
function renderHotbarIcons() {
    document.querySelectorAll('.slot').forEach((slot) => {
        const type = slot.dataset.type;
        const canvas = makeCanvas(HOTBAR_PREVIEW_TYPE[type] || type);
        slot.style.backgroundImage = `url(${canvas.toDataURL()})`;
    });
}
renderHotbarIcons();

// ------------------------------------------------------------------
// Block create/remove
// ------------------------------------------------------------------
function clearWorld() {
    blockObjects.forEach((b) => scene.remove(b));
    blockObjects = [];
    blocksData = {};
}

function switchDimension(dim) {
    currentDimension = dim;
    clearWorld();
    rebuildMaterials();
    renderHotbarIcons();
    if (dim === 'nether') { scene.background = new THREE.Color(0x3b0a0a); scene.fog.color = new THREE.Color(0x3b0a0a); }
    else if (dim === 'end') { scene.background = new THREE.Color(0x1a0a2a); scene.fog.color = new THREE.Color(0x1a0a2a); }
    else { scene.background = new THREE.Color(0x87CEEB); scene.fog.color = new THREE.Color(0x87CEEB); }

    socket.emit('changeDimension', dim);
    generateTerrain();
}

function createBlock(x, y, z, type, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) return;
    const mat = materials[type] || materials['stone'];
    const block = new THREE.Mesh(blockGeometry, mat);
    block.position.set(x, y, z);
    block.userData = { x, y, z, type };
    scene.add(block);
    blocksData[key] = block;
    blockObjects.push(block);
    if (emit) socket.emit('placeBlock', { x, y, z, type, dim: currentDimension });
}

function removeBlock(x, y, z, emit = false) {
    const key = `${x},${y},${z}`;
    const mesh = blocksData[key];
    if (mesh) {
        scene.remove(mesh);
        const idx = blockObjects.indexOf(mesh);
        if (idx !== -1) blockObjects.splice(idx, 1);
        delete blocksData[key];
        if (emit) socket.emit('breakBlock', { x, y, z, dim: currentDimension });
    }
}

function terrainHeightAt(x, z) {
    if (currentDimension === 'end') return 0;
    return Math.floor(Math.sin(x * 0.2) * Math.cos(z * 0.2) * 2);
}

function generateTerrain() {
    for (let x = -10; x <= 10; x++) {
        for (let z = -10; z <= 10; z++) {
            const height = terrainHeightAt(x, z);
            for (let y = -4; y <= height; y++) {
                createBlock(x, y, z, y === height && currentDimension !== 'end' ? 'grass' : 'stone');
            }
        }
    }
    if (currentDimension === 'overworld') placeTrees();
}

function placeTrees() {
    const used = new Set();
    let placed = 0, attempts = 0;
    while (placed < 7 && attempts < 60) {
        attempts++;
        const tx = Math.floor(rand(-8, 8));
        const tz = Math.floor(rand(-8, 8));
        const k = `${tx},${tz}`;
        if (used.has(k)) continue;
        used.add(k);
        const baseY = terrainHeightAt(tx, tz) + 1;
        for (let h = 0; h < 4; h++) createBlock(tx, baseY + h, tz, 'wood');
        for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
                for (let ly = 3; ly <= 4; ly++) {
                    if (Math.abs(lx) + Math.abs(lz) <= 3 && Math.random() > 0.3) {
                        createBlock(tx + lx, baseY + ly, tz + lz, 'leaves');
                    }
                }
            }
        }
        placed++;
    }
}
generateTerrain();

function isSolid(x, y, z) {
    return !!blocksData[`${Math.round(x)},${Math.round(y)},${Math.round(z)}`];
}

// ------------------------------------------------------------------
// Menu / username / join flow
// ------------------------------------------------------------------
const usernameInput = document.getElementById('username-input');
const btnPlay = document.getElementById('btn-play');
const menuError = document.getElementById('menu-error');
const onlineCountEl = document.getElementById('online-count');

let username = '';
let hasJoined = false;

function tryPlay() {
    const name = usernameInput.value.trim();
    if (!name) {
        menuError.textContent = 'Masukkan nama dulu!';
        usernameInput.focus();
        return;
    }
    menuError.textContent = '';
    username = name;
    if (!hasJoined) {
        socket.emit('join', { username });
        hasJoined = true;
        usernameInput.disabled = true;
        btnPlay.textContent = 'Lanjut Bermain';
    }
    controls.lock();
}

btnPlay.addEventListener('click', tryPlay);
usernameInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') tryPlay();
});

// ------------------------------------------------------------------
// Controls & movement
// ------------------------------------------------------------------
const controls = new THREE.PointerLockControls(camera, document.body);
let suppressMenuOnUnlock = false;
controls.addEventListener('lock', () => { document.getElementById('ui-menu').style.display = 'none'; });
controls.addEventListener('unlock', () => {
    if (suppressMenuOnUnlock) { suppressMenuOnUnlock = false; return; }
    document.getElementById('ui-menu').style.display = 'flex';
});

const moveState = { forward: false, backward: false, left: false, right: false, jump: false, shift: false, fly: false, up: false, down: false };
let velocityY = 0;
let onGround = false;
const PLAYER_HEIGHT = 1.7;   // eyes above feet
const PLAYER_EYE_TOP_MARGIN = 0.2;
const GRAVITY = 25.0;

let selectedBlockType = 'grass';
function selectSlot(el) {
    document.querySelectorAll('.slot').forEach((s) => s.classList.remove('active'));
    el.classList.add('active');
    selectedBlockType = el.dataset.type;
}
document.querySelectorAll('.slot').forEach((slot, i) => {
    slot.addEventListener('click', () => selectSlot(slot));
});

const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

function isTyping() {
    return document.activeElement === document.getElementById('chat-input') ||
           document.activeElement === usernameInput;
}

window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    if (e.code === 'KeyW') moveState.forward = true;
    if (e.code === 'KeyS') moveState.backward = true;
    if (e.code === 'KeyA') moveState.left = true;
    if (e.code === 'KeyD') moveState.right = true;
    if (e.code === 'Space') { if (moveState.fly) moveState.up = true; else moveState.jump = true; }
    if (e.code === 'ShiftLeft') { if (moveState.fly) moveState.down = true; else moveState.shift = true; }
    if (e.code === 'KeyF') moveState.fly = !moveState.fly;
    if (e.code === 'Digit7') switchDimension('overworld');
    if (e.code === 'Digit8') switchDimension('nether');
    if (e.code === 'Digit9') switchDimension('end');

    const digitMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 };
    if (digitMap[e.code] !== undefined) {
        const slot = document.querySelectorAll('.slot')[digitMap[e.code]];
        if (slot) selectSlot(slot);
    }

    if (e.code === 'Enter' && controls.isLocked) {
        suppressMenuOnUnlock = true;
        controls.unlock();
        chatInput.focus();
    }
});

window.addEventListener('keyup', (e) => {
    if (isTyping()) return;
    if (e.code === 'KeyW') moveState.forward = false;
    if (e.code === 'KeyS') moveState.backward = false;
    if (e.code === 'KeyA') moveState.left = false;
    if (e.code === 'KeyD') moveState.right = false;
    if (e.code === 'Space') { moveState.up = false; moveState.jump = false; }
    if (e.code === 'ShiftLeft') { moveState.shift = false; moveState.down = false; }
});

chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Enter') {
        const msg = chatInput.value.trim();
        if (msg) socket.emit('sendChat', msg);
        chatInput.value = '';
        chatInput.blur();
        if (hasJoined) controls.lock();
    } else if (e.code === 'Escape') {
        chatInput.value = '';
        chatInput.blur();
        if (hasJoined) controls.lock();
    }
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function appendChatLine(html, isSystem) {
    const div = document.createElement('div');
    div.style.color = isSystem ? '#9fd89f' : '#fff';
    div.innerHTML = html;
    chatMessages.appendChild(div);
    while (chatMessages.children.length > 50) chatMessages.removeChild(chatMessages.firstChild);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ------------------------------------------------------------------
// Block interaction (raycast break / place)
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.far = 6.5;
const centerVec = new THREE.Vector2(0, 0);

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    raycaster.setFromCamera(centerVec, camera);
    const hits = raycaster.intersectObjects(blockObjects);
    if (hits.length === 0) return;
    const hit = hits[0];
    const { x, y, z } = hit.object.userData;

    if (e.button === 0) {
        removeBlock(x, y, z, true);
    } else if (e.button === 2) {
        const normal = hit.face.normal;
        const nx = x + Math.round(normal.x);
        const ny = y + Math.round(normal.y);
        const nz = z + Math.round(normal.z);
        const dist = Math.hypot(camera.position.x - (nx + 0.5), camera.position.y - (ny + 0.5), camera.position.z - (nz + 0.5));
        if (dist < 0.9) return; // don't place inside the player
        createBlock(nx, ny, nz, selectedBlockType, true);
    }
});

// ------------------------------------------------------------------
// Multiplayer: remote players
// ------------------------------------------------------------------
const remotePlayers = {}; // id -> { mesh, nameSprite }

function makeNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, 128, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
}

function addRemotePlayer(id, player) {
    if (id === socket.id || remotePlayers[id]) return;
    const geo = new THREE.BoxGeometry(0.6, 1.8, 0.6);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3b6fd6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(player.x, player.y - PLAYER_HEIGHT + 0.9, player.z);
    scene.add(mesh);

    const nameSprite = makeNameSprite(player.username || 'Player');
    nameSprite.position.set(0, 1.3, 0);
    mesh.add(nameSprite);

    remotePlayers[id] = { mesh, nameSprite };
    updateOnlineCount();
}

function updateRemotePlayer(id, data) {
    const rp = remotePlayers[id];
    if (!rp) return;
    rp.mesh.position.set(data.x, data.y - PLAYER_HEIGHT + 0.9, data.z);
    rp.mesh.rotation.y = data.ry || 0;
}

function removeRemotePlayer(id) {
    const rp = remotePlayers[id];
    if (!rp) return;
    scene.remove(rp.mesh);
    delete remotePlayers[id];
    updateOnlineCount();
}

function updateOnlineCount() {
    onlineCountEl.textContent = `${Object.keys(remotePlayers).length + 1} online`;
}

// ------------------------------------------------------------------
// Socket events
// ------------------------------------------------------------------
socket.on('currentPlayers', (players) => {
    Object.entries(players).forEach(([id, p]) => addRemotePlayer(id, p));
});

socket.on('worldState', (state) => {
    Object.entries(state).forEach(([key, type]) => {
        const [x, y, z] = key.split(',').map(Number);
        if (type === 'air') removeBlock(x, y, z, false);
        else createBlock(x, y, z, type, false);
    });
});

socket.on('blockPlaced', (data) => createBlock(data.x, data.y, data.z, data.type, false));
socket.on('blockBroken', (data) => removeBlock(data.x, data.y, data.z, false));

socket.on('newPlayer', ({ id, player }) => addRemotePlayer(id, player));
socket.on('playerMoved', ({ id, x, y, z, ry }) => updateRemotePlayer(id, { x, y, z, ry }));
socket.on('playerDisconnected', (id) => removeRemotePlayer(id));

socket.on('receiveChat', (data) => {
    if (data.system) {
        appendChatLine(escapeHtml(data.message), true);
    } else {
        appendChatLine(`<span style="color:#7ec8ff">${escapeHtml(data.username)}:</span> ${escapeHtml(data.message)}`, false);
    }
});

// ------------------------------------------------------------------
// Main loop
// ------------------------------------------------------------------
let lastSync = 0;
camera.position.set(0, 10, 0);

function isSolidNear(x, y, z) {
    const feetY = y - PLAYER_HEIGHT;
    return isSolid(x, feetY + 0.1, z) || isSolid(x, feetY + 1.0, z) || isSolid(x, y - PLAYER_EYE_TOP_MARGIN, z);
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    if (controls.isLocked) {
        let speed = 5.0;
        if (moveState.shift && !moveState.fly) speed = 9.0;

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() > 0) forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);

        const dirZ = Number(moveState.forward) - Number(moveState.backward);
        const dirX = Number(moveState.right) - Number(moveState.left);

        const moveVec = new THREE.Vector3();
        moveVec.addScaledVector(forward, dirZ * speed * delta);
        moveVec.addScaledVector(right, dirX * speed * delta);

        const tryX = camera.position.x + moveVec.x;
        const tryZ = camera.position.z + moveVec.z;

        if (!isSolidNear(tryX, camera.position.y, camera.position.z)) camera.position.x = tryX;
        if (!isSolidNear(camera.position.x, camera.position.y, tryZ)) camera.position.z = tryZ;

        if (moveState.fly) {
            if (moveState.up) camera.position.y += speed * delta;
            if (moveState.down) camera.position.y -= speed * delta;
            velocityY = 0;
            onGround = false;
        } else {
            velocityY -= GRAVITY * delta;
            const newY = camera.position.y + velocityY * delta;
            const feetY = newY - PLAYER_HEIGHT;

            if (velocityY <= 0 && isSolid(camera.position.x, feetY, camera.position.z)) {
                camera.position.y = Math.round(feetY) + 1 + PLAYER_HEIGHT;
                velocityY = 0;
                onGround = true;
                if (moveState.jump) { velocityY = 8; onGround = false; }
            } else if (velocityY > 0 && isSolid(camera.position.x, newY - PLAYER_EYE_TOP_MARGIN, camera.position.z)) {
                velocityY = 0;
                camera.position.y = newY;
            } else {
                camera.position.y = newY;
                onGround = false;
            }
        }

        if (time - lastSync > 50) {
            socket.emit('playerMovement', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
            lastSync = time;
        }
    }
    renderer.render(scene, camera);
}
animate();
