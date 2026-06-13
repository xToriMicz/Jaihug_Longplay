import os
import sys
import math
import subprocess
import logging
import requests
from pathlib import Path

# Add libs folder containing libraqm DLLs to PATH for Pillow on Windows
if sys.platform == 'win32':
    libs_dir = Path(__file__).resolve().parent.parent / "libs"
    if libs_dir.exists():
        os.environ["PATH"] = str(libs_dir) + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(str(libs_dir))
        except AttributeError:
            pass

logger = logging.getLogger(__name__)

def run_command(cmd, timeout=600):
    """
    Runs a shell command and returns a tuple (returncode, stdout, stderr)
    """
    logger.info(f"Running command: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired as e:
        logger.error(f"Command timed out: {e}")
        return -1, "", "Timeout expired"
    except Exception as e:
        logger.error(f"Command failed: {e}")
        return -1, "", str(e)

def safe_path_for_ffmpeg(path):
    """
    Converts a Windows path to a safe format for FFmpeg filter complexes or concat files.
    """
    abs_path = os.path.abspath(path)
    return abs_path.replace("\\", "/").replace("'", "'\\''")

def download_file(url, output_path):
    """
    Downloads a file from a URL and saves it to output_path
    """
    try:
        logger.info(f"Downloading {url} to {output_path}...")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        logger.info("Download completed successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to download file: {e}")
        return False

def ensure_fonts():
    """
    Ensures that standard Thai fonts are downloaded and available in the fonts directory.
    """
    fonts_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts"))
    os.makedirs(fonts_dir, exist_ok=True)
    
    font_urls = {
        "Mali-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/mali/Mali-Regular.ttf",
        "Mali-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/mali/Mali-Bold.ttf",
        "Sarabun-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf",
        "Sarabun-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf",
        "IBMPlexSansThai-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/ibmplexsansthai/IBMPlexSansThai-Regular.ttf",
        "IBMPlexSansThai-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/ibmplexsansthai/IBMPlexSansThai-Bold.ttf",
        "NotoSansThai-Regular.ttf": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf",
        "NotoSansThai-Bold.ttf": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf",
        "Inter-Regular.ttf": "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
        "Inter-Bold.ttf": "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf",
    }
    
    for filename, url in font_urls.items():
        font_path = os.path.join(fonts_dir, filename)
        if not os.path.exists(font_path) or os.path.getsize(font_path) < 1000:
            logger.info(f"Font {filename} missing. Downloading...")
            download_file(url, font_path)
            
    return fonts_dir

def contains_thai(text: str) -> bool:
    """
    Checks if the text contains any Thai characters.
    """
    return any('\u0e00' <= char <= '\u0e7f' for char in text)

def contains_latin(text: str) -> bool:
    """
    Checks if the text contains any Latin/English alphabetical characters (A-Z, a-z).
    """
    return any(('a' <= char <= 'z') or ('A' <= char <= 'Z') for char in text)

def get_font(text: str, bold: bool, size: int, fonts_dir: str, font_family: str = "Inter"):
    """
    Loads font based on font_family selection, falling back to Noto Sans Thai 
    if the text contains Thai characters and Inter is selected.
    """
    from PIL import ImageFont
    
    supported_fonts = {
        "Inter": ("Inter-Bold.ttf", "Inter-Regular.ttf"),
        "Noto Sans Thai": ("NotoSansThai-Bold.ttf", "NotoSansThai-Regular.ttf"),
        "Mali": ("Mali-Bold.ttf", "Mali-Regular.ttf"),
        "Sarabun": ("Sarabun-Bold.ttf", "Sarabun-Regular.ttf"),
        "IBM Plex Sans Thai": ("IBMPlexSansThai-Bold.ttf", "IBMPlexSansThai-Regular.ttf")
    }
    
    # Resolve default / unsupported fonts
    if not font_family or font_family not in supported_fonts:
        font_family = "Inter"
        
    # Fallback to Sarabun for Thai characters if Inter is selected
    if font_family == "Inter" and contains_thai(text):
        font_family = "Sarabun"
        
    # Fallback to IBM Plex Sans Thai for Latin characters if Noto Sans Thai is selected
    if font_family == "Noto Sans Thai" and contains_latin(text):
        font_family = "IBM Plex Sans Thai"
        
    bold_file, regular_file = supported_fonts[font_family]
    font_name = bold_file if bold else regular_file
        
    font_path = os.path.join(fonts_dir, font_name)
    if os.path.exists(font_path):
        try:
            return ImageFont.truetype(font_path, size)
        except Exception as e:
            logger.warning(f"Failed to load font {font_path}: {e}")
    return ImageFont.load_default()

import re

def normalize_thai_text(text: str) -> str:
    """
    Normalize Thai text to handle vowel/tone mark ordering and deduplication.
    """
    if not text:
        return text
    
    # 1. Deduplicate identical consecutive combining marks (vowels, tone marks)
    text = re.sub(r'([\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])\1+', r'\1', text)
    
    # 2. Reorder misordered combining marks:
    # Standard order in Thai: Consonant + [Lower/Upper Vowel] + [Tone Mark]
    # If a tone mark is followed by an upper or lower vowel, swap them
    upper_vowels = r'[\u0e31\u0e34-\u0e37\u0e4d]'
    lower_vowels = r'[\u0e38-\u0e3a]'
    tone_marks = r'[\u0e48-\u0e4c]'
    
    pattern = f'({tone_marks})({upper_vowels}|{lower_vowels})'
    text = re.sub(pattern, r'\2\1', text)
    
    # 3. Clean up specific Sara Am (\u0e33) cases:
    # If it is typed as \u0e33 + tone_mark -> tone_mark + \u0e33
    text = re.sub(f'\u0e33({tone_marks})', r'\1' + '\u0e33', text)
    
    return text

def render_thai_clean(draw, position, text, font, fill, stroke_width=0, stroke_fill=None):
    """
    Renders Thai text. If libraqm is available, uses standard text drawing with direction='ltr'
    to allow the engine to shape and position combining marks perfectly.
    Otherwise, falls back to manual cluster-by-cluster stacking to prevent overlaps.
    """
    text = normalize_thai_text(text)
    
    from PIL import features
    if features.check("raqm"):
        draw.text(position, text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill, direction="ltr")
        try:
            return position[0] + draw.textlength(text, font=font, direction="ltr")
        except AttributeError:
            bbox = draw.textbbox(position, text, font=font, stroke_width=stroke_width, direction="ltr")
            return bbox[2]

    x, y = position
    font_size = font.size
    
    # Decompose Sara Am (\u0e33) into Nikhahit (\u0e4d) + Sara A (\u0e32)
    text = text.replace('\u0e33', '\u0e4d\u0e32')
    
    # Define Thai character categories
    UPPER_VOWELS = {'\u0e31', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e47', '\u0e4d'}
    LOWER_VOWELS = {'\u0e38', '\u0e39', '\u0e3a'}
    TONE_MARKS = {'\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c'}
    
    # Parse text into clusters
    clusters = []
    i = 0
    n = len(text)
    
    while i < n:
        char = text[i]
        cluster = {
            "base": char,
            "upper": "",
            "lower": "",
            "tone": ""
        }
        
        i += 1
        while i < n:
            next_char = text[i]
            if next_char in UPPER_VOWELS:
                cluster["upper"] = next_char
            elif next_char in LOWER_VOWELS:
                cluster["lower"] = next_char
            elif next_char in TONE_MARKS:
                cluster["tone"] = next_char
            elif next_char not in (UPPER_VOWELS | LOWER_VOWELS | TONE_MARKS):
                break
            i += 1
        clusters.append(cluster)
        
    curr_x = x
    shift_y_tone_stacked = int(font_size * 0.18)
    
    for cluster in clusters:
        base = cluster["base"]
        upper = cluster["upper"]
        lower = cluster["lower"]
        tone = cluster["tone"]
        
        # Measure base character
        base_bbox = draw.textbbox((0, 0), base, font=font)
        base_w = base_bbox[2] - base_bbox[0]
        if base_w <= 0:
            base_bbox_space = draw.textbbox((0, 0), base + " ", font=font)
            base_w = base_bbox_space[2] - base_bbox_space[0]
            
        # Draw base consonant
        draw.text((curr_x, y), base, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        
        # Helper function to draw combining mark centered on the base consonant
        def draw_combining(mark, y_offset):
            mark_bbox = draw.textbbox((0, 0), mark, font=font)
            tx0, ty0, tx1, ty1 = mark_bbox
            tw = tx1 - tx0
            mark_x = curr_x + (base_w - tw) / 2 - tx0
            draw.text((mark_x, y - y_offset), mark, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
            
        # Draw lower vowel
        if lower:
            draw_combining(lower, 0)
            
        # Draw upper vowel
        if upper:
            draw_combining(upper, 0)
            
        # Draw tone mark
        if tone:
            if upper:
                # Stack above upper vowel
                draw_combining(tone, shift_y_tone_stacked)
            else:
                # Draw at default position
                draw_combining(tone, 0)
                
        # Advance x cursor
        try:
            curr_x += draw.textlength(base, font=font)
        except AttributeError:
            curr_x += base_w
            
    return curr_x

def get_thai_text_width(draw, text, font):
    """
    Measures the precise visual width of the rendered Thai text.
    """
    text = normalize_thai_text(text)
    
    from PIL import features
    if features.check("raqm"):
        try:
            return draw.textlength(text, font=font, direction="ltr")
        except AttributeError:
            bbox = draw.textbbox((0, 0), text, font=font, direction="ltr")
            return bbox[2] - bbox[0]
            
    text = text.replace('\u0e33', '\u0e4d\u0e32')
    UPPER_VOWELS = {'\u0e31', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e47', '\u0e4d'}
    LOWER_VOWELS = {'\u0e38', '\u0e39', '\u0e3a'}
    TONE_MARKS = {'\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c'}
    
    bases = []
    i = 0
    n = len(text)
    while i < n:
        char = text[i]
        bases.append(char)
        i += 1
        while i < n and text[i] in (UPPER_VOWELS | LOWER_VOWELS | TONE_MARKS):
            i += 1
            
    total_w = 0
    for base in bases:
        try:
            total_w += draw.textlength(base, font=font)
        except AttributeError:
            bbox = draw.textbbox((0, 0), base, font=font)
            total_w += (bbox[2] - bbox[0])
            
    return total_w



