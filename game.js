const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id'; 
const socket = io(BACKEND_URL); 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 15, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera); // Wajib ditambahkan ke scene agar tangan terlihat

const renderer = new THREE.WebGLRenderer({ antialias: false }); 
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight.position.set(20, 50, 20);
scene.add(dirLight);

// ==========================================
// ASSET TEXTURES & FIX CORS
// ==========================================
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('Anonymous'); // PENTING: Mencegah error tekstur hitam

const BASE_URL = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/master/assets/minecraft/textures/block/';

function loadPixelTexture(filename) {
    const tex = textureLoader.load(BASE_URL + filename);
    tex.magFilter = THREE.NearestFilter; 
    tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
}

const materials = {
    grass: [
        loadPixelTexture('grass_block_side.png'),
        loadPixelTexture('grass_block_side.png'),
        loadPixelTexture('grass_block_top.png'),
        loadPixelTexture('dirt.png'),
        loadPixelTexture('grass_block_side.png'),
        loadPixelTexture('grass_block_side.png')
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

// ==========================================
// TANGAN PERTAMA (VIEWMODEL) & ANIMASI
// ==========================================
const handGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
let handMesh = new THREE.Mesh(handGeo, materials['grass']);
handMesh.position.set(0.4, -0.3, -0.5); // Posisi di pojok kanan bawah kamera
handMesh.rotation.set(0, -Math.PI / 4, Math.PI / 8);
camera.add(handMesh);

let isSwinging = false;
let swingProgress = 0;

function swingHand() {
    if (!isSwinging) isSwinging = true;
}

// ==========================================
// GENERATOR DUNIA BERGELOMBANG (BUKIT)
// ==========================================
const blocksData = {}; 
const blockObjects = []; 
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

function createBlock(x, y, z, type, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) return; // Jangan tumpuk blok

    const mat = materials[type] || materials['stone'];
    const block = new THREE.Mesh(blockGeometry, mat);
    block.position.set(x, y, z);
    scene.add(block);
    
    blocksData[key] = block;
    blockObjects.push(block);

    if (emit) socket.emit('placeBlock', { x, y, z, type });
    return block;
}

function removeBlock(x, y, z, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) {
        scene.remove(blocksData[key]);
        const index = blockObjects.indexOf(blocksData[key]);
        if (index > -1) blockObjects.splice(index, 1);
        delete blocksData[key];
        if (emit) socket.emit('breakBlock', { x, y, z });
    }
}

// Fungsi Matematika untuk membuat bukit bergelombang
function generateTerrain() {
    const worldSize = 15; // 30x30 blok
    for (let x = -worldSize; x <= worldSize; x++) {
        for (let z = -worldSize; z <= worldSize; z++) {
            // Kalkulasi ketinggian (Noise buatan sederhana)
            let height = Math.floor(Math.sin(x * 0.2) * Math.cos(z * 0.2) * 3 + Math.sin(x * 0.5) * 1.5);
            
            // Susun blok dari bawah ke atas
            for (let y = -4; y <= height; y++) {
                if (y === height) createBlock(x, y, z, 'grass');
                else if (y > height - 3) createBlock(x, y, z, 'dirt');
                else createBlock(x, y, z, 'stone');
            }
        }
    }
}
generateTerrain();

// ==========================================
// HOTBAR LOGIC
// ==========================================
let currentSelectedBlock = 'grass';
const slots = ['grass', 'dirt', 'wood', 'stone', 'cobblestone', 'bricks'];

window.addEventListener('keydown', (e) => {
    if(document.activeElement.id === 'chat-input') return;
    
    if (e.key >= '1' && e.key <= '6') {
        const index = parseInt(e.key) - 1;
        currentSelectedBlock = slots[index];
        
        // Update tekstur blok di tangan
        handMesh.material = materials[currentSelectedBlock];

        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById(`slot-${e.key}`).classList.add('active');
    }
});

// ==========================================
// RAYCASTER (MENARUH / MENGHANCURKAN)
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
    swingHand(); // Jalankan animasi tangan memukul
    
    if (e.button === 0 && targetBlock) { 
        const pos = targetBlock.position;
        // Mencegah menghancurkan bedrock tiruan (batas bawah)
        if (pos.y > -4) removeBlock(pos.x, pos.y, pos.z, true);
    } 
    else if (e.button === 2 && placePosition) {
        const pPos = camera.position;
        const dist = Math.sqrt(Math.pow(pPos.x - placePosition.x, 2) + Math.pow(pPos.y - 1.5 - placePosition.y, 2) + Math.pow(pPos.z - placePosition.z, 2));
        
        if (dist > 1.0) { 
            createBlock(placePosition.x, placePosition.y, placePosition.z, currentSelectedBlock, true);
        }
    }
});

function updateRaycaster() {
    raycaster.setFromCamera(centerVector, camera);
    const intersects = raycaster.intersectObjects(blockObjects);

    if (intersects.length > 0 && intersects[0].distance < 5) { 
        targetBlock = intersects[0].object;
        blockHighlight.position.copy(targetBlock.position);
        blockHighlight.visible = true;
        placePosition = targetBlock.position.clone().add(intersects[0].face.normal);
    } else {
        targetBlock = null;
        placePosition = null;
        blockHighlight.visible = false;
    }
}

// ==========================================
// KONTROL & FISIKA TABRAKAN
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
            if (moveState.canJump) { velocityY = 8; moveState.canJump = false; }
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

function isBlockSolid(x, y, z) {
    return !!blocksData[`${Math.round(x)},${Math.round(y)},${Math.round(z)}`];
}

function checkCollision(newX, newY, newZ) {
    const r = 0.25; 
    const yPoints = [Math.round(newY - 1.5), Math.round(newY - 0.5)]; 
    const offsets = [[0,0], [r,r], [-r,-r], [r,-r], [-r,r]];
    
    for (let yp of yPoints) {
        for (let off of offsets) {
            if (isBlockSolid(newX + off[0], yp, newZ + off[1])) return true;
        }
    }
    return false;
}

// ==========================================
// MULTIPLAYER (SINKRONISASI STATE)
// ==========================================
socket.on('worldState', (changes) => {
    for (const key in changes) {
        const [x, y, z] = key.split(',').map(Number);
        if (changes[key] === 'air') removeBlock(x, y, z, false);
        else createBlock(x, y, z, changes[key], false);
    }
});
socket.on('blockPlaced', (data) => createBlock(data.x, data.y, data.z, data.type, false));
socket.on('blockBroken', (data) => removeBlock(data.x, data.y, data.z, false));

// System Chat
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

// Kamera Spawn Point (Di atas bukit)
camera.position.set(0, 15, 0);

// ==========================================
// GAME LOOP
// ==========================================
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // Animasi Tangan Memukul
    if (isSwinging) {
        swingProgress += delta * 15;
        handMesh.rotation.x = -Math.sin(swingProgress) * 0.5;
        handMesh.position.y = -0.3 - Math.sin(swingProgress) * 0.1;
        if (swingProgress > Math.PI) {
            isSwinging = false;
            swingProgress = 0;
            handMesh.rotation.x = 0;
            handMesh.position.y = -0.3;
        }
    }

    if (controls.isLocked) {
        updateRaycaster(); 

        velocityY -= 25.0 * delta; 
        let intendedY = camera.position.y + (velocityY * delta);

        if (checkCollision(camera.position.x, intendedY, camera.position.z)) {
            if (velocityY < 0) { 
                velocityY = 0;
                moveState.canJump = true;
            } else {
                velocityY = 0;
            }
        } else {
            camera.position.y = intendedY;
            if (velocityY < -3) moveState.canJump = false; 
        }

        if (camera.position.y < -15) {
            camera.position.set(0, 15, 0);
            velocityY = 0;
        }

        let dirZ = Number(moveState.forward) - Number(moveState.backward);
        let dirX = Number(moveState.right) - Number(moveState.left);
        
        if (dirZ !== 0 || dirX !== 0) {
            const length = Math.sqrt(dirZ * dirZ + dirX * dirX);
            dirZ /= length;
            dirX /= length;
            
            // Efek jalan (Bobbing kamera)
            camera.position.y += Math.sin(time * 0.01) * 0.02;
        }

        const speed = 5.0; 
        const prevPosition = camera.position.clone();

        controls.moveForward(dirZ * speed * delta);
        controls.moveRight(dirX * speed * delta);

        const intendedX = camera.position.x;
        const intendedZ = camera.position.z;

        camera.position.copy(prevPosition);

        if (!checkCollision(intendedX, camera.position.y, camera.position.z)) {
            camera.position.x = intendedX;
        }
        if (!checkCollision(camera.position.x, camera.position.y, intendedZ)) {
            camera.position.z = intendedZ;
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
