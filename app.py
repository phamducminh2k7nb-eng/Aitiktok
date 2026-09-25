import asyncio
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(title="LiveHost AI", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")


class ReplyRequest(BaseModel):
    comment: str
    viewer: Optional[str] = None
    product_name: str = ""
    product_price: str = ""
    product_notes: str = ""


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "version": "1.0.0",
        "mode": os.getenv("ENGINE_MODE", "demo"),
        "ai_configured": bool(os.getenv("AI_API_URL") and os.getenv("AI_MODEL")),
        "avatar_engine_configured": bool(os.getenv("AVATAR_ENGINE_URL")),
        "tiktok_live_connector": "not-configured",
    }


def current_avatar_path():
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = UPLOADS / ("avatar" + ext)
        if p.exists():
            return p
    return None


@app.get("/api/avatar/current")
def current_avatar():
    p = current_avatar_path()
    if not p:
        return {"ok": True, "exists": False, "url": None}
    return {"ok": True, "exists": True, "url": f"/uploads/{p.name}?v={int(p.stat().st_mtime)}"}


@app.post("/api/avatar")
async def upload_avatar(file: UploadFile = File(...)):
    ext = Path(file.filename or "avatar.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        return JSONResponse(
            {"ok": False, "error": "Chỉ hỗ trợ PNG, JPG, JPEG hoặc WEBP."},
            status_code=400,
        )

    raw = await file.read()
    if not raw:
        return JSONResponse({"ok": False, "error": "File ảnh đang trống."}, status_code=400)
    if len(raw) > 12 * 1024 * 1024:
        return JSONResponse({"ok": False, "error": "Ảnh lớn hơn 12MB."}, status_code=400)

    for old in UPLOADS.glob("avatar.*"):
        try:
            old.unlink()
        except OSError:
            pass

    dest = UPLOADS / ("avatar" + ext)
    dest.write_bytes(raw)
    return {"ok": True, "filename": dest.name, "url": f"/uploads/{dest.name}?v={int(dest.stat().st_mtime)}"}


@app.websocket("/ws/control")
async def ws_control(ws: WebSocket):
    await ws.accept()
    await ws.send_json({"type": "hello", "message": "LiveHost backend connected", "version": "1.0.0"})
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                msg = {"type": "text", "value": raw}
            await ws.send_json({"type": "ack", "received": msg})
    except WebSocketDisconnect:
        pass


@app.get("/api/gpu-config")
def gpu_config():
    return {
        "engine": os.getenv("GPU_ENGINE", "remote-avatar"),
        "server_url": os.getenv("AVATAR_ENGINE_URL", ""),
        "mode": os.getenv("ENGINE_MODE", "demo"),
    }


@app.get("/api/tiktok/status")
def tiktok_status():
    return {
        "connected": False,
        "mode": "manual-test",
        "message": "Bản ổn định hiện chưa đọc comment TikTok LIVE thật. Comment Assistant đang ở chế độ test thủ công để tránh lỗi tài khoản/API.",
    }


def local_reply(req: ReplyRequest) -> str:
    text = (req.comment or "").strip()
    low = text.lower()
    product = req.product_name.strip() or "sản phẩm này"
    price = req.product_price.strip()

    if any(k in low for k in ["giá", "bao nhiêu", "nhiêu tiền"]):
        if price:
            return f"Dạ {product} đang được nhập giá tham chiếu là {price}. Bạn vẫn nên kiểm tra giá trong giỏ vì voucher có thể thay đổi nhé."
        return "Dạ bạn bấm vào sản phẩm đang ghim để xem đúng giá hiện tại nhé, vì giá và voucher có thể thay đổi."

    if any(k in low for k in ["size", "cỡ", "kích thước"]):
        return "Bạn gửi mình chiều cao, cân nặng hoặc kích thước cần dùng, mình sẽ gợi ý size phù hợp hơn nhé."

    if any(k in low for k in ["ship", "giao", "bao lâu", "mấy ngày"]):
        return "Thời gian giao tùy khu vực. Bạn nhập địa chỉ trong giỏ để TikTok Shop hiển thị thời gian dự kiến chính xác nhất nhé."

    notes = req.product_notes.strip()
    if notes:
        return f"Mình trả lời theo thông tin đã nhập nhé: {notes[:220].strip()}"
    return f"Mình thấy câu hỏi của bạn về {product} rồi. Hiện mình chưa có đủ thông tin để khẳng định thêm, nên mình sẽ không tự bịa thông số nhé."


def call_ai_sync(req: ReplyRequest) -> str:
    api_url = os.getenv("AI_API_URL", "").strip()
    api_key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_MODEL", "").strip()

    if not api_url or not model:
        return local_reply(req)

    system = (
        "Bạn là trợ lý livestream bán hàng bằng tiếng Việt. "
        "Trả lời tự nhiên, ngắn gọn, tối đa 2 câu. "
        "Không bịa giá, tồn kho, chính sách, công dụng, chứng nhận hay thông số. "
        "Nếu thiếu dữ liệu, nói rõ cần kiểm tra. Không gây áp lực mua hàng."
    )
    product_context = (
        f"Tên sản phẩm: {req.product_name or 'chưa nhập'}\n"
        f"Giá tham chiếu: {req.product_price or 'chưa nhập'}\n"
        f"Ghi chú: {req.product_notes or 'chưa nhập'}"
    )
    user = f"{product_context}\n\nBình luận: {req.comment}"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.4,
        "max_tokens": 180,
    }).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request = urllib.request.Request(api_url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


@app.post("/api/ai/reply")
async def ai_reply(req: ReplyRequest):
    try:
        text = await asyncio.to_thread(call_ai_sync, req)
        source = "api" if os.getenv("AI_API_URL") and os.getenv("AI_MODEL") else "local"
        return {"ok": True, "reply": text, "source": source}
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, ValueError) as exc:
        return {"ok": True, "reply": local_reply(req), "source": "local-fallback", "warning": str(exc)[:220]}
