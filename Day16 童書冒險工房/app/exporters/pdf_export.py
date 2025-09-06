
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import black
from PIL import Image
import os

def export_pdf(spreads, title, author, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    c = canvas.Canvas(out_path, pagesize=landscape(A4))
    w, h = landscape(A4)
    c.setFillColor(black); c.setFont("Helvetica-Bold", 28)
    c.drawString(80, h-100, title); c.setFont("Helvetica", 14)
    c.drawString(80, h-130, f"Author: {author}"); c.showPage()
    for sp in spreads:
        img_path = sp.get('image_path'); text = sp.get('display_text', '')
        if img_path and os.path.exists(img_path):
            img = Image.open(img_path); aspect = img.width/img.height
            target_w = w*0.7; target_h = target_w/aspect
            if target_h > h*0.9: target_h = h*0.9; target_w = target_h*aspect
            c.drawImage(ImageReader(img), 40, (h-target_h)/2, width=target_w, height=target_h)
        c.setFont("Helvetica", 14); c.drawString(40, 40, f"Page {sp.get('page')}")
        c.setFont("Helvetica", 16); c.drawString(40, 60, (text or '')[:90]); c.showPage()
    c.save(); return out_path
