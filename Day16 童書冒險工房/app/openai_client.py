import os
import base64
from pathlib import Path
from typing import Iterable, List, Dict, Any, Optional

# OpenAI SDK v1
try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # 允許在沒有套件時先載入專案

# ---------- 環境變數 ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TEXT_MODEL  = os.getenv("TEXT_MODEL",  "gpt-4o")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-1")
TTS_MODEL   = os.getenv("TTS_MODEL",   "gpt-4o-mini-tts")
USE_MOCK    = os.getenv("MOCK_OPENAI", "0") == "1"

# ---------- Client ----------
client = None
if OPENAI_API_KEY and OpenAI and not USE_MOCK:
    # 不帶 proxies，避免「got unexpected keyword argument 'proxies'」
    client = OpenAI(api_key=OPENAI_API_KEY)


# =========================================================
# 1) 串流文字：stream_text(messages)
# =========================================================
def stream_text(messages: List[Dict[str, str]], model: str = TEXT_MODEL) -> Iterable[str]:
    """
    串流輸出文字（逐字元/逐片段），回傳一個 generator。
    messages: OpenAI Chat Completions 標準格式 [{"role":"system|user|assistant","content":"..."}]
    """
    if USE_MOCK or client is None:
        # 簡易 mock：輸出一個小 JSON（足夠讓大綱解析通過）
        dummy = (
            '{"title":"小蝌蚪的家族冒險",'
            '"logline":"小蝌蚪在池塘尋親的溫暖旅程。",'
            '"cast":[{"name":"@小蝌蚪","role":"protagonist","description":"好奇、勇敢，渴望找家人。","appearance":"圓滾身體，小尾巴，笑容燦爛"},'
            '{"name":"@小魚","role":"ally","description":"活潑愛玩，願意幫助朋友。","appearance":"彩色鱗片，長尾巴"},'
            '{"name":"@老鴨","role":"mentor","description":"有經驗、愛說故事。","appearance":"白色羽毛，圓眼睛，小毛帽"}]}'
        )
        for ch in dummy:
            yield ch
        return

    # OpenAI v1 chat.completions（stream=True）
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        temperature=0.7,
    )
    for event in resp:
        try:
            delta = event.choices[0].delta
            content = getattr(delta, "content", None)
            if content:
                yield content
        except Exception:
            # 容錯：某些 SDK 版本 delta 可能是 dict
            try:
                delta = event.choices[0].delta  # type: ignore
                if isinstance(delta, dict) and delta.get("content"):
                    yield delta["content"]  # type: ignore
            except Exception:
                continue


# =========================================================
# 2) 生成圖像：image_to_file(prompt, out_path, ref_images=None)
# =========================================================
def _save_b64_image(b64: str, out_path: str):
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))

def _try_crop_16x9(in_path: str, target: str) -> bool:
    """
    將方圖裁成目標尺寸（例如 1792x1024），若缺少 Pillow 則略過。
    """
    try:
        from PIL import Image
        w, h = [int(x) for x in target.lower().split("x")]
        im = Image.open(in_path).convert("RGB")
        src_w, src_h = im.size
        src_ratio = src_w / src_h
        tgt_ratio = w / h

        # 等比縮放到「至少」覆蓋目標畫布，再置中裁切
        if src_ratio > tgt_ratio:
            # 太寬，先以高度對齊
            new_h = h
            new_w = int(new_h * src_ratio)
        else:
            new_w = w
            new_h = int(new_w / src_ratio)
        im = im.resize((new_w, new_h), Image.LANCZOS)
        left = (new_w - w) // 2
        top  = (new_h - h) // 2
        im = im.crop((left, top, left + w, top + h))
        im.save(in_path, "PNG")
        return True
    except Exception:
        return False

def image_to_file(prompt: str, out_path: str,
                  ref_images: Optional[List[str]] = None,
                  size: str = "1792x1024"):
    """
    先嘗試帶參考圖（on‑model），若 API 不支援 size → 退而求其次生成 1024x1024 再裁成 16:9。
    """
    ref_images = ref_images or []

    # 優先：帶參考圖（edits）
    if ref_images:
        try:
            # 取第一張作為基底（避免太大 payload）
            with open(ref_images[0], "rb") as fh:
                res = client.images.edits(
                    model=IMAGE_MODEL,
                    prompt=prompt,
                    image=[fh],
                    size=size,    # 可能在某些版本不支援長方形
                    n=1
                )
            _save_b64_image(res.data[0].b64_json, out_path)
            return out_path
        except Exception:
            # 參考圖流程失敗，改純文字
            pass

    # 純文字生成（嘗試 16:9）
    try:
        res = client.images.generate(
            model=IMAGE_MODEL,
            prompt=prompt,
            size=size,
            n=1
        )
        _save_b64_image(res.data[0].b64_json, out_path)
        return out_path
    except Exception:
        # 若 16:9 尺寸被拒，改 1024x1024，再嘗試裁成 16:9
        res = client.images.generate(
            model=IMAGE_MODEL,
            prompt=prompt + "\n畫面為 16:9 橫式雙跨頁構圖。",
            size="1024x1024",
            n=1
        )
        _save_b64_image(res.data[0].b64_json, out_path)
        _try_crop_16x9(out_path, size)
        return out_path
# =========================================================
# 3) 文字轉語音：tts_to_file(text, voice, out_path, fmt="mp3")
# =========================================================
def tts_to_file(text: str, voice: str, out_path: str, fmt: str = "mp3"):
    """
    使用 gpt-4o-mini-tts 輸出 mp3/wav。若 MOCK 則輸出一個極短空白音檔。
    """
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    if USE_MOCK or client is None:
        # 寫入一個合法但極短的 mp3（其實是空資料，但避免播放器報錯）
        with open(out_path, "wb") as f:
            f.write(b"\xFF\xFB\x90\x64\x00\x00\x00\x00")  # 粗略幾個 byte 作為占位
        return out_path

    # 推薦用 streaming_response 直接存檔
    try:
        with client.audio.speech.with_streaming_response.create(
            model=TTS_MODEL,
            voice=voice or "alloy",
            input=text,
            format=fmt
        ) as resp:
            resp.stream_to_file(out_path)
        return out_path
    except Exception:
        # 某些舊版 SDK 沒有 with_streaming_response，改用一次性回傳
        audio = client.audio.speech.create(
            model=TTS_MODEL,
            voice=voice or "alloy",
            input=text
        )
        # 新版回傳 bytes / 舊版回傳 b64，這裡統一處理
        try:
            content = audio.read()  # type: ignore[attr-defined]
        except Exception:
            # 嘗試 b64 欄位
            b64 = getattr(audio, "audio", None) or getattr(audio, "data", None)
            if b64 and isinstance(b64, (bytes, bytearray)):
                content = b64
            else:
                content = base64.b64decode(getattr(audio, "b64", ""))
        with open(out_path, "wb") as f:
            f.write(content)
        return out_path
