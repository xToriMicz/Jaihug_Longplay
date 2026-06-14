from modules.subtitle_burner import compile_ass_content, hex_to_ass_color, make_karaoke_text

def test_color_conversion():
    assert hex_to_ass_color("#ffffff") == "&H00FFFFFF"
    assert hex_to_ass_color("#ff0000") == "&H000000FF"
    assert hex_to_ass_color("#00ff00aa") == "&H5500FF00"
    print("Color conversion tests passed!")

def test_karaoke_highlight():
    text = "รักแรก"
    res = make_karaoke_text(text, 1.0)
    assert r"{\kf20}รั" in res
    assert r"{\kf20}ก" in res
    print("Karaoke highlight tests passed!")

def test_ass_compiler():
    subtitles = [{"start": 1.5, "end": 4.2, "text": "ทดสอบซับ"}]
    settings = {"font_family": "Mali", "font_size": "Medium", "color": "#ffffff", "outline_color": "#000000"}
    quote = {"enabled": True, "text": "คำคมสเตตัส", "position_y": 0.20}
    ass = compile_ass_content(subtitles, quote, settings, total_duration=10.0)
    
    assert "PlayResX: 1920" in ass
    assert "PlayResY: 1080" in ass
    assert "Style: Default" in ass
    assert "Style: QuoteStyle" in ass
    assert "Dialogue: 0,0:00:00.00,0:00:10.00,QuoteStyle" in ass
    assert "Dialogue: 0,0:00:01.50,0:00:04.20,Default" in ass
    print("ASS compiler tests passed!")

def test_quote_highlighting():
    from modules.subtitle_burner import auto_tag_thai_keywords, parse_highlight_tags
    
    text = "รักเธอมากที่สุดแต่เธอกลับไม่รักเรา"
    tagged = auto_tag_thai_keywords(text)
    assert tagged == "[รักเธอ]มากที่สุดแต่เธอกลับไม่รักเรา"
    
    manual = "เจ็บปวดแต่ก็ยัง[รัก]เธอ"
    tagged_manual = auto_tag_thai_keywords(manual)
    assert tagged_manual == manual
    
    parsed = parse_highlight_tags("[รักเธอ]", 36, "#ff007a")
    assert r"{\b1\fs45\1c&H7A00FF&}รักเธอ{\r}" in parsed
    
    subtitles = []
    settings = {"font_family": "Mali", "font_size": "Medium"}
    quote = {"enabled": True, "text": "คนเดียวมันเหงา", "position_y": 0.20}
    ass = compile_ass_content(subtitles, quote, settings, total_duration=10.0)
    assert r"\b1\fs40\1c&H7A00FF&" in ass
    
    # Test custom highlight color and scale
    quote_custom = {
        "enabled": True,
        "text": "คนเดียวมันเหงา",
        "position_y": 0.20,
        "highlight_color": "#00ff00",
        "highlight_scale": 1.5
    }
    ass_custom = compile_ass_content(subtitles, quote_custom, settings, total_duration=10.0)
    assert r"\b1\fs48\1c&H00FF00&" in ass_custom
    
    print("Quote highlighting tests passed!")

if __name__ == "__main__":
    test_color_conversion()
    test_karaoke_highlight()
    test_ass_compiler()
    test_quote_highlighting()
    print("All subtitle burner tests passed successfully!")
