import os, json
from ..openai_client import image_to_file

def generate_image_stream(pid: str, page: int, prompt: str, out_dir: str,
                          ref_images=None, size: str = "1792x1024"):
    """
    包裝成 SSE：支援 16:9 尺寸與參考圖。
    - 輸出檔案：固定兩位數 PNG，例如 01.png, 02.png
    - SSE 事件：
        start → saved (帶 src) → done (帶 src)
        error → done
    """
    os.makedirs(out_dir, exist_ok=True)
    filename = f"{int(page):02d}.png"
    out_path = os.path.join(out_dir, filename)

    yield json.dumps({"stage": "start", "page": page}, ensure_ascii=False)
    try:
        image_to_file(prompt, out_path, ref_images=ref_images or [], size=size)

        # 加上 mtime 做快取破壞
        mtime = int(os.path.getmtime(out_path))
        src = f"/output/{pid}/images/{filename}?v={mtime}"

        yield json.dumps({"stage": "saved", "page": page, "src": src}, ensure_ascii=False)
    except Exception as e:
        yield json.dumps({"stage": "error", "page": page, "error": str(e)}, ensure_ascii=False)

    # done 事件也帶 src，方便前端不用記憶 saved 的內容
    if os.path.exists(out_path):
        mtime = int(os.path.getmtime(out_path))
        src = f"/output/{pid}/images/{filename}?v={mtime}"
        yield json.dumps({"stage": "done", "page": page, "src": src}, ensure_ascii=False)
    else:
        yield json.dumps({"stage": "done", "page": page}, ensure_ascii=False)
