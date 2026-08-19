from flask import Flask, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'rahasia-game-3d'
socketio = SocketIO(app, cors_allowed_origins="*")

players = {}
world_changes = {'overworld': {}, 'nether': {}, 'end': {}}


def clean_username(raw):
    name = (raw or 'Player').strip()
    if not name:
        name = 'Player'
    return name[:16]


@app.route('/')
def index():
    return {'status': 'ok', 'players_online': len(players)}


@app.route('/health')
def health():
    return {'ok': True, 'players': len(players)}


@socketio.on('connect')
def handle_connect():
    # Player is only added to the world once they send 'join' with a username.
    print(f'[connect] {request.sid}')


@socketio.on('join')
def handle_join(data):
    client_id = request.sid
    username = clean_username((data or {}).get('username'))

    players[client_id] = {
        'x': 0, 'y': 15, 'z': 0,
        'ry': 0,
        'dimension': 'overworld',
        'username': username,
    }

    # Send world/players state to the joining client only.
    emit('currentPlayers', {pid: p for pid, p in players.items() if pid != client_id})
    emit('worldState', world_changes['overworld'])

    # Tell everyone else this player joined.
    emit('newPlayer', {'id': client_id, 'player': players[client_id]}, broadcast=True, include_self=False)
    emit('receiveChat', {'system': True, 'message': f'{username} bergabung ke game'}, broadcast=True)


@socketio.on('disconnect')
def handle_disconnect():
    client_id = request.sid
    player = players.pop(client_id, None)
    if player:
        emit('playerDisconnected', client_id, broadcast=True)
        emit('receiveChat', {'system': True, 'message': f"{player['username']} keluar dari game"}, broadcast=True)
    print(f'[disconnect] {client_id}')


@socketio.on('playerMovement')
def handle_movement(data):
    client_id = request.sid
    if client_id in players and data:
        players[client_id].update({
            'x': data.get('x', players[client_id]['x']),
            'y': data.get('y', players[client_id]['y']),
            'z': data.get('z', players[client_id]['z']),
            'ry': data.get('ry', players[client_id]['ry']),
        })
        emit('playerMoved', {'id': client_id, **data}, broadcast=True, include_self=False)


@socketio.on('changeDimension')
def handle_dimension(dim):
    client_id = request.sid
    if client_id in players and dim in world_changes:
        players[client_id]['dimension'] = dim
        emit('worldState', world_changes[dim])


@socketio.on('placeBlock')
def place_block(data):
    if not data:
        return
    dim = data.get('dim', 'overworld')
    if dim not in world_changes:
        return
    key = f"{data['x']},{data['y']},{data['z']}"
    world_changes[dim][key] = data['type']
    emit('blockPlaced', data, broadcast=True, include_self=False)


@socketio.on('breakBlock')
def break_block(data):
    if not data:
        return
    dim = data.get('dim', 'overworld')
    if dim not in world_changes:
        return
    key = f"{data['x']},{data['y']},{data['z']}"
    world_changes[dim][key] = 'air'
    emit('blockBroken', data, broadcast=True, include_self=False)


@socketio.on('sendChat')
def handle_chat(message):
    client_id = request.sid
    if not message:
        return
    username = players.get(client_id, {}).get('username', 'Player')
    clean_message = str(message).strip()[:200]
    if not clean_message:
        return
    emit('receiveChat', {'username': username, 'message': clean_message}, broadcast=True)


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=3535)
