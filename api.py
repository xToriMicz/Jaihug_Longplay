import os
import uuid
import json
import logging
import subprocess
import threading
import unicodedata
from typing import List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from modules.audio_merger import get_audio_info
from modules.video_creator import create_longplay_video

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Visual Music Longplay API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:19385", "http://127.0.0.1:19385"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CORSStaticFiles(StaticFiles):
    async def simple_response(self, *args, **kwargs) -> Response:
        response = await super().simple_response(*args, **kwargs)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

# Project paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
TEMP_DIR = os.path.join(BASE_DIR, "temp")
STATE_FILE = os.path.join(BASE_DIR, "workspace_state.json")

# Ensure folders exist
PROJECTS_DIR = os.path.join(BASE_DIR, "projects")
for folder in [UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR, PROJECTS_DIR]:
    os.makedirs(folder, exist_ok=True)

# Mount static folders with CORS support
app.mount("/uploads", CORSStaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/output", CORSStaticFiles(directory=OUTPUT_DIR), name="output")

# In-memory progress tracking
export_progress = {
    "status": "idle",       # idle, processing, success, failed
    "progress": 0.0,        # 0.0 to 100.0
    "step": "",             # Description of current step
    "output_video": "",
    "output_timeline": "",
    "output_songlist": "",
    "error": ""
}

# Lock for thread-safe state modification
progress_lock = threading.Lock()

class EditorState(BaseModel):
    tracks: List[Dict[str, Any]]
    backgrounds: List[Dict[str, Any]]
    active_background: str
    settings: Dict[str, Any]

def load_default_state() -> Dict[str, Any]:
    return {
        "tracks": [],
        "backgrounds": [],
        "active_background": "",
        "settings": {
            "main_title": "เจ็บจนไม่รู้สึกอะไร...",
            "genre": "Acoustic, Sad Thai Pop Rock 2026",
            "description": "เพลงออนไลน์ ฟังสบายๆ ฟังทำงาน ร้านกาแฟ",
            "watermark": "Jaihug Music",
            "resolution": "HD",
            "fps": 24,
            "visualizer_style": "Spectrum Bars",
            "color_theme": "Lo-fi / Chill",
            "custom_color": "",
            "visualizer_opacity": 0.8,
            "visualizer_height": 0.15,
            "visualizer_y": 0.92,
            "font_family": "Inter",
            "title_font_size": "Medium",
            "ken_burns": False,
            "ken_burns_speed": "normal",
            "background_filter": "none",
            "bgs_per_track": 1,
            "selected_bg_paths": []
        }
    }

@app.get("/api/state")
def get_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading state file: {e}")
            return load_default_state()
    else:
        return load_default_state()

@app.post("/api/state")
def save_state(state: EditorState):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state.dict(), f, indent=2, ensure_ascii=False)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error saving state file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), file_type: str = Form(...)):
    """
    Handles uploading track mp3s or image/video backgrounds.
    """
    # Create clean name
    original_name = file.filename
    clean_name = "".join(c for c in original_name if c.isalnum() or unicodedata.category(c).startswith('M') or c in (".", "_", "-", " ", "(", ")", "[", "]", ",", "&")).strip()
    # Add unique prefix to avoid collisions
    unique_filename = f"{uuid.uuid4().hex[:8]}_{clean_name}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
            
        duration = 0.0
        if file_type == "audio":
            duration, _, _ = get_audio_info(file_path)
            
        relative_path = f"/uploads/{unique_filename}"
        return {
            "filename": original_name,
            "filepath": relative_path,
            "duration": duration
        }
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def run_export_pipeline(state_data: Dict[str, Any]):
    global export_progress
    temp_trimmed_files = []
    
    try:
        with progress_lock:
            export_progress.update({
                "status": "processing",
                "progress": 5.0,
                "step": "Initializing export pipeline...",
                "error": ""
            })
            
        settings = state_data.get("settings", {})
        tracks = state_data.get("tracks", [])
        active_bg_rel = state_data.get("active_background", "")
        
        if not tracks:
            raise ValueError("No audio tracks in playlist")
        if not active_bg_rel:
            raise ValueError("No background media selected")
            
        # Convert relative URLs to absolute paths
        audio_files = []
        processed_tracks = []
        bg_abs_path = os.path.join(BASE_DIR, active_bg_rel.lstrip("/"))
        if not os.path.exists(bg_abs_path):
             raise FileNotFoundError(f"Background media not found: {active_bg_rel}")
             
        for t in tracks:
            rel_path = t["filepath"].lstrip("/")
            abs_path = os.path.join(BASE_DIR, rel_path)
            track_duration = t.get("duration", 0.0)
            
            if os.path.exists(abs_path):
                # Check if we should trim the track (Custom Hook)
                if t.get("use_hook") and t.get("hook_start") is not None and t.get("hook_duration") is not None:
                    hook_start = float(t["hook_start"])
                    hook_dur = float(t["hook_duration"])
                    
                    temp_filename = f"trim_{uuid.uuid4().hex[:8]}_{os.path.basename(abs_path)}"
                    temp_filepath = os.path.join(TEMP_DIR, temp_filename)
                    
                    logger.info(f"Trimming track {abs_path} from {hook_start}s for {hook_dur}s to {temp_filepath}")
                    
                    # Trim without re-encoding using stream copy
                    trim_cmd = [
                        "ffmpeg", "-y",
                        "-ss", str(hook_start),
                        "-t", str(hook_dur),
                        "-i", abs_path,
                        "-c", "copy",
                        temp_filepath
                    ]
                    
                    try:
                        subprocess.run(trim_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                        trimmed_dur, _, _ = get_audio_info(temp_filepath)
                        if trimmed_dur > 0:
                            logger.info(f"Trimmed successfully! New duration: {trimmed_dur}s")
                            audio_files.append(temp_filepath)
                            temp_trimmed_files.append(temp_filepath)
                            abs_path = temp_filepath
                            track_duration = trimmed_dur
                        else:
                            logger.warning(f"Trimmed file was empty, falling back to original: {abs_path}")
                            audio_files.append(abs_path)
                    except Exception as err:
                        logger.error(f"FFmpeg trim failed: {err}. Falling back to original: {abs_path}")
                        audio_files.append(abs_path)
                else:
                    audio_files.append(abs_path)
                
            # Resolve track background(s)
            bg_val = t.get("background")
            bg_abs = None
            if bg_val:
                if isinstance(bg_val, list):
                    bg_abs = []
                    for b in bg_val:
                        if b:
                            bg_abs.append(os.path.join(BASE_DIR, b.lstrip("/")))
                        else:
                            bg_abs.append(bg_abs_path)
                else:
                    bg_abs = os.path.join(BASE_DIR, bg_val.lstrip("/"))
            
            processed_tracks.append({
                "filepath": abs_path,
                "duration": track_duration,
                "background": bg_abs,
                "name": os.path.splitext(t["filename"])[0]
            })
             
        # Resolution mapping
        res_map = {
            "HD": (1920, 1080),
            "2K": (2560, 1440),
            "4K": (3840, 2160),
            "Vertical HD": (1080, 1920),
            "Vertical 2K": (1440, 2560),
            "Vertical 4K": (2160, 3840)
        }
        res_val = res_map.get(settings.get("resolution", "HD"), (1920, 1080))
        
        # Color Theme: use custom color if available, otherwise preset name
        color_theme = settings.get("custom_color") or settings.get("color_theme", "Lo-fi / Chill")
        
        # Outputs
        output_filename = f"longplay_{uuid.uuid4().hex[:6]}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        
        total_duration = max(1.0, sum(t.get("duration", 0.0) for t in tracks))
        import time
        render_start_time = [None]
        
        # Callback to update progress
        def on_visualizer_progress(ratio: float):
            if render_start_time[0] is None:
                render_start_time[0] = time.time()
                
            elapsed = time.time() - render_start_time[0]
            percent = 10.0 + (ratio * 85.0)
            
            eta_msg = ""
            if ratio > 0.01:
                total_est = elapsed / ratio
                eta = max(0.0, total_est - elapsed)
                eta_str = f"{int(eta // 60)}ม. {int(eta % 60)}ว." if eta >= 60 else f"{int(eta)}ว."
                
                # Estimate current FPS
                tot_fps = int(settings.get("fps", 24))
                tot_frames = total_duration * tot_fps
                curr_fps = (ratio * tot_frames) / elapsed
                
                eta_msg = f" (เหลืออีก ~{eta_str} | ความเร็ว {curr_fps:.1f} fps)"
                
            with progress_lock:
                export_progress["progress"] = round(percent, 1)
                export_progress["step"] = f"กำลังเรนเดอร์เฟรม visualizer ({round(ratio * 100)}%){eta_msg}..."
                
        # Update progress for audio merging
        with progress_lock:
            export_progress["progress"] = 8.0
            export_progress["step"] = "Merging audio tracks & generating song files..."
            
        track_names = [os.path.splitext(t["filename"])[0] for t in tracks]
        create_longplay_video(
            audio_files=audio_files,
            background_media=bg_abs_path,
            output_path=output_path,
            style=settings.get("visualizer_style", "Spectrum Bars"),
            color_theme=color_theme,
            resolution=res_val,
            fps=int(settings.get("fps", 24)),
            genre=settings.get("genre", ""),
            main_title=settings.get("main_title", ""),
            description=settings.get("description", ""),
            watermark=settings.get("watermark", ""),
            progress_callback=on_visualizer_progress,
            visualizer_opacity=float(settings.get("visualizer_opacity", 0.8)),
            visualizer_height=float(settings.get("visualizer_height", 0.15)),
            visualizer_y=float(settings.get("visualizer_y", 0.92)),
            font_family=settings.get("font_family", "Inter"),
            track_names=track_names,
            title_font_size=settings.get("title_font_size", "Medium"),
            tracks_data=processed_tracks,
            background_filter=settings.get("background_filter", "none")
        )
        
        # Output URLs
        video_url = f"/output/{output_filename}"
        timeline_url = f"/output/{os.path.splitext(output_filename)[0]}_Timeline.txt"
        songlist_url = f"/output/{os.path.splitext(output_filename)[0]}_SongList.txt"
        
        with progress_lock:
            export_progress.update({
                "status": "success",
                "progress": 100.0,
                "step": "Export completed successfully!",
                "output_video": video_url,
                "output_timeline": timeline_url,
                "output_songlist": songlist_url
            })
            
    except Exception as e:
        logger.error(f"Export pipeline failed: {e}", exc_info=True)
        with progress_lock:
            export_progress.update({
                "status": "failed",
                "progress": 100.0,
                "step": "Failed",
                "error": str(e)
            })
    finally:
        for f in temp_trimmed_files:
            try:
                if os.path.exists(f):
                    os.remove(f)
                    logger.info(f"Cleaned up temp trimmed file: {f}")
            except Exception as ex:
                logger.warning(f"Failed to clean up temp trimmed file {f}: {ex}")

@app.post("/api/export")
def start_export(background_tasks: BackgroundTasks, project_name: str = None):
    global export_progress
    
    with progress_lock:
        if export_progress["status"] == "processing":
            raise HTTPException(status_code=400, detail="An export is already in progress.")
            
    # Load state data to pass to thread
    if project_name:
        clean_name = "".join(c for c in project_name if c.isalnum() or unicodedata.category(c).startswith('M') or c in ("-", "_", " ")).strip()
        file_path = os.path.join(BASE_DIR, "projects", f"{clean_name}.json")
        if not os.path.exists(file_path):
             raise HTTPException(status_code=404, detail="Project not found")
        with open(file_path, "r", encoding="utf-8") as f:
            state_data = json.load(f)
    else:
        state_data = get_state()
    
    # Start task
    background_tasks.add_task(run_export_pipeline, state_data)
    
    return {"status": "started"}

@app.get("/api/export/status")
def get_export_status():
    with progress_lock:
        return export_progress

@app.post("/api/export/reset")
def reset_export_status():
    global export_progress
    with progress_lock:
        export_progress.update({
            "status": "idle",
            "progress": 0.0,
            "step": "",
            "output_video": "",
            "output_timeline": "",
            "output_songlist": "",
            "error": ""
        })
@app.get("/api/projects")
def list_projects():
    projects_dir = os.path.join(BASE_DIR, "projects")
    os.makedirs(projects_dir, exist_ok=True)
    files = [f for f in os.listdir(projects_dir) if f.endswith(".json")]
    project_list = []
    for file in files:
        name = os.path.splitext(file)[0]
        path = os.path.join(projects_dir, file)
        mtime = os.path.getmtime(path)
        project_list.append({"name": name, "updated_at": mtime})
    return sorted(project_list, key=lambda x: x["updated_at"], reverse=True)

@app.post("/api/projects/{name}")
def save_project(name: str, state: EditorState):
    clean_name = "".join(c for c in name if c.isalnum() or unicodedata.category(c).startswith('M') or c in ("-", "_", " ")).strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Invalid project name")
    projects_dir = os.path.join(BASE_DIR, "projects")
    os.makedirs(projects_dir, exist_ok=True)
    file_path = os.path.join(projects_dir, f"{clean_name}.json")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(state.dict(), f, indent=2, ensure_ascii=False)
        # Also update last active state
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state.dict(), f, indent=2, ensure_ascii=False)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error saving project {clean_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{name}")
def load_project(name: str):
    clean_name = "".join(c for c in name if c.isalnum() or unicodedata.category(c).startswith('M') or c in ("-", "_", " ")).strip()
    file_path = os.path.join(BASE_DIR, "projects", f"{clean_name}.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Also update last active state so it persists on reload
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return data
    except Exception as e:
        logger.error(f"Error loading project {clean_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{name}")
def delete_project(name: str):
    clean_name = "".join(c for c in name if c.isalnum() or unicodedata.category(c).startswith('M') or c in ("-", "_", " ")).strip()
    file_path = os.path.join(BASE_DIR, "projects", f"{clean_name}.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        os.remove(file_path)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting project {clean_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=28453, reload=True)
