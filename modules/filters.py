from enum import Enum

class FilterType(str, Enum):
    NONE = "none"
    VINTAGE = "vintage"
    CINEMATIC = "cinematic"
    NOIR = "noir"
    SEPIA = "sepia"
    WARM = "warm"
    COOL = "cool"
    VIVID = "vivid"
    GRAYSCALE = "grayscale"
    CYBERPUNK = "cyberpunk"
    VIBRANT = "vibrant"
    DREAMY = "dreamy"
    BLUR = "blur"
    VIGNETTE = "vignette"
    VIGNETTE_HEAVY = "vignette_heavy"
    NEGATE = "negate"

def get_filter_string(filter_type: str, width: int = None, height: int = None) -> str:
    """
    Get FFmpeg filter string for a filter type.
    """
    if not filter_type:
        return ""
    
    # Normalize
    ft = filter_type.lower()
    
    aspect_val = ""
    if width and height:
        aspect_val = f":aspect={width}/{height}"
    
    filter_map = {
        "none": "",
        "vintage": "curves=vintage,noise=c0s=25:allf=t",
        "cinematic": "eq=contrast=1.1:brightness=0.05:saturation=0.9,colorbalance=rs=0.1:gs=0.05:bs=-0.1,unsharp=5:5:0.5:5:5:0",
        "noir": "eq=contrast=1.5:brightness=-0.1:saturation=0,curves=all='0/0 0.4/0.3 0.6/0.7 1/1'",
        "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
        "warm": "colorbalance=rs=0.3:gs=0.1:bs=-0.2:rm=0.2:gm=0.1:bm=-0.1",
        "cool": "colorbalance=rs=-0.2:gs=-0.1:bs=0.3:rm=-0.1:gm=0.0:bm=0.2",
        "vivid": "eq=contrast=1.2:saturation=1.5,unsharp=5:5:0.8:5:5:0.4",
        "grayscale": "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
        "cyberpunk": "colorbalance=rs=-0.2:gs=0.0:bs=0.4:rm=-0.1:gm=0.2:bm=0.3,eq=contrast=1.4:saturation=1.6",
        "vibrant": "eq=saturation=1.6:contrast=1.15",
        "dreamy": "gblur=sigma=1.5,eq=brightness=0.1:saturation=1.1,colorbalance=rs=0.1:gs=0.05:bs=0.1",
        "blur": "boxblur=2:1",
        "vignette": f"vignette=angle=PI/4:mode=forward{aspect_val}",
        "vignette_heavy": f"vignette=angle=PI/3:mode=forward{aspect_val}",
        "negate": "negate",
    }
    
    return filter_map.get(ft, "")
