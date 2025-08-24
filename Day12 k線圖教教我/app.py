
import os, re, json
from datetime import date, timedelta, datetime
import streamlit as st
from dotenv import load_dotenv

# Import plotting as module so monkey-patch can take effect
import utils.plotting as plotting
from utils.data_loader import fetch_history_safely, add_indicators, normalize_ticker
from utils.vision import openai_stream_vision, mask_json_for_display, parse_items_debug
from utils.overlay_patch import apply_overlay_outline_patch

# Apply outline-only bbox overlay
apply_overlay_outline_patch()

load_dotenv(override=False)
st.set_page_config(page_title="K線圖教教我（台股版）", layout="wide")

# ---------------- Sidebar nav ----------------
PAGES = ["首頁", "小卡教學"]
page = st.sidebar.radio("導覽", PAGES)

# ---------------- Common state ----------------
if "data" not in st.session_state: st.session_state["data"] = None
if "symbol" not in st.session_state: st.session_state["symbol"] = normalize_ticker("2330.TW")
if "png" not in st.session_state: st.session_state["png"] = None
if "ai_items" not in st.session_state: st.session_state["ai_items"] = []
if "prose" not in st.session_state: st.session_state["prose"] = ""
if "debug_last" not in st.session_state: st.session_state["debug_last"] = {}
if "input_sig" not in st.session_state: st.session_state["input_sig"] = ""
if "data_sig" not in st.session_state: st.session_state["data_sig"] = ""
if "items_sig" not in st.session_state: st.session_state["items_sig"] = ""

# ---------------- Page: 首頁 ----------------
if page == "首頁":
    st.title("K線圖教教我（台股版）")
    st.caption("教學用途，非投資建議。")

    with st.sidebar:
        st.subheader("參數")
        default_symbol = "2330.TW"
        user_symbol = st.text_input("股票代號（台股）", value=default_symbol)
        today = date.today()
        start = st.date_input("開始日期", value=today - timedelta(days=365))
        end   = st.date_input("結束日期", value=today)
        fetch_clicked = st.button("📥 抓資料", type="primary")

        st.subheader("圖層")
        ma5 = st.checkbox("MA5", True);   ma20 = st.checkbox("MA20", True)
        ma60= st.checkbox("MA60", True);  ma120= st.checkbox("MA120", True)
        ma240=st.checkbox("MA240（年線）", True)

        st.subheader("AI 視覺解讀")
        model = st.selectbox("模型", ["gpt-4o","gpt-4o-mini"], index=0)
        analyze_clicked = st.button("🔍 串流視覺解讀（中文）")

        st.subheader("🧪 Debug")
        debug_mode = st.checkbox("顯示解析日誌", False)

    # --- Detect input changes and clear AI outputs immediately ---
    current_input_sig = f"{normalize_ticker(user_symbol)}|{str(start)}|{str(end)}"
    if st.session_state["input_sig"] != current_input_sig:
        st.session_state["input_sig"] = current_input_sig
        st.session_state["ai_items"] = []
        st.session_state["prose"] = ""
        st.session_state["debug_last"] = {}

    # Fetch
    if fetch_clicked:
        st.session_state["ai_items"] = []
        st.session_state["items_sig"] = ""
        with st.spinner("下載資料中…"):
            df, used_symbol = fetch_history_safely(user_symbol, str(start), str(end + timedelta(days=1)))
            if df is None or df.empty:
                st.error(f"抓資料失敗：{user_symbol}。")
            else:
                df = add_indicators(df)
                st.session_state["data"] = df
                st.session_state["symbol"] = used_symbol
                st.session_state["data_sig"] = st.session_state["input_sig"]
                st.success(f"已取得 {used_symbol} 的 {len(df)} 筆日資料。")

    df = st.session_state.get("data")
    col_left, col_right = st.columns([7,5])

    # Chart
    with col_left:
        if st.session_state["data_sig"] and st.session_state["data_sig"] != st.session_state["input_sig"]:
            st.info("查詢條件已變更，請按「📥 抓資料」以更新圖表與分析。")
        if df is not None and not df.empty:
            try:
                png, meta = plotting.plot_kline_with_volume(
                    df,
                    show_ma=[win for win,flag in zip([5,20,60,120,240],[ma5,ma20,ma60,ma120,ma240]) if flag],
                    title=st.session_state["symbol"]
                )
                st.session_state["png"] = png
                st.image(png, caption=f"{st.session_state['symbol']}  K 線（上漲紅、下跌綠；下方為量能）", use_container_width=True)
            except Exception as e:
                st.exception(e)
        else:
            st.info("請在左側輸入代號與日期並抓資料。")

    # Streaming prose
    with col_right:
        st.subheader("視覺解讀主文（中文串流）")
        st.caption("模型會先輸出主文，接著輸出 '=@ai===' 後的 JSON（不顯示在此）。")
        prose_placeholder = st.empty()
        if analyze_clicked:
            if st.session_state.get("png") is None:
                st.warning("請先抓資料。")
            else:
                st.session_state["ai_items"] = []
                st.session_state["items_sig"] = ""
                chunks = []
                with st.spinner("串流中…"):
                    for piece in openai_stream_vision(st.session_state["png"], model=model):
                        chunks.append(piece)
                        display = mask_json_for_display("".join(chunks))
                        prose_placeholder.markdown(display)
                full_text = "".join(chunks)
                st.session_state["prose"] = full_text

                if st.session_state.get("data_sig") == st.session_state.get("input_sig"):
                    items, dbg = parse_items_debug(full_text)
                    st.session_state["ai_items"] = items
                    st.session_state["items_sig"] = st.session_state["data_sig"]
                    st.session_state["debug_last"] = dbg
                    # Logs
                    try:
                        os.makedirs("logs", exist_ok=True)
                        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                        sym = st.session_state.get("symbol","NA").replace("/", "-")
                        base = f"logs/{ts}_{sym}_{model}"
                        with open(base + "_raw.txt", "w", encoding="utf-8") as f:
                            f.write(full_text)
                        if dbg.get("raw_payload"):
                            with open(base + "_payload.json", "w", encoding="utf-8") as f:
                                f.write(dbg["raw_payload"])
                        with open(base + "_items.json", "w", encoding="utf-8") as f:
                            json.dump(items, f, ensure_ascii=False, indent=2)
                    except Exception as e:
                        st.warning(f"無法寫入 logs：{e}")
                else:
                    st.info("分析期間查詢條件已變更，已忽略本次 AI 結果。請重新抓資料並再次分析。")

    # Left: features + debug
    with col_left:
        items = st.session_state.get("ai_items", [])
        if items and st.session_state.get("png") and st.session_state.get("items_sig") == st.session_state.get("data_sig") == st.session_state.get("input_sig"):
            st.subheader(f"視覺特徵抽取（共 {len(items)} 項）")
            for i, it in enumerate(items, 1):
                with st.expander(f"{i}. {it.get('title','(無題)')} 〔{it.get('type','')}〕 置信度 {it.get('confidence',0):.2f}"):
                    st.write(it.get("explanation",""))
                    ov = plotting.overlay_bboxes_on_image(st.session_state["png"], [it])
                    st.image(ov, use_container_width=True)
        elif df is not None and not df.empty and st.session_state.get("data_sig") != st.session_state.get("input_sig"):
            st.info("條件已更新，圖表尚未同步，特徵抽取暫不顯示。")
        elif st.session_state.get("prose") and not items:
            st.info("串流已完成，但未能解析出特徵項目。可開啟 Debug 檢視模型回傳內容。")

        if debug_mode:
            st.subheader("解析日誌（Debug）")
            dbg = st.session_state.get("debug_last", {})
            st.write("方法:", dbg.get("method","(未知)"), "  解析階段:", dbg.get("stage","(未解析)"))
            if dbg.get("error"):
                st.error(dbg["error"])
            if "parsed_items" in dbg:
                st.write(f"parsed_items={dbg.get('parsed_items')}")
            with st.expander("顯示原始串流全文"):
                st.code(st.session_state.get("prose","")[:12000])
            if dbg.get("raw_payload"):
                with st.expander("顯示擷取到的 JSON payload（截斷顯示）"):
                    st.code(dbg["raw_payload"][:12000], language="json")
            if os.path.isdir("logs"):
                files = sorted([f for f in os.listdir("logs") if f.endswith(('.txt','.json'))], reverse=True)[:10]
                for fn in files:
                    with open(os.path.join("logs", fn), "r", encoding="utf-8", errors="ignore") as f:
                        data = f.read()
                    st.download_button(f"下載 {fn}", data, file_name=fn)

# ---------------- Page: 小卡教學 ----------------
elif page == "小卡教學":
    from components.flashcards import ensure_flashcard_svgs
    st.title("K線術語小卡（互動教學）")
    st.caption("這裡只展示術語示意，實戰請回首頁搭配圖上 bbox 教學。")
    svg_paths = ensure_flashcard_svgs(os.path.join("assets","flashcards"))
    for key, fn in svg_paths.items():
        with open(fn, "r", encoding="utf-8") as f:
            st.markdown(f.read(), unsafe_allow_html=True)

# ---------------- Footer ----------------
st.write("---")
st.caption("若瀏覽器 console 顯示 `preventOverflow/hide` 警告：這是前端 Popper 的提示，不影響功能。此版程式未使用 popper/tippy，升級 Streamlit 一般可消除。")
