const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id'; 
const socket = io(BACKEND_URL); 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 15, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera); 

const renderer = new THREE.WebGLRenderer({ antialias: false }); 
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ==========================================
// PROCEDURAL TEXTURE GENERATOR (ANTI-ERROR)
// ==========================================
// Fungsi ini menggambar tekstur 16x16 pixel dengan HTML Canvas
function generateTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');

    // Pewarnaan dasar dan noise (bintik-bintik acak)
    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            let noise = Math.random() * 0.2; 
            let r=0, g=0, b=0;

            if (type === 'grass_top') { r=60; g=160; b=60; }
            else if (type === 'dirt') { r=100; g=70; b=40; }
            else if (type === 'stone') { r=120; g=120; b=120; noise = Math.random() * 0.3; }
            else if (type === 'wood') { 
                r=90; g=60; b=30; 
                if (x % 4 === 0) { r=70; g=40; b=20; } // Serat kayu
            }
            else if (type === 'wood_top') { r=150; g=120; b=70; }
            else if (type === 'cobblestone') {
                r=100; g=100; b=100;
                if ((x+y)%4 === 0 || x%6===0) { r=60; g=60; b=60; } // Pola batu
            }
            else if (type === 'bricks') {
                r=160; g=60; b=40;
                if (y%4===0 || (y%8!==0 && x%8===0) || (y%8===0 && (x+4)%8===0)) { r=200; g=200; b=200; } // Semen putih
            }

            // Terapkan noise
            r = Math.min(255, r * (1 - noise));
            g = Math.min(255, g * (1 - noise));
            b = Math.min(255, b * (1 - noise));

            // Tambahkan rumput gantung untuk grass_side
            if (type === 'grass_side') {
                if (y < 4 || (y < 7 && Math.random() > 0.5)) { r=60; g=160; b=60; } // Hijau
                else { r=100; g=70; b=40; } // Coklat
                r = Math.min(255, r * (1 - Math.random() * 0.2));
                g = Math.min(255, g * (1 - Math.random() * 0.2));
                b = Math.min(255, b * (1 - Math.random() * 0.2));
            }

            ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; 
    tex.minFilter = THREE.NearestFilter;
    
    // Kembalikan material untuk 3D dan URL Data untuk Hotbar UI
    return { material: new THREE.MeshLambertMaterial({ map: tex }), dataUrl: canvas.toDataURL() };
}

// Generate semua tekstur
const texGrassTop = generateTexture('grass_top');
const texGrassSide = generateTexture('grass_side');
const texDirt = generateTexture('dirt');
const texWood = generateTexture('wood');
const texWoodTop = generateTexture('wood_top');
const texStone = generateTexture('stone');
const texCobblestone = generateTexture('cobblestone');
const texBricks = generateTexture('bricks');

const materials = {
    grass: [texGrassSide.material, texGrassSide.material, texGrassTop.material, texDirt.material, texGrassSide.material, texGrassSide.material],
    dirt: texDirt.material,
    wood: [texWood.material, texWood.material, texWoodTop.material, texWoodTop.material, texWood.material, texWood.material],
    stone: texStone.material,
    cobblestone: texCobblestone.material,
    bricks: texBricks.material
};

// Set gambar Hotbar dari hasil generate canvas
document.getElementById('img-grass').src = texGrassSide.dataUrl;
document.getElementById('img-dirt').src = texDirt.dataUrl;
document.getElementById('img-wood').src = texWood.dataUrl;
document.getElementById('img-stone').src = texStone.dataUrl;
document.getElementById('img-cobblestone').src = texCobblestone.dataUrl;
document.getElementById('img-bricks').src = texBricks.dataUrl;

// ==========================================
// TANGAN PERTAMA (VIEWMODEL) & ANIMASI
// ==========================================
const handGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
let handMesh = new THREE.Mesh(handGeo, materials['grass']);
handMesh.position.set(0.4, -0.3, -0.5); 
handMesh.rotation.set(0, -Math.PI / 4, Math.PI / 8);
camera.add(handMesh);

let isSwinging = false;
let swingProgress = 0;

function swingHand() { if (!isSwinging) isSwinging = true; }

// ==========================================
// GENERATOR DUNIA TERRAIN
// ==========================================
const blocksData = {}; 
const blockObjects = []; 
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

function createBlock(x, y, z, type, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) return; 

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

function generateTerrain() {
    for (let x = -15; x <= 15; x++) {
        for (let z = -15; z <= 15; z++) {
            let height = Math.floor(Math.sin(x * 0.2) * Math.cos(z * 0.2) * 3 + Math.sin(x * 0.5) * 1.5);
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
        handMesh.material = materials[currentSelectedBlock];

        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById(`slot-${e.key}`).classList.add('active');
    }
});

// ==========================================
// RAYCASTER & KONTROL
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

const controls = new THREE.PointerLockControls(camera, document.body);
const uiMenu = document.getElementById('ui-menu');
const btnPlay = document.getElementById('btn-play');

btnPlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => uiMenu.style.display = 'none');
controls.addEventListener('unlock', () => uiMenu.style.display = 'flex');

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    swingHand(); 
    
    if (e.button === 0 && targetBlock) { 
        if (targetBlock.position.y > -4) removeBlock(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, true);
    } 
    else if (e.button === 2 && placePosition) {
        const pPos = camera.position;
        const dist = Math.sqrt(Math.pow(pPos.x - placePosition.x, 2) + Math.pow(pPos.y - 1.5 - placePosition.y, 2) + Math.pow(pPos.z - placePosition.z, 2));
        if (dist > 1.0) createBlock(placePosition.x, placePosition.y, placePosition.z, currentSelectedBlock, true);
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
        targetBlock = null; placePosition = null; blockHighlight.visible = false;
    }
}

// Fisika Gerak
const moveState = { forward: false, backward: false, left: false, right: false, canJump: false };
let velocityY = 0;

window.addEventListener('keydown', (e) => {
    if(document.activeElement.id === 'chat-input') return; 
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': if (moveState.canJump) { velocityY = 8.5; moveState.canJump = false; } break;
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

function checkCollision(newX, newY, newZ) {
    const r = 0.25; 
    const yPoints = [Math.round(newY - 1.5), Math.round(newY - 0.5)]; 
    const offsets = [[0,0], [r,r], [-r,-r], [r,-r], [-r,r]];
    for (let yp of yPoints) {
        for (let off of offsets) {
            if (blocksData[`${Math.round(newX + off[0])},${yp},${Math.round(newZ + off[1])}`]) return true;
        }
    }
    return false;
}

// Multiplayer
socket.on('worldState', (changes) => {
    for (const key in changes) {
        const [x, y, z] = key.split(',').map(Number);
        if (changes[key] === 'air') removeBlock(x, y, z, false);
        else createBlock(x, y, z, changes[key], false);
    }
});
socket.on('blockPlaced', (data) => createBlock(data.x, data.y, data.z, data.type, false));
socket.on('blockBroken', (data) => removeBlock(data.x, data.y, data.z, false));

const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

socket.on('receiveChat', (data) => {
    const msg = document.createElement('div');
    msg.innerText = `<Player-${data.id.substring(0, 4)}> ${data.message}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('sendChat', chatInput.value); chatInput.value = ''; controls.lock(); 
    }
});

camera.position.set(0, 15, 0);

let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (isSwinging) {
        swingProgress += delta * 15;
        handMesh.rotation.x = -Math.sin(swingProgress) * 0.5;
        handMesh.position.y = -0.3 - Math.sin(swingProgress) * 0.1;
        if (swingProgress > Math.PI) {
            isSwinging = false; swingProgress = 0; handMesh.rotation.x = 0; handMesh.position.y = -0.3;
        }
    }

    if (controls.isLocked) {
        updateRaycaster(); 
        velocityY -= 25.0 * delta; 
        let intendedY = camera.position.y + (velocityY * delta);

        if (checkCollision(camera.position.x, intendedY, camera.position.z)) {
            if (velocityY < 0) { velocityY = 0; moveState.canJump = true; } 
            else { velocityY = 0; }
        } else {
            camera.position.y = intendedY;
            if (velocityY < -3) moveState.canJump = false; 
        }

        if (camera.position.y < -15) { camera.position.set(0, 15, 0); velocityY = 0; }

        let dirZ = Number(moveState.forward) - Number(moveState.backward);
        let dirX = Number(moveState.right) - Number(moveState.left);
        
        if (dirZ !== 0 || dirX !== 0) {
            const length = Math.sqrt(dirZ * dirZ + dirX * dirX);
            dirZ /= length; dirX /= length;
            camera.position.y += Math.sin(time * 0.015) * 0.015; // Bobbing
        }

        const speed = 5.0; 
        const prevPosition = camera.position.clone();
        controls.moveForward(dirZ * speed * delta);
        controls.moveRight(dirX * speed * delta);

        const intendedX = camera.position.x;
        const intendedZ = camera.position.z;
        camera.position.copy(prevPosition);

        if (!checkCollision(intendedX, camera.position.y, camera.position.z)) camera.position.x = intendedX;
        if (!checkCollision(camera.position.x, camera.position.y, intendedZ)) camera.position.z = intendedZ;
    }

    renderer.render(scene, camera);
    prevTime = time;
}

animate();
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });
