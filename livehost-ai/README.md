# LiveHost AI v0.2

Web studio nhẹ cho avatar livestream. Laptop chỉ dùng trình duyệt; GPU/model nặng được thiết kế để chạy ở server ngoài.

## Có sẵn
- Camera/microphone trong trình duyệt
- Upload avatar + preview
- TTS tiếng Việt bằng Web Speech API
- Comment assistant demo + phản hồi mẫu
- WebSocket control channel
- GPU adapter configuration placeholder
- Docker + Railway deploy config

## Chạy local
```bash
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8080
```
Mở http://127.0.0.1:8080

## Deploy Railway
Repo có sẵn `Dockerfile` và `railway.json`. Chọn root directory là thư mục `livehost-ai` nếu project nằm trong monorepo.

## Environment
```env
ENGINE_MODE=demo
GPU_ENGINE=personalive
GPU_SERVER_URL=
```

## Kiến trúc dự kiến
Browser/Web -> FastAPI/WebSocket -> GPU adapter -> avatar engine -> OBS/TikTok LIVE Studio

Lưu ý: PersonaLive cần GPU riêng và điều khoản repo gốc cần được kiểm tra trước khi dùng cho mục đích thương mại. LiveHost AI v0.2 hiện là lớp web/controller và demo; không đóng gói model PersonaLive.
