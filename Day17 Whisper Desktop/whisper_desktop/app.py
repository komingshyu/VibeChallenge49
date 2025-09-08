import sys, traceback
from PySide6.QtWidgets import QApplication, QMessageBox
from .ui.main_window import MainWindow
def excepthook(exc_type, exc, tb):
    try:
        msg=QMessageBox(); msg.setWindowTitle('未處理例外'); msg.setText(str(exc)); msg.setDetailedText(''.join(traceback.format_exception(exc_type,exc,tb))); msg.setIcon(QMessageBox.Critical); msg.exec()
    except Exception: pass
    print(''.join(traceback.format_exception(exc_type,exc,tb)))
def main():
    sys.excepthook = excepthook
    app = QApplication(sys.argv); w = MainWindow(); w.show(); sys.exit(app.exec())
if __name__ == "__main__": main()
