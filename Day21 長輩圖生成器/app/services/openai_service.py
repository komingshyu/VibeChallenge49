\
import base64, os
from .utils import logger

def transcribe_audio_wav(wav_bytes: bytes) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY 未設定。語音辨識停用。")
        return ""
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    # 先用 whisper-1
    try:
        tr = client.audio.transcriptions.create(model="whisper-1", file=("voice.wav", wav_bytes, "audio/wav"))
        return (getattr(tr, "text", "") or "").strip()
    except Exception as e:
        logger.error(f"whisper-1 失敗：{e}")
    # 後備 Responses API
    try:
        b64 = base64.b64encode(wav_bytes).decode("ascii")
        resp = client.responses.create(
            model="gpt-4o-mini-transcribe",
            input=[{"role":"user","content":[
                {"type":"input_audio","audio":{"data": b64, "format":"wav"}},
                {"type":"text","text":"Transcribe to Traditional Chinese text."}
            ]}]
        )
        if hasattr(resp, "output_text") and resp.output_text: return resp.output_text.strip()
        for out in getattr(resp, "output", []):
            if out.get("type")=="message":
                for c in out.get("content", []):
                    if c.get("type")=="output_text": return (c.get("text") or "").strip()
    except Exception as e:
        logger.error(f"Responses API 失敗：{e}")
    return ""
