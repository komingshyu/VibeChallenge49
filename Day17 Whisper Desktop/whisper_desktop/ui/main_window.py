import os, numpy as np, traceback, importlib.util, soundfile as sf, time
from typing import List
from PySide6.QtWidgets import (QMainWindow, QWidget, QTabWidget, QFileDialog, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QComboBox,
                               QCheckBox, QTextEdit, QProgressBar, QLineEdit, QGroupBox, QMessageBox, QRadioButton, QFormLayout, QListWidget, QListWidgetItem, QTableWidget, QTableWidgetItem)
from PySide6.QtCore import Qt, Signal, QThread, QObject, QTimer
from ..config.settings import AppSettings, LANG_TO_INIT_PROMPT
from ..backend.logger_setup import setup_logger
from ..backend import audio_utils, vad as vad_mod
from ..backend.model_manager import ModelManager
from ..backend.transcriber import Transcriber, Segment
from ..backend.mic_stream import MicStream
from ..backend.project_io import create_project, save_wav, write_subs, maybe_burn_subs, list_assets
from ..backend.polisher import polish_sentence
from ..backend.diarization_optional import diarize_file, assign_speaker_for_segment, DiarizationAuthError
from .widgets.player import PlayerWidget

class WorkerSignals(QObject):
    progress = Signal(int,int); message = Signal(str); error = Signal(str); artifact = Signal(str); segment = Signal(object); done = Signal(object)

class TranscribeWorker(QThread):
    def __init__(self, input_path: str, settings: AppSettings, logger, project_dir: str, use_polished_for_files: bool):
        super().__init__(); self.input_path=input_path; self.settings=settings; self.logger=logger; self.project_dir=project_dir; self.use_polished_for_files=use_polished_for_files; self.signals=WorkerSignals()

    def run(self):
        try:
            self.signals.message.emit("抽取音訊...")
            wav = audio_utils.extract_audio(self.input_path, 16000, True)
            audio, sr = audio_utils.read_audio(wav)
            try: path_ex=os.path.join(self.project_dir,"extracted.wav"); save_wav(path_ex, audio, sr); self.signals.message.emit("已保存：extracted.wav"); self.signals.artifact.emit(path_ex)
            except Exception: pass
            if self.settings.enable_denoise:
                self.signals.message.emit("雜訊抑制（noisereduce）...")
                try:
                    import noisereduce as nr
                    audio = nr.reduce_noise(y=audio, sr=sr, stationary=False)
                    path_dn=os.path.join(self.project_dir,"denoised.wav"); save_wav(path_dn, audio, sr); self.signals.message.emit("已保存：denoised.wav"); self.signals.artifact.emit(path_dn)
                except Exception: self.signals.message.emit("去噪不可用，跳過。")
            if self.settings.enable_demucs:
                self.signals.message.emit("人聲分離（Demucs）...")
                try:
                    from ..backend.demucs_optional import separate_vocals
                    voc = separate_vocals(wav)
                    if voc and os.path.exists(voc):
                        dst=os.path.join(self.project_dir,"vocals.wav")
                        import shutil; shutil.copy2(voc, dst)
                        y, sr2 = audio_utils.read_audio(dst)
                        audio, sr = audio_utils.resample_audio(y, sr2, 16000)
                        self.signals.message.emit("採用人聲分離結果（磁碟保留原SR，供播放器/pyannote），轉錄使用 16k 版本。"); self.signals.artifact.emit(dst)
                except Exception: self.signals.message.emit("Demucs 不可用，跳過。")
            self.signals.message.emit("語音活動檢測（VAD）...")
            segs = vad_mod.detect_segments(audio, sr, threshold=self.settings.vad_threshold, min_speech=self.settings.min_speech_duration, max_silence=self.settings.max_silence_duration)
            if not segs: segs=[(0.0,len(audio)/sr)]
            self.signals.message.emit(f"載入/檢查模型：{self.settings.model_size}（faster-whisper）...")
            mm=ModelManager(cache_dir="./.whisper_models"); mm.ensure_download(self.settings.model_size, progress_cb=lambda d,t:self.signals.progress.emit(d,t))
            model=mm.load(self.settings.model_size, self.settings.compute_type); tr=Transcriber(model)
            diar=None
            if self.settings.diarization:
                self.signals.message.emit("說話人分離（pyannote）中...")
                try:
                    diar=diarize_file(os.path.join(self.project_dir,"vocals.wav")) or diarize_file(os.path.join(self.project_dir,"extracted.wav"))
                    if diar: self.signals.message.emit("已載入說話人區段")
                    else: self.signals.message.emit("說話人分離不可用或失敗，跳過。")
                except DiarizationAuthError as e:
                    self.signals.message.emit(str(e))
                except Exception as e:
                    self.signals.message.emit(f"[說話人分離失敗] {e}")
            collected=[]; ctx=[]
            for (s,e) in segs:
                chunk=audio[int(s*sr):int(e*sr)]
                for sg in tr.iter_transcribe(chunk, sr, self.settings.language, self.settings.init_prompt):
                    sg.start += s; sg.end += s
                    if diar: sg.speaker = assign_speaker_for_segment(sg.start, sg.end, diar)
                    if self.settings.enable_polish:
                        sg.polished = polish_sentence(sg.text, ctx, language_tag=self.settings.init_prompt); ctx.append(sg.polished or sg.text)
                    collected.append(sg)
                    try: write_subs(self.project_dir, collected, use_polished=self.use_polished_for_files)
                    except Exception: pass
                    self.signals.segment.emit(sg)
            try:
                ext=os.path.splitext(self.input_path)[1].lower()
                if ext in [".mp4",".mov",".mkv",".webm",".m4v",".avi"]:
                    outp=os.path.join(self.project_dir,"subtitled.mp4")
                    if maybe_burn_subs(self.input_path, os.path.join(self.project_dir,"subtitles.srt"), outp):
                        self.signals.message.emit("已產生：subtitled.mp4"); self.signals.artifact.emit(outp)
                    else: self.signals.message.emit("FFmpeg 未安裝 libass 或環境受限，已輸出 SRT/VTT。")
            except Exception: pass
            self.signals.done.emit(collected)
        except Exception as e:
            self.logger.exception("轉錄失敗"); self.signals.error.emit(str(e))

# ---- LiveWorker：非阻塞、滑窗、排程推論 ----
class LiveWorker(QThread):
    text_partial = Signal(str); text_final = Signal(str); amp = Signal(float); status = Signal(str)

    def __init__(self, settings: AppSettings, logger, project_dir: str):
        super().__init__()
        self.settings=settings; self.logger=logger; self.project_dir=project_dir
        self._running=False

    def stop(self):
        self._running=False

    def run(self):
        import numpy as np, time, threading, queue, soundfile as sf
        try:
            self.status.emit("載入/檢查模型...")
            mm=ModelManager(cache_dir="./.whisper_models"); mm.ensure_download(self.settings.model_size, progress_cb=lambda d,t: None)
            model=mm.load(self.settings.model_size, self.settings.compute_type); tr=Transcriber(model)
            self.status.emit("啟動麥克風...")
            mic=MicStream(samplerate=16000, block_size=1024); mic.start()
            wav_path=os.path.join(self.project_dir,"live.wav")
            sfw=sf.SoundFile(wav_path, mode="w", samplerate=16000, channels=1, subtype="PCM_16")
            model_vad, get_speech_timestamps, VADIterator, collect_chunks = vad_mod.load_silero_vad()
            vad_iter=None
            if model_vad and VADIterator:
                try: vad_iter = VADIterator(model_vad, sampling_rate=16000)
                except TypeError: vad_iter = VADIterator(model_vad)

            win_len = int(16000*3.5); hop_len = int(16000*0.6)
            ring = np.zeros(win_len, dtype=np.float32); filled=0

            import queue as _q
            task_q = _q.Queue(maxsize=1)
            def _put_task(tk):
                try:
                    task_q.get_nowait()
                except Exception:
                    pass
                try:
                    task_q.put_nowait(tk)
                except Exception:
                    pass

            def decoder_loop():
                ctx=[]; last_partial=""
                while self._running or (not task_q.empty()):
                    try:
                        kind, audio = task_q.get(timeout=0.2)
                    except Exception:
                        continue
                    if kind=="partial":
                        try:
                            text=""
                            for sg in tr.iter_transcribe(audio, 16000, self.settings.language, self.settings.init_prompt):
                                t=(sg.text or "").strip()
                                if t: text=t
                            if text and text!=last_partial:
                                last_partial=text
                                self.text_partial.emit(text)
                        except Exception as e:
                            self.status.emit(f"[部分推論錯誤] {e}")
                    else:
                        try:
                            lines=[]
                            for sg in tr.iter_transcribe(audio, 16000, self.settings.language, self.settings.init_prompt):
                                t=(sg.text or '').strip()
                                if t: lines.append(t)
                            if lines:
                                text=' '.join(lines)
                                if self.settings.enable_polish:
                                    text = polish_sentence(text, ctx, language_tag=self.settings.init_prompt)
                                if text:
                                    ctx.append(text)
                                    self.text_final.emit(text)
                        except Exception as e:
                            self.status.emit(f"[定稿推論錯誤] {e}")

            self._running=True
            tdec = threading.Thread(target=decoder_loop, daemon=True); tdec.start()

            speaking=False; silence_start=None
            min_active_s = 0.5
            min_final_len_s = 0.7
            last_partial_time=0.0

            while self._running:
                chunk = mic.read_chunk(timeout=0.5)
                if chunk is None: continue
                sfw.write(chunk)
                rms=float(np.sqrt((chunk**2).mean()+1e-9)); self.amp.emit(min(1.0, max(0.0, rms*25)))

                if filled+len(chunk) <= win_len:
                    ring[filled:filled+len(chunk)] = chunk; filled += len(chunk)
                else:
                    shift = hop_len
                    ring[:-shift] = ring[shift:]
                    ring[-len(chunk):] = chunk[-min(len(chunk), shift):]
                    filled = min(win_len, filled + len(chunk) - shift)

                active = rms > 0.01
                if vad_iter:
                    try:
                        state = vad_iter(chunk)
                        if isinstance(state, dict): active = bool(state.get('start') is not None or state.get('end') is None)
                        else: active = bool(state)
                    except Exception: pass

                now=time.time()
                if active:
                    if not speaking:
                        speaking=True; silence_start=None
                    if filled/16000.0 >= min_active_s and (now - last_partial_time) > 0.5:
                        last_partial_time = now
                        _put_task(("partial", ring[:filled].copy()))
                else:
                    if speaking and silence_start is None:
                        silence_start = now
                    if silence_start and (now - silence_start) > max(1.0, self.settings.max_silence_duration):
                        speaking=False; silence_start=None; filled=0
                        continue
                    if speaking and silence_start and (now - silence_start) > max(0.35, self.settings.max_silence_duration*0.6):
                        speaking=False
                        if filled/16000.0 >= min_final_len_s:
                            _put_task(("final", ring[:filled].copy()))
                        filled=0
                time.sleep(0.002)

            mic.stop(); sfw.close(); self.status.emit(f"已停止，錄音保存：{wav_path}")
        except Exception as e:
            self.logger.exception("即時轉錄失敗"); self.status.emit(f"[錯誤] {e}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__(); self.setWindowTitle("WhisperDesktop"); self.resize(1320,900)
        self.logger=setup_logger("./logs"); self.settings=AppSettings()
        self.tabs=QTabWidget(self); self.setCentralWidget(self.tabs)
        self.file_tab=QWidget(); self.tabs.addTab(self.file_tab,"文件轉錄"); self._init_file_tab()
        self.live_tab=QWidget(); self.tabs.addTab(self.live_tab,"即時轉錄"); self._init_live_tab()
        self.settings_tab=QWidget(); self.tabs.addTab(self.settings_tab,"設定 / 下載"); self._init_settings_tab()
        with open(os.path.join(os.path.dirname(__file__), "theme.qss"), "r", encoding="utf-8") as f: self.setStyleSheet(f.read())
        self._pos_timer=QTimer(self); self._pos_timer.timeout.connect(self._highlight_current_row_safe); self._pos_timer.start(200)

    # ---------- 文件轉錄頁
    def _init_file_tab(self):
        layout=QVBoxLayout(self.file_tab)
        row1=QHBoxLayout()
        self.lang_cb=QComboBox(); self.lang_cb.addItems(list(LANG_TO_INIT_PROMPT.keys())); self.lang_cb.setCurrentText(self.settings.language); self.lang_cb.currentTextChanged.connect(self._on_lang_changed)
        self.open_btn=QPushButton("選擇檔案"); self.start_btn=QPushButton("開始轉錄")
        self.q_denoise=QCheckBox("去噪"); self.q_demucs=QCheckBox("人聲分離"); self.q_diar=QCheckBox("說話人"); self.q_polish=QCheckBox("潤飾")
        self.q_denoise.setChecked(self.settings.enable_denoise); self.q_demucs.setChecked(self.settings.enable_demucs); self.q_diar.setChecked(self.settings.diarization); self.q_polish.setChecked(self.settings.enable_polish)
        self.open_out_btn=QPushButton("開啟輸出資料夾"); self.open_project_btn=QPushButton("開啟專案")
        for w in [QLabel("語言"), self.lang_cb, self.open_btn, self.start_btn, self.q_denoise, self.q_demucs, self.q_diar, self.q_polish, self.open_out_btn, self.open_project_btn]:
            row1.addWidget(w)
        row1.addStretch(1); layout.addLayout(row1)

        layout.addWidget(QLabel("初始 Prompt："))
        self.init_prompt_edit=QLineEdit(self.settings.init_prompt); layout.addWidget(self.init_prompt_edit)

        mid=QHBoxLayout()
        left=QVBoxLayout()
        self.player=PlayerWidget(self.file_tab); self.player.setMinimumWidth(900); self.player.setMinimumHeight(460); left.addWidget(self.player, 9)
        left.addWidget(QLabel("資產列表（包含原始媒體）"))
        self.asset_list=QListWidget(); self.asset_list.setMaximumHeight(64); left.addWidget(self.asset_list)
        mid.addLayout(left, 7)

        right=QVBoxLayout()
        tools=QHBoxLayout()
        self.use_polished_cb=QCheckBox("使用潤飾稿"); self.use_polished_cb.setChecked(True)
        self.export_srt_btn=QPushButton("輸出 SRT"); self.export_vtt_btn=QPushButton("輸出 VTT"); self.export_srt_btn.setEnabled(False); self.export_vtt_btn.setEnabled(False)
        for w in [self.use_polished_cb, self.export_srt_btn, self.export_vtt_btn]: tools.addWidget(w)
        tools.addStretch(1); right.addLayout(tools)
        self.seg_table=QTableWidget(0,5); self.seg_table.setHorizontalHeaderLabels(["開始","結束","說話人","原始","潤飾"]); self.seg_table.setMinimumHeight(520)
        self.seg_table.setColumnHidden(2, not self.q_diar.isChecked())
        right.addWidget(self.seg_table, 10)
        mid.addLayout(right, 8)
        layout.addLayout(mid)

        self.progress=QProgressBar(); self.progress.setRange(0,1); self.progress.setValue(0); layout.addWidget(self.progress)
        layout.addWidget(QLabel("即時事件："))
        self.log=QTextEdit(); self.log.setReadOnly(True); self.log.setMaximumHeight(120); layout.addWidget(self.log)

        self.open_btn.clicked.connect(self._choose_file); self.start_btn.clicked.connect(self._start_transcribe)
        self.export_srt_btn.clicked.connect(self._export_srt); self.export_vtt_btn.clicked.connect(self._export_vtt)
        self.open_out_btn.clicked.connect(self._open_output_dir); self.open_project_btn.clicked.connect(self._open_project)
        self.asset_list.itemClicked.connect(lambda it: self.player.load_media(it.data(Qt.UserRole), autoplay=True))
        self.init_prompt_edit.textChanged.connect(lambda t: setattr(self.settings, "init_prompt", t))

        self.q_demucs.stateChanged.connect(lambda s: self._maybe_install_for_feature("demucs", s==Qt.Checked))
        self.q_diar.stateChanged.connect(lambda s: self._maybe_install_for_feature("diar", s==Qt.Checked))

        def _sync_quick():
            self.settings.enable_denoise=self.q_denoise.isChecked(); self.settings.enable_demucs=self.q_demucs.isChecked(); self.settings.diarization=self.q_diar.isChecked(); self.settings.enable_polish=self.q_polish.isChecked()
            self.seg_table.setColumnHidden(2, not self.settings.diarization)
            self._append_log(f"[設定] 去噪={self.settings.enable_denoise} 人聲分離={self.settings.enable_demucs} 說話人={self.settings.diarization} 潤飾={self.settings.enable_polish}（將在下一次轉錄時生效）")
        for cb in [self.q_denoise,self.q_demucs,self.q_diar,self.q_polish]: cb.stateChanged.connect(lambda _:_sync_quick())

        self.file_path=None; self.project_dir=None; self.project_id=None; self._export_cache=[]; self._last_row=-1

    def _maybe_install_for_feature(self, feat: str, enabling: bool):
        if not enabling: return
        missing=[]
        if feat=="demucs":
            import importlib.util
            for m in ["demucs","torch"]:
                if importlib.util.find_spec(m) is None: missing.append(m)
        elif feat=="diar":
            import importlib.util
            for m in ["pyannote.audio","torch"]:
                if importlib.util.find_spec(m) is None: missing.append(m)
        if not missing: return
        ans = QMessageBox.question(self, "需要安裝選配", f"功能需要套件：{', '.join(missing)}\n是否立即安裝？（會在背景安裝並輸出日誌）")
        if ans != QMessageBox.Yes:
            if feat=="demucs": self.q_demucs.setChecked(False)
            if feat=="diar": self.q_diar.setChecked(False)
            return
        self._append_log(f"安裝選配中：{missing}")
        self.progress.setRange(0,0); self.progress.setValue(0)
        self.pip_worker = PipInstallWorker(missing); self.pip_worker.message.connect(self._append_log)
        def _done(code): self._append_log(f"[完成] 安裝退出碼 {code}"); self.progress.setRange(0,1); self.progress.setValue(1)
        self.pip_worker.done.connect(_done); self.pip_worker.start()

    def _reset_for_new_file(self, path: str):
        self.seg_table.setRowCount(0); self.asset_list.clear(); self._export_cache=[]; self._last_row=-1; self.player.set_segments([])
        self.project_id, self.project_dir = create_project(path, base_dir=self.settings.save_dir)
        self._append_log(f"[專案建立] {self.project_id} → {self.project_dir}")
        self._refresh_assets()

    def _choose_file(self):
        path,_=QFileDialog.getOpenFileName(self,"選擇音訊或影片","","Media Files (*.wav *.mp3 *.m4a *.flac *.mp4 *.mov *.mkv *.webm)")
        if path:
            self.file_path=path; self._reset_for_new_file(path)
            self.player.load_media(path, autoplay=True); self._append_log(f"載入：{path}")
            self.progress.setRange(0,1); self.progress.setValue(0)
            try:
                wav_tmp=audio_utils.extract_audio(self.file_path,16000,True)
                y, sr = sf.read(wav_tmp)
                if getattr(y,'ndim',1)==2: y=y.mean(axis=1)
                import numpy as np
                frame=1024; hop=256
                if len(y) > frame:
                    env=np.array([float(np.sqrt((y[i:i+frame]**2).mean()+1e-9)) for i in range(0,len(y)-frame,hop)], dtype=float)
                    dur=len(y)/float(sr)
                    self.player.set_envelope(env, dur)
            except Exception as e: self._append_log(f"[警告] 無法建立音量視覺化：{e}")

    def _open_project(self):
        dirpath=QFileDialog.getExistingDirectory(self,"選擇專案資料夾", self.settings.save_dir)
        if not dirpath: return
        self.project_dir=dirpath; self.project_id=os.path.basename(dirpath.rstrip("\/")); self._append_log(f"[開啟專案] {self.project_id}")
        self._refresh_assets()
        srt=os.path.join(dirpath,"subtitles.srt")
        if os.path.exists(srt):
            try:
                import srt
                with open(srt,"r",encoding="utf-8") as f: subs=list(srt.parse(f.read()))
                self.seg_table.setRowCount(0); self._export_cache=[]
                for sub in subs:
                    row=self.seg_table.rowCount(); self.seg_table.insertRow(row)
                    self.seg_table.setItem(row,0,QTableWidgetItem(f"{sub.start.total_seconds():.2f}"))
                    self.seg_table.setItem(row,1,QTableWidgetItem(f"{sub.end.total_seconds():.2f}"))
                    self.seg_table.setItem(row,2,QTableWidgetItem(""))
                    self.seg_table.setItem(row,3,QTableWidgetItem(sub.content)); self.seg_table.setItem(row,4,QTableWidgetItem(""))
                media=None
                for cand in ["subtitled.mp4"]+ [fn for fn in os.listdir(dirpath) if fn.startswith("original.")] + ["extracted.wav"]:
                    p=os.path.join(dirpath, cand)
                    if os.path.exists(p): media=p; break
                if media: self.player.load_media(media, autoplay=True)
            except Exception as e: self._append_log(f"[警告] 載入專案字幕失敗：{e}")

    def _ensure_hf_token(self) -> bool:
        import sys, webbrowser
        token = os.environ.get("HF_TOKEN")
        if token: return True
        self._append_log("[提示] 未偵測到 HF_TOKEN，說話人分離需要 Hugging Face Access Token。")
        from PySide6.QtWidgets import QInputDialog
        ok=False; text=""
        try:
            text, ok = QInputDialog.getText(self, "設定 HF_TOKEN", "請在此貼上從 hf.co 取得的 Access Token：")
        except Exception: ok=False
        if not ok or not text.strip():
            self._append_log("[警告] 使用者未提供 HF_TOKEN，將跳過說話人分離。")
            return False
        os.environ["HF_TOKEN"] = text.strip()
        self._append_log("[完成] 已於本次執行環境設定 HF_TOKEN。")
        from PySide6.QtWidgets import QMessageBox
        ans = QMessageBox.question(self, "寫入系統環境變數", "是否將 HF_TOKEN 寫入系統環境變數（Windows 會使用 setx）？")
        if ans == QMessageBox.Yes:
            try:
                if sys.platform.startswith("win"):
                    import subprocess
                    subprocess.run(["setx","HF_TOKEN", text.strip()], check=True)
                    self._append_log("[完成] 已寫入系統環境變數（Windows）。重新開啟應用後生效。")
                else:
                    self._append_log("請手動將以下內容加入你的 shell 啟動檔：\nexport HF_TOKEN='"+text.strip()+"'")
            except Exception as e:
                self._append_log(f"[錯誤] 寫入系統環境變數失敗：{e}")
        self._append_log("若載入失敗，請至 https://hf.co/pyannote/speaker-diarization 接受使用條款，並在 https://hf.co/settings/tokens 檢查 Token。")
        try: webbrowser.open("https://hf.co/pyannote/speaker-diarization")
        except Exception: pass
        return True

    def _start_transcribe(self):
        if not self.file_path: self._append_log("請先選擇檔案"); return
        if self.q_diar.isChecked():
            if not self._ensure_hf_token():
                self.q_diar.setChecked(False); self.settings.diarization=False; self._append_log("[提示] 已關閉『說話人』功能（缺少 HF_TOKEN）。")
        self.settings.init_prompt=self.init_prompt_edit.text()
        self.progress.setRange(0,0); self.progress.setValue(0)
        self.worker=TranscribeWorker(self.file_path, self.settings, self.logger, self.project_dir, self.use_polished_cb.isChecked())
        self.worker.signals.progress.connect(self._on_progress); self.worker.signals.message.connect(self._append_log)
        self.worker.signals.error.connect(self._on_error); self.worker.signals.artifact.connect(self._on_artifact); self.worker.signals.segment.connect(self._on_segment); self.worker.signals.done.connect(self._on_done); self.worker.start()

    def _on_progress(self,d,t):
        if t<=0: self.progress.setRange(0,0); self.progress.setValue(0)
        else:
            if self.progress.maximum()!=1000: self.progress.setRange(0,1000)
            self.progress.setValue(min(max(int(1000*d/max(t,1)),0),1000))

    def _append_log(self, msg:str): self.log.append(str(msg))

    def _on_artifact(self, path: str):
        if not path: return
        it=QListWidgetItem(os.path.basename(path)); it.setData(Qt.UserRole, os.path.abspath(path)); self.asset_list.addItem(it)

    def _on_segment(self, sg: Segment):
        row=self.seg_table.rowCount(); self.seg_table.insertRow(row)
        self.seg_table.setItem(row,0,QTableWidgetItem(f"{sg.start:.2f}"))
        self.seg_table.setItem(row,1,QTableWidgetItem(f"{sg.end:.2f}"))
        self.seg_table.setItem(row,2,QTableWidgetItem(sg.speaker or ""))
        self.seg_table.setItem(row,3,QTableWidgetItem(sg.text))
        self.seg_table.setItem(row,4,QTableWidgetItem(sg.polished or ""))
        self._export_cache.append(sg)
        shown=[]; 
        for s in self._export_cache:
            text=s.polished or s.text
            if s.speaker: text=f"{s.speaker}: {text}"
            shown.append((s.start,s.end,text))
        self.player.set_segments(shown)

    def _on_done(self, segments: List[Segment]):
        self._append_log(f"完成，共 {len(segments)} 段")
        self.progress.setRange(0,1); self.progress.setValue(1); self.export_srt_btn.setEnabled(True); self.export_vtt_btn.setEnabled(True)
        self.player.rewind_and_play(); self._refresh_assets()

    def _on_error(self, err: str):
        self._append_log("[錯誤] " + str(err)); self.progress.setRange(0,1); self.progress.setValue(0)

    def _on_lang_changed(self, name: str):
        self.settings.apply_language(name); self.init_prompt_edit.setText(self.settings.init_prompt)
        self._append_log(f"已設定語言：{name} / init_prompt: {self.settings.init_prompt}")

    def _export_srt(self):
        if not self._export_cache: self._append_log("尚無可匯出的字幕"); return
        from ..backend.srt_writer import to_srt
        path,_=QFileDialog.getSaveFileName(self,"另存 SRT","","SRT Files (*.srt)")
        if path:
            text=to_srt(self._export_cache, use_polished=self.use_polished_cb.isChecked())
            with open(path,"w",encoding="utf-8") as f: f.write(text); self._append_log(f"已匯出：{path}")

    def _export_vtt(self):
        if not self._export_cache: self._append_log("尚無可匯出的字幕"); return
        from ..backend.srt_writer import to_vtt
        path,_=QFileDialog.getSaveFileName(self,"另存 VTT","","WebVTT Files (*.vtt)")
        if path:
            text=to_vtt(self._export_cache, use_polished=self.use_polished_cb.isChecked())
            with open(path,"w",encoding="utf-8") as f: f.write(text); self._append_log(f"已匯出：{path}")

    def _open_output_dir(self):
        import subprocess, sys, os
        if self.project_dir and os.path.exists(self.project_dir):
            path=os.path.abspath(self.project_dir)
            try:
                if sys.platform.startswith("win"):
                    os.startfile(path)
                elif sys.platform=="darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
            except Exception as e:
                self._append_log(f"[錯誤] 開啟輸出資料夾失敗：{e}")
        else:
            self._append_log("目前尚無輸出資料夾。")

    def _refresh_assets(self):
        self.asset_list.clear()
        if self.project_dir and os.path.exists(self.project_dir):
            for p in list_assets(self.project_dir):
                it=QListWidgetItem(os.path.basename(p)); it.setData(Qt.UserRole, os.path.abspath(p)); self.asset_list.addItem(it)

    def _highlight_current_row_safe(self):
        try:
            if not self._export_cache: return
            pos = self.player.media_player.position()/1000.0
            new_row=-1
            for i, s in enumerate(self._export_cache):
                if s.start <= pos <= s.end: new_row=i; break
            if new_row == self._last_row: return
            if 0 <= self._last_row < self.seg_table.rowCount():
                for c in range(self.seg_table.columnCount()):
                    it=self.seg_table.item(self._last_row, c)
                    if it: it.setBackground(Qt.white)
            if 0 <= new_row < self.seg_table.rowCount():
                for c in range(self.seg_table.columnCount()):
                    it=self.seg_table.item(new_row, c)
                    if it: it.setBackground(Qt.yellow)
            self._last_row = new_row
        except Exception as e:
            self._append_log(f"[錯誤] 高亮段落：{e}")

    # ---------- 即時頁
    def _init_live_tab(self):
        layout=QVBoxLayout(self.live_tab)
        top=QHBoxLayout()
        self.live_status=QTextEdit(); self.live_status.setReadOnly(True); self.live_status.setMaximumHeight(140)
        self.live_partial=QTextEdit(); self.live_partial.setReadOnly(True)
        self.live_final=QTextEdit(); self.live_final.setReadOnly(True)
        left=QVBoxLayout(); left.addWidget(QLabel('即時（部分）')); left.addWidget(self.live_partial,3); left.addWidget(QLabel('最終')); left.addWidget(self.live_final,5)
        top.addLayout(left, 7); top.addWidget(self.live_status, 5)
        layout.addLayout(top)
        self.live_player=PlayerWidget(self.live_tab); layout.addWidget(self.live_player)
        bar=QHBoxLayout(); self.live_start_btn=QPushButton("開始"); self.live_stop_btn=QPushButton("停止"); bar.addWidget(self.live_start_btn); bar.addWidget(self.live_stop_btn); layout.addLayout(bar)
        self.live_worker=None
        self.live_start_btn.clicked.connect(self._live_start); self.live_stop_btn.clicked.connect(self._live_stop)

    def _live_start(self):
        if self.live_worker and self.live_worker.isRunning(): return
        pid, pdir = create_project(None, base_dir=self.settings.save_dir); self._append_log(f"[LIVE] 建立：{pid}")
        self.live_worker=LiveWorker(self.settings, self.logger, project_dir=pdir)
        self.live_worker.status.connect(lambda t: self.live_status.append(t))
        self.live_worker.text_partial.connect(lambda t: self.live_partial.setPlainText(t))
        self.live_worker.text_final.connect(lambda t: self.live_final.append(t))
        self.live_worker.amp.connect(lambda a: self.live_player.set_live_amp(a))
        self.live_start_btn.setEnabled(False); self.live_stop_btn.setEnabled(True)
        self.live_worker.finished.connect(lambda: (self.live_start_btn.setEnabled(True), self.live_stop_btn.setEnabled(True)))
        self.live_worker.start()

    def _live_stop(self):
        if self.live_worker:
            try:
                self.live_worker.stop()
                self.live_status.append("要求停止…")
            except Exception as e:
                self.live_status.append(f"[錯誤] 停止請求失敗：{e}")
    def _live_on_segment(self, obj):
            # Backward-compat: accept either str or Segment-like
            try:
                if isinstance(obj, str):
                    text = obj
                else:
                    text = getattr(obj, "text", str(obj))
                if hasattr(self, "live_final"):
                    self.live_final.append(text)
            except Exception as e:
                self._append_log(f"[錯誤] _live_on_segment: {e}")
            if self.live_orch:
                self.live_orch.stop(); self.live_orch=None; self.live_status.append("要求停止…")

    def _init_settings_tab(self):
        layout=QVBoxLayout(self.settings_tab)
        basic=QGroupBox("基本設定"); bl=QHBoxLayout(basic)
        self.backend_local=QRadioButton("本地"); self.backend_cloud=QRadioButton("雲端"); self.backend_local.setChecked(True if self.settings.backend=='local' else False); self.backend_cloud.setChecked(not self.backend_local.isChecked())
        self.mode_batch=QRadioButton("Batch"); self.mode_realtime=QRadioButton("Realtime"); self.mode_batch.setChecked(True if self.settings.mode=='batch' else False); self.mode_realtime.setChecked(not self.mode_batch.isChecked())
        bl.addWidget(QLabel("後端：")); bl.addWidget(self.backend_local); bl.addWidget(self.backend_cloud); bl.addSpacing(16)
        bl.addWidget(QLabel("模式：")); bl.addWidget(self.mode_batch); bl.addWidget(self.mode_realtime); bl.addStretch(1)
        layout.addWidget(basic)
        def _sync_backend(): self.settings.backend='cloud' if self.backend_cloud.isChecked() else 'local'; self.settings.mode='realtime' if self.mode_realtime.isChecked() else 'batch'
        self.backend_local.toggled.connect(lambda _:_sync_backend()); self.backend_cloud.toggled.connect(lambda _:_sync_backend()); self.mode_batch.toggled.connect(lambda _:_sync_backend()); self.mode_realtime.toggled.connect(lambda _:_sync_backend())

        dl=QGroupBox("模型與選配安裝"); dl_l=QHBoxLayout(dl)
        self.download_model_btn=QPushButton("下載模型"); self.install_optional_btn=QPushButton("安裝選配（torch/pyannote/demucs）")
        self.dl_progress=QProgressBar(); self.dl_progress.setRange(0,1); self.dl_progress.setValue(0)
        for w in [self.download_model_btn, self.install_optional_btn, self.dl_progress]: dl_l.addWidget(w)
        layout.addWidget(dl)
        self.download_model_btn.clicked.connect(self._download_model_settings); self.install_optional_btn.clicked.connect(self._install_optional_settings)

        adv=QGroupBox("進階參數"); form=QFormLayout(adv)
        from PySide6.QtWidgets import QComboBox
        self.model_size_cb=QComboBox(); self.model_size_cb.addItems(["tiny","base","small","medium","large-v2","large-v3"]); self.model_size_cb.setCurrentText(self.settings.model_size)
        self.vad_edit=QLineEdit(str(self.settings.vad_threshold)); self.min_speech_edit=QLineEdit(str(self.settings.min_speech_duration)); self.max_silence_edit=QLineEdit(str(self.settings.max_silence_duration))
        form.addRow("模型尺寸", self.model_size_cb); form.addRow("VAD 閾值", self.vad_edit); form.addRow("最短語段（秒）", self.min_speech_edit); form.addRow("最大靜默（秒）", self.max_silence_edit)
        layout.addWidget(adv)
        def _sync_adv():
            self.settings.model_size=self.model_size_cb.currentText()
            try: self.settings.vad_threshold=float(self.vad_edit.text())
            except Exception: pass
            try: self.settings.min_speech_duration=float(self.min_speech_edit.text())
            except Exception: pass
            try: self.settings.max_silence_duration=float(self.max_silence_edit.text())
            except Exception: pass
        self.model_size_cb.currentTextChanged.connect(lambda *_:_sync_adv()); self.vad_edit.textChanged.connect(lambda *_:_sync_adv()); self.min_speech_edit.textChanged.connect(lambda *_:_sync_adv()); self.max_silence_edit.textChanged.connect(lambda *_:_sync_adv())

        self.log_view=QTextEdit(); self.log_view.setReadOnly(True); layout.addWidget(QLabel("應用日誌（logs/app.log）：")); layout.addWidget(self.log_view)
        self.refresh_log_btn=QPushButton("重新整理日誌"); self.refresh_log_btn.clicked.connect(self._refresh_logs); layout.addWidget(self.refresh_log_btn); self._refresh_logs()

    def _download_model_settings(self):
        self.log_view.append(f"開始下載/檢查模型：{self.settings.model_size}")
        self.dl_progress.setRange(0,0); self.dl_progress.setValue(0)
        try:
            mm=ModelManager(cache_dir="./.whisper_models"); mm.ensure_download(self.settings.model_size, progress_cb=lambda d,t: self._dl_progress(d,t))
            self.log_view.append("模型檢查/下載完成。"); self.dl_progress.setRange(0,1); self.dl_progress.setValue(1)
        except Exception as e:
            self.log_view.append(f"[錯誤] 模型下載：{e}"); self.dl_progress.setRange(0,1); self.dl_progress.setValue(0)

    def _dl_progress(self, d, t):
        if t<=0: self.dl_progress.setRange(0,0); self.dl_progress.setValue(0)
        else:
            if self.dl_progress.maximum()!=1000: self.dl_progress.setRange(0,1000)
            self.dl_progress.setValue(min(max(int(1000*d/max(t,1)),0),1000))

    def _install_optional_settings(self):
        self.log_view.append("安裝選配（torch/pyannote.audio/demucs）中..."); self.dl_progress.setRange(0,0); self.dl_progress.setValue(0)
        self.pip_worker = PipInstallWorker(["torch","pyannote.audio","demucs"]); self.pip_worker.message.connect(self.log_view.append)
        def _done(code): self.log_view.append(f"[完成] pip 退出碼 {code}"); self.dl_progress.setRange(0,1); self.dl_progress.setValue(1)
        self.pip_worker.done.connect(_done); self.pip_worker.start()

    def _refresh_logs(self):
        p="./logs/app.log"
        if os.path.exists(p):
            with open(p,"r",encoding="utf-8") as f: self.log_view.setPlainText(f.read())
        else: self.log_view.setPlainText("(尚無日誌)")

class PipInstallWorker(QThread):
    message = Signal(str); done = Signal(int)
    def __init__(self, pkgs: list):
        super().__init__(); self.pkgs=pkgs
    def run(self):
        import subprocess, sys
        try:
            cmd=[sys.executable,"-m","pip","install"]+self.pkgs+["--disable-pip-version-check","--no-input"]
            proc=subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in proc.stdout: self.message.emit(line.rstrip())
            proc.wait(); self.done.emit(proc.returncode)
        except Exception as e:
            self.message.emit(f"[錯誤] pip：{e}"); self.done.emit(1)
