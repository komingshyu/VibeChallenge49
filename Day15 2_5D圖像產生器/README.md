
# 2.5D Studio v16 — **Responses API 正確 payload**（只給「去人後背景圖」單圖重畫）

這版修正：
- 使用 **Responses API** 搭配 **image_generation 工具**（**正確 payload**）。
- `tools=[{"type":"image_generation", "partial_images":3, "size":"<WxH>"}]`
- `input=[{"role":"user","content":[{"type":"input_text","text":...},{"type":"input_image","image_url":"data:image/png;base64,..."}]}]`
- 不送原圖、不送 mask。

上傳後第一步仍會規格化尺寸到 `1024x1024 / 1536x1024 / 1024x1536`，**size** 同步傳給工具，確保輸出尺寸一致。
