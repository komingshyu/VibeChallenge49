from PySide6.QtWidgets import QWidget
from PySide6.QtCore import QTimer
from PySide6.QtGui import QPainter, QColor, QPen
import math

class LissajousWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent); self._t=0.0; self._amp=0.2; self._kx, self._ky=3,2; self._phase=0.0
        self._timer=QTimer(self); self._timer.timeout.connect(self._tick); self._timer.start(33)
    def setAmplitude(self, amp: float): self._amp=max(0.0,min(1.0,amp))
    def _tick(self): self._t+=0.04; self._phase+=0.02; self.update()
    def paintEvent(self,e):
        p=QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        w=self.width(); h=self.height(); cx,cy=w/2,h/2; size=min(w,h)*0.42; steps=480
        hue=int(200-180*self._amp)%360; pen=QPen(QColor.fromHsv(hue,200,230),2); p.setPen(pen)
        prev=None
        for i in range(steps):
            t=self._t+i/steps*2*math.pi
            x=cx+size*self._amp*math.sin(self._kx*t+self._phase)
            y=cy+size*self._amp*math.sin(self._ky*t)
            if prev: p.drawLine(prev[0],prev[1],x,y)
            prev=(x,y)
        p.end()
