import os
import json
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
STATIC = BASE / 'static'
UPLOADS = BASE / 'uploads'
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(title='LiveHost AI Demo', version='0.1.0')
app.mount('/static', StaticFiles(directory=STATIC), name='static')

@app.get('/')
def index():
    return FileResponse(STATIC / 'index.html')

@app.get('/api/health')
def health():
    return {
        'ok': True,
        'mode': os.getenv('ENGINE_MODE', 'demo'),
        'gpu_server_url': os.getenv('GPU_SERVER_URL', ''),
        'persona_live_connected': False,
        'note': 'Demo mode: browser handles camera + TTS. GPU adapter is ready to configure.'
    }

@app.post('/api/avatar')
async def upload_avatar(file: UploadFile = File(...)):
    ext = Path(file.filename or 'avatar.png').suffix.lower() or '.png'
    if ext not in {'.png','.jpg','.jpeg','.webp'}:
        return JSONResponse({'ok': False, 'error': 'Only PNG/JPG/JPEG/WEBP supported'}, status_code=400)
    dest = UPLOADS / ('avatar' + ext)
    dest.write_bytes(await file.read())
    return {'ok': True, 'filename': dest.name}

@app.websocket('/ws/control')
async def ws_control(ws: WebSocket):
    await ws.accept()
    await ws.send_json({'type': 'hello', 'message': 'LiveHost backend connected'})
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                msg = {'type': 'text', 'value': raw}
            # Demo echo. Future: route commands to PersonaLive/TTS/comment engine.
            await ws.send_json({'type': 'ack', 'received': msg})
    except WebSocketDisconnect:
        pass

@app.get('/api/gpu-config')
def gpu_config():
    return {
        'engine': os.getenv('GPU_ENGINE', 'personalive'),
        'server_url': os.getenv('GPU_SERVER_URL', ''),
        'mode': os.getenv('ENGINE_MODE', 'demo')
    }
