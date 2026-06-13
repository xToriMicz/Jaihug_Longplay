import os
import subprocess
import json
import logging
import re
from datetime import datetime
from typing import List, Tuple
from modules.utils import safe_path_for_ffmpeg, run_command

logger = logging.getLogger(__name__)

def get_audio_info(audio_file: str) -> Tuple[float, int, int]:
    """
    Retrieves duration (seconds), sample rate (Hz), and channels from an audio file using ffprobe.
    Returns (duration, sample_rate, channels)
    """
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        audio_file
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, errors='ignore')
        if result.returncode == 0:
            data = json.loads(result.stdout)
            
            # Duration
            duration = float(data.get("format", {}).get("duration", 0.0))
            
            # Find audio stream
            audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
            sample_rate = int(audio_stream.get("sample_rate", 44100))
            channels = int(audio_stream.get("channels", 2))
            
            return duration, sample_rate, channels
    except Exception as e:
        logger.error(f"Error reading audio info for {audio_file}: {e}")
    
    return 0.0, 44100, 2

def generate_timeline_files(audio_files: List[str], output_audio_path: str, track_names: List[str] = None):
    """
    Generates Timeline.txt and SongList.txt side-by-side with the output file.
    """
    timeline_entries = []
    song_list_entries = []
    current_seconds = 0.0
    
    for idx, filepath in enumerate(audio_files, 1):
        duration, _, _ = get_audio_info(filepath)
        if track_names and idx - 1 < len(track_names):
            filename = track_names[idx - 1]
        else:
            filename = os.path.splitext(os.path.basename(filepath))[0]
            # Strip 8-character hex UUID prefix followed by underscore (e.g. 201a52fa_)
            filename = re.sub(r'^[0-9a-fA-F]{8}_', '', filename)
        
        # Format Start Time
        hours = int(current_seconds // 3600)
        minutes = int((current_seconds % 3600) // 60)
        seconds = int(current_seconds % 60)
        
        if hours > 0:
            time_str = f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            time_str = f"{minutes}:{seconds:02d}"
            
        timeline_entries.append(f"{time_str} {filename}")
        song_list_entries.append(f"{idx}. {filename}")
        current_seconds += duration

    # Format Total Duration
    tot_h = int(current_seconds // 3600)
    tot_m = int((current_seconds % 3600) // 60)
    tot_s = int(current_seconds % 60)
    total_duration_str = f"{tot_h}:{tot_m:02d}:{tot_s:02d}" if tot_h > 0 else f"{tot_m}:{tot_s:02d}"

    created_at_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Content for Timeline
    timeline_content = "🎵 Timeline ของเพลงที่รวมกัน\n" + "=" * 50 + "\n\n"
    timeline_content += "\n".join(timeline_entries)
    timeline_content += f"\n\n📊 รวมทั้งหมด: {len(audio_files)} เพลง\n"
    timeline_content += f"⏱️ ความยาวรวม: {total_duration_str}\n"
    timeline_content += f"📅 สร้างเมื่อ: {created_at_str}\n"
    
    timeline_path = os.path.splitext(output_audio_path)[0] + "_Timeline.txt"
    with open(timeline_path, "w", encoding="utf-8") as f:
        f.write(timeline_content)
        
    # Content for Song List
    song_list_content = "🎵 รายชื่อเพลง (Song List)\n" + "=" * 50 + "\n\n"
    song_list_content += "\n".join(song_list_entries)
    song_list_content += f"\n\n📊 รวมทั้งหมด: {len(audio_files)} เพลง\n"
    song_list_content += f"📅 สร้างเมื่อ: {created_at_str}\n"
    
    song_list_path = os.path.splitext(output_audio_path)[0] + "_SongList.txt"
    with open(song_list_path, "w", encoding="utf-8") as f:
        f.write(song_list_content)
        
    logger.info(f"Timeline/SongList generated at: {timeline_path}")

def merge_audio_files(audio_files: List[str], output_path: str, track_names: List[str] = None) -> str:
    """
    Merges multiple audio files.
    Tries fast copy concat first if codecs, formats, and output format match,
    otherwise falls back to re-encoding concat.
    """
    if not audio_files:
        raise ValueError("No audio files provided to merge")
        
    # Generate Timeline and Song List text files
    generate_timeline_files(audio_files, output_path, track_names)
    
    # Analyze files
    formats = []
    sample_rates = []
    channels_list = []
    
    for f in audio_files:
        ext = os.path.splitext(f)[1].lower()
        duration, sr, ch = get_audio_info(f)
        formats.append(ext)
        sample_rates.append(sr)
        channels_list.append(ch)
        
    # Check if inputs are uniform and match the desired output format extension
    same_format = len(set(formats)) == 1
    same_sr = len(set(sample_rates)) == 1
    same_ch = len(set(channels_list)) == 1
    output_ext = os.path.splitext(output_path)[1].lower()
    matches_output = formats[0] == output_ext if formats else False
    
    if same_format and same_sr and same_ch and matches_output:
        logger.info("Uniform files matching output format detected. Using FFmpeg fast concat (stream copy)...")
        return merge_audio_ffmpeg_fast(audio_files, output_path)
    else:
        logger.info("Mismatched or different parameters detected. Using FFmpeg re-encoding concat (to MP3)...")
        # Ensure output is .mp3 for encoded merge
        if output_ext != ".mp3":
            output_path = os.path.splitext(output_path)[0] + ".mp3"
        return merge_audio_ffmpeg_encode(audio_files, output_path)

def merge_audio_ffmpeg_fast(audio_files: List[str], output_path: str) -> str:
    """
    Fast merge using FFmpeg concat demuxer (stream copy).
    """
    output_dir = os.path.dirname(output_path) or "."
    concat_file_path = os.path.join(output_dir, f"temp_audio_concat_{os.getpid()}.txt")
    
    try:
        with open(concat_file_path, "w", encoding="utf-8") as f:
            for audio_file in audio_files:
                safe_path = safe_path_for_ffmpeg(audio_file)
                f.write(f"file '{safe_path}'\n")
                
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file_path,
            "-c", "copy",
            output_path
        ]
        
        returncode, _, stderr = run_command(cmd)
        if returncode != 0 or not os.path.exists(output_path):
            raise RuntimeError(f"FFmpeg copy concat failed: {stderr}")
            
        return output_path
    finally:
        if os.path.exists(concat_file_path):
            try: os.unlink(concat_file_path)
            except: pass

def merge_audio_ffmpeg_encode(audio_files: List[str], output_path: str) -> str:
    """
    Merges audio files by re-encoding them to a uniform output (MP3 @ 192k).
    """
    cmd = ["ffmpeg", "-y"]
    
    # Input files
    for f in audio_files:
        cmd.extend(["-i", f])
        
    # Concat filter
    # e.g., -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" -map "[out]"
    filter_inputs = "".join(f"[{i}:a]" for i in range(len(audio_files)))
    filter_complex = f"{filter_inputs}concat=n={len(audio_files)}:v=0:a=1[out]"
    
    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-ar", "44100",
        output_path
    ])
    
    returncode, _, stderr = run_command(cmd)
    if returncode != 0 or not os.path.exists(output_path):
         raise RuntimeError(f"FFmpeg encoding concat failed: {stderr}")
         
    return output_path
