import os
from typing import List, Tuple
from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedLayout, QPushButton, QSlider, QLabel, QHBoxLayout, QSizePolicy
from PySide6.QtCore import Qt, QUrl, QTimer, Signal
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput
from PySide6.QtMultimediaWidgets import QVideoWidget
from .subtitle_overlay import SubtitleOverlay
from .visualizer import VolumeVisualizer
from .lissajous import LissajousWidget

class PlayerWidget(QWidget):
    positionChanged = Signal(int)

    def __init__(self,parent=None):
        super().__init__(parent)
        self.media_player=QMediaPlayer(self); self.audio_out=QAudioOutput(self); self.media_player.setAudioOutput(self.audio_out)
        self.video_widget=QVideoWidget(self); self.video_widget.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.overlay=SubtitleOverlay(self)
        self.visual=VolumeVisualizer(self); self.visual.setMinimumHeight(96)
        self.liss=LissajousWidget(self); self.liss.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding); self.liss.setMinimumHeight(320)
        self.stack=QStackedLayout()
        self.video_container=QWidget(self); v=QVBoxLayout(self.video_container); v.setContentsMargins(0,0,0,0); v.addWidget(self.video_widget)
        self.overlay.setParent(self.video_widget)
        self.stack.addWidget(self.video_container); self.stack.addWidget(self.liss)
        ctrl=QWidget(self); h=QHBoxLayout(ctrl); self.play_btn=QPushButton("播放"); self.pause_btn=QPushButton("暫停"); self.slider=QSlider(Qt.Horizontal); h.addWidget(self.play_btn); h.addWidget(self.pause_btn); h.addWidget(self.slider)
        lay=QVBoxLayout(self); lay.addLayout(self.stack, stretch=10); lay.addWidget(self.visual, stretch=0); lay.addWidget(ctrl, stretch=0)
        self.play_btn.clicked.connect(self.media_player.play); self.pause_btn.clicked.connect(self.media_player.pause)
        self.media_player.setVideoOutput(self.video_widget); self.media_player.positionChanged.connect(self._on_pos_changed); self.slider.sliderMoved.connect(lambda v:self.media_player.setPosition(int(v)))
        self.segments=[]; self._timer=QTimer(self); self._timer.timeout.connect(self._update_overlay); self._timer.start(100)

    def load_media(self, path: str, autoplay: bool=True):
        is_video=os.path.splitext(path)[1].lower() in [".mp4",".mov",".mkv",".avi",".webm",".m4v"]
        self.media_player.setSource(QUrl.fromLocalFile(path))
        self.stack.setCurrentIndex(0 if is_video else 1)
        if autoplay: self.media_player.play()

    def set_segments(self, segs: List[Tuple[float,float,str]]): self.segments = segs
    def set_envelope(self, env, duration: float): self.visual.set_envelope(env, duration)
    def set_live_amp(self, amp: float): self.visual.push_live_amp(amp); self.liss.setAmplitude(amp)

    def _on_pos_changed(self, ms:int):
        self.slider.setMaximum(max(self.slider.maximum(), ms)); self.slider.setValue(ms); self.positionChanged.emit(ms)
        self.visual.set_position(ms/1000.0)

    def _update_overlay(self):
        if not self.segments: self.overlay.setSubtitle(""); return
        pos_s=self.media_player.position()/1000.0
        for s,e,t in self.segments:
            if s<=pos_s<=e: self.overlay.setSubtitle(t); break
        else: self.overlay.setSubtitle("")

    def resizeEvent(self,e):
        super().resizeEvent(e)
        if self.overlay and self.video_widget: self.overlay.setGeometry(self.video_widget.geometry())

    def rewind_and_play(self):
        self.media_player.pause(); self.media_player.setPosition(0); self.media_player.play()
