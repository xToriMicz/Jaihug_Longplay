import os
import math
import subprocess
import time
import logging
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont, ImageColor
from modules.utils import safe_path_for_ffmpeg, run_command, ensure_fonts, get_font, contains_thai, render_thai_clean
from modules.audio_merger import get_audio_info, merge_audio_files
from modules.visualizer_renderer import get_ffmpeg_visualizer_args, render_custom_visualizer

logger = logging.getLogger(__name__)

def create_static_text_overlay(
    resolution: Tuple[int, int],
    genre: str,
    main_title: str,
    description: str,
    watermark: str,
    fonts_dir: str,
    font_family: str = "Inter"
) -> str:
    """
    Creates a transparent PNG with all the static text overlays (genre, main title, description, watermark).
    Using PIL to render Thai text beautifully.
    """
    width, height = resolution
    overlay_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_img)
    
    # Load fonts using dynamic get_font
    font_genre = get_font(genre or "", False, int(height * 0.025), fonts_dir, font_family)
    font_title = get_font(main_title or "", True, int(height * 0.065), fonts_dir, font_family)
    font_desc = get_font(description or "", False, int(height * 0.022), fonts_dir, font_family)
    font_watermark = get_font(watermark or "", True, int(height * 0.035), fonts_dir, font_family)

    
    # Text positions (percentages of width/height)
    margin_x = int(width * 0.08)
    
    # Draw Watermark logo/text at bottom left
    if watermark:
        if contains_thai(watermark):
            render_thai_clean(draw, (margin_x, int(height * 0.78)), watermark, font_watermark, (255, 255, 255, 240), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        else:
            draw.text(
                (margin_x, int(height * 0.78)),
                watermark,
                font=font_watermark,
                fill=(255, 255, 255, 240),
                stroke_width=2,
                stroke_fill=(0, 0, 0, 255)
            )
        
    # Save overlay image
    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "temp"))
    os.makedirs(temp_dir, exist_ok=True)
    overlay_path = os.path.join(temp_dir, f"static_text_overlay_{os.getpid()}.png")
    overlay_img.save(overlay_path, "PNG")
    return overlay_path



def detect_encoder() -> str:
    """
    Detects the best available hardware accelerator for video encoding.
    """
    try:
        # Check NVIDIA NVENC
        res = subprocess.run(["ffmpeg", "-encoders"], capture_output=True, text=True)
        if "h264_nvenc" in res.stdout:
            logger.info("NVIDIA NVENC hardware encoder detected.")
            return "h264_nvenc"
        elif "h264_qsv" in res.stdout:
            logger.info("Intel QSV hardware encoder detected.")
            return "h264_qsv"
    except Exception:
        pass
    logger.info("Using standard CPU encoder (libx264).")
    return "libx264"

def create_longplay_video(
    audio_files: List[str],
    background_media: str,
    output_path: str,
    style: str,
    color_theme: str,
    resolution: Tuple[int, int],
    fps: int,
    genre: str,
    main_title: str,
    description: str,
    watermark: str,
    progress_callback = None,
    visualizer_opacity: float = 0.8,
    visualizer_height: float = 0.15,
    visualizer_y: float = 0.92,
    font_family: str = "Inter",
    track_names: List[str] = None,
    title_font_size: str = "Medium"
) -> str:
    """
    Coordinates the entire Visual Music Longplay generation pipeline.
    """
    logger.info("Starting Visual Music Longplay generation...")
    fonts_dir = ensure_fonts()
    encoder = detect_encoder()
    
    temp_files = []
    
    # 1. Merge audio files first
    temp_audio = os.path.join(os.path.dirname(output_path), f"merged_audio_{os.getpid()}.mp3")
    logger.info("Step 1: Merging audio tracks...")
    merged_audio_path = merge_audio_files(audio_files, temp_audio)
    temp_files.append(merged_audio_path)
    
    # Rename timeline and songlist from temp_audio name to output_path name
    temp_timeline = os.path.splitext(merged_audio_path)[0] + "_Timeline.txt"
    temp_songlist = os.path.splitext(merged_audio_path)[0] + "_SongList.txt"
    final_timeline = os.path.splitext(output_path)[0] + "_Timeline.txt"
    final_songlist = os.path.splitext(output_path)[0] + "_SongList.txt"
    try:
        if os.path.exists(temp_timeline):
            if os.path.exists(final_timeline):
                os.remove(final_timeline)
            os.rename(temp_timeline, final_timeline)
            logger.info(f"Renamed timeline to: {final_timeline}")
        if os.path.exists(temp_songlist):
            if os.path.exists(final_songlist):
                os.remove(final_songlist)
            os.rename(temp_songlist, final_songlist)
            logger.info(f"Renamed songlist to: {final_songlist}")
    except Exception as e:
        logger.warning(f"Could not rename timeline/songlist files: {e}")
        
    # Retrieve final audio duration
    audio_duration, _, _ = get_audio_info(merged_audio_path)
    logger.info(f"Merged audio duration: {audio_duration:.2f} seconds")
    
    # Calculate track start/end times for dynamic song title display
    tracks_timeline = []
    curr_time = 0.0
    for i, f in enumerate(audio_files):
        duration, _, _ = get_audio_info(f)
        song_name = track_names[i] if (track_names and i < len(track_names)) else os.path.splitext(os.path.basename(f))[0]
        tracks_timeline.append({
            "name": song_name,
            "start": curr_time,
            "end": curr_time + duration
        })
        curr_time += duration
        
    # 2. Check if background is image or video
    is_image = background_media.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.bmp'))
    
    # 3. Create static text overlay PNG
    static_overlay_path = create_static_text_overlay(
        resolution=resolution,
        genre=genre,
        main_title=main_title,
        description=description,
        watermark=watermark,
        fonts_dir=fonts_dir,
        font_family=font_family
    )
    temp_files.append(static_overlay_path)
    
    # 4. Prepare base background with text burned in
    if is_image:
        # Pre-burn the text onto the image background once
        bg_img = Image.open(background_media).convert("RGBA")
        width, height = resolution
        bg_w, bg_h = bg_img.size
        aspect_bg = bg_w / bg_h
        aspect_target = width / height
        
        if aspect_bg > aspect_target:
            new_w = width
            new_h = int(width / aspect_bg)
        else:
            new_h = height
            new_w = int(height * aspect_bg)
            
        bg_resized = bg_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        bg_final = Image.new("RGBA", (width, height), (0, 0, 0, 255))
        pad_x = (width - new_w) // 2
        pad_y = (height - new_h) // 2
        bg_final.paste(bg_resized, (pad_x, pad_y))
        
        # Overlay the static text
        txt_img = Image.open(static_overlay_path).convert("RGBA")
        bg_final = Image.alpha_composite(bg_final, txt_img)
        
        bg_with_text_path = os.path.join(os.path.dirname(static_overlay_path), f"bg_with_text_{os.getpid()}.png")
        bg_final.save(bg_with_text_path)
        temp_files.append(bg_with_text_path)
        
        active_background = bg_with_text_path
    else:
        # Video background, we don't need to generate a looped video background anymore.
        # We will loop it natively using FFmpeg's -stream_loop option in a single pass.
        active_background = background_media

    # 5. Render active visualizer & output final longplay video
    logger.info(f"Step 2: Rendering visualizer (Style: {style}, Color Theme: {color_theme})...")
    
    style_lower = style.lower()
    
    # Waveform can be rendered fast via FFmpeg Native filter complex.
    # Spectrum Bars is rendered via the custom Python renderer to support chunky spacing.
    if style_lower == "waveform":
        logger.info("Using high-performance native FFmpeg filter for rendering...")
        ffmpeg_cmd, temp_png_files = get_ffmpeg_visualizer_args(
            audio_path=merged_audio_path,
            background_path=active_background,
            output_path=output_path,
            style=style,
            color_theme=color_theme,
            resolution=resolution,
            fps=fps,
            duration=audio_duration,
            encoder=encoder,
            is_image=is_image,
            static_overlay_path=static_overlay_path,
            opacity=visualizer_opacity,
            tracks_timeline=tracks_timeline,
            fonts_dir=fonts_dir,
            visualizer_height=visualizer_height,
            visualizer_y=visualizer_y,
            font_family=font_family,
            title_font_size=title_font_size
        )
        temp_files.extend(temp_png_files)
        
        # Run FFmpeg native visualizer process
        returncode, _, stderr = run_command(ffmpeg_cmd)
        if returncode != 0 or not os.path.exists(output_path):
            raise RuntimeError(f"Native FFmpeg visualizer rendering failed: {stderr}")
            
    else:
        # Use Custom Python Frame-by-Frame renderer
        logger.info("Using Pillow + NumPy visualizer frame loop renderer...")
        render_custom_visualizer(
            audio_path=merged_audio_path,
            background_path=active_background,
            output_path=output_path,
            style=style,
            color_theme=color_theme,
            resolution=resolution,
            fps=fps,
            duration=audio_duration,
            encoder=encoder,
            tracks_timeline=tracks_timeline,
            fonts_dir=fonts_dir,
            progress_callback=progress_callback,
            is_image=is_image,
            static_overlay_path=static_overlay_path,
            opacity=visualizer_opacity,
            visualizer_height=visualizer_height,
            visualizer_y=visualizer_y,
            font_family=font_family,
            title_font_size=title_font_size
        )

    # Clean up temp files
    logger.info("Cleaning up intermediate files...")
    for temp_f in temp_files:
        try:
            if os.path.exists(temp_f):
                os.remove(temp_f)
        except Exception as e:
            logger.warning(f"Could not remove temp file {temp_f}: {e}")
            
    logger.info(f"Visual Music Longplay created successfully at {output_path}!")
    return output_path
