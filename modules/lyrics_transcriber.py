import base64
import os
import json
import logging
import requests
import subprocess
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def convert_to_transcription_audio(input_path: str, temp_dir: str) -> str:
    """
    Converts audio to a highly compressed mono MP3 (64k) to minimize API payload size.
    """
    import uuid
    temp_filename = f"transcribe_input_{uuid.uuid4().hex[:8]}.mp3"
    temp_path = os.path.join(temp_dir, temp_filename)
    
    # Compress to mono, 64k, 22050Hz to minimize size while keeping vocal clarity
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-acodec", "libmp3lame",
        "-b:a", "64k",
        "-ac", "1",
        "-ar", "22050",
        temp_path
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
            return temp_path
    except Exception as e:
        logger.error(f"Failed to compress audio for transcription: {e}")
        
    return input_path

def transcribe_audio_lyrics(
    audio_path: str,
    api_key: str,
    temp_dir: str,
    model: str = "google/gemini-2.5-pro"
) -> List[Dict[str, Any]]:
    """
    Transcribes lyrics with timestamps from an audio file using OpenRouter (Gemini).
    """
    if not api_key:
        raise ValueError("OpenRouter API key is required.")
        
    # Compress audio first to save bandwidth and speed up request
    compressed_path = convert_to_transcription_audio(audio_path, temp_dir)
    
    try:
        with open(compressed_path, "rb") as f:
            audio_data = base64.b64encode(f.read()).decode("utf-8")
    finally:
        if compressed_path != audio_path and os.path.exists(compressed_path):
            try:
                os.remove(compressed_path)
            except Exception:
                pass
                
    # Prepare OpenRouter payload
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:19385",
        "X-Title": "Jaihug Longplay Creator"
    }
    
    prompt = (
        "You are a professional audio transcriber and subtitler. \n"
        "Please listen to the attached audio and transcribe the vocals (lyrics or speech). \n"
        "Create a highly accurate SubRip (.srt) format subtitle file. \n\n"
        "IMPORTANT: You MUST use the standard SRT timestamp format: HH:MM:SS,mmm --> HH:MM:SS,mmm\n"
        "(Use a comma \",\" to separate seconds and milliseconds, NOT a dot \".\").\n\n"
        "Example format:\n"
        "1\n"
        "00:00:01,000 --> 00:00:04,500\n"
        "Hello world\n\n"
        "Ensure the timestamps align perfectly with the flow of the vocals. \n"
        "Support whatever language is spoken in the audio.\n"
        "Output strictly the .srt file content, nothing else."
    )
    
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": audio_data,
                            "format": "mp3"
                        }
                    }
                ]
            }
        ]
    }
    
    logger.info(f"Sending transcription request to OpenRouter using {model}...")
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code != 200:
        raise Exception(f"OpenRouter API error (HTTP {response.status_code}): {response.text}")
        
    res_data = response.json()
    try:
        content = res_data["choices"][0]["message"]["content"].strip()
        
        # Strip markdown code blocks if present (e.g. ```srt ... ```)
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines).strip()
            
        from modules.subtitle_parser import parse_srt
        subtitles = parse_srt(content)
        if not subtitles:
            raise ValueError("No subtitles could be parsed from the model response.")
        return subtitles
    except Exception as e:
        logger.error(f"Failed to parse API response: {e}. Raw content: {res_data}")
        raise e
