import os
import logging
import subprocess
import unicodedata
import re
from typing import List, Dict, Any, Tuple
from modules.video_creator import detect_encoder

logger = logging.getLogger(__name__)

def hex_to_ass_color(hex_str: str, default: str = "&H00FFFFFF") -> str:
    """
    Converts CSS hex color (#RRGGBB or #RRGGBBAA) to ASS hex color (&HAABBGGRR).
    In ASS, Alpha is inverted (00 is opaque, FF is fully transparent).
    """
    if not hex_str:
        return default
    hex_str = hex_str.strip().lstrip('#')
    try:
        if len(hex_str) == 6:
            r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
            a = "00"
        elif len(hex_str) == 8:
            r, g, b, a = hex_str[0:2], hex_str[2:4], hex_str[4:6], hex_str[6:8]
            # Invert alpha for ASS: 255 is transparent, 0 is opaque
            alpha_val = int(a, 16)
            ass_alpha = 255 - alpha_val
            a = f"{ass_alpha:02X}"
        else:
            return default
        return f"&H{a}{b}{g}{r}".upper()
    except Exception as e:
        logger.warning(f"Error converting color '{hex_str}': {e}")
        return default

def make_karaoke_text(text: str, duration_sec: float) -> str:
    """
    Splits text into cluster segments (characters + combining marks)
    and inserts ASS Karaoke tags (\\kf) to animate the highlight over time.
    """
    total_cs = int(round(duration_sec * 100))
    if total_cs <= 0:
        return text
        
    # Group characters into clusters (base character + combining marks)
    clusters = []
    current_cluster = ""
    for c in text:
        if current_cluster and unicodedata.category(c).startswith('M'):
            current_cluster += c
        else:
            if current_cluster:
                clusters.append(current_cluster)
            current_cluster = c
    if current_cluster:
        clusters.append(current_cluster)
        
    if not clusters:
        return text
        
    cs_per_cluster = max(1, total_cs // len(clusters))
    
    result = []
    for cluster in clusters:
        if cluster.strip():
            result.append(f"{{\\kf{cs_per_cluster}}}{cluster}")
        else:
            result.append(cluster)
            
    return "".join(result)

def auto_wrap_text(text: str, max_chars: int = 28) -> str:
    r"""
    Automatically wraps a text line if it exceeds max_chars, trying to break at spaces first,
    or doing character-based chunks for continuous languages like Thai without spaces.
    If the text contains user-defined newlines (\n or \N), it respects them and skips wrapping.
    """
    if not text:
        return text
    if '\n' in text or '\\N' in text:
        return text
    if len(text) <= max_chars:
        return text
        
    # Wrap by space if there is any
    if ' ' in text:
        words = text.split(' ')
        lines = []
        current_line = []
        current_len = 0
        for word in words:
            word_len = len(word)
            if current_len + word_len + (1 if current_line else 0) <= max_chars:
                current_line.append(word)
                current_len += word_len + (1 if len(current_line) > 1 else 0)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
                current_len = word_len
        if current_line:
            lines.append(' '.join(current_line))
        return '\n'.join(lines)
        
    # Safe Thai wrap fallback
    CANNOT_START_LINE = set([
        '\u0e30', '\u0e31', '\u0e32', '\u0e33', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e38', '\u0e39', '\u0e3a',  # Vowels
        '\u0e47', '\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c', '\u0e4d', '\u0e4e',  # Tone marks & diacritics
        '\u0e46', # ๆ Mai Yamok
        '\u0e45' # ๅ Lakkhang Yao
    ])
    LEADING_VOWELS = set(['\u0e40', '\u0e41', '\u0e42', '\u0e43', '\u0e44']) # เ, แ, โ, ใ, ไ

    def thai_wrap_line(t: str, limit: int) -> str:
        if len(t) <= limit:
            return t
            
        split_idx = limit
        while split_idx > 0:
            char_at_split = t[split_idx]
            char_before_split = t[split_idx - 1]
            
            if char_at_split not in CANNOT_START_LINE and char_before_split not in LEADING_VOWELS:
                break
            split_idx -= 1
            
        if split_idx == 0:
            split_idx = limit + 1
            while split_idx < len(t):
                char_at_split = t[split_idx]
                char_before_split = t[split_idx - 1]
                if char_at_split not in CANNOT_START_LINE and char_before_split not in LEADING_VOWELS:
                    break
                split_idx += 1
                
        if split_idx >= len(t) or split_idx == 0:
            split_idx = limit
            
        left = t[:split_idx].strip()
        right = t[split_idx:].strip()
        return left + '\n' + thai_wrap_line(right, limit)

    return thai_wrap_line(text, max_chars)

def auto_tag_thai_keywords(text: str) -> str:
    """
    Automatically tags the first matching Thai emotional keyword with brackets [keyword]
    if no user-defined brackets are present in the text.
    """
    if not text:
        return text
        
    if '[' in text or ']' in text:
        return text
        
    thai_emotional_keywords = [
        "เจ็บปวด", "ความรัก", "คิดถึงเธอ", "ร้องไห้",
        "ความจริง", "คนเดียว", "เสียใจ", "รักเธอ", "ห่วงหา", "ไม่รัก",
        "คิดถึง", "เหนื่อย", "น้ำตา", "รัก", "เจ็บ", "รอ", "ลืม", "เหงา", 
        "กอด", "ใจ", "ทิ้ง", "พัง", "จบ"
    ]
    
    for kw in thai_emotional_keywords:
        if kw in text:
            # Wrap only the first match
            return text.replace(kw, f"[{kw}]", 1)
            
    return text

def parse_highlight_tags(text: str, base_size: int, highlight_hex: str = "#ff007a", highlight_scale: float = 1.25) -> str:
    """
    Parses bracketed text [word] and replaces them with ASS inline override tags
    for bolding, custom highlight color, and larger font size.
    """
    if not text:
        return text
        
    # Convert hex color to ASS color format
    hex_str = highlight_hex.strip().lstrip('#')
    if len(hex_str) >= 6:
        r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
    else:
        r, g, b = "FF", "00", "7A" # Default pink
    ass_color = f"&H{b}{g}{r}&".upper()
    
    highlight_size = int(round(base_size * highlight_scale))
    
    def replace_match(match):
        word = match.group(1)
        return f"{{\\b1\\fs{highlight_size}\\1c{ass_color}}}{word}{{\\r}}"
        
    return re.sub(r'\[(.*?)\]', replace_match, text)

def compile_ass_content(
    subtitles: List[Dict[str, Any]],
    quote_overlay: Dict[str, Any],
    settings: Dict[str, Any],
    resolution: Tuple[int, int] = (1920, 1080),
    total_duration: float = 3600.0
) -> str:
    """
    Generates ASS subtitle content from subtitle list, quote data, and style settings.
    """
    width, height = resolution
    
    font_family = settings.get("font_family", "Mali")
    
    # Font size mapping
    font_size_str = settings.get("font_size", "Medium")
    size_map = {"Small": 24, "Medium": 36, "Large": 48}
    font_size = size_map.get(font_size_str, 36)
    # Scale font size based on resolution height (reference is 1080p)
    scale_factor = height / 1080.0
    scaled_font_size = int(round(font_size * scale_factor))
    
    # Dynamic character limits for auto wrapping based on font size
    wrap_limit_map = {"Small": 38, "Medium": 28, "Large": 22}
    max_chars = wrap_limit_map.get(font_size_str, 28)
    
    primary_color = hex_to_ass_color(settings.get("color"), "&H00FFFFFF")
    outline_color = hex_to_ass_color(settings.get("outline_color"), "&H00000000")
    back_color = hex_to_ass_color(settings.get("background_box_color"), "&H80000000")
    
    outline_width = float(settings.get("outline_width", 2.0))
    
    # BorderStyle: 3 is background box, 1 is standard outline + shadow
    border_style = 3 if settings.get("show_background_box") else 1
    
    # MarginV: vertical distance from the bottom
    position_y = float(settings.get("position_y", 0.80))
    margin_v = int(round(height * (1.0 - position_y)))
    
    # Check if we should use Karaoke Highlight style
    is_karaoke = settings.get("effect") in ["Karaoke Highlight", "Karaoke Glow"]
    
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # Default style for subtitles
        f"Style: Default,{font_family},{scaled_font_size},{primary_color},&H0000FF00,{outline_color},{back_color},-1,0,0,0,100,100,0,0,{border_style},{outline_width},2,2,10,10,{margin_v},1"
    ]
    
    # Add QuoteStyle if enabled
    if quote_overlay and quote_overlay.get("enabled"):
        q_text = quote_overlay.get("text", "").strip()
        if q_text:
            q_pos_y = float(quote_overlay.get("position_y", 0.20))
            q_margin_v = int(round(height * q_pos_y))
            
            q_font_size_str = quote_overlay.get("font_size", "Medium")
            q_size_map = {"Small": 22, "Medium": 32, "Large": 43}
            q_base_font_size = q_size_map.get(q_font_size_str, 32)
            q_font_size = int(round(q_base_font_size * scale_factor))
            
            lines.append(
                f"Style: QuoteStyle,{font_family},{q_font_size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.5,1,8,10,10,{q_margin_v},1"
            )
            
    lines.append("")
    lines.append("[Events]")
    lines.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")
    
    # Time formatter for ASS: H:MM:SS.cs
    def format_time(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = seconds % 60
        return f"{h}:{m:02d}:{s:05.2f}"
 
    # Add static quote line
    if quote_overlay and quote_overlay.get("enabled"):
        q_text = quote_overlay.get("text", "").strip()
        if q_text:
            q_pos_x = float(quote_overlay.get("position_x", 0.50))
            q_pos_y = float(quote_overlay.get("position_y", 0.20))
            q_alignment = quote_overlay.get("alignment", "center")
            q_decorator = quote_overlay.get("decorator_style", "none")
            
            x = int(round(width * q_pos_x))
            y = int(round(height * q_pos_y))
            
            # Map alignment string to ASS tag and adjust coordinate for centered bounding box (85% of screen width)
            box_width = width * 0.85
            align_tag = "8"
            x_pos = x
            if q_alignment == "left":
                align_tag = "7"
                x_pos = x - int(round(box_width / 2.0))
            elif q_alignment == "right":
                align_tag = "9"
                x_pos = x + int(round(box_width / 2.0))
                
            q_text = auto_tag_thai_keywords(q_text)
            
            q_font_size_str = quote_overlay.get("font_size", "Medium")
            q_size_map = {"Small": 22, "Medium": 32, "Large": 43}
            q_base_font_size = q_size_map.get(q_font_size_str, 32)
            q_font_size = int(round(q_base_font_size * scale_factor))
            
            q_wrap_limit_map = {"Small": 42, "Medium": 31, "Large": 24}
            q_max_chars = q_wrap_limit_map.get(q_font_size_str, 31)
            q_text = auto_wrap_text(q_text, max_chars=q_max_chars)
            
            highlight_color = quote_overlay.get("highlight_color", "#ff007a")
            highlight_scale = float(quote_overlay.get("highlight_scale", 1.25))
            
            # Convert hex color to ASS color format
            hex_str = highlight_color.strip().lstrip('#')
            if len(hex_str) >= 6:
                r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
            else:
                r, g, b = "FF", "00", "7A"
            ass_color = f"&H{b}{g}{r}&".upper()
            
            q_text_ass = parse_highlight_tags(
                q_text, 
                q_font_size, 
                highlight_hex=highlight_color, 
                highlight_scale=highlight_scale
            )
            q_text_ass = q_text_ass.replace('\n', '\\N')
            
            # Background decorator dialogue line
            if q_decorator == "background":
                bg_font_size = int(round(q_font_size * 3.0))
                bg_y = y - int(round(q_font_size * 0.5))
                bg_line_text = f"{{\\an{align_tag}\\pos({x_pos},{bg_y})\\fs{bg_font_size}\\1a&HB0&}}“"
                lines.append(
                    f"Dialogue: 0,{format_time(0.0)},{format_time(total_duration)},QuoteStyle,,0,0,0,,{bg_line_text}"
                )
                
            # Artistic Above/Below decorators (top-left “ and bottom-right ”)
            elif q_decorator == "artistic":
                lines_list = q_text.split('\n')
                num_lines = len(lines_list)
                
                def estimate_width(t_str):
                    width_px = 0.0
                    for char in t_str:
                        if 0x0E00 <= ord(char) <= 0x0E7F:
                            if ord(char) in [0x0E31, 0x0E34, 0x0E35, 0x0E36, 0x0E37, 0x0E38, 0x0E39, 0x0E3A, 0x0E47, 0x0E48, 0x0E49, 0x0E4A, 0x0E4B, 0x0E4C, 0x0E4D, 0x0E4E]:
                                continue
                            width_px += q_font_size * 0.48
                        else:
                            width_px += q_font_size * 0.52
                    return width_px
                
                max_w = max(estimate_width(l) for l in lines_list) if lines_list else 0
                text_height = num_lines * q_font_size * 1.30
                
                if q_alignment == "left":
                    x_left = x_pos
                    x_right = x_pos + max_w
                elif q_alignment == "right":
                    x_right = x_pos
                    x_left = x_pos - max_w
                else:
                    x_left = x_pos - max_w / 2.0
                    x_right = x_pos + max_w / 2.0
                    
                bg_font_size = int(round(q_font_size * 2.5))
                o_x = int(round(x_left - q_font_size * 0.6))
                o_y = int(round(y - q_font_size * 0.3))
                c_x = int(round(x_right + q_font_size * 0.1))
                c_y = int(round(y + text_height - q_font_size * 0.8))
                
                bg_line_text = f"{{\\an7\\pos({o_x},{o_y})\\fs{bg_font_size}}}“"
                fg_line_text = f"{{\\an7\\pos({c_x},{c_y})\\fs{bg_font_size}}}”"
                
                lines.append(
                    f"Dialogue: 0,{format_time(0.0)},{format_time(total_duration)},QuoteStyle,,0,0,0,,{bg_line_text}"
                )
                lines.append(
                    f"Dialogue: 0,{format_time(0.0)},{format_time(total_duration)},QuoteStyle,,0,0,0,,{fg_line_text}"
                )
                
            # Inline decorator prepending
            if q_decorator == "inline":
                decorator_size = int(round(q_font_size * highlight_scale * 1.2))
                q_text_ass = f"{{\\fs{decorator_size}\\1c{ass_color}}}“{{\\r}} " + q_text_ass
                
            # Main quote dialogue line
            main_line_text = f"{{\\an{align_tag}\\pos({x_pos},{y})}}{q_text_ass}"
            lines.append(
                f"Dialogue: 0,{format_time(0.0)},{format_time(total_duration)},QuoteStyle,,0,0,0,,{main_line_text}"
            )
            
    # Add subtitle dialogue lines
    for sub in subtitles:
        start = max(0.0, float(sub["start"]))
        end = max(start + 0.1, float(sub["end"]))
        duration = end - start
        
        txt = sub["text"].strip()
        # Apply auto wrapping based on font size threshold
        txt = auto_wrap_text(txt, max_chars=max_chars)
        
        if is_karaoke:
            if '\n' in txt:
                lines_wrapped = txt.split('\n')
                txt_parts = [make_karaoke_text(p, duration / len(lines_wrapped)) for p in lines_wrapped]
                txt = "\\N".join(txt_parts)
            else:
                txt = make_karaoke_text(txt, duration)
        else:
            txt = txt.replace('\n', '\\N')
            
        lines.append(
            f"Dialogue: 0,{format_time(start)},{format_time(end)},Default,,0,0,0,,{txt}"
        )
        
    return "\n".join(lines)

def burn_subtitles_to_video(
    base_video_path: str,
    output_video_path: str,
    subtitles: List[Dict[str, Any]],
    quote_overlay: Dict[str, Any],
    settings: Dict[str, Any],
    temp_dir: str,
    resolution: Tuple[int, int] = (1920, 1080),
    total_duration: float = 3600.0
) -> str:
    """
    Burns subtitles and quotes onto the base video. Creates a temporary ASS file
    and invokes FFmpeg to superimpose it.
    """
    import uuid
    ass_filename = f"temp_subs_{uuid.uuid4().hex[:8]}.ass"
    ass_path = os.path.join(temp_dir, ass_filename)
    
    ass_content = compile_ass_content(
        subtitles=subtitles,
        quote_overlay=quote_overlay,
        settings=settings,
        resolution=resolution,
        total_duration=total_duration
    )
    
    # Save the ASS file
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass_content)
        
    # Format ASS file path for FFmpeg filter on Windows
    filter_path = ass_path.replace("\\", "/").replace(":", "\\:")
    
    encoder = detect_encoder()
    
    # FFmpeg command to overlay subtitle onto base video
    # We copy audio (-c:a copy) to avoid any audio quality degradation
    cmd = [
        "ffmpeg", "-y",
        "-i", base_video_path,
        "-vf", f"ass='{filter_path}'",
        "-c:a", "copy",
        "-c:v", encoder
    ]
    
    if encoder == "libx264":
        cmd.extend(["-preset", "superfast", "-crf", "18"])
    elif encoder == "h264_nvenc":
        cmd.extend(["-preset", "p1", "-cq", "19"])
    elif encoder == "h264_qsv":
        cmd.extend(["-preset", "veryfast", "-global_quality", "19"])
        
    cmd.append(output_video_path)
    
    logger.info(f"Burning subtitles onto video: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except Exception as e:
        logger.error(f"FFmpeg subtitle burn failed: {e}")
        # Clean up temp file on failure
        if os.path.exists(ass_path):
            try:
                os.remove(ass_path)
            except Exception:
                pass
        raise e
        
    # Clean up ASS file on success
    if os.path.exists(ass_path):
        try:
            os.remove(ass_path)
        except Exception as ex:
            logger.warning(f"Failed to clean up temporary ASS file {ass_path}: {ex}")
            
    return output_video_path
