from PySide6.QtWidgets import QWidget, QLabel, QVBoxLayout
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QPalette, QColor

class PopupSubtitle(QWidget):
    def __init__(self, opacity: float=0.75, font_pt: int=24, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.label = QLabel("", self)
        f=QFont(); f.setPointSize(font_pt); f.setBold(True); self.label.setFont(f)
        self.label.setAlignment(Qt.AlignCenter)
        pal = self.label.palette(); pal.setColor(QPalette.WindowText, QColor(255,255,255)); self.label.setPalette(pal)
        lay = QVBoxLayout(self); lay.setContentsMargins(20,8,20,12); lay.addWidget(self.label)
        self._bg = QColor(0,0,0); self._bg.setAlphaF(opacity)
        self.resize(800, 140)

    def setText(self, text: str):
        self.label.setText(text)

    def paintEvent(self, e):
        from PySide6.QtGui import QPainter, QBrush
        p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        p.setBrush(QBrush(self._bg)); p.setPen(Qt.NoPen)
        p.drawRoundedRect(self.rect(), 16, 16)
        p.end()
