
# -*- coding: utf-8 -*-
import cv2, numpy as np
class FaceDetector:
    def __init__(self, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80)):
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.cascade = cv2.CascadeClassifier(cascade_path)
        self.scaleFactor = scaleFactor; self.minNeighbors = minNeighbors; self.minSize = minSize
    def detect_one(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.cascade.detectMultiScale(gray, scaleFactor=self.scaleFactor, minNeighbors=self.minNeighbors, minSize=self.minSize)
        if len(faces) == 0: return None
        areas = [w*h for (x,y,w,h) in faces]; i = int(np.argmax(areas))
        x,y,w,h = faces[i]
        h2 = int(h*0.6); y2 = int(y + h*0.05)
        return (x, y2, w, h2)
