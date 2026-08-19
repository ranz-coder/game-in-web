// ==========================================
// PENGATURAN KONEKSI MULTIPLAYER
// ==========================================
// GANTI DENGAN URL BACKEND ANDA YANG SUDAH HTTPS
const BACKEND_URL = 'https://game-in-web-api.ranzzawok.my.id'; 
const socket = io(BACKEND_URL); 

// ==========================================
// SETUP SCENE & KAMERA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Langit biru
scene.fog = new THREE.Fog(0x87CEEB, 10, 50);  // Efek kabut

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false }); // Antialias false agar lebih terlihat 'pixelated'
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Pencahayaan
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(20, 50, 20);
scene.add(dirLight);

// ==========================================
// GENERATOR DUNIA VOXEL (BLOK MINECRAFT)
// ==========================================
const blockSize = 1;
const worldSize = 15; // Dunia ukuran 30x30 blok

// Membuat material balok (Atas rumput hijau, samping tanah cokelat)
const grassMat = new THREE.MeshLambertMaterial({ color: 0x3b8526 }); // Hijau
const dirtMat = new THREE.MeshLambertMaterial({ color: 0x79553a });  // Cokelat
const blockMaterials = [
    dirtMat,  // Kanan
    dirtMat,  // Kiri
    grassMat, // Atas
    dirtMat,  // Bawah
    dirtMat,  // Depan
    dirtMat   // Belakang
];

const blockGeometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);

// Generate lantai balok
for (let x = -worldSize; x <= worldSize; x++) {
    for (let z = -worldSize; z <= worldSize; z++) {
        const block = new THREE.Mesh(blockGeometry, blockMaterials);
        block.position.set(x, 0, z);
        scene.add(block);
    }
}

// Tambahkan beberapa tiang/pohon sederhana secara acak
for (let i = 0; i < 15; i++) {
    const woodGeo = new THREE.BoxGeometry(1, 4, 1);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const wood = new THREE.Mesh(woodGeo, woodMat);
    wood.position.set(
        Math.floor(Math.random() * 20 - 10), 
        2.5, 
        Math.floor(Math.random() * 20 - 10)
    );
    scene.add(wood);
}

// ==========================================
// KONTROL FIRST-PERSON (POINTER LOCK)
// ==========================================
const controls = new THREE.PointerLockControls(camera, document.body);
const uiMenu = document.getElementById('ui-menu');
const btnPlay = document.getElementById('btn-play');

btnPlay.addEventListener('click', () => {
    controls.lock(); // Mengunci mouse ke dalam game
});

controls.addEventListener('lock', () => {
    uiMenu.style.display = 'none'; // Sembunyikan menu
});

controls.addEventListener('unlock', () => {
    uiMenu.style.display = 'flex'; // Tampilkan menu saat tekan ESC
});

// Fisika & Pergerakan
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward: false, backward: false, left: false, right: false, canJump: false };

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': 
            if (moveState.canJump) {
                velocity.y += 8; // Kekuatan lompat
                moveState.canJump = false;
            }
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

// Kamera mulai pada ketinggian karakter
camera.position.y = 2; 

// ==========================================
// MULTIPLAYER LOGIC
// ==========================================
const otherPlayers = {};
const playerGeo = new THREE.BoxGeometry(0.8, 1.8, 0.8); // Ukuran badan pemain

function addOtherPlayer(id, playerInfo) {
    const mat = new THREE.MeshLambertMaterial({ color: playerInfo.color });
    const mesh = new THREE.Mesh(playerGeo, mat);
    mesh.position.set(playerInfo.x, playerInfo.y + 0.9, playerInfo.z); // +0.9 agar tidak tembus tanah
    scene.add(mesh);
    otherPlayers[id] = mesh;
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            addOtherPlayer(id, players[id]);
        } else {
            camera.position.set(players[id].x, 2, players[id].z);
        }
    });
});

socket.on('newPlayer', (data) => {
    addOtherPlayer(data.id, data.player);
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        // Mengubah posisi mesh pemain lain
        otherPlayers[data.id].position.x = data.x;
        otherPlayers[data.id].position.z = data.z;
    }
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
    msgElement.innerText = `<Player-${shortId}> ${data.message}`;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('sendChat', chatInput.value);
        chatInput.value = '';
        controls.lock(); // Kembali ke game otomatis setelah nge-chat
    }
});

// Mencegah pergerakan wasd masuk ke text chat jika mouse tidak di-lock
chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
});

// ==========================================
// GAME LOOP (ANIMASI & FISIKA)
// ==========================================
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        // Efek perlambatan (Friksi)
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 25.0 * delta; // Gravitasi

        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize(); // Biar jalan serong tidak lebih cepat

        // Kecepatan gerak
        if (moveState.forward || moveState.backward) velocity.z -= direction.z * 40.0 * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * 40.0 * delta;

        // Terapkan kecepatan ke kamera (Pemain)
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.y += velocity.y * delta;

        // Deteksi tabrakan dengan tanah (lantai ada di y=0.5)
        if (camera.position.y < 2) {
            velocity.y = 0;
            camera.position.y = 2;
            moveState.canJump = true;
        }

        // Kirim posisi kita ke server agar dilihat pemain lain
        if (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1) {
            socket.emit('playerMovement', { x: camera.position.x, z: camera.position.z });
        }
    }

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

// Resize layar otomatis
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
