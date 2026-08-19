const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id'; 
const socket = io(BACKEND_URL); 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false }); 
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight.position.set(20, 50, 20);
scene.add(dirLight);

// ==========================================
// ASSET TEXTURES & MATERIALS
// ==========================================
const textureLoader = new THREE.TextureLoader();
const BASE_URL = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/master/assets/minecraft/textures/block/';

function loadPixelTexture(filename) {
    const tex = textureLoader.load(BASE_URL + filename);
    tex.magFilter = THREE.NearestFilter; 
    tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
}

// 6 Tipe Material Blok
const materials = {
    grass: [
        loadPixelTexture('grass_block_side.png'), // Kanan
        loadPixelTexture('grass_block_side.png'), // Kiri
        loadPixelTexture('grass_block_top.png'),  // Atas
        loadPixelTexture('dirt.png'),             // Bawah
        loadPixelTexture('grass_block_side.png'), // Depan
        loadPixelTexture('grass_block_side.png')  // Belakang
    ],
    dirt: loadPixelTexture('dirt.png'),
    wood: [
        loadPixelTexture('oak_log.png'),
        loadPixelTexture('oak_log.png'),
        loadPixelTexture('oak_log_top.png'),
        loadPixelTexture('oak_log_top.png'),
        loadPixelTexture('oak_log.png'),
        loadPixelTexture('oak_log.png')
    ],
    stone: loadPixelTexture('stone.png'),
    cobblestone: loadPixelTexture('cobblestone.png'),
    bricks: loadPixelTexture('bricks.png')
};

const headMaterial = new THREE.MeshLambertMaterial({ 
    map: textureLoader.load('https://minotar.net/avatar/Steve/64.png') 
});

// ==========================================
// GENERATOR DUNIA
// ==========================================
const blocksData = {}; 
const blockObjects = []; 
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

function createBlock(x, y, z, type, isLocal = true) {
    const mat = materials[type] || materials['stone']; // Fallback
    const block = new THREE.Mesh(blockGeometry, mat);
    block.position.set(x, y, z);
    scene.add(block);
    
    const key = `${x},${y},${z}`;
    blocksData[key] = block;
    blockObjects.push(block);
    return block;
}

function removeBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) {
        scene.remove(blocksData[key]);
        const index = blockObjects.indexOf(blocksData[key]);
        if (index > -1) blockObjects.splice(index, 1);
        delete blocksData[key];
    }
}

// Lantai Dasar 20x20
for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
        createBlock(x, 0, z, 'grass');
    }
}

// ==========================================
// HOTBAR & INVENTORY LOGIC
// ==========================================
let currentSelectedBlock = 'grass';
const slots = ['grass', 'dirt', 'wood', 'stone', 'cobblestone', 'bricks'];

window.addEventListener('keydown', (e) => {
    if(document.activeElement.id === 'chat-input') return;
    
    // Angka 1-6 untuk ganti blok
    if (e.key >= '1' && e.key <= '6') {
        const index = parseInt(e.key) - 1;
        currentSelectedBlock = slots[index];
        
        // Update UI Hotbar
        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById(`slot-${e.key}`).classList.add('active');
    }
});

// ==========================================
// INTERAKSI RAYCASTER (TARUH / HANCURKAN)
// ==========================================
const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0);

const wireframeGeo = new THREE.EdgesGeometry(blockGeometry);
const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
const blockHighlight = new THREE.LineSegments(wireframeGeo, wireframeMat);
blockHighlight.visible = false;
scene.add(blockHighlight);

let targetBlock = null;
let placePosition = null;

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    
    if (e.button === 0 && targetBlock && targetBlock.position.y !== 0) { 
        // HANCURKAN (Kiri) - Jangan hancurkan lantai 0
        const pos = targetBlock.position;
        removeBlock(pos.x, pos.y, pos.z);
        socket.emit('breakBlock', { x: pos.x, y: pos.y, z: pos.z });
    } 
    else if (e.button === 2 && placePosition) {
        // TARUH BLOK (Kanan)
        const pPos = camera.position;
        // Jarak aman agar tidak menaruh blok di kepala sendiri
        const dist = Math.sqrt(Math.pow(pPos.x - placePosition.x, 2) + Math.pow(pPos.y - 1.5 - placePosition.y, 2) + Math.pow(pPos.z - placePosition.z, 2));
        
        if (dist > 1.0) { 
            createBlock(placePosition.x, placePosition.y, placePosition.z, currentSelectedBlock);
            socket.emit('placeBlock', { x: placePosition.x, y: placePosition.y, z: placePosition.z, type: currentSelectedBlock });
        }
    }
});

function updateRaycaster() {
    raycaster.setFromCamera(centerVector, camera);
    const intersects = raycaster.intersectObjects(blockObjects);

    if (intersects.length > 0 && intersects[0].distance < 6) { 
        const intersect = intersects[0];
        targetBlock = intersect.object;
        
        blockHighlight.position.copy(targetBlock.position);
        blockHighlight.visible = true;

        placePosition = intersect.object.position.clone().add(intersect.face.normal);
    } else {
        targetBlock = null;
        placePosition = null;
        blockHighlight.visible = false;
    }
}

// ==========================================
// KONTROL FIRST-PERSON & FISIKA MINECRAFT
// ==========================================
const controls = new THREE.PointerLockControls(camera, document.body);
const uiMenu = document.getElementById('ui-menu');
const btnPlay = document.getElementById('btn-play');

btnPlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => uiMenu.style.display = 'none');
controls.addEventListener('unlock', () => uiMenu.style.display = 'flex');

const moveState = { forward: false, backward: false, left: false, right: false, canJump: false };
let velocityY = 0;

window.addEventListener('keydown', (e) => {
    if(document.activeElement.id === 'chat-input') return; 
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': 
            if (moveState.canJump) { velocityY = 8.5; moveState.canJump = false; }
            break;
    }
});
window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

// Deteksi Tabrakan Presisi Tinggi
function isBlockSolid(x, y, z) {
    return !!blocksData[`${Math.round(x)},${Math.round(y)},${Math.round(z)}`];
}

function checkCollision(newX, newY, newZ) {
    const r = 0.25; // Jari-jari tabrakan pemain
    const yPoints = [Math.round(newY - 1.5), Math.round(newY - 0.5)]; // Kaki dan Badan
    
    // Periksa titik pusat dan 4 sudut hitbox
    const offsets = [[0,0], [r,r], [-r,-r], [r,-r], [-r,r]];
    
    for (let yp of yPoints) {
        for (let off of offsets) {
            if (isBlockSolid(newX + off[0], yp, newZ + off[1])) return true;
        }
    }
    return false;
}

// ==========================================
// MULTIPLAYER & CHAT (TIDAK BERUBAH)
// ==========================================
const otherPlayers = {};

function createPlayerModel(playerInfo) {
    const playerGroup = new THREE.Group();
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const head = new THREE.Mesh(headGeo, headMaterial);
    head.position.y = 1.3;
    
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.9, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d1d87 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    
    playerGroup.add(head);
    playerGroup.add(body);
    
    playerGroup.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    scene.add(playerGroup);
    return playerGroup;
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            otherPlayers[id] = createPlayerModel(players[id]);
        } else {
            camera.position.set(players[id].x, players[id].y, players[id].z);
        }
    });
});

socket.on('worldState', (changes) => {
    for (const key in changes) {
        const [x, y, z] = key.split(',').map(Number);
        if (changes[key] === 'air') removeBlock(x, y, z);
        else createBlock(x, y, z, changes[key]);
    }
});

socket.on('newPlayer', (data) => otherPlayers[data.id] = createPlayerModel(data.player));
socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.x, data.y - 1.5, data.z);
        otherPlayers[data.id].rotation.y = data.ry; 
    }
});
socket.on('blockPlaced', (data) => createBlock(data.x, data.y, data.z, data.type, false));
socket.on('blockBroken', (data) => removeBlock(data.x, data.y, data.z));
socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; }
});

const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

socket.on('receiveChat', (data) => {
    const msg = document.createElement('div');
    msg.innerText = `<Pemain-${data.id.substring(0, 4)}> ${data.message}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('sendChat', chatInput.value);
        chatInput.value = '';
        controls.lock(); 
    }
});

// ==========================================
// GAME LOOP 
// ==========================================
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        updateRaycaster(); 

        // 1. GRAVITASI
        velocityY -= 25.0 * delta; 
        let intendedY = camera.position.y + (velocityY * delta);

        if (checkCollision(camera.position.x, intendedY, camera.position.z)) {
            if (velocityY < 0) { 
                // Menyentuh lantai
                velocityY = 0;
                moveState.canJump = true;
            } else {
                // Menyentuh atap
                velocityY = 0;
            }
        } else {
            camera.position.y = intendedY;
            if (velocityY < -3) moveState.canJump = false; 
        }

        // Jika jatuh ke void
        if (camera.position.y < -10) {
            camera.position.set(0, 5, 0);
            velocityY = 0;
        }

        // 2. PERGERAKAN WASD (FIX TERBALIK)
        let dirZ = Number(moveState.forward) - Number(moveState.backward);
        let dirX = Number(moveState.right) - Number(moveState.left);
        
        // Normalisasi agar kecepatan serong sama dengan lurus
        if (dirZ !== 0 || dirX !== 0) {
            const length = Math.sqrt(dirZ * dirZ + dirX * dirX);
            dirZ /= length;
            dirX /= length;
        }

        const speed = 5.0; // Kecepatan gerak karakter (Snappy)

        // Simpan posisi sebelum bergerak
        const prevPosition = camera.position.clone();

        // Gunakan PointerLockControls untuk mengkalkulasi arah depan & samping relatif dari kamera
        controls.moveForward(dirZ * speed * delta);
        controls.moveRight(dirX * speed * delta);

        const intendedX = camera.position.x;
        const intendedZ = camera.position.z;

        // Kembalikan ke posisi awal, lalu cek tabrakan per sumbu
        camera.position.copy(prevPosition);

        // Uji Sumbu X
        if (!checkCollision(intendedX, camera.position.y, camera.position.z)) {
            camera.position.x = intendedX;
        }

        // Uji Sumbu Z
        if (!checkCollision(camera.position.x, camera.position.y, intendedZ)) {
            camera.position.z = intendedZ;
        }

        // 3. MULTIPLAYER UPDATE
        if (dirX !== 0 || dirZ !== 0 || Math.abs(velocityY) > 0.1) {
            socket.emit('playerMovement', { 
                x: camera.position.x, 
                y: camera.position.y, 
                z: camera.position.z, 
                ry: camera.rotation.y 
            });
        }
    }

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
