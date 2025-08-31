
import io, base64, logging
from typing import Generator
from PIL import Image
from openai import OpenAI

log = logging.getLogger("2p5d.gptimg")

def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def _b64_data_url_png(img: Image.Image) -> str:
    return 'data:image/png;base64,' + base64.b64encode(_png_bytes(img.convert('RGBA'))).decode('utf-8')

def stream_repaint_single_image_responses(bg_image: Image.Image, prompt: str, size: str, partial_images: int = 3) -> Generator[dict, None, None]:
    """Responses API + image_generation tool, single input image, full repaint.
    - content uses {"type":"input_image","image_url":"data:image/png;base64,..."}
    - tools includes image_generation with size and partial_images
    - stream events: response.image_generation_call.partial_image; response.completed for final
    """
    client = OpenAI()
    content = [
        {"type":"input_text","text": prompt},
        {"type":"input_image","image_url": _b64_data_url_png(bg_image)},
    ]
    tool = {"type":"image_generation", "partial_images": int(max(1,min(3,partial_images))), "size": size}

    stream = client.responses.create(
        model="gpt-4.1",
        input=[{"role":"user","content": content}],
        tools=[tool],
        stream=True,
    )

    final_b64 = None
    for event in stream:
        et = getattr(event, 'type', None) or (event.get('type') if isinstance(event, dict) else None)
        if et == "response.image_generation_call.partial_image":
            b64 = getattr(event, 'partial_image_b64', None) or (event.get('partial_image_b64') if isinstance(event, dict) else None)
            if b64:
                yield {"type":"partial","b64": b64}
        elif et == "response.completed":
            # Extract final image from the response object carried by the completed event
            resp = getattr(event, 'response', None) or (event.get('response') if isinstance(event, dict) else None)
            outputs = getattr(resp, 'output', None) if resp is not None else None
            if outputs is None and isinstance(resp, dict):
                outputs = resp.get('output')
            if outputs:
                for item in outputs:
                    itype = getattr(item, 'type', None) or (item.get('type') if isinstance(item, dict) else None)
                    if itype == 'image_generation_call':
                        result = getattr(item, 'result', None) or (item.get('result') if isinstance(item, dict) else None)
                        if result:
                            final_b64 = result
                            yield {"type":"final","b64": final_b64}
                            return
    # If we exit the loop without a final, just stop (caller will treat as failure)
