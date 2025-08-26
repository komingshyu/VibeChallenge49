from __future__ import annotations
import os
import asyncio
import base64
from typing import List, Optional, Dict, Any
import threading

from openai import OpenAI
from openai import (
    PermissionDeniedError,
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    APIStatusError,
)
from tenacity import (
    retry, stop_after_attempt, wait_random_exponential,
    retry_if_exception
)

class ImageGenError(Exception):
    pass

def _to_data_url(b64: str) -> str:
    return f"data:image/png;base64,{b64}"

def _is_transient(e: Exception) -> bool:
    # Retry for transient issues: 429/5xx/network/timeout
    if isinstance(e, (RateLimitError, APIConnectionError, APITimeoutError, InternalServerError)):
        return True
    if isinstance(e, APIStatusError) and getattr(e, "status_code", None) in (429, 500, 502, 503, 504):
        return True
    return False

class OpenAIImageService:
    def __init__(self, model: str = "gpt-4o") -> None:
        self.model = model
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ImageGenError("環境變數 OPENAI_API_KEY 未設定")
        self.client = OpenAI(api_key=api_key)

    @retry(wait=wait_random_exponential(multiplier=1, max=8),
           stop=stop_after_attempt(5),
           retry=retry_if_exception(_is_transient))
    async def generate_image_from_inputs(
        self,
        input_images: List[str],
        user_text: str,
        session_id: Optional[str] = None,
        size: str = "1024x1024",
    ) -> bytes:
        if not input_images and not user_text:
            raise ImageGenError("至少需要一張輸入圖或一段文字指令")

        content: List[Dict[str, Any]] = []
        for b64 in input_images:
            content.append({"type": "input_image", "image_url": _to_data_url(b64)})
        if user_text:
            content.append({"type": "input_text", "text": user_text})

        try:
            response = await asyncio.to_thread(
                self.client.responses.create,
                model=self.model,
                input=[{"role": "user", "content": content}],
                tools=[{"type": "image_generation"}],
                tool_choice={"type": "image_generation"},  # or remove, since only one tool provided
                metadata={"session_id": session_id} if session_id else None,
            )
        except PermissionDeniedError as e:
            msg = str(e)
            if "gpt-image-1" in msg.lower() and ("verify" in msg.lower() or "verified" in msg.lower()):
                raise ImageGenError(
                    "影像生成功能尚未開通：你的 OpenAI 組織需要完成 Verify Organization 後才能使用 "
                    "image_generation（gpt-image-1）。請到平台 Settings → Organization → Verify Organization 完成驗證，"
                    "並於生效後再試。"
                ) from e
            raise ImageGenError(f"呼叫 OpenAI 失敗：{e}") from e
        except Exception as e:
            raise ImageGenError(f"呼叫 OpenAI 失敗：{e}") from e

        b64 = self._extract_first_image_b64(response)
        try:
            return base64.b64decode(b64)
        except Exception as e:
            raise ImageGenError(f"影像解碼失敗：{e}") from e

    async def stream_image_from_inputs(
        self,
        input_images: List[str],
        user_text: str,
        session_id: Optional[str] = None,
        partial_images: int = 2,
    ) -> asyncio.Queue:
        """Streaming with partial images.
        Returns an asyncio.Queue with events:
          {"type":"partial","idx":int,"b64":str} |
          {"type":"final","b64":str} |
          {"type":"error","message":str} |
          {"type":"end"}
        """
        if not input_images and not user_text:
            raise ImageGenError("至少需要一張輸入圖或一段文字指令")

        # clamp per API docs (0..3); we enforce 1..3 here
        pi = max(1, min(3, int(partial_images)))

        content: List[Dict[str, Any]] = []
        for b64 in input_images:
            content.append({"type": "input_image", "image_url": _to_data_url(b64)})
        if user_text:
            content.append({"type": "input_text", "text": user_text})

        q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def _put(obj: Dict[str, Any]):
            try:
                asyncio.run_coroutine_threadsafe(q.put(obj), loop)
            except RuntimeError:
                pass  # loop closed

        def _extract_partial(evt: Any):
            """Return (b64, idx) if this event carries a partial image; else None."""
            # Direct attributes path
            b64 = getattr(evt, "partial_image_b64", None)
            if isinstance(b64, str):
                idx = getattr(evt, "partial_image_index", 0)
                return b64, idx

            # Robust: dump to dict and search
            data = None
            if hasattr(evt, "model_dump"):
                data = evt.model_dump()
            elif hasattr(evt, "to_dict"):
                data = evt.to_dict()
            else:
                data = getattr(evt, "__dict__", {})

            def walk(o):
                if isinstance(o, dict):
                    if "partial_image_b64" in o and isinstance(o["partial_image_b64"], str):
                        return o["partial_image_b64"], o.get("partial_image_index", 0)
                    for v in o.values():
                        r = walk(v)
                        if r: return r
                elif isinstance(o, list):
                    for it in o:
                        r = walk(it)
                        if r: return r
                return None
            return walk(data)

        def runner():
            try:
                with self.client.responses.stream(
                    model=self.model,
                    input=[{"role": "user", "content": content}],
                    tools=[{"type": "image_generation", "partial_images": pi}],
                    tool_choice={"type": "image_generation"},  # or remove
                    metadata={"session_id": session_id} if session_id else None,
                ) as stream:
                    for event in stream:
                        # Prefer feature detection over event.type string equality
                        extracted = _extract_partial(event)
                        if extracted:
                            b64, idx = extracted
                            _put({"type": "partial", "idx": idx, "b64": b64})
                            continue

                        # If the SDK surfaces explicit error events
                        et = getattr(event, "type", "")
                        if et and "error" in et:
                            _put({"type": "error", "message": str(getattr(event, "error", ""))})

                    # final
                    try:
                        final_resp = stream.get_final_response()
                        b64 = self._extract_first_image_b64(final_resp)
                        _put({"type": "final", "b64": b64})
                    except Exception as e:
                        _put({"type": "error", "message": f"解析最終影像失敗：{e}"})
            except PermissionDeniedError as e:
                _put({"type": "error", "message": "影像生成功能尚未開通（組織需 Verify）。"})
            except Exception as e:
                _put({"type": "error", "message": f"{e}"})
            finally:
                _put({"type": "end"})

        threading.Thread(target=runner, daemon=True).start()
        return q

    def _extract_first_image_b64(self, response: Any) -> str:
        """Parse the first base64 image from Responses API output (non-streaming)."""
        if hasattr(response, "model_dump"):
            data = response.model_dump()
        elif hasattr(response, "to_dict"):
            data = response.to_dict()
        else:
            data = getattr(response, "__dict__", {"output": []})

        images_b64: List[str] = []

        def walk(obj: Any):
            if isinstance(obj, dict):
                t = obj.get("type")
                if t in ("image_generation_call", "image", "image_generation"):
                    for key in ("image_base64", "image", "result", "b64_json", "b64"):
                        val = obj.get(key)
                        if isinstance(val, str):
                            images_b64.append(val)
                for v in obj.values():
                    walk(v)
            elif isinstance(obj, list):
                for it in obj:
                    walk(it)

        for key in ("output", "content", "data", "choices"):
            if key in data:
                walk(data[key])
        walk(data)

        if not images_b64:
            # Heuristic fallback
            B64_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\r\n")
            def find_b64(o: Any):
                if isinstance(o, str):
                    s = o.strip()
                    if len(s) > 1024 and all((c in B64_CHARS) for c in s[:80]):
                        images_b64.append(s)
                elif isinstance(o, dict):
                    for v in o.values():
                        find_b64(v)
                elif isinstance(o, list):
                    for it in o:
                        find_b64(it)
            find_b64(data)

        if not images_b64:
            raise ImageGenError("無法從模型回應解析影像資料")
        return images_b64[0]
