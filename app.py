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

app = FastAPI(title="LiveHost AI", version="0.3.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


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
        "version": "0.3.0",
        "mode": os.getenv("ENGINE_MODE", "demo"),
        "ai_configured": bool(os.getenv("AI_API_URL") and os.getenv("AI_MODEL")),
        "avatar_engine_configured": bool(os.getenv("AVATAR_ENGINE_URL")),
        "tiktok_live_connector": "not-configured",
    }


@app.post("/api/avatar")
async def upload_avatar(file: UploadFile = File(...)):
    ext = Path(file.filename or "avatar.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        return JSONResponse(
            {"ok": False, "error": "Only PNG/JPG/JPEG/WEBP supported"},
            status_code=400,
        )
    dest = UPLOADS / ("avatar" + ext)
    dest.write_bytes(await file.read())
    return {"ok": True, "filename": dest.name}


@app.websocket("/ws/control")
async def ws_control(ws: WebSocket):
    await ws.accept()
    await ws.send_json({"type": "hello", "message": "LiveHost backend connected", "version": "0.3.0"})
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


@app.get("/api/ai/status")
def ai_status():
    return {
        "configured": bool(os.getenv("AI_API_URL") and os.getenv("AI_MODEL")),
        "model": os.getenv("AI_MODEL", "local-fallback"),
        "provider": "openai-compatible" if os.getenv("AI_API_URL") else "local-fallback",
    }


@app.get("/api/tiktok/status")
def tiktok_status():
    return {
        "connected": False,
        "mode": "adapter-ready",
        "message": "Live comment connector is not enabled on the public server. Use an approved TikTok LIVE integration or a separate local connector.",
    }


def local_reply(req: ReplyRequest) -> str:
    text = (req.comment or "").strip()
    low = text.lower()
    product = req.product_name.strip() or "sản phẩm này"
    price = req.product_price.strip()

    if any(k in low for k in ["giá", "bao nhiêu", "nhiêu tiền"]):
        if price:
            return f"Dạ {product} hiện bạn đang để giá {price}. Bạn vẫn nên kiểm tra giá hiển thị trong giỏ vì ưu đãi có thể thay đổi nhé."
        return "Dạ bạn bấm vào sản phẩm đang ghim để xem đúng giá hiện tại nhé, vì giá và voucher có thể thay đổi theo thời điểm."

    if any(k in low for k in ["size", "cỡ", "kích thước"]):
        return "Bạn gửi mình chiều cao, cân nặng hoặc kích thước bạn cần, mình sẽ gợi ý size phù hợp hơn nhé."

    if any(k in low for k in ["ship", "giao", "bao lâu", "mấy ngày"]):
        return "Thời gian giao tùy khu vực. Bạn mở giỏ và nhập địa chỉ để TikTok Shop hiển thị thời gian dự kiến chính xác nhất nhé."

    if any(k in low for k in ["tốt không", "ổn không", "đáng mua", "có tốt"]):
        notes = req.product_notes.strip()
        if notes:
            short = notes[:220].strip()
            return f"Mình nói theo thông tin đang có nhé: {short}. Bạn cân nhắc xem có đúng nhu cầu của mình không."
        return "Mình sẽ nói rõ ưu và nhược điểm thay vì khẳng định quá mức. Bạn cho mình biết bạn quan tâm nhất điểm nào để mình review đúng phần đó nhé."

    return f"Mình thấy câu hỏi của bạn về {product} rồi. Mình sẽ trả lời ngắn gọn theo thông tin sản phẩm đang có và không tự bịa thông số nhé."


def call_ai_sync(req: ReplyRequest) -> str:
    api_url = os.getenv("AI_API_URL", "").strip()
    api_key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_MODEL", "").strip()

    if not api_url or not model:
        return local_reply(req)

    system = (
        "Bạn là trợ lý livestream bán hàng bằng tiếng Việt. "
        "Trả lời tự nhiên, ngắn gọn, tối đa khoảng 2 câu. "
        "Không bịa giá, tồn kho, chính sách, công dụng, chứng nhận hay thông số. "
        "Nếu thiếu dữ liệu, nói rõ cần kiểm tra. "
        "Không gây áp lực mua hàng và không dùng tuyên bố tuyệt đối."
    )
    product_context = (
        f"Tên sản phẩm: {req.product_name or 'chưa nhập'}\n"
        f"Giá tham chiếu: {req.product_price or 'chưa nhập'}\n"
        f"Ghi chú sản phẩm: {req.product_notes or 'chưa nhập'}"
    )
    user = f"{product_context}\n\nBình luận của người xem: {req.comment}"

    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.4,
            "max_tokens": 180,
        }
    ).encode("utf-8")

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
        return {
            "ok": True,
            "reply": local_reply(req),
            "source": "local-fallback",
            "warning": str(exc)[:220],
        }
