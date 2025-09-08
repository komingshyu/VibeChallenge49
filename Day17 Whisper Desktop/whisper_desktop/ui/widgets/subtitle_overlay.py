from PySide6.QtWidgets import QWidget
from PySide6.QtGui import QPainter, QColor, QFont
from PySide6.QtCore import Qt

class SubtitleOverlay(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent); self._text=""; self.setAttribute(Qt.WA_TransparentForMouseEvents); self.setStyleSheet("background: transparent;")
    def setSubtitle(self, text: str):
        self._text=text; self.update()
    def paintEvent(self, e):
        if not self._text: return
        p=QPainter(self); p.setRenderHint(QPainter.Antialiasing); p.setPen(QColor(0,0,0,180)); p.setBrush(QColor(0,0,0,180))
        w=self.width(); h=self.height()
        # 簡潔白字
        p.setPen(QColor(255,255,255)); f=QFont(); f.setPointSize(14); p.setFont(f)
        p.drawText(20, h-40, w-40, 30, Qt.AlignCenter|Qt.TextWordWrap, self._text)
        p.end()
