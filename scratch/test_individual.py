import os
from PIL import Image, ImageDraw, ImageFont
from modules.utils import ensure_fonts, get_font

def test_individual():
    fonts_dir = ensure_fonts()
    font = get_font("ย", True, 48, fonts_dir, "Sarabun")
    
    img = Image.new("RGBA", (500, 300), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw base consonant 'ย'
    draw.text((50, 50), "ย", font=font, fill=(0, 0, 0, 255))
    
    # Draw upper vowel 'ิ'
    draw.text((150, 50), "ิ", font=font, fill=(0, 0, 0, 255))
    
    # Draw tone mark '้'
    draw.text((250, 50), "้", font=font, fill=(0, 0, 0, 255))
    
    # Draw combined manually
    draw.text((350, 50), "ย", font=font, fill=(0, 0, 0, 255))
    draw.text((350, 50), "ิ", font=font, fill=(0, 0, 0, 255))
    draw.text((350, 50), "้", font=font, fill=(0, 0, 0, 255))
    
    # Draw combined standard
    draw.text((50, 150), "ยิ้ม", font=font, fill=(0, 0, 0, 255))
    
    img.save("temp_individual.png")
    print("Saved temp_individual.png")

if __name__ == "__main__":
    test_individual()
