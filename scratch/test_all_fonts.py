import os
from PIL import Image, ImageDraw, ImageFont
from modules.utils import render_thai_clean, ensure_fonts, get_font

def test_all_fonts():
    fonts_dir = ensure_fonts()
    fonts = ["Sarabun", "Noto Sans Thai", "Mali", "IBM Plex Sans Thai"]
    
    # Create canvas
    img = Image.new("RGBA", (1000, 800), (240, 240, 240, 255))
    draw = ImageDraw.Draw(img)
    
    y = 30
    for font_name in fonts:
        font = get_font("ฝืนยิ้มทั้งน้ำตา", True, 48, fonts_dir, font_name)
        
        # Draw header
        draw.text((30, y), f"Font: {font_name}", font=font, fill=(0, 0, 255, 255))
        y += 60
        
        # Render using render_thai_clean
        draw.text((30, y), "Clean: ", font=font, fill=(50, 50, 50, 255))
        render_thai_clean(draw, (200, y), "ฝืนยิ้มทั้งน้ำตา", font, (255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        y += 60
        
        # Render using standard draw.text
        draw.text((30, y), "Standard: ", font=font, fill=(50, 50, 50, 255))
        draw.text((200, y), "ฝืนยิ้มทั้งน้ำตา", font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        y += 90
        
    output_path = "temp_all_fonts_test.png"
    img.save(output_path)
    print(f"Saved test image to {output_path}")

if __name__ == "__main__":
    test_all_fonts()
