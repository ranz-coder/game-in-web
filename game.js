// ==========================================
// PENGATURAN KONEKSI MULTIPLAYER
// ==========================================
const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id'; 
const socket = io(BACKEND_URL); 

// ==========================================
// SETUP SCENE, KAMERA & RENDERER
// ==========================================
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
// ASSET TEXTURES (DARI CDN PIXELATED)
// ==========================================
const textureLoader = new THREE.TextureLoader();
function loadPixelTexture(url) {
    const tex = textureLoader.load(url);
    tex.magFilter = THREE.NearestFilter; // Kunci agar gambar bergaya pixelated tajam
    tex.minFilter = THREE.NearestFilter;
    return tex;
}

// Mengambil Asset tekstur Minecraft publik
const texGrassTop = loadPixelTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/minecraft/grass.png');
const texGrassSide = loadPixelTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/minecraft/grass_dirt.png');
const texDirt = loadPixelTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/minecraft/dirt.png');
const texWood = loadPixelTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/minecraft/wood.png');
const texSteveHead = loadPixelTexture('https://minotar.net/avatar/Steve/64.png'); // Kepala Steve

const matGrass = [
    new THREE.MeshLambertMaterial({ map: texGrassSide }), // Kanan
    new THREE.MeshLambertMaterial({ map: texGrassSide }), // Kiri
    new THREE.MeshLambertMaterial({ map: texGrassTop }),  // Atas
    new THREE.MeshLambertMaterial({ map: texDirt }),      // Bawah
    new THREE.MeshLambertMaterial({ map: texGrassSide }), // Depan
    new THREE.MeshLambertMaterial({ map: texGrassSide })  // Belakang
];
const matWood = new THREE.MeshLambertMaterial({ map: texWood });

// ==========================================
// GENERATOR DUNIA & SISTEM BLOK
// ==========================================
const blockSize = 1;
const worldSize = 10;
const blocksData = {}; // Menyimpan referensi blok untuk Collision
const blockObjects = []; // Untuk target Raycaster

const blockGeometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);

function createBlock(x, y, z, type, isLocal = true) {
    let material = matGrass;
    if (type === 'wood') material = matWood;

    const block = new THREE.Mesh(blockGeometry, material);
    block.position.set(x, y, z);
    scene.add(block);
    
    const key = `${x},${y},${z}`;
    blocksData[key] = block;
    blockObjects.push(block);

    // Outline pinggiran blok saat disorot akan diproses terpisah
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

// Generate Dunia Awal
for (let x = -worldSize; x <= worldSize; x++) {
    for (let z = -worldSize; z <= worldSize; z++) {
        createBlock(x, 0, z, 'grass');
    }
}

// ==========================================
// INTERAKSI RAYCASTER (HANCURKAN / TARUH BLOK)
// ==========================================
const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0); // Selalu dari tengah layar (crosshair)

// Highlight blok yang disorot
const wireframeGeo = new THREE.EdgesGeometry(blockGeometry);
const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
const blockHighlight = new THREE.LineSegments(wireframeGeo, wireframeMat);
blockHighlight.visible = false;
scene.add(blockHighlight);

let targetBlock = null;
let placePosition = null;

// Matikan klik kanan bawaan browser (Context Menu)
document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    
    // Klik Kiri (0) = Hancurkan Blok, Klik Kanan (2) = Taruh Blok Kayu
    if (e.button === 0 && targetBlock && targetBlock.position.y !== 0) { // Jangan hancurkan lantai dasar
        const pos = targetBlock.position;
        removeBlock(pos.x, pos.y, pos.z);
        socket.emit('breakBlock', { x: pos.x, y: pos.y, z: pos.z });
    } 
    else if (e.button === 2 && placePosition) {
        // Mencegah menaruh blok di dalam tubuh karakter sendiri
        const pPos = camera.position;
        const dist = Math.sqrt(Math.pow(pPos.x - placePosition.x, 2) + Math.pow(pPos.y - 1.5 - placePosition.y, 2) + Math.pow(pPos.z - placePosition.z, 2));
        
        if (dist > 1.2) { // Jarak aman
            createBlock(placePosition.x, placePosition.y, placePosition.z, 'wood');
            socket.emit('placeBlock', { x: placePosition.x, y: placePosition.y, z: placePosition.z, type: 'wood' });
        }
    }
});

function updateRaycaster() {
    raycaster.setFromCamera(centerVector, camera);
    const intersects = raycaster.intersectObjects(blockObjects);

    if (intersects.length > 0 && intersects[0].distance < 6) { // Maksimal jarak interaksi 6 blok
        const intersect = intersects[0];
        targetBlock = intersect.object;
        
        // Posisi untuk highlight blok yang disorot
        blockHighlight.position.copy(targetBlock.position);
        blockHighlight.visible = true;

        // Posisi jika kita ingin menaruh blok baru (di sisi blok yang disorot)
        placePosition = intersect.object.position.clone().add(intersect.face.normal);
    } else {
        targetBlock = null;
        placePosition = null;
        blockHighlight.visible = false;
    }
}

// ==========================================
// KONTROL FIRST-PERSON & FISIKA TABRAKAN
// ==========================================
const controls = new THREE.PointerLockControls(camera, document.body);
const uiMenu = document.getElementById('ui-menu');
const btnPlay = document.getElementById('btn-play');

btnPlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => uiMenu.style.display = 'none');
controls.addEventListener('unlock', () => uiMenu.style.display = 'flex');

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward: false, backward: false, left: false, right: false, canJump: false };

window.addEventListener('keydown', (e) => {
    // Jangan izinkan jalan saat ngetik di chat
    if(document.activeElement.id === 'chat-input') return; 
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': 
            if (moveState.canJump) { velocity.y = 8; moveState.canJump = false; }
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

// FUNGSI DETEKSI TABRAKAN (COLLISION)
function checkCollision(x, y, z) {
    const rx = Math.round(x);
    const rz = Math.round(z);
    
    // Karakter memiliki tinggi ~1.8 blok. Kita periksa blok di area Kaki dan area Kepala.
    const footY = Math.floor(y - 1.5); 
    const headY = Math.floor(y - 0.5); 
    
    // Apakah ada blok padat di koordinat tersebut?
    if (blocksData[`${rx},${footY},${rz}`] || blocksData[`${rx},${headY},${rz}`]) {
        return true;
    }
    return false;
}

// ==========================================
// MULTIPLAYER LOGIC & MODEL PEMAIN (STEVE)
// ==========================================
const otherPlayers = {};

function createPlayerModel(playerInfo) {
    const playerGroup = new THREE.Group();
    
    // Kepala Steve
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ map: texSteveHead });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.25;
    
    // Badan Baju Biru
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d1d87 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    
    // Kaki Celana Biru Tua
    const legGeo = new THREE.BoxGeometry(0.5, 0.6, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a78 });
    const legs = new THREE.Mesh(legGeo, legMat);
    legs.position.y = -0.1;

    playerGroup.add(head);
    playerGroup.add(body);
    playerGroup.add(legs);
    
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
        if (changes[key] === 'air') {
            removeBlock(x, y, z);
        } else {
            createBlock(x, y, z, changes[key]);
        }
    }
});

socket.on('newPlayer', (data) => {
    otherPlayers[data.id] = createPlayerModel(data.player);
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.x, data.y - 1.5, data.z);
        otherPlayers[data.id].rotation.y = data.ry; // Rotasi pemain mengikuti pandangan kamera
    }
});

socket.on('blockPlaced', (data) => {
    createBlock(data.x, data.y, data.z, data.type, false);
});

socket.on('blockBroken', (data) => {
    removeBlock(data.x, data.y, data.z);
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

// ==========================================
// SISTEM CHAT
// ==========================================
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

socket.on('receiveChat', (data) => {
    const msgElement = document.createElement('div');
    const shortId = data.id.substring(0, 4);
    msgElement.innerText = `<Pemain-${shortId}> ${data.message}`;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('sendChat', chatInput.value);
        chatInput.value = '';
        controls.lock(); 
    }
});
chatInput.addEventListener('keydown', e => e.stopPropagation());

// ==========================================
// GAME LOOP (ANIMASI & FISIKA)
// ==========================================
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        updateRaycaster(); // Cek bidikan crosshair

        // Friksi dan Gravitasi
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 25.0 * delta; 

        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize();

        if (moveState.forward || moveState.backward) velocity.z -= direction.z * 30.0 * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * 30.0 * delta;

        // SISTEM COLLISION SAAT BERGERAK (Cek X, Y, Z secara terpisah)
        let newX = camera.position.x - (velocity.x * delta);
        let newZ = camera.position.z - (velocity.z * delta);
        let newY = camera.position.y + (velocity.y * delta);

        // Jika tabrak tembok di X, hentikan gerakan X
        if (checkCollision(newX, camera.position.y, camera.position.z)) {
            velocity.x = 0;
            newX = camera.position.x; 
        }
        
        // Jika tabrak tembok di Z, hentikan gerakan Z
        if (checkCollision(camera.position.x, camera.position.y, newZ)) {
            velocity.z = 0;
            newZ = camera.position.z;
        }

        // Terapkan gerakan Horizontal
        controls.getObject().position.x = newX;
        controls.getObject().position.z = newZ;

        // Cek Pijakan Bawah (Jatuh / Berdiri)
        if (checkCollision(camera.position.x, newY, camera.position.z)) {
            // Jatuh menabrak lantai
            if (velocity.y < 0) {
                velocity.y = 0;
                moveState.canJump = true;
                // Snap ketinggian ke atas blok agar tidak tembus
                camera.position.y = Math.floor(camera.position.y) + 0.5; 
            } else { 
                // Lompat membentur atap
                velocity.y = 0;
                camera.position.y -= 0.1;
            }
        } else {
            camera.position.y = newY;
            // Jika jatuh dari tebing, hapus state bisa lompat
            if (velocity.y < -5) moveState.canJump = false; 
        }

        // Batas bawah dunia (Mati masuk void, respawn ke atas)
        if (camera.position.y < -10) {
            camera.position.set(0, 10, 0);
            velocity.y = 0;
        }

        // Kirim update posisi ke server terus menerus jika sedang bergerak
        if (Math.abs(velocity.x) > 0.05 || Math.abs(velocity.z) > 0.05 || Math.abs(velocity.y) > 0.05) {
            // Ambil arah hadap kepala untuk merotasi badan
            const ry = camera.rotation.y;
            socket.emit('playerMovement', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: ry });
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
