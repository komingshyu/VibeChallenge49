const $ = (sel) => document.querySelector(sel);
let uploadedFileId = null, taskId = null;

const imgOriginal = $("#img-original");
const imgDepth = $("#img-depth");
const imgMask = $("#img-mask");
const imgBgPartial = $("#img-bg-partial");
const imgBG = $("#img-bg");
const fgGrid = $("#img-fg");
const imgDepthFinal = $("#img-depth-final");

// 透明 1x1 佔位，避免破圖樣式
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
[imgOriginal, imgDepth, imgMask, imgBgPartial, imgBG, imgDepthFinal].forEach(el => el.src = BLANK);

/* Busy indicator */
const busy = document.createElement("div");
busy.id = "busy-indicator";
busy.innerHTML = `<div class="spinner"></div><span>背景重畫中...</span>`;
document.body.appendChild(busy);

// 將 0/1 或 0~小數值 的灰階 mask 正規化成可視白底黑字（或二值 0/255）
function normalizeMaskPreviewB64(b64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      // 找最大灰階，若太小就放大；並把 >0 的值直接提到 255，成清楚的二值圖
      let maxV = 0;
      for (let i=0;i<id.data.length;i+=4) maxV = Math.max(maxV, id.data[i], id.data[i+1], id.data[i+2]);
      const scale = (maxV > 0 && maxV < 64) ? (255 / maxV) : 1;
      for (let i=0;i<id.data.length;i+=4){
        let v = Math.max(id.data[i], id.data[i+1], id.data[i+2]) * scale;
        v = v > 0 ? 255 : 0;         // 直接做二值化，避免灰黑一片
        id.data[i] = id.data[i+1] = id.data[i+2] = v;
        id.data[i+3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.src = `data:image/png;base64,${b64}`;
  });
}

$("#file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  // reset 預覽
  imgOriginal.src = URL.createObjectURL(f);
  imgDepth.src = imgMask.src = imgBgPartial.src = imgBG.src = imgDepthFinal.src = BLANK;

  $("#runBtn").disabled = true;
  $("#status").textContent = "正在上傳...";

  const form = new FormData();
  form.append("file", f);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const j = await res.json();
  uploadedFileId = j.file_id;
  $("#status").textContent = "已上傳，準備開始。";
  $("#runBtn").disabled = false;
});

$("#runBtn").addEventListener("click", async () => {
  if (!uploadedFileId) return;
  $("#runBtn").disabled = true;
  $("#status").textContent = "排程中...";

  const res = await fetch(`/api/run?file_id=${uploadedFileId}&partial_images=3`, { method: "POST" });
  const j = await res.json();
  taskId = j.task_id;
  $("#status").textContent = "執行中...";

  const es = new EventSource(`/api/stream/${taskId}`);

  es.addEventListener("progress", (ev) => {
    const data = JSON.parse(ev.data);
    $("#status").textContent = data.message || "處理中...";
  });

  es.addEventListener("depth", (ev) => {
    const data = JSON.parse(ev.data);
    imgDepth.src = `data:image/png;base64,${data.b64}`;
    imgDepthFinal.src = imgDepth.src;
  });

  // 這裡先顯示「正規化後」的 union 遮罩，避免一開始是一張幾乎全黑的 0/1 圖
  es.addEventListener("mask", async (ev) => {
    const data = JSON.parse(ev.data);
    const url = await normalizeMaskPreviewB64(data.b64);
    imgMask.src = url;
  });

  es.addEventListener("bg.partial", (ev) => {
    const data = JSON.parse(ev.data);
    imgBgPartial.src = `data:image/png;base64,${data.b64}`;
    busy.style.display = "flex";
  });

  es.addEventListener("final", (ev) => {
    const data = JSON.parse(ev.data);
    const { instances, depth_b64 } = data;

    // 取背景（容錯）
    const bgAny = data.bg_b64 || data.bg || data.background_b64 || data.background || null;

    // 視差 viewer
    window.initViewer({ bg: bgAny, instances, depth: depth_b64 });

    // 右側輸出：背景（重畫）
    if (bgAny) imgBG.src = `data:image/png;base64,${bgAny}`;

    // 前景（全部實例）
    fgGrid.innerHTML = "";
    instances.forEach((inst, idx) => {
      const item = document.createElement("div");
      item.className = "fg-item";
      const img = document.createElement("img");
      img.src = `data:image/png;base64,${inst.img_b64}`;
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = `Instance ${idx + 1}`;
      item.appendChild(img);
      item.appendChild(label);
      fgGrid.appendChild(item);
    });

    // 以 instances 產生「彩色匯總」覆蓋掉左下圖
    if (instances.length) {
      const colorMask = document.createElement("canvas");
      const tmp = new Image();
      tmp.onload = () => {
        colorMask.width = tmp.width;
        colorMask.height = tmp.height;
        const ctx = colorMask.getContext("2d");
        const palette = [
          [255,99,132],[54,162,235],[255,206,86],[75,192,192],
          [153,102,255],[255,159,64],[199,199,199],[255,99,255],
          [99,255,132],[132,99,255],[255,132,99],[99,132,255]
        ];
        instances.forEach((inst, i) => {
          const im = new Image();
          im.onload = () => {
            const off = document.createElement("canvas");
            off.width = im.width; off.height = im.height;
            const octx = off.getContext("2d");
            octx.drawImage(im, 0, 0);
            const id = octx.getImageData(0, 0, off.width, off.height);
            const [r,g,b] = palette[i % palette.length];
            for (let p=0; p<id.data.length; p+=4) {
              const a = id.data[p+3];
              if (a > 0) { id.data[p]=r; id.data[p+1]=g; id.data[p+2]=b; id.data[p+3]=180; }
            }
            octx.putImageData(id, 0, 0);
            ctx.drawImage(off, 0, 0);
            imgMask.src = colorMask.toDataURL();
          };
          im.src = `data:image/png;base64,${inst.img_b64}`;
        });
      };
      tmp.src = `data:image/png;base64,${instances[0].img_b64}`;
    }

    busy.style.display = "none";
    es.close();
  });
});
