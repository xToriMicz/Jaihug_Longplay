import os
from PIL import Image, ImageDraw, ImageFont
from modules.utils import render_thai_clean, ensure_fonts, get_font

def test_final_render():
    fonts_dir = ensure_fonts()
    
    # Create canvas
    img = Image.new("RGBA", (800, 300), (200, 200, 200, 255))
    draw = ImageDraw.Draw(img)
    
    # Render Noto Sans Thai (which previously had overlapping vowels)
    font_noto = get_font("ผู้หญิงที่ยิ้มทั้งน้ำตา", True, 48, fonts_dir, "Noto Sans Thai")
    draw.text((30, 30), "Noto Sans Thai (Native libraqm):", font=font_noto, fill=(0, 0, 255, 255))
    render_thai_clean(draw, (30, 90), "ผู้หญิงที่ยิ้มทั้งน้ำตา", font_noto, (255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    
    # Render Sarabun
    font_sarabun = get_font("ผู้หญิงที่ยิ้มทั้งน้ำตา", True, 48, fonts_dir, "Sarabun")
    draw.text((30, 160), "Sarabun (Native libraqm):", font=font_sarabun, fill=(0, 0, 255, 255))
    render_thai_clean(draw, (30, 220), "ผู้หญิงที่ยิ้มทั้งน้ำตา", font_sarabun, (255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    
    img.save("temp_final_render.png")
    print("Saved temp_final_render.png")

if __name__ == "__main__":
    test_final_render()
