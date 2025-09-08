from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtCore import QTimer
import pyqtgraph as pg
import numpy as np
class EnvelopeWidget(QWidget):
    def __init__(self,parent=None):
        super().__init__(parent)
        self._env=None; self._rate=50.0; self._duration=0.0; self._window=2.0; self.t=0.0
        lay=QVBoxLayout(self); self.plot=pg.PlotWidget(); self.plot.setMenuEnabled(False); self.plot.hideButtons()
        self.curve=self.plot.plot(); self.cursor=pg.InfiniteLine(angle=90, movable=False); self.plot.addItem(self.cursor); lay.addWidget(self.plot)
        self.timer=QTimer(self); self.timer.timeout.connect(self._tick); self.timer.start(50)
    def set_envelope(self, env: np.ndarray, rate_hz: float, duration: float):
        self._env=env.astype(float); self._rate=float(rate_hz); self._duration=float(duration); self._refresh(self.t)
    def set_time(self,t:float): self.t=max(0.0,min(t,self._duration))
    def _refresh(self,center_t:float):
        if self._env is None: return
        half=self._window/2.0; start=max(0.0,center_t-half); end=min(self._duration,center_t+half)
        i0=int(start*self._rate); i1=int(end*self._rate)+1
        if i1<=i0: return
        xs=np.linspace(start,end,i1-i0); seg=self._env[i0:i1]; 
        y=seg/(np.max(seg)+1e-9)
        self.curve.setData(xs,y); self.plot.setXRange(start,end, padding=0.02); self.plot.setYRange(0,1.0,padding=0.05); self.cursor.setPos(center_t)
    def _tick(self): self._refresh(self.t)
