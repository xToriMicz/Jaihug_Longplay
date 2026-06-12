import os
from PIL import Image, ImageDraw, ImageFont
from modules.utils import render_thai_clean, ensure_fonts, get_font

def test_render():
    fonts_dir = ensure_fonts()
    font = get_font("ฝืนยิ้มทั้งน้ำตา", True, 64, fonts_dir, "Sarabun")
    
    # Create canvas
    img = Image.new("RGBA", (800, 200), (200, 200, 200, 255))
    draw = ImageDraw.Draw(img)
    
    # Render using render_thai_clean
    render_thai_clean(draw, (50, 50), "ฝืนยิ้มทั้งน้ำตา", font, (255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    
    # Render using standard draw.text for comparison
    draw.text((50, 120), "ฝืนยิ้มทั้งน้ำตา (Standard)", font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    
    output_path = "temp_thai_test.png"
    img.save(output_path)
    print(f"Saved test image to {output_path}")

if __name__ == "__main__":
    test_render()
