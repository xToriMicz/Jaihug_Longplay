import os
import math
import subprocess
import logging
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageColor, ImageFont
from typing import List, Dict, Any, Tuple
from modules.utils import safe_path_for_ffmpeg, run_command, get_font, contains_thai, render_thai_clean, get_thai_text_width

logger = logging.getLogger(__name__)

# Preset color themes mapped to hex colors
THEME_COLORS = {
    "Lo-fi / Chill": "#FF7A00",  # Orange
    "Synthwave": "#FF007A",      # Pink
    "Ambient": "#10B981",        # Emerald Green
    "EDM": "#00E5FF",            # Cyan Blue
    "Jazz": "#8B5CF6",           # Violet Purple
}

def get_color_rgb(color_val: str) -> Tuple[int, int, int]:
    """
    Converts a color theme name or hex string into an RGB tuple.
    """
    hex_color = THEME_COLORS.get(color_val, color_val)
    if not hex_color.startswith("#"):
        hex_color = "#FFFFFF" # fallback to white
    try:
        return ImageColor.getrgb(hex_color)
    except Exception:
        return (255, 255, 255)

def draw_3d_text_with_shadow(
    draw_handle,
    frame_img,
    position,
    text,
    font,
    fill_color,
    outline_color=(0, 0, 0, 255),
    outline_width=2,
    shadow_offset=(3, 4),
    shadow_blur=4
):
    """
    Renders text with a premium 3D soft drop shadow and sharp outline.
    Uses a sub-canvas to blur the shadow layer cleanly.
    """
    x, y = position
    width, height = frame_img.size
    
    # 1. Draw the shadow on a separate transparent layer
    shadow_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_img)
    
    shadow_fill = (0, 0, 0, 200) # Soft black shadow
    sx, sy = x + shadow_offset[0], y + shadow_offset[1]
    
    if contains_thai(text):
        render_thai_clean(shadow_draw, (sx, sy), text, font, shadow_fill, stroke_width=outline_width, stroke_fill=shadow_fill)
    else:
        shadow_draw.text(
            (sx, sy),
            text,
            font=font,
            fill=shadow_fill,
            stroke_width=outline_width,
            stroke_fill=shadow_fill
        )
        
    # 2. Blur the shadow layer to create the soft drop shadow aura
    if shadow_blur > 0:
        if contains_thai(text):
            tx_w = get_thai_text_width(shadow_draw, text, font)
        else:
            bbox = shadow_draw.textbbox((0, 0), text, font=font)
            tx_w = bbox[2] - bbox[0]
            
        tx_h = font.size * 1.5
        cx0 = max(0, int(sx - shadow_blur * 2))
        cy0 = max(0, int(sy - shadow_blur * 2))
        cx1 = min(width, int(sx + tx_w + shadow_blur * 2))
        cy1 = min(height, int(sy + tx_h + shadow_blur * 2))
        
        if cx1 > cx0 and cy1 > cy0:
            shadow_sub = shadow_img.crop((cx0, cy0, cx1, cy1))
            shadow_blurred_sub = shadow_sub.filter(ImageFilter.GaussianBlur(radius=shadow_blur))
            frame_img.paste(shadow_blurred_sub, (cx0, cy0), shadow_blurred_sub)
    else:
        frame_img.paste(shadow_img, (0, 0), shadow_img)
        
    # 3. Draw the main sharp text on top with thin black stroke
    main_draw = ImageDraw.Draw(frame_img)
    if contains_thai(text):
        render_thai_clean(main_draw, (x, y), text, font, fill_color, stroke_width=outline_width, stroke_fill=outline_color)
    else:
        main_draw.text(
            (x, y),
            text,
            font=font,
            fill=fill_color,
            stroke_width=outline_width,
            stroke_fill=outline_color
        )

def create_song_title_overlay(
    resolution: Tuple[int, int],
    song_name: str,
    fonts_dir: str,
    idx: int,
    font_family: str = "Inter",
    visualizer_y: float = 0.92,
    title_font_size: str = "Medium"
) -> str:
    """
    Creates a transparent PNG with the song title centered below the visualizer,
    matching the user's style preference (handwritten outlined text + 3D drop shadow).
    """
    width, height = resolution
    overlay_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_img)
    
    full_text = song_name
    
    # Map Small, Medium, Large to Y multipliers
    size_map = {"Small": 0.024, "Medium": 0.032, "Large": 0.040}
    mult = size_map.get(title_font_size, 0.032)
    font_song = get_font(full_text, True, int(height * mult), fonts_dir, font_family)
    
    # Calculate text bounding box to center it
    if contains_thai(full_text):
        tx_w = get_thai_text_width(draw, full_text, font_song)
    else:
        bbox = draw.textbbox((0, 0), full_text, font=font_song)
        tx_w = bbox[2] - bbox[0]
    
    pos_x = (width - tx_w) // 2
    pos_y = int(height * (visualizer_y + 0.025)) # Placed below visualizer
    
    # Draw premium 3D text
    draw_3d_text_with_shadow(
        draw_handle=draw,
        frame_img=overlay_img,
        position=(pos_x, pos_y),
        text=full_text,
        font=font_song,
        fill_color=(255, 255, 255, 255),
        outline_color=(0, 0, 0, 255),
        outline_width=2,
        shadow_offset=(3, 4),
        shadow_blur=4
    )
    
    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "temp"))
    os.makedirs(temp_dir, exist_ok=True)
    overlay_path = os.path.join(temp_dir, f"song_title_top_{idx}_{os.getpid()}.png")
    overlay_img.save(overlay_path, "PNG")
    return overlay_path

def get_ffmpeg_visualizer_args(
    audio_path: str,
    background_path: str,
    output_path: str,
    style: str,
    color_theme: str,
    resolution: Tuple[int, int],
    fps: int,
    duration: float,
    encoder: str = "libx264",
    is_image: bool = True,
    static_overlay_path: str = None,
    opacity: float = 0.8,
    tracks_timeline: List[Dict] = None,
    fonts_dir: str = None,
    visualizer_height: float = 0.15,
    visualizer_y: float = 0.92,
    font_family: str = "Inter",
    title_font_size: str = "Medium"
) -> Tuple[List[str], List[str]]:
    """
    Constructs FFmpeg arguments for fast native visualizers (Waveform or Spectrum Bars).
    Also generates PNG overlays for song titles and loops them over time.
    """
    width, height = resolution
    color_rgb = get_color_rgb(color_theme)
    color_hex = f"0x{color_rgb[0]:02x}{color_rgb[1]:02x}{color_rgb[2]:02x}"
    
    # Position and sizing for visualizers: 
    # Width = 60% of video width, Height = 150px, placed at the bottom 15% of the screen
    vis_w = int(width * 0.6)
    vis_h = int(height * visualizer_height)
    pos_x = int((width - vis_w) / 2)
    pos_y = int(height * visualizer_y) - vis_h
    
    # FFmpeg filters
    if style.lower() == "waveform":
        # Cline mode waveform
        vis_filter = f"showwaves=s={vis_w}x{vis_h}:mode=cline:colors={color_hex}:rate={fps}"
    else:
        # Spectrum bars
        vis_filter = f"showfreqs=s={vis_w}x{vis_h}:mode=bar:colors={color_hex}:ascale=log:fscale=log:rate={fps}"
        
    # Standard GPU/CPU encoding parameters
    enc_args = []
    if encoder == "h264_nvenc":
        enc_args = ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "19"]
    elif encoder == "h264_qsv":
        enc_args = ["-c:v", "h264_qsv", "-global_quality", "19", "-preset", "fast"]
    else:
        enc_args = ["-c:v", "libx264", "-preset", "fast", "-crf", "19"]
        
    temp_png_files = []
    overlay_inputs = []
    
    # Build song title PNG overlays if timeline is provided
    if tracks_timeline and fonts_dir:
        for idx, track in enumerate(tracks_timeline, 1):
            png_path = create_song_title_overlay(resolution, track["name"], fonts_dir, idx, font_family, visualizer_y, title_font_size)
            temp_png_files.append(png_path)
            overlay_inputs.extend(["-i", png_path])
            
    # Base input counts
    # For image: [0:v] is background, [1:a] is audio. Song overlays start at input index 2.
    # For video: [0:v] is background video, [1:v] is static overlay, [2:a] is audio. Song overlays start at index 3.
    song_overlay_start_idx = 2 if is_image else 3
    
    if is_image:
        # Image background is already pre-resized and pre-padded in python
        # We key out black background from native visualizer and apply opacity
        filter_complex_list = [
            f"[1:a]{vis_filter},colorkey=0x000000:0.1:0.1,format=rgba,colorchannelmixer=aa={opacity}[vis]",
            f"[0:v][vis]overlay=x={pos_x}:y={pos_y}:shortest=1[bg0]"
        ]
        
        # Chain overlays for song titles
        last_v = "bg0"
        for i, track in enumerate(tracks_timeline or []):
            next_v = f"bg{i+1}"
            inp_idx = song_overlay_start_idx + i
            start_t = track["start"]
            end_t = track["end"]
            filter_complex_list.append(
                f"[{last_v}][{inp_idx}:v]overlay=0:0:enable='between(t,{start_t:.3f},{end_t:.3f})'[{next_v}]"
            )
            last_v = next_v
            
        # Rename final stream
        if tracks_timeline:
            filter_complex_list[-1] = filter_complex_list[-1].replace(f"[{last_v}]", "[outv]")
        else:
            filter_complex_list[-1] = filter_complex_list[-1].replace("[bg0]", "[outv]")
            
        filter_complex = ";".join(filter_complex_list)
        
        cmd = [
            "ffmpeg", "-threads", "4", "-y",
            "-loop", "1", "-t", str(duration), "-i", background_path,
            "-i", audio_path,
        ] + overlay_inputs + [
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "1:a",
        ] + enc_args + [
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-r", str(fps),
            "-shortest",
            output_path
        ]
    else:
        # Video background, loop natively using -stream_loop -1
        filter_complex_list = [
            f"[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2[bg]",
            f"[bg][1:v]overlay=0:0[bg_with_text]",
            f"[2:a]{vis_filter},colorkey=0x000000:0.1:0.1,format=rgba,colorchannelmixer=aa={opacity}[vis]",
            f"[bg_with_text][vis]overlay=x={pos_x}:y={pos_y}:shortest=1[bg0]"
        ]
        
        # Chain overlays for song titles
        last_v = "bg0"
        for i, track in enumerate(tracks_timeline or []):
            next_v = f"bg{i+1}"
            inp_idx = song_overlay_start_idx + i
            start_t = track["start"]
            end_t = track["end"]
            filter_complex_list.append(
                f"[{last_v}][{inp_idx}:v]overlay=0:0:enable='between(t,{start_t:.3f},{end_t:.3f})'[{next_v}]"
            )
            last_v = next_v
            
        # Rename final stream
        if tracks_timeline:
            filter_complex_list[-1] = filter_complex_list[-1].replace(f"[{last_v}]", "[outv]")
        else:
            filter_complex_list[-1] = filter_complex_list[-1].replace("[bg0]", "[outv]")
            
        filter_complex = ";".join(filter_complex_list)
        
        cmd = [
            "ffmpeg", "-threads", "4", "-y",
            "-stream_loop", "-1", "-i", background_path,
            "-i", static_overlay_path,
            "-i", audio_path,
        ] + overlay_inputs + [
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "2:a",
        ] + enc_args + [
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-r", str(fps),
            "-shortest",
            output_path
        ]
        
    return cmd, temp_png_files

def render_custom_visualizer(
    audio_path: str,
    background_path: str,
    output_path: str,
    style: str,
    color_theme: str,
    resolution: Tuple[int, int],
    fps: int,
    duration: float,
    encoder: str = "libx264",
    tracks_timeline: List[Dict] = None,
    fonts_dir: str = None,
    progress_callback = None,
    is_image: bool = True,
    static_overlay_path: str = None,
    opacity: float = 0.8,
    visualizer_height: float = 0.15,
    visualizer_y: float = 0.92,
    font_family: str = "Inter",
    title_font_size: str = "Medium"
):
    """
    Renders custom visualizer styles (Circular Pulse, Particle Burst, Minimal Lines, etc.)
    by extracting FFT frequency data from audio, drawing frames in Pillow, and piping to FFmpeg.
    """
    width, height = resolution
    style_lower = style.lower()
    color_rgb = get_color_rgb(color_theme)
    
    # 1. Extract audio sample rate and PCM details via FFmpeg pipe
    sample_rate = 22050  # Downsample for faster FFT processing
    samples_per_frame = int(sample_rate / fps)
    
    logger.info(f"Extracting PCM from {audio_path}...")
    pcm_cmd = [
        "ffmpeg", "-threads", "2", "-i", audio_path,
        "-f", "s16le",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-"
    ]
    
    # Start FFmpeg PCM reader
    pcm_process = subprocess.Popen(pcm_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    # Prepare FFmpeg writer
    enc_args = []
    if encoder == "h264_nvenc":
        enc_args = ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "19"]
    elif encoder == "h264_qsv":
        enc_args = ["-c:v", "h264_qsv", "-global_quality", "19", "-preset", "fast"]
    else:
        enc_args = ["-c:v", "libx264", "-preset", "fast", "-crf", "19"]
        
    if is_image:
        # Background image is already resized and padded in python
        writer_cmd = [
            "ffmpeg", "-threads", "4", "-y",
            "-loop", "1", "-t", str(duration), "-i", background_path,  # Input 0: background image
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", f"{width}x{height}",
            "-r", str(fps),
            "-i", "-",                                                 # Input 1: raw video from python
            "-i", audio_path,                                          # Input 2: audio
            "-filter_complex", f"[1:v]format=rgba,colorchannelmixer=aa={opacity}[vis_opacity]; [0:v][vis_opacity]overlay=0:0:shortest=1[outv]",
            "-map", "[outv]",
            "-map", "2:a",
        ] + enc_args + [
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-shortest",
            output_path
        ]
    else:
        # Video background, loop natively
        writer_cmd = [
            "ffmpeg", "-threads", "4", "-y",
            "-stream_loop", "-1", "-i", background_path,                # Input 0: background video
            "-i", static_overlay_path,                                 # Input 1: static text overlay PNG
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", f"{width}x{height}",
            "-r", str(fps),
            "-i", "-",                                                 # Input 2: raw video from python
            "-i", audio_path,                                          # Input 3: audio
            "-filter_complex", f"[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2[bg];"
                               f"[bg][1:v]overlay=0:0[bg_with_text];"
                               f"[2:v]format=rgba,colorchannelmixer=aa={opacity}[vis_opacity];"
                               f"[bg_with_text][vis_opacity]overlay=0:0:shortest=1[outv]",
            "-map", "[outv]",
            "-map", "3:a",
        ] + enc_args + [
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-shortest",
            output_path
        ]
    
    writer_process = subprocess.Popen(writer_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    # Render parameters
    total_frames = int(duration * fps)
    
    # Smooth arrays for visualizer smoothing
    num_bars = 80 if style.lower() == "spectrum bars" else (64 if style.lower() == "circular pulse" else 128)
    map_size = num_bars
    smooth_history = np.zeros(map_size)
    
    # Particle burst particles container
    particles = []  # each particle: [angle, distance, speed, size, alpha]
    for _ in range(120):
        particles.append([
            np.random.uniform(0, 2 * math.pi),
            np.random.uniform(50, 400),
            np.random.uniform(2, 8),
            np.random.uniform(2, 6),
            np.random.uniform(0.1, 0.8)
        ])
        
    try:
        for frame_idx in range(total_frames):
            # Read PCM chunk for this frame (16-bit integer, 2 bytes per sample)
            bytes_to_read = samples_per_frame * 2
            raw_pcm = pcm_process.stdout.read(bytes_to_read)
            if not raw_pcm:
                # Fill remaining frames with silence
                audio_data = np.zeros(samples_per_frame)
            else:
                # Convert bytes to numpy array and normalize to [-1.0, 1.0]
                audio_data = np.frombuffer(raw_pcm, dtype=np.int16).astype(np.float32) / 32768.0
                if len(audio_data) < samples_per_frame:
                    audio_data = np.pad(audio_data, (0, samples_per_frame - len(audio_data)))
            
            # Apply Hanning window and run FFT
            windowed_data = audio_data * np.hanning(len(audio_data))
            fft_data = np.abs(np.fft.rfft(windowed_data))
            
            # Group FFT bins into visualizer bars
            # Focus on audible frequencies (mostly low to mid: 20Hz - 8000Hz)
            fft_len = len(fft_data)
            max_freq_idx = int(fft_len * 0.625) # Cutoff high frequencies at ~13.8kHz to match Web Audio API
            valid_fft = fft_data[:max_freq_idx]
            
            if len(valid_fft) > 0:
                # Normalize FFT amplitudes
                # For a window of length N, the maximum possible bin amplitude is N/2
                N = len(audio_data)
                fft_normalized = valid_fft / (N / 2)
                
                # Convert to dB with epsilon
                fft_db = 20 * np.log10(fft_normalized + 1e-5)
                
                # Map from [-90.0, -30.0] dB (Web Audio API standards) to [0.0, 255.0]
                min_db = -90.0
                max_db = -30.0
                fft_mapped = (fft_db - min_db) / (max_db - min_db) * 255.0
                fft_mapped = np.clip(fft_mapped, 0.0, 255.0)
                
                # Determine frequency range
                max_bin = len(valid_fft) - 1
                
                # Use linear spacing to match the Web Audio API's linear frequency bins
                bar_indices = np.linspace(1.0, max_bin, map_size)
                raw_bars = []
                for idx in bar_indices:
                    idx_floor = int(math.floor(idx))
                    idx_ceil = min(idx_floor + 1, len(valid_fft) - 1)
                    frac = idx - idx_floor
                    val = fft_mapped[idx_floor] * (1.0 - frac) + fft_mapped[idx_ceil] * frac
                    raw_bars.append(val)
                bars = np.array(raw_bars)
                
                # Spatial smoothing (horizontal wave smoothing)
                if map_size > 2:
                    bars_smooth = 0.7 * bars + 0.15 * np.roll(bars, 1) + 0.15 * np.roll(bars, -1)
                    bars_smooth[0] = 0.85 * bars[0] + 0.15 * bars[1]
                    bars_smooth[-1] = 0.85 * bars[-1] + 0.15 * bars[-2]
                    bars = bars_smooth
            else:
                bars = np.zeros(map_size)
                
            # Temporal Smoothing (Attack/Decay envelope follower)
            # Attack is fast (0.7) for beat responsiveness; Decay is slow (0.15) for fluidity
            rising = bars > smooth_history
            smooth_history = np.where(
                rising,
                smooth_history * 0.3 + bars * 0.7,
                smooth_history * 0.85 + bars * 0.15
            )
            
            # Calculate overall bass/volume for pulsing effects
            # Bass is usually in the first 10% of frequency bars
            bass_volume = np.mean(smooth_history[:int(map_size * 0.15)])
            overall_volume = np.mean(smooth_history)
            
            # Create a clean transparent canvas
            frame_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            
            # Create a separate transparent canvas for visualizer drawing
            vis_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            draw = ImageDraw.Draw(vis_img)
            
            # --- RENDER STYLES ---
            style_lower = style.lower()
            
            if style_lower == "circular pulse":
                # Circle visualizer centered at Y position
                scale_factor = visualizer_height / 0.15
                cx, cy = width // 2, int(height * visualizer_y)
                base_radius = int(160 * scale_factor) + int((bass_volume / 255.0) * (80 * scale_factor))
                
                # Draw pulsing glow/shadow
                glow_r = base_radius + int(15 * scale_factor)
                draw.ellipse(
                    (cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r),
                    fill=None,
                    outline=(color_rgb[0], color_rgb[1], color_rgb[2], 40),
                    width=int(12 * scale_factor)
                )
                
                # Draw bars radiating from center
                for i in range(num_bars):
                    angle = (i / num_bars) * 2 * math.pi
                    # Length of frequency bar
                    bar_len = (smooth_history[i] / 255.0) * 220 * scale_factor
                    
                    # Start point (on the circle boundary)
                    x_start = cx + base_radius * math.cos(angle)
                    y_start = cy + base_radius * math.sin(angle)
                    
                    # End point
                    x_end = cx + (base_radius + bar_len) * math.cos(angle)
                    y_end = cy + (base_radius + bar_len) * math.sin(angle)
                    
                    draw.line(
                        [(x_start, y_start), (x_end, y_end)],
                        fill=(color_rgb[0], color_rgb[1], color_rgb[2], 220),
                        width=int(4 * scale_factor)
                    )
                    
                # Center cover circle
                draw.ellipse(
                    (cx - base_radius, cy - base_radius, cx + base_radius, cy + base_radius),
                    fill=(15, 15, 15, 230),
                    outline=(color_rgb[0], color_rgb[1], color_rgb[2], 255),
                    width=int(4 * scale_factor)
                )
                
            elif style_lower == "particle burst":
                # Particles that react to treble/volume centered at Y position
                scale_factor = visualizer_height / 0.15
                cx, cy = width // 2, int(height * visualizer_y)
                
                # Update and draw particles
                for p in particles:
                    # Speed scales with overall volume
                    speed = p[2] * (1.0 + (overall_volume / 255.0) * 2.0)
                    p[1] += speed # Increase distance
                    
                    # If particle moves off-screen, reset
                    if p[1] > max(width, height) // 2 + 50:
                        p[1] = np.random.uniform(10 * scale_factor, 50 * scale_factor)
                        p[0] = np.random.uniform(0, 2 * math.pi)
                        p[2] = np.random.uniform(2, 8)
                        
                    # Calculate coordinate
                    px = cx + p[1] * math.cos(p[0])
                    py = cy + p[1] * math.sin(p[0])
                    
                    # Particle alpha glows with treble/volume
                    alpha = int(min(255, p[4] * 255 * (0.4 + (overall_volume / 255.0) * 0.6)))
                    p_size = p[3] * (1.0 + (bass_volume / 255.0) * 0.8) * scale_factor
                    
                    draw.ellipse(
                        (px - p_size, py - p_size, px + p_size, py + p_size),
                        fill=(color_rgb[0], color_rgb[1], color_rgb[2], alpha)
                    )
                    
                # Draw a minimal ring in the center pulsing with bass
                ring_r = int(100 * scale_factor) + int((bass_volume / 255.0) * (60 * scale_factor))
                draw.ellipse(
                    (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
                    fill=None,
                    outline=(color_rgb[0], color_rgb[1], color_rgb[2], 180),
                    width=int(3 * scale_factor)
                )
                
            elif style_lower == "minimal lines":
                # Minimal line visualizer
                vis_w = int(width * 0.6)
                vis_h = int(height * visualizer_height)
                startX = (width - vis_w) // 2
                base_y = int(height * visualizer_y)
                
                step_x = vis_w / num_bars
                points = []
                for i in range(num_bars):
                    px = startX + i * step_x
                    # Modulate height by smoothed frequency, scaled with visualizer_height
                    py = base_y - (smooth_history[i] / 255.0) * vis_h
                    points.append((px, py))
                    
                # Connect points as a continuous line
                for i in range(len(points) - 1):
                    draw.line(
                        [points[i], points[i+1]],
                        fill=(color_rgb[0], color_rgb[1], color_rgb[2], 230),
                        width=4
                    )
                    
            elif style_lower == "geometric":
                # Render clean geometric bars with Y-position and Y-scale
                vis_w = int(width * 0.65)
                vis_h = int(height * visualizer_height)
                start_x = (width - vis_w) // 2
                base_y = int(height * visualizer_y)
                bar_w = vis_w / num_bars
                
                for i in range(num_bars):
                    bx = start_x + i * bar_w
                    bh = (smooth_history[i] / 255.0) * vis_h
                    
                    # Draw a rectangle with round-ish top (we draw regular rect here)
                    if bh > 2:
                        draw.rectangle(
                            (bx + 1, base_y - bh, bx + bar_w - 1, base_y),
                            fill=(color_rgb[0], color_rgb[1], color_rgb[2], 200),
                            outline=None
                        )
                        # Add a bright cap on top of the bar
                        draw.rectangle(
                            (bx + 1, base_y - bh - 2, bx + bar_w - 1, base_y - bh),
                            fill=(255, 255, 255, 255)
                        )
            
            elif style_lower == "spectrum bars":
                # Draw clean independent spectrum analyzer bars at the bottom
                vis_w = int(width * 0.65)
                vis_h = int(height * visualizer_height)
                start_x = (width - vis_w) // 2
                base_y = int(height * visualizer_y)
                bar_w = vis_w / num_bars
                
                bar_width = int(bar_w * 0.70)
                bar_gap = bar_w - bar_width
                
                for i in range(num_bars):
                    bh = (smooth_history[i] / 255.0) * vis_h
                    
                    if bh > 2:
                        bx = start_x + i * bar_w
                        x0 = bx + bar_gap // 2
                        y0 = base_y - bh
                        x1 = bx + bar_gap // 2 + bar_width
                        y1 = base_y
                        
                        draw.rectangle(
                            (x0, y0, x1, y1),
                            fill=(color_rgb[0], color_rgb[1], color_rgb[2], 255),
                            outline=None
                        )
                                
            else: # Fallback or other styles (Shockwave, Galaxy Vortex)
                # Draw clean spectrum analyzer bars at the bottom
                vis_w = int(width * 0.65)
                vis_h = int(height * visualizer_height)
                start_x = (width - vis_w) // 2
                base_y = int(height * visualizer_y)
                bar_w = vis_w / num_bars
                
                bar_width = int(bar_w * 0.6)
                bar_gap = bar_w - bar_width
                
                for i in range(num_bars):
                    bx = start_x + i * bar_w
                    bh = (smooth_history[i] / 255.0) * vis_h
                    
                    if bh > 2:
                        draw.rectangle(
                            (bx + bar_gap // 2, base_y - bh, bx + bar_gap // 2 + bar_width, base_y),
                            fill=(color_rgb[0], color_rgb[1], color_rgb[2], 255),
                            outline=None
                        )
                        
            # Apply glow blur if needed (specifically for spectrum bars and fallback styles)
            if style_lower == "spectrum bars" or style_lower not in ("circular pulse", "particle burst", "minimal lines", "geometric"):
                # Apply Gaussian Blur to create the glow aura
                blur_radius = max(2, int(6 * (width / 1920)))
                # Crop only the visualizer area to speed up Gaussian blur (90% pixel reduction)
                vis_w = int(width * 0.65)
                vis_h = int(height * visualizer_height)
                start_x = (width - vis_w) // 2
                base_y = int(height * visualizer_y)
                
                crop_margin = blur_radius * 3
                cx0 = max(0, start_x - crop_margin)
                cy0 = max(0, base_y - vis_h - crop_margin)
                cx1 = min(width, start_x + vis_w + crop_margin)
                cy1 = min(height, base_y + crop_margin)
                
                vis_sub = vis_img.crop((cx0, cy0, cx1, cy1))
                glow_sub = vis_sub.filter(ImageFilter.GaussianBlur(radius=blur_radius))
                
                frame_img.paste(glow_sub, (cx0, cy0), glow_sub)
                frame_img.paste(vis_sub, (cx0, cy0), vis_sub)
            else:
                frame_img = Image.alpha_composite(frame_img, vis_img)


            # Draw dynamic active song title
            if tracks_timeline and fonts_dir:
                time_sec = frame_idx / fps
                active_track = ""
                for idx, track in enumerate(tracks_timeline, 1):
                    if track["start"] <= time_sec <= track["end"]:
                        active_track = track['name']
                        break
                if active_track:
                    # Map Small, Medium, Large to Y multipliers
                    size_map = {"Small": 0.024, "Medium": 0.032, "Large": 0.040}
                    mult = size_map.get(title_font_size, 0.032)
                    font_song = get_font(active_track, True, int(height * mult), fonts_dir, font_family)
                    
                    draw_title = ImageDraw.Draw(frame_img)
                    if contains_thai(active_track):
                        tx_w = get_thai_text_width(draw_title, active_track, font_song)
                    else:
                        bbox = draw_title.textbbox((0, 0), active_track, font=font_song)
                        tx_w = bbox[2] - bbox[0]
                    pos_x = (width - tx_w) // 2
                    pos_y = int(height * (visualizer_y + 0.025)) # Placed below visualizer
                    
                    # Draw premium 3D text with soft drop shadow
                    draw_3d_text_with_shadow(
                        draw_handle=draw_title,
                        frame_img=frame_img,
                        position=(pos_x, pos_y),
                        text=active_track,
                        font=font_song,
                        fill_color=(255, 255, 255, 255),
                        outline_color=(0, 0, 0, 255),
                        outline_width=2,
                        shadow_offset=(3, 4),
                        shadow_blur=4
                    )
                        
            # Save frame to FFmpeg pipe
            frame_bytes = frame_img.tobytes()
            try:
                writer_process.stdin.write(frame_bytes)
            except (BrokenPipeError, OSError) as e:
                logger.warning(f"FFmpeg writer pipe closed early (possibly due to audio stream ending): {e}. Stopping frame render loop.")
                break
            
            # Call progress callback if provided
            if progress_callback and frame_idx % 24 == 0:
                progress_callback(frame_idx / total_frames)
                
    except Exception as e:
        logger.error(f"Error in custom visualizer frame loop: {e}")
        raise e
    finally:
        # Close handles
        try: pcm_process.terminate()
        except: pass
        try:
            writer_process.stdin.close()
            writer_process.wait()
        except: pass
        
    logger.info("Custom visualizer render finished successfully.")
