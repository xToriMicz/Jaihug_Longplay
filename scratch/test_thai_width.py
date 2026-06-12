import os
from PIL import Image, ImageDraw, ImageFont
from modules.utils import get_thai_text_width, ensure_fonts, get_font

def test_width():
    fonts_dir = ensure_fonts()
    font = get_font("ฝืนยิ้มทั้งน้ำตา", True, 48, fonts_dir, "Sarabun")
    
    img = Image.new("RGBA", (100, 100))
    draw = ImageDraw.Draw(img)
    
    w_standard = draw.textlength("ฝืนยิ้มทั้งน้ำตา", font=font)
    w_custom = get_thai_text_width(draw, "ฝืนยิ้มทั้งน้ำตา", font)
    
    # Let's also test bbox width
    bbox = draw.textbbox((0, 0), "ฝืนยิ้มทั้งน้ำตา", font=font)
    w_bbox = bbox[2] - bbox[0]
    
    print(f"Standard textlength: {w_standard}")
    print(f"Custom get_thai_text_width: {w_custom}")
    print(f"Bbox width: {w_bbox}")

if __name__ == "__main__":
    test_width()
