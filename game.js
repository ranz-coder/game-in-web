// PENTING: Ganti string di bawah dengan URL dari Replit Anda
const BACKEND_URL = 'http://45.142.115.40:3535';
const socket = io(BACKEND_URL); 

const uiMenu = document.getElementById('ui-menu');
const btnPlay = document.getElementById('btn-play');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

// Tiga.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x55aa55 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const otherPlayers = {};
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            addOtherPlayer(id, players[id]);
        } else {
            camera.position.set(players[id].x, 2, players[id].z + 5);
        }
    });
});

socket.on('newPlayer', (data) => {
    addOtherPlayer(data.id, data.player);
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
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

function addOtherPlayer(id, playerInfo) {
    const mat = new THREE.MeshLambertMaterial({ color: playerInfo.color });
    const mesh = new THREE.Mesh(playerGeometry, mat);
    mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    scene.add(mesh);
    otherPlayers[id] = mesh;
}

socket.on('receiveChat', (data) => {
    const msgElement = document.createElement('div');
    const shortId = data.id.substring(0, 4);
    msgElement.innerText = `[Player-${shortId}]: ${data.message}`;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('sendChat', chatInput.value);
        chatInput.value = '';
    }
});

let isPlaying = false;
btnPlay.addEventListener('click', () => {
    uiMenu.style.display = 'none';
    chatContainer.style.display = 'block';
    isPlaying = true;
});

const keys = {};
window.addEventListener('keydown', (e) => {
    // Abaikan input jika sedang mengetik di chat
    if(document.activeElement !== chatInput) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

const speed = 0.15;

function animate() {
    requestAnimationFrame(animate);

    if (isPlaying && document.activeElement !== chatInput) {
        let moved = false;
        if (keys['w']) { camera.position.z -= speed; moved = true; }
        if (keys['s']) { camera.position.z += speed; moved = true; }
        if (keys['a']) { camera.position.x -= speed; moved = true; }
        if (keys['d']) { camera.position.x += speed; moved = true; }

        if (moved) {
            socket.emit('playerMovement', { x: camera.position.x, z: camera.position.z - 5 });
        }
    }

    renderer.render(scene, camera);
}

animate();

// Resize canvas otomatis saat layar berubah ukuran
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
