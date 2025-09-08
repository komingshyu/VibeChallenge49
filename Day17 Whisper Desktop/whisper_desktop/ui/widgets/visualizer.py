from PySide6.QtWidgets import QWidget
from PySide6.QtCore import QTimer, QRectF
from PySide6.QtGui import QPainter, QColor
import numpy as np

def _amp_color(v: float) -> QColor:
    v = max(0.0, min(1.0, v))
    if v < 0.33:
        g = int(200 + v*3*(230-200))
        return QColor(180, 180, g)
    elif v < 0.66:
        t = (v-0.33)/0.33
        r = int(30 + t*(60))
        g = int(140 + t*(50))
        b = int(200 + t*(40))
        return QColor(r,g,b)
    else:
        t = (v-0.66)/0.34
        r = int(90 + t*(140))
        g = int(140 - t*(100))
        b = int(240 - t*(200))
        return QColor(r,g,b)

class VolumeVisualizer(QWidget):
    def __init__(self,parent=None,bars=48):
        super().__init__(parent); self.setMinimumHeight(96); self._bars=bars; self._env=None; self._pos=0.0; self._duration=0.0; self._live=None
        self._timer=QTimer(self); self._timer.timeout.connect(self.update); self._timer.start(33)
    def set_envelope(self, env, duration: float):
        if env is None or len(env)==0: self._env=None; self._duration=0.0
        else:
            import numpy as np
            env=np.asarray(env, dtype=float); m=float(np.max(env) or 1.0); self._env=(env/m).clip(0,1); self._duration=duration
        self.update()
    def set_position(self, sec: float): self._pos=max(0.0,sec); self.update()
    def push_live_amp(self, amp: float):
        if self._live is None: self._live=[0.0]*self._bars
        self._live=(self._live+[max(0.0,min(1.0,amp))])[-self._bars:]; self.update()
    def paintEvent(self,e):
        p=QPainter(self); p.setRenderHint(QPainter.Antialiasing); w=self.width(); h=self.height(); gap=2; n=self._bars; bw=max(2,int((w-(n-1)*gap)/n))
        def draw(vals):
            for i,v in enumerate(vals):
                bh=int(v*(h-6)); x=i*(bw+gap); y=h-bh; p.fillRect(QRectF(x,y,bw,bh), _amp_color(v))
        if self._env is not None and self._duration>0:
            idx=int((self._pos/self._duration)*len(self._env)); half=n//2; s=max(0, idx-half); e=min(len(self._env), s+n)
            import numpy as np
            vals=self._env[s:e]
            if len(vals)<n: vals=np.pad(vals,(0,n-len(vals)))
            draw(vals.tolist())
        elif self._live is not None: draw(self._live)
        else: draw([0.0]*n); p.end()
