from PIL import Image, ImageDraw, ImageFont

# Original render_thai_clean implementation for tracing
def trace_render_thai_clean(text):
    text = text.replace('\u0e33', '\u0e4d\u0e32')
    UPPER_VOWELS = {'\u0e31', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e47', '\u0e4d'}
    LOWER_VOWELS = {'\u0e38', '\u0e39', '\u0e3a'}
    TONE_MARKS = {'\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c'}
    
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
        
    for idx, c in enumerate(clusters):
        print(f"Cluster {idx}: base='{c['base']}' (hex {hex(ord(c['base']))}), upper='{c['upper']}' (hex {hex(ord(c['upper'])) if c['upper'] else ''}), lower='{c['lower']}' (hex {hex(ord(c['lower'])) if c['lower'] else ''}), tone='{c['tone']}' (hex {hex(ord(c['tone'])) if c['tone'] else ''})")

trace_render_thai_clean("ฝืนยิ้มทั้งน้ำตา")
