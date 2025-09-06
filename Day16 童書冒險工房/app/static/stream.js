// app/static/stream.js
(function () {
  const $ = (sel) => document.querySelector(sel);

  function appendText(el, txt) {
    if (!el) return;
    el.textContent += txt || "";
    el.scrollTop = el.scrollHeight;
  }

  function setText(el, txt) {
    if (!el) return;
    el.textContent = txt || "";
    el.scrollTop = el.scrollHeight;
  }

  function ensureImageSlot(page) {
    let img = document.querySelector(`img[data-page="${page}"]`);
    if (!img) {
      const container = $("#pages");
      const wrap = document.createElement("div");
      wrap.className = "page";
      img = document.createElement("img");
      img.setAttribute("data-page", String(page));
      img.alt = `第 ${page} 頁`;
      img.loading = "lazy";
      wrap.appendChild(img);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `p${String(page).padStart(2, "0")}`;
      wrap.appendChild(meta);
      container && container.appendChild(wrap);
    }
    return img;
  }

  function wireEventSource(url, handlers, { retry = true, onStatus } = {}) {
    const es = new EventSource(url, { withCredentials: false });
    onStatus && onStatus(`連線中：${url}`);

    Object.keys(handlers).forEach((evt) => {
      es.addEventListener(evt, (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers[evt](data, e);
        } catch (err) {
          console.error("SSE parse error", err, e.data);
        }
      });
    });

    es.addEventListener("ping", () => { /* 心跳保活 */ });

    es.onerror = (e) => {
      console.warn("SSE error", e);
      es.close();
      onStatus && onStatus(`中斷：${url}`);
      if (retry) {
        setTimeout(() => wireEventSource(url, handlers, { retry, onStatus }), 1500);
      }
    };
    return es;
  }

  window.Stream = {
    connectOutline(pid, prompt) {
      const url = `/api/stream/outline/${encodeURIComponent(pid)}?prompt=${encodeURIComponent(prompt || "")}`;
      const outEl = document.querySelector("#outlineText");
      return wireEventSource(url, {
        outline_token: (d) => appendText(outEl, d.text),
        done: () => console.log("outline done"),
      }, { retry: false, onStatus: (s) => { const st = document.querySelector("#status"); st && (st.textContent = s); }});
    },

    connectStoryboard(pid, promptOrEdit) {
      const url = `/api/stream/storyboard/${encodeURIComponent(pid)}?prompt=${encodeURIComponent(promptOrEdit || "")}`;
      const el = document.querySelector("#storyboardText");
      return wireEventSource(url, {
        storyboard_token: (d) => appendText(el, d.text),
        storyboard_snapshot: (d) => setText(el, d.text),
        done: () => console.log("storyboard done"),
      }, { retry: false, onStatus: (s) => { const st = document.querySelector("#status"); st && (st.textContent = s); }});
    },

    connectImages(pid, pages = 14) {
      const url = `/api/stream/images/${encodeURIComponent(pid)}?pages=${pages}`;
      return wireEventSource(url, {
        image_ready: (d) => {
          const img = ensureImageSlot(d.page);
          img.src = d.src; // 已含 ?v=mtime，避免 404 快取
          img.dataset.ready = "1";
        },
        done: (d) => console.log("images done", d),
      }, { retry: true, onStatus: (s) => { const st = document.querySelector("#status"); st && (st.textContent = s); }});
    },
  };
})();
