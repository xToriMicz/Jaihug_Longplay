import os
import time
import json
import wave
import struct
import math
from PIL import Image
from fastapi.testclient import TestClient

# Import the FastAPI app
from api import app

client = TestClient(app)

TEST_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_TEST_FILES = []

def generate_dummy_wav(filename: str, duration_sec: float = 3.0, frequency: float = 440.0):
    """
    Generates a simple sine wave WAV file using Python's built-in wave module.
    """
    filepath = os.path.join(TEST_DIR, filename)
    sample_rate = 44100
    num_samples = int(duration_sec * sample_rate)
    
    # 16-bit PCM mono
    wav_file = wave.open(filepath, 'w')
    wav_file.setparams((1, 2, sample_rate, num_samples, 'NONE', 'not compressed'))
    
    for i in range(num_samples):
        # Generate sine wave sample
        value = int(32767.0 * math.sin(2.0 * math.pi * frequency * i / sample_rate))
        data = struct.pack('<h', value)
        wav_file.writeframesraw(data)
        
    wav_file.close()
    TEMP_TEST_FILES.append(filepath)
    print(f"Generated dummy WAV: {filepath} ({duration_sec}s)")
    return filepath

def generate_dummy_png(filename: str):
    """
    Generates a simple test image.
    """
    filepath = os.path.join(TEST_DIR, filename)
    img = Image.new("RGBA", (800, 450), (20, 24, 30, 255))
    img.save(filepath, "PNG")
    TEMP_TEST_FILES.append(filepath)
    print(f"Generated dummy PNG: {filepath}")
    return filepath

def cleanup_temp_files():
    print("\nCleaning up dummy test assets...")
    for f in TEMP_TEST_FILES:
        try:
            if os.path.exists(f):
                os.remove(f)
                print(f"Removed temp test asset: {f}")
        except Exception as e:
            print(f"Failed to remove {f}: {e}")

def run_e2e_test():
    print("=========================================================")
    print("   Visual Music Longplay - End-to-End Integration Test   ")
    print("=========================================================")
    print()

    # Step 1: Generate dummy assets
    audio1 = generate_dummy_wav("test_song1.wav", duration_sec=3.0, frequency=440.0)
    audio2 = generate_dummy_wav("test_song2.wav", duration_sec=2.0, frequency=880.0)
    bg_img = generate_dummy_png("test_bg.png")

    try:
        # Step 2: Upload audio tracks
        print("\nStep 2: Uploading audio tracks to backend...")
        uploaded_tracks = []
        for audio_path in [audio1, audio2]:
            with open(audio_path, "rb") as f:
                response = client.post(
                    "/api/upload",
                    files={"file": (os.path.basename(audio_path), f, "audio/wav")},
                    data={"file_type": "audio"}
                )
            assert response.status_code == 200, f"Upload failed: {response.text}"
            res_data = response.json()
            uploaded_tracks.append({
                "id": f"track_{len(uploaded_tracks)+1}",
                "filename": res_data["filename"],
                "filepath": res_data["filepath"],
                "duration": res_data["duration"]
            })
            print(f"Uploaded track successfully: {res_data['filename']} (Duration: {res_data['duration']:.2f}s)")

        # Step 3: Upload background media
        print("\nStep 3: Uploading background image...")
        with open(bg_img, "rb") as f:
            response = client.post(
                "/api/upload",
                files={"file": (os.path.basename(bg_img), f, "image/png")},
                data={"file_type": "background"}
            )
        assert response.status_code == 200, f"Background upload failed: {response.text}"
        bg_data = response.json()
        print(f"Uploaded background successfully: {bg_data['filepath']}")

        # Step 4: Save workspace state
        print("\nStep 4: Saving workspace state to sandbox project e2e_test_project...")
        state = {
            "tracks": uploaded_tracks,
            "backgrounds": [{"filename": os.path.basename(bg_img), "filepath": bg_data["filepath"]}],
            "active_background": bg_data["filepath"],
            "settings": {
                "main_title": "เพลงทดสอบ E2E\nแอนติกราวิตี้",
                "genre": "E2E Test Beats",
                "description": "เอนด์ทูเอนด์อินทิเกรชันเทสต์รัน",
                "watermark": "E2E Antigravity",
                "resolution": "HD",
                "fps": 24,
                "visualizer_style": "Spectrum Bars",
                "color_theme": "Lo-fi / Chill",
                "custom_color": ""
            }
        }
        response = client.post("/api/projects/e2e_test_project", json=state)
        assert response.status_code == 200, f"Save state failed: {response.text}"
        print("Workspace state saved successfully.")

        # Step 5: Start Export
        print("\nStep 5: Starting Video Export...")
        response = client.post("/api/export?project_name=e2e_test_project")
        assert response.status_code == 200, f"Export initialization failed: {response.text}"
        print("Export started in background.")

        # Step 6: Poll export status until completion
        print("\nStep 6: Polling progress...")
        attempts = 0
        max_attempts = 60
        export_success = False
        final_status = {}
        
        while attempts < max_attempts:
            status_resp = client.get("/api/export/status")
            assert status_resp.status_code == 200
            status_data = status_resp.json()
            
            print(f"[{status_data['status'].upper()}] Progress: {status_data['progress']}% | Step: {status_data['step']}")
            
            if status_data["status"] == "success":
                export_success = True
                final_status = status_data
                break
            elif status_data["status"] == "failed":
                print(f"Export failed on backend: {status_data['error']}")
                break
                
            time.sleep(2)
            attempts += 1

        assert export_success, "Video export did not succeed within timeout limit"
        
        # Step 7: Verify output files exist and are valid
        print("\nStep 7: Verifying output files...")
        out_video = final_status["output_video"]
        out_timeline = final_status["output_timeline"]
        out_songlist = final_status["output_songlist"]
        
        # Absolute paths
        abs_video = os.path.join(TEST_DIR, out_video.lstrip("/"))
        abs_timeline = os.path.join(TEST_DIR, out_timeline.lstrip("/"))
        abs_songlist = os.path.join(TEST_DIR, out_songlist.lstrip("/"))
        
        for path, name in [(abs_video, "Video"), (abs_timeline, "Timeline Text"), (abs_songlist, "Song List Text")]:
            assert os.path.exists(path), f"Output file missing: {path}"
            size = os.path.getsize(path)
            assert size > 0, f"Output file is empty: {path}"
            print(f"Verified {name} exists: {path} (Size: {size} bytes)")

        print("\n=========================================================")
        print("   SUCCESS: END-TO-END INTEGRATION TEST PASSED!   ")
        print("=========================================================")
        
    except AssertionError as ae:
        print("\n=========================================================")
        print(f"   FAILED: {ae}   ")
        print("=========================================================")
        raise ae
    finally:
        try:
            client.delete("/api/projects/e2e_test_project")
            print("Deleted dummy test project: e2e_test_project")
        except Exception as e:
            print(f"Failed to delete test project: {e}")
        cleanup_temp_files()

if __name__ == "__main__":
    run_e2e_test()
