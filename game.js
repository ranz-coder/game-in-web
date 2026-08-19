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

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Dimensi Aktif ('overworld', 'nether', 'end')
let currentDimension = 'overworld';
let blocksData = {}; 
let blockObjects = []; 
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

// Procedural Texture Generator (Sama seperti sebelumnya)
function generateTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            let noise = Math.random() * 0.2;
            let r=100, g=100, b=100;
            if (currentDimension === 'nether') { r=150; g=40; b=40; }
            else if (currentDimension === 'end') { r=80; g=40; b=120; }
            else {
                if (type === 'grass_top') { r=60; g=160; b=60; }
                else if (type === 'dirt') { r=100; g=70; b=40; }
                else if (type === 'stone') { r=120; g=120; b=120; }
                else if (type === 'wood') { r=90; g=60; b=30; }
                else if (type === 'wood_top') { r=150; g=120; b=70; }
                else if (type === 'cobblestone') { r=90; g=90; b=90; }
                else if (type === 'bricks') { r=160; g=60; b=40; }
            }
            ctx.fillStyle = `rgb(${Math.floor(r * (1-noise))},${Math.floor(g * (1-noise))},${Math.floor(b * (1-noise))})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
}

let materials = {
    grass: [generateTexture('grass_side'), generateTexture('grass_side'), generateTexture('grass_top'), generateTexture('dirt'), generateTexture('grass_side'), generateTexture('grass_side')],
    dirt: generateTexture('dirt'),
    wood: generateTexture('wood'),
    stone: generateTexture('stone'),
    cobblestone: generateTexture('cobblestone'),
    bricks: generateTexture('bricks')
};

function clearWorld() {
    blockObjects.forEach(b => scene.remove(b));
    blockObjects = [];
    blocksData = {};
}

function switchDimension(dim) {
    currentDimension = dim;
    clearWorld();
    if (dim === 'nether') scene.background = new THREE.Color(0x3b0a0a), scene.fog.color = new THREE.Color(0x3b0a0a);
    else if (dim === 'end') scene.background = new THREE.Color(0x1a0a2a), scene.fog.color = new THREE.Color(0x1a0a2a);
    else scene.background = new THREE.Color(0x87CEEB), scene.fog.color = new THREE.Color(0x87CEEB);

    socket.emit('changeDimension', dim);
    generateTerrain();
}

function createBlock(x, y, z, type, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) return; 
    const mat = materials[type] || materials['stone'];
    const block = new THREE.Mesh(blockGeometry, mat);
    block.position.set(x, y, z);
    scene.add(block);
    blocksData[key] = block;
    blockObjects.push(block);
    if (emit) socket.emit('placeBlock', { x, y, z, type, dim: currentDimension });
}

function removeBlock(x, y, z, emit = false) {
    const key = `${x},${y},${z}`;
    if (blocksData[key]) {
        scene.remove(blocksData[key]);
        blockObjects.splice(blockObjects.indexOf(blocksData[key]), 1);
        delete blocksData[key];
        if (emit) socket.emit('breakBlock', { x, y, z, dim: currentDimension });
    }
}

function generateTerrain() {
    for (let x = -10; x <= 10; x++) {
        for (let z = -10; z <= 10; z++) {
            let height = currentDimension === 'end' ? 0 : Math.floor(Math.sin(x * 0.2) * Math.cos(z * 0.2) * 2);
            for (let y = -4; y <= height; y++) {
                createBlock(x, y, z, y === height && currentDimension !== 'end' ? 'grass' : 'stone');
            }
        }
    }
}
generateTerrain();

// Kontrol & Gerak Mulus (Smooth Movement)
const controls = new THREE.PointerLockControls(camera, document.body);
document.getElementById('btn-play').addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => document.getElementById('ui-menu').style.display = 'none');
controls.addEventListener('unlock', () => document.getElementById('ui-menu').style.display = 'flex');

const moveState = { forward: false, backward: false, left: false, right: false, jump: false, shift: false, fly: false, up: false, down: false };
let velocityY = 0;

window.addEventListener('keydown', (e) => {
    if(document.activeElement.id === 'chat-input') return;
    if(e.code === 'KeyW') moveState.forward = true;
    if(e.code === 'KeyS') moveState.backward = true;
    if(e.code === 'KeyA') moveState.left = true;
    if(e.code === 'KeyD') moveState.right = true;
    if(e.code === 'Space') { if(moveState.fly) moveState.up = true; else moveState.jump = true; }
    if(e.code === 'ShiftLeft') { if(moveState.fly) moveState.down = true; else moveState.shift = true; }
    if(e.code === 'KeyF') moveState.fly = !moveState.fly; // Tekan F untuk Terbang
    if(e.code === 'Digit7') switchDimension('overworld');
    if(e.code === 'Digit8') switchDimension('nether');
    if(e.code === 'Digit9') switchDimension('end');
});

window.addEventListener('keyup', (e) => {
    if(e.code === 'KeyW') moveState.forward = false;
    if(e.code === 'KeyS') moveState.backward = false;
    if(e.code === 'KeyA') moveState.left = false;
    if(e.code === 'KeyD') moveState.right = false;
    
    // Perbaikan di sini: Mereset status lonpat dan terbang naik saat spasi dilepas
    if(e.code === 'Space') { 
        moveState.up = false; 
        moveState.jump = false; 
    }
    
    if(e.code === 'ShiftLeft') { 
        moveState.shift = false; 
        moveState.down = false; 
    }
});

// Throttling network sync agar tidak patah-patah
let lastSync = 0;
camera.position.set(0, 10, 0);

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    if (controls.isLocked) {
        let speed = 5.0;
        if (moveState.shift && !moveState.fly) speed = 9.0; // Fitur Sprint

        let dirZ = Number(moveState.forward) - Number(moveState.backward);
        let dirX = Number(moveState.right) - Number(moveState.left);

        const prevPos = camera.position.clone();
        controls.moveForward(dirZ * speed * delta);
        controls.moveRight(dirX * speed * delta);

        if (moveState.fly) {
            if (moveState.up) camera.position.y += speed * delta;
            if (moveState.down) camera.position.y -= speed * delta;
            velocityY = 0;
        } else {
            velocityY -= 25.0 * delta;
            camera.position.y += velocityY * delta;
            // Deteksi lantai sederhana
            if (camera.position.y < 2) { camera.position.y = 2; velocityY = 0; if (moveState.jump) velocityY = 8; }
        }

        // Kirim sinkronisasi dengan jeda waktu (Throttling) agar lancar
        if (time - lastSync > 50 && (dirX !== 0 || dirZ !== 0 || moveState.fly)) {
            socket.emit('playerMovement', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
            lastSync = time;
        }
    }
    renderer.render(scene, camera);
}
animate();
