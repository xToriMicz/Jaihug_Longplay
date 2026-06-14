import re
import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def parse_time_to_seconds(time_str: str) -> float:
    """
    Parses a time string in format HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS.mmm
    to float seconds.
    """
    time_str = time_str.strip().replace(',', '.')
    parts = time_str.split(':')
    try:
        if len(parts) == 3:
            h, m, s = parts
            return float(h) * 3600.0 + float(m) * 60.0 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return float(m) * 60.0 + float(s)
        else:
            return float(time_str)
    except Exception as e:
        logger.warning(f"Failed to parse time string '{time_str}': {e}")
        return 0.0

def parse_srt(content: str) -> List[Dict[str, Any]]:
    """
    Parses SRT subtitle content into a list of dictionaries with 'start', 'end', and 'text'.
    """
    subtitles = []
    # Normalize line endings
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    # Split into blocks by double newlines or multiple newlines
    blocks = re.split(r'\n\n+', content.strip())
    
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) < 2:
            continue
            
        # First line is usually index (might be skipped if malformed)
        time_line_idx = 0
        if lines[0].strip().isdigit():
            time_line_idx = 1
            
        if time_line_idx >= len(lines):
            continue
            
        time_line = lines[time_line_idx].strip()
        # Expecting e.g. "00:00:01,500 --> 00:00:04,200"
        if '-->' not in time_line:
            continue
            
        time_parts = time_line.split('-->')
        if len(time_parts) != 2:
            continue
            
        start_sec = parse_time_to_seconds(time_parts[0])
        end_sec = parse_time_to_seconds(time_parts[1])
        
        # Text is everything after the timeline
        text_lines = lines[time_line_idx + 1:]
        text = '\n'.join(text_lines).strip()
        
        subtitles.append({
            "start": start_sec,
            "end": end_sec,
            "text": text
        })
        
    return subtitles

def parse_ass(content: str) -> List[Dict[str, Any]]:
    """
    Parses ASS subtitle content into a list of dictionaries with 'start', 'end', and 'text'.
    Strips style tags in dialogue.
    """
    subtitles = []
    # Normalize line endings
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    lines = content.split('\n')
    
    in_events = False
    format_fields = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check section headers
        if line.lower() == '[events]':
            in_events = True
            continue
        elif line.startswith('[') and line.endswith(']'):
            in_events = False
            continue
            
        if not in_events:
            continue
            
        if line.lower().startswith('format:'):
            # Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            header_val = line.split(':', 1)[1].strip()
            format_fields = [f.strip().lower() for f in header_val.split(',')]
            continue
            
        if line.lower().startswith('dialogue:'):
            payload = line.split(':', 1)[1].strip()
            # If we don't have format fields, assume standard dialogue layout
            # 9 commas means splitting into 10 parts
            parts = payload.split(',', 9)
            if len(parts) < 10:
                continue
                
            start_str = parts[1] # Start
            end_str = parts[2]   # End
            text_str = parts[9]  # Text
            
            # If format fields exist, find the correct indices
            if format_fields:
                try:
                    parts = payload.split(',', len(format_fields) - 1)
                    start_idx = format_fields.index('start')
                    end_idx = format_fields.index('end')
                    text_idx = format_fields.index('text')
                    start_str = parts[start_idx]
                    end_str = parts[end_idx]
                    text_str = parts[text_idx]
                except Exception:
                    pass # Fallback to standard dialogue positions
                    
            start_sec = parse_time_to_seconds(start_str)
            end_sec = parse_time_to_seconds(end_str)
            
            # Clean formatting tags, e.g. {\pos(960,1000)} or {\fnArial} or {\c&HFF0000&}
            clean_text = re.sub(r'\{[^}]*\}', '', text_str).strip()
            # Clean up line breaks in ASS (e.g. \N or \n or \h)
            clean_text = clean_text.replace('\\N', '\n').replace('\\n', '\n').replace('\\h', ' ')
            
            subtitles.append({
                "start": start_sec,
                "end": end_sec,
                "text": clean_text
            })
            
    # Sort subtitles chronologically
    subtitles.sort(key=lambda x: x['start'])
    return subtitles
