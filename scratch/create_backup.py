import os
import zipfile
from pathlib import Path

def create_backup():
    project_dir = Path(__file__).resolve().parent.parent
    backup_dir = project_dir / "backups"
    os.makedirs(backup_dir, exist_ok=True)
    
    backup_name = "Jaihug_Longplay_v1.3.0_Backup.zip"
    backup_path = backup_dir / backup_name
    
    # Folders to ignore
    ignore_folders = {
        "node_modules",
        ".next",
        "temp",
        "uploads",
        "output",
        "backups",
        "__pycache__",
        ".git"
    }
    
    print(f"Creating backup at {backup_path}...")
    
    with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_dir):
            root_path = Path(root)
            
            # Check if any parent folder is in the ignore list
            relative_parts = root_path.relative_to(project_dir).parts
            if any(part in ignore_folders for part in relative_parts):
                continue
                
            for file in files:
                file_path = root_path / file
                # Skip the zip file itself if it is somehow in the tree
                if file_path == backup_path:
                    continue
                # Skip python cache files
                if file.endswith('.pyc') or file.endswith('.pyo'):
                    continue
                    
                arcname = file_path.relative_to(project_dir)
                zipf.write(file_path, arcname)
                
    print(f"Backup completed successfully! Size: {os.path.getsize(backup_path) / (1024 * 1024):.2f} MB")

if __name__ == "__main__":
    create_backup()
