import numpy as np, librosa, pyqtgraph as pg
from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtCore import QRectF
class SpectrogramWidget(QWidget):
    def __init__(self,parent=None):
        super().__init__(parent); self._duration=0.0
        lay=QVBoxLayout(self); self.plot=pg.PlotWidget(); self.plot.setMenuEnabled(False); self.plot.hideButtons()
        self.img=pg.ImageItem(); self.plot.addItem(self.img); lay.addWidget(self.plot); self._cursor=None
    def load_audio(self,path:str):
        y,sr=librosa.load(path,sr=16000,mono=True)
        S=librosa.feature.melspectrogram(y=y,sr=sr,n_mels=96,fmax=8000)
        Sdb=librosa.power_to_db(S,ref=np.max); self._duration=len(y)/sr
        self.img.setImage(Sdb, autoRange=True, levels=(Sdb.min(), Sdb.max()))
        self.img.resetTransform(); self.img.setRect(QRectF(0.0, 0.0, float(self._duration), 1.0))
        if self._cursor is None:
            self._cursor=pg.InfiniteLine(pos=0, angle=90, movable=False); self.plot.addItem(self._cursor)
    def set_position(self,sec:float):
        if self._cursor: self._cursor.setPos(max(0.0,min(sec,self._duration)))
