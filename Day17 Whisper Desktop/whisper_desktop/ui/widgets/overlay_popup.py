from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel
from PySide6.QtCore import Qt
class FloatingOverlay(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        lay=QVBoxLayout(self); lay.setContentsMargins(12,12,12,12)
        self.src=QLabel(" "); self.dst=QLabel(" ")
        for lab in [self.src, self.dst]:
            lab.setStyleSheet("color:#111; background:rgba(255,255,255,210); padding:8px 10px; border-radius:8px; font-size:18px;")
            lab.setWordWrap(True); lay.addWidget(lab)
        self.resize(680, 140)
    def update_texts(self, src_text: str, dst_text: str):
        self.src.setText(src_text or " "); self.dst.setText(dst_text or " ")
