
import io
from typing import List, Dict
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image, ImageDraw

UP_COLOR = "#d32f2f"    # red for up
DOWN_COLOR = "#1b5e20"  # green for down
VOL_ALPHA = 0.5

def _to_png_bytes(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight")
    buf.seek(0)
    return buf.getvalue()

def plot_kline_with_volume(df: pd.DataFrame, show_ma=(5,20,60,120,240), title: str = "") -> (bytes, dict):
    if df is None or df.empty:
        raise ValueError("沒有可繪製的資料")

    x = np.arange(len(df))
    width = 0.6

    fig = plt.figure(figsize=(12, 7))
    gs = fig.add_gridspec(5, 1, height_ratios=[3,0.05,1.6,0.2,0.2])
    ax = fig.add_subplot(gs[0, 0])
    axv = fig.add_subplot(gs[2, 0], sharex=ax)

    # Data arrays
    openp = df["Open"].to_numpy()
    highp = df["High"].to_numpy()
    lowp  = df["Low"].to_numpy()
    closep= df["Close"].to_numpy()
    up = closep >= openp

    # Draw candles
    for i in range(len(df)):
        color = UP_COLOR if up[i] else DOWN_COLOR
        ax.vlines(x[i], lowp[i], highp[i], color=color, linewidth=1.0, alpha=0.9)
        bottom = min(openp[i], closep[i])
        height = abs(closep[i] - openp[i])
        if height < 1e-9:
            height = 0.001  # doji
        rect = Rectangle((x[i]-width/2, bottom), width, height, facecolor=color, edgecolor=color, linewidth=0.5)
        ax.add_patch(rect)

    # Moving averages
    ma_colors = {5:"#ef5350",20:"#42a5f5",60:"#ab47bc",120:"#ffa726",240:"#90a4ae"}
    for win in show_ma:
        col = f"MA{win}"
        if col in df.columns:
            ax.plot(x, df[col].to_numpy(), linewidth=1.2, label=col, color=ma_colors.get(win, "#888888"))

    # Year break markers
    if "YR_BREAK" in df.columns and df["YR_BREAK"].any():
        idxs = np.where(df["YR_BREAK"].to_numpy())[0]
        ax.plot(x[idxs], df["Close"].iloc[idxs].to_numpy(), "v", color="#000000", markersize=8, label="YR_BREAK")

    # Support/Resistance zones (bands)
    if {"SUP_LOW","SUP_HIGH","RES_LOW","RES_HIGH"}.issubset(df.columns):
        sup_low  = df["SUP_LOW"].iloc[-1]
        sup_high = df["SUP_HIGH"].iloc[-1]
        res_low  = df["RES_LOW"].iloc[-1]
        res_high = df["RES_HIGH"].iloc[-1]
        if np.isfinite(sup_low) and np.isfinite(sup_high):
            ax.axhspan(sup_low, sup_high, color="#81c784", alpha=0.15, label="Support")
        if np.isfinite(res_low) and np.isfinite(res_high):
            ax.axhspan(res_low, res_high, color="#ffcc80", alpha=0.15, label="Resistance")

    # Volume
    vol = df["Volume"].to_numpy(dtype=float)
    for i in range(len(df)):
        color = UP_COLOR if up[i] else DOWN_COLOR
        axv.vlines(x[i], 0, vol[i], color=color, alpha=VOL_ALPHA)

    ax.set_xlim(-0.5, len(df)-0.5)
    ymin = np.nanmin(lowp)
    ymax = np.nanmax(highp)
    pad = (ymax - ymin) * 0.05 if ymax > ymin else 1.0
    ax.set_ylim(ymin - pad, ymax + pad)
    ax.grid(True, linestyle="--", alpha=0.2)
    ax.set_title(title or "K線圖", fontsize=14)

    axv.set_ylim(0, np.nanmax(vol) * 3/2 if np.nanmax(vol) > 0 else 1.0)
    axv.grid(True, linestyle="--", alpha=0.15)
    axv.set_ylabel("Volume")

    xticks_pos = np.linspace(0, len(df)-1, num=min(8, len(df))).astype(int) if len(df) > 0 else []
    xtick_labels = [str(df.index[i].date()) for i in xticks_pos] if len(df)>0 else []
    ax.set_xticks(xticks_pos)
    ax.set_xticklabels(xtick_labels, rotation=0, ha="center")
    axv.set_xticks(xticks_pos)
    axv.set_xticklabels(xtick_labels, rotation=0, ha="center")

    ax.legend(loc="upper left", fontsize=9, ncol=3, frameon=False)

    png = _to_png_bytes(fig)
    plt.close(fig)

    meta = {"width": 1200, "height": 700, "xmax": len(df)-1}
    return png, meta

def overlay_bboxes_on_image(png_bytes: bytes, boxes: List[Dict]) -> bytes:
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    w, h = im.size
    draw = ImageDraw.Draw(im, "RGBA")
    for b in boxes:
        bbox = b.get("bbox") or {}
        x = max(0.0, min(1.0, float(bbox.get("x", 0))))
        y = max(0.0, min(1.0, float(bbox.get("y", 0))))
        bw = max(0.0, min(1.0, float(bbox.get("w", 0))))
        bh = max(0.0, min(1.0, float(bbox.get("h", 0))))
        x1 = int(x * w); y1 = int(y * h)
        x2 = int((x + bw) * w); y2 = int((y + bh) * h)
        draw.rectangle([x1, y1, x2, y2], outline=(255,0,0,255), width=3)
        draw.rectangle([x1, y1, x2, y2], fill=(255,0,0,60))
    out = io.BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()
