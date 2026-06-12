import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Import utils
import modules.utils

# We want to force raqm to False to test the fallback path
from PIL import features
# Mock features.check to return False for raqm
original_check = features.check
def mock_check(feature):
    if feature == "raqm":
        return False
    return original_check(feature)
features.check = mock_check

# Create canvas
img = Image.new("RGBA", (1000, 400), (200, 200, 200, 255))
draw = ImageDraw.Draw(img)

# Load font
fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
font_path = str(fonts_dir / "Sarabun-Regular.ttf")
font = ImageFont.truetype(font_path, 48)

# Import render_thai_clean and test with different inputs
from modules.utils import render_thai_clean

# 1. Unswapped/Standard: น + ้ + ำ
text1 = "น\u0e49\u0e33"
# 2. Swapped/Reordered: น + ำ + ้
text2 = "น\u0e33\u0e49"

draw.text((30, 30), "Fallback Stacker (Raqm=False):", font=font, fill=(255,0,0,255))

draw.text((30, 120), "1. Standard Input (น + ้ + ำ):", font=font, fill=(0,0,255,255))
render_thai_clean(draw, (500, 120), text1, font, (0,0,0,255))

draw.text((30, 220), "2. Swapped Input (น + ำ + ้):", font=font, fill=(0,0,255,255))
render_thai_clean(draw, (500, 220), text2, font, (0,0,0,255))

img_path = "d:/Project/Jaihug_Longplay/temp_fallback_test.png"
img.save(img_path)
print("Saved", img_path)
