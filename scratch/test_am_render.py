import os
import sys
from pathlib import Path

# Import utils first to configure DLL directories before importing PIL
import modules.utils

from PIL import Image, ImageDraw, ImageFont
from PIL import features

print("Raqm available:", features.check("raqm"))

# Create canvas
img = Image.new("RGBA", (1000, 600), (200, 200, 200, 255))
draw = ImageDraw.Draw(img)

# Load font
fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
font_path = str(fonts_dir / "Sarabun-Regular.ttf")
font = ImageFont.truetype(font_path, 48)

# Test cases
# 1. Standard typed: น + ้ + ำ (Consonant + Tone + Sara Am)
text1 = "น\u0e49\u0e33"
# 2. Reordered: น + ำ + ้ (Consonant + Sara Am + Tone)
text2 = "น\u0e33\u0e49"
# 3. Decomposed A: น + ํ + ้ + า (Consonant + Nikhahit + Tone + Sara A)
text3 = "น\u0e4d\u0e49\u0e32"
# 4. Decomposed B: น + ้ + ํ + า (Consonant + Tone + Nikhahit + Sara A)
text4 = "น\u0e49\u0e4d\u0e32"

draw.text((30, 30), "1. Standard (น + ้ + ำ):", font=font, fill=(0,0,255,255))
draw.text((450, 30), text1, font=font, fill=(0,0,0,255), direction="ltr")

draw.text((30, 130), "2. Reordered (น + ำ + ้):", font=font, fill=(0,0,255,255))
draw.text((450, 130), text2, font=font, fill=(0,0,0,255), direction="ltr")

draw.text((30, 230), "3. Decomposed A (น + ํ + ้ + า):", font=font, fill=(0,0,255,255))
draw.text((450, 230), text3, font=font, fill=(0,0,0,255), direction="ltr")

draw.text((30, 330), "4. Decomposed B (น + ้ + ํ + า):", font=font, fill=(0,0,255,255))
draw.text((450, 330), text4, font=font, fill=(0,0,0,255), direction="ltr")

img_path = "d:/Project/Jaihug_Longplay/temp_am_test.png"
img.save(img_path)
print("Saved", img_path)
