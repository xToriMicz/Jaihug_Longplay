'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Plus, Trash2, Sliders, Palette, Video, Music, Image as ImageIcon,
  ChevronRight, Save, Download, RotateCcw, AlertCircle, Sparkles, Loader2, ArrowRight, Volume2,
  FolderOpen, Check, Clock
} from 'lucide-react';
import { musicApi } from '../lib/api';
import CanvasVisualizer, { getHexColor, THEME_COLORS } from '../components/canvas_visualizer';

export default function Home() {
  // Playlist state
  const [tracks, setTracks] = useState([]);
  const [backgrounds, setBackgrounds] = useState([]);
  const [activeBg, setActiveBg] = useState('');
  
  // Settings state
  const [mainTitle, setMainTitle] = useState('เจ็บจนไม่รู้สึกอะไร...');
  const [genreText, setGenreText] = useState('Acoustic, Sad Thai Pop Rock 2026');
  const [descText, setDescText] = useState('เพลงออนไลน์ ฟังสบายๆ ฟังทำงาน ร้านกาแฟ');
  const [watermark, setWatermark] = useState('Jaihug Music');
  
  const [resolution, setResolution] = useState('HD');
  const [fps, setFps] = useState(24);
  const [visStyle, setVisStyle] = useState('Spectrum Bars');
  const [colorTheme, setColorTheme] = useState('Lo-fi / Chill');
  const [customColor, setCustomColor] = useState('');
  const [kenBurns, setKenBurns] = useState(false);
  const [kenBurnsSpeed, setKenBurnsSpeed] = useState('normal'); // 'low' or 'normal'
  const [bgFilter, setBgFilter] = useState('none');
  const [visOpacity, setVisOpacity] = useState(0.8);
  const [visHeight, setVisHeight] = useState(0.15); // Default 15% of container height
  const [visYPos, setVisYPos] = useState(0.92); // Default Y position is 92% (bottom)
  const [fontFamily, setFontFamily] = useState('Inter');
  const [titleFontSize, setTitleFontSize] = useState('Medium');

  const isVertical = resolution.includes('Vertical');

  const [activeBgSelectorTrackId, setActiveBgSelectorTrackId] = useState(null);
  const [activeHookSelectorTrackId, setActiveHookSelectorTrackId] = useState(null);
  const [bgDimensions, setBgDimensions] = useState({});
  const [selectedBgPaths, setSelectedBgPaths] = useState([]);
  const [bgsPerTrack, setBgsPerTrack] = useState(1);
  const [autoSaveStatus, setAutoSaveStatus] = useState("Saved");

  // Subtitle / Lyrics / Quote states
  const [subtitles, setSubtitles] = useState([]);
  const [quoteOverlay, setQuoteOverlay] = useState({ 
    text: '', 
    enabled: false, 
    position_y: 0.20,
    position_x: 0.50,
    alignment: 'center',
    decorator_style: 'none',
    highlight_color: '#ff007a',
    highlight_scale: 1.25
  });
  const [subtitleSettings, setSubtitleSettings] = useState({
    font_family: 'Mali',
    font_size: 'Medium',
    color: '#FFFFFF',
    outline_color: '#000000',
    outline_width: 2,
    position_y: 0.80,
    effect: 'Static Shadow', // 'Static Shadow', 'Karaoke Highlight', 'Karaoke Glow'
    show_background_box: false,
    background_box_color: '#00000080'
  });
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [activeTab, setActiveTab] = useState('settings'); // settings, subtitles
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isBurning, setIsBurning] = useState(false);

  // UI states
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [exportState, setExportState] = useState({
    status: 'idle', // idle, processing, success, failed
    progress: 0.0,
    step: '',
    output_video: '',
    output_timeline: '',
    output_songlist: '',
    error: ''
  });
  const [showExportModal, setShowExportModal] = useState(false);

  const isInitialLoad = useRef(true);

  const updateTrackBackground = (trackId, bgPath) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, background: bgPath } : t));
  };

  const updateTrackHook = (trackId, key, value) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, [key]: value } : t));
  };

  const toggleTrackBackgroundSelection = (trackId, filepath) => {
    setTracks(prevTracks => prevTracks.map(track => {
      if (track.id !== trackId) return track;
      
      let currentBg = track.background;
      if (!currentBg) {
        return { ...track, background: filepath };
      } else if (Array.isArray(currentBg)) {
        if (currentBg.includes(filepath)) {
          const newList = currentBg.filter(f => f !== filepath);
          return { ...track, background: newList.length === 0 ? null : (newList.length === 1 ? newList[0] : newList) };
        } else {
          return { ...track, background: [...currentBg, filepath] };
        }
      } else {
        if (currentBg === filepath) {
          return { ...track, background: null };
        } else {
          return { ...track, background: [currentBg, filepath] };
        }
      }
    }));
  };

  const handleDeleteBackground = (filepath) => {
    // 1. Remove from backgrounds list
    setBackgrounds(prev => {
      const filtered = prev.filter(bg => bg.filepath !== filepath);
      
      // 2. Adjust activeBg if we deleted the active one
      if (activeBg === filepath) {
        if (filtered.length > 0) {
          setActiveBg(filtered[0].filepath);
        } else {
          setActiveBg("");
        }
      }
      
      return filtered;
    });

    // Also remove from selectedBgPaths
    setSelectedBgPaths(prev => prev.filter(p => p !== filepath));

    // 3. Clean up track backgrounds referencing this path
    setTracks(prevTracks => prevTracks.map(track => {
      let currentBg = track.background;
      if (!currentBg) return track;
      
      if (Array.isArray(currentBg)) {
        const newList = currentBg.filter(f => f !== filepath);
        return { 
          ...track, 
          background: newList.length === 0 ? null : (newList.length === 1 ? newList[0] : newList) 
        };
      } else {
        if (currentBg === filepath) {
          return { ...track, background: null };
        }
        return track;
      }
    }));
  };

  const handleAutoDistributeBackgrounds = () => {
    if (selectedBgPaths.length === 0 || tracks.length === 0) return;
    setTracks(prev => prev.map((track, idx) => {
      const trackBgs = [];
      for (let j = 0; j < bgsPerTrack; j++) {
        const bgIndex = (idx * bgsPerTrack + j) % selectedBgPaths.length;
        trackBgs.push(selectedBgPaths[bgIndex]);
      }
      return {
        ...track,
        background: trackBgs.length === 0 ? null : (trackBgs.length === 1 ? trackBgs[0] : trackBgs)
      };
    }));
  };

  // Debounced Auto-Save
  useEffect(() => {
    if (isInitialLoad.current || isSaving || isUploading || exportState.status === 'processing') {
      return;
    }

    const timer = setTimeout(async () => {
      setAutoSaveStatus("Saving...");
      try {
        const stateObj = {
          tracks,
          backgrounds,
          active_background: activeBg,
          subtitles: subtitles.map(s => ({
            ...s,
            start: parseFloat(s.start) || 0,
            end: parseFloat(s.end) || 0
          })),
          quote_overlay: quoteOverlay,
          subtitle_settings: subtitleSettings,
          settings: {
            main_title: mainTitle,
            genre: genreText,
            description: descText,
            watermark,
            resolution,
            fps,
            visualizer_style: visStyle,
            color_theme: colorTheme,
            custom_color: customColor,
            visualizer_opacity: visOpacity,
            visualizer_height: visHeight,
            visualizer_y: visYPos,
            font_family: fontFamily,
            title_font_size: titleFontSize,
            ken_burns: kenBurns,
            ken_burns_speed: kenBurnsSpeed,
            background_filter: bgFilter,
            bgs_per_track: bgsPerTrack,
            selected_bg_paths: selectedBgPaths
          }
        };
        await musicApi.saveState(stateObj);
        setAutoSaveStatus("Auto-saved");
      } catch (err) {
        console.error("Auto-save failed:", err);
        setAutoSaveStatus("Error");
      }
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [
    tracks, backgrounds, activeBg, mainTitle, genreText, descText, watermark,
    resolution, fps, visStyle, colorTheme, customColor, visOpacity, visHeight,
    visYPos, fontFamily, titleFontSize, kenBurns, kenBurnsSpeed, bgFilter, bgsPerTrack,
    selectedBgPaths, isSaving, isUploading, exportState.status, subtitles, quoteOverlay, subtitleSettings
  ]);

  const getCurrentTrackBackground = () => {
    const currentTrack = tracks[currentTrackIndex];
    if (!currentTrack || !currentTrack.background) {
      return activeBg;
    }
    
    const bg = currentTrack.background;
    if (Array.isArray(bg)) {
      if (bg.length === 0) return activeBg;
      const N = bg.length;
      const durationPerImage = currentTrack.duration / N;
      const currentImageIdx = Math.min(Math.floor(currentTime / durationPerImage), N - 1);
      return bg[currentImageIdx];
    }
    
    return bg;
  };

  // Player state
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trackProgress, setTrackProgress] = useState(0); // overall playlist progress
  


  const audioRef = useRef(null);
  const progressInterval = useRef(null);
  const audioInputRef = useRef(null);
  const currentTrackIndexRef = useRef(0);

  // Sync ref with currentTrackIndex state to prevent stale closure bugs in intervals
  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  const applyProjectState = (data) => {
    setTracks(data.tracks || []);
    const loadedBackgrounds = data.backgrounds || [];
    setBackgrounds(loadedBackgrounds);
    
    // Restore selectedBgPaths from settings if present, otherwise select all
    const s = data.settings || {};
    if (s.selected_bg_paths !== undefined) {
      setSelectedBgPaths(s.selected_bg_paths);
    } else {
      setSelectedBgPaths(loadedBackgrounds.map(bg => bg.filepath));
    }
    
    setActiveBg(data.active_background || '');

    // Restore subtitles, quote overlays & subtitle settings
    setSubtitles(data.subtitles || []);
    setQuoteOverlay(data.quote_overlay ? {
      text: data.quote_overlay.text || '',
      enabled: data.quote_overlay.enabled || false,
      position_y: data.quote_overlay.position_y !== undefined ? data.quote_overlay.position_y : 0.20,
      position_x: data.quote_overlay.position_x !== undefined ? data.quote_overlay.position_x : 0.50,
      alignment: data.quote_overlay.alignment || 'center',
      decorator_style: data.quote_overlay.decorator_style || 'none',
      highlight_color: data.quote_overlay.highlight_color || '#ff007a',
      highlight_scale: data.quote_overlay.highlight_scale !== undefined ? data.quote_overlay.highlight_scale : 1.25
    } : {
      text: '',
      enabled: false,
      position_y: 0.20,
      position_x: 0.50,
      alignment: 'center',
      decorator_style: 'none',
      highlight_color: '#ff007a',
      highlight_scale: 1.25
    });
    setSubtitleSettings(data.subtitle_settings || {
      font_family: 'Mali',
      font_size: 'Medium',
      color: '#FFFFFF',
      outline_color: '#000000',
      outline_width: 2,
      position_y: 0.80,
      effect: 'Static Shadow',
      show_background_box: false,
      background_box_color: '#00000080'
    });
    
    // settings fallbacks
    setMainTitle(s.main_title !== undefined ? s.main_title : 'เจ็บจนไม่รู้สึกอะไร...');
    setGenreText(s.genre !== undefined ? s.genre : 'Acoustic, Sad Thai Pop Rock 2026');
    setDescText(s.description !== undefined ? s.description : 'เพลงออนไลน์ ฟังสบายๆ ฟังทำงาน ร้านกาแฟ');
    setWatermark(s.watermark !== undefined ? s.watermark : 'Jaihug Music');
    setResolution(s.resolution !== undefined ? s.resolution : 'HD');
    setFps(s.fps !== undefined ? s.fps : 24);
    setVisStyle(s.visualizer_style !== undefined ? s.visualizer_style : 'Spectrum Bars');
    setColorTheme(s.color_theme !== undefined ? s.color_theme : 'Lo-fi / Chill');
    setCustomColor(s.custom_color !== undefined ? s.custom_color : '');
    setVisOpacity(s.visualizer_opacity !== undefined ? s.visualizer_opacity : 0.8);
    setVisHeight(s.visualizer_height !== undefined ? s.visualizer_height : 0.15);
    setVisYPos(s.visualizer_y !== undefined ? s.visualizer_y : 0.92);
    setFontFamily(s.font_family !== undefined ? s.font_family : 'Inter');
    setTitleFontSize(s.title_font_size !== undefined ? s.title_font_size : 'Medium');
    setKenBurns(s.ken_burns !== undefined ? s.ken_burns : true);
    setKenBurnsSpeed(s.ken_burns_speed !== undefined ? s.ken_burns_speed : 'normal');
    setBgFilter(s.background_filter !== undefined ? s.background_filter : 'none');
    setBgsPerTrack(s.bgs_per_track !== undefined ? s.bgs_per_track : 1);
  };

  // Load state from backend on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key') || '';
    setOpenrouterApiKey(savedKey);

    async function loadState() {
      try {
        const data = await musicApi.getState();
        applyProjectState(data);
      } catch (err) {
        console.error("Failed to load workspace state:", err);
      } finally {
        setTimeout(() => {
          isInitialLoad.current = false;
          setAutoSaveStatus("Saved");
        }, 1000);
      }
    }
    loadState();
    fetchProjects();
  }, []);

  const [projectList, setProjectList] = useState([]);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleNewProjectClick = () => {
    if (confirm("คุณต้องการสร้างโปรเจคใหม่ใช่หรือไม่? ข้อมูลปัจจุบันที่ไม่ได้เซฟจะหายไป")) {
      isInitialLoad.current = true;
      applyProjectState({
        settings: {
          main_title: 'โปรเจคใหม่'
        }
      });
      setTimeout(() => {
        isInitialLoad.current = false;
        setAutoSaveStatus("Saved");
      }, 1000);
    }
  };

  const fetchProjects = async () => {
    try {
      const projects = await musicApi.listProjects();
      setProjectList(projects);
    } catch (err) {
      console.error("Failed to load projects list:", err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveBgSelectorTrackId(null);
      setActiveHookSelectorTrackId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveBgSelectorTrackId(null);
      setActiveHookSelectorTrackId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleLoadProject = async (name) => {
    try {
      isInitialLoad.current = true;
      const data = await musicApi.loadProject(name);
      applyProjectState(data);
      setShowProjectsModal(false);
      alert(`โหลดโปรเจค "${name}" สำเร็จ!`);
      setTimeout(() => {
        isInitialLoad.current = false;
        setAutoSaveStatus("Saved");
      }, 1000);
    } catch (err) {
      console.error(err);
      alert("โหลดโปรเจคล้มเหลว: " + err.message);
      isInitialLoad.current = false;
    }
  };

  const handleDeleteProject = async (name) => {
    if (!confirm(`คุณต้องการลบโปรเจค "${name}" ใช่หรือไม่?`)) return;
    try {
      await musicApi.deleteProject(name);
      fetchProjects();
      alert(`ลบโปรเจค "${name}" สำเร็จ!`);
    } catch (err) {
      console.error(err);
      alert("ลบโปรเจคล้มเหลว: " + err.message);
    }
  };

  // Save state to backend
  const handleSaveState = async () => {
    setIsSaving(true);
    const projName = mainTitle.trim() || "Untitled Project";
    try {
      const stateObj = {
        tracks,
        backgrounds,
        active_background: activeBg,
        subtitles: subtitles.map(s => ({
          ...s,
          start: parseFloat(s.start) || 0,
          end: parseFloat(s.end) || 0
        })),
        quote_overlay: quoteOverlay,
        subtitle_settings: subtitleSettings,
        settings: {
          main_title: mainTitle,
          genre: genreText,
          description: descText,
          watermark,
          resolution,
          fps,
          visualizer_style: visStyle,
          color_theme: colorTheme,
          custom_color: customColor,
          visualizer_opacity: visOpacity,
          visualizer_height: visHeight,
          visualizer_y: visYPos,
          font_family: fontFamily,
          title_font_size: titleFontSize,
          ken_burns: kenBurns,
          ken_burns_speed: kenBurnsSpeed,
          background_filter: bgFilter,
          bgs_per_track: bgsPerTrack,
          selected_bg_paths: selectedBgPaths
        }
      };
      await musicApi.saveState(stateObj);
      await musicApi.saveProject(projName, stateObj);
      fetchProjects();
      alert(`บันทึกโปรเจค "${projName}" ลงเครื่องสำเร็จ!`);
    } catch (err) {
      console.error(err);
      alert("ไม่สามารถบันทึกโปรเจคได้: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Upload track or background
  const handleFileUpload = async (e, type) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const result = await musicApi.uploadFile(files[i], type);
        
        if (type === 'audio') {
          setTracks(prev => {
            const newTracks = [...prev, {
              id: 'track_' + Math.random().toString(36).substr(2, 9),
              filename: result.filename,
              filepath: result.filepath,
              duration: result.duration
            }];
            // Auto select active background if empty
            return newTracks;
          });
        } else {
          setBackgrounds(prev => {
            const newBgs = [...prev, {
              filename: result.filename,
              filepath: result.filepath
            }];
            if (!activeBg) {
              setActiveBg(result.filepath);
            }
            setSelectedBgPaths(prevSel => [...prevSel, result.filepath]);
            return newBgs;
          });
        }
      }
    } catch (err) {
      console.error(err);
      alert("อัปโหลดไฟล์ล้มเหลว: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Reordering tracks (HTML5 Native Drag and Drop)
  const dragItem = useRef();
  const dragOverItem = useRef();
  
  const handleDragStart = (e, index) => {
    dragItem.current = index;
  };
  
  const handleDragEnter = (e, index) => {
    dragOverItem.current = index;
  };
  
  const handleDragEnd = () => {
    const listCopy = [...tracks];
    const draggedItemContent = listCopy[dragItem.current];
    listCopy.splice(dragItem.current, 1);
    listCopy.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setTracks(listCopy);
  };

  // Playback Control
  const togglePlay = () => {
    if (tracks.length === 0) return;
    
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      clearInterval(progressInterval.current);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        startProgressTracker();
      }).catch(err => {
        console.error("Playback failed:", err);
      });
    }
  };

  const handleTrackChange = (index) => {
    if (index < 0 || index >= tracks.length) return;
    
    const audio = audioRef.current;
    if (!audio) return;
    
    if (index === currentTrackIndex) {
      // Toggle play/pause for the current track
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        clearInterval(progressInterval.current);
      } else {
        audio.play().then(() => {
          setIsPlaying(true);
          startProgressTracker();
        }).catch(err => console.error("Play failed:", err));
      }
    } else {
      // Switch track and play immediately
      currentTrackIndexRef.current = index;
      setCurrentTrackIndex(index);
      const startPos = tracks[index].use_hook ? (tracks[index].hook_start || 0) : 0;
      setCurrentTime(startPos);
      audio.src = musicApi.getBaseUrl() + tracks[index].filepath;
      audio.currentTime = startPos;
      audio.play().then(() => {
        setIsPlaying(true);
        startProgressTracker();
      }).catch(err => console.error("Play failed:", err));
    }
  };

  const startProgressTracker = () => {
    clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
        // If track finished (either naturally or hook duration exceeded), play next
        const activeTrack = tracks[currentTrackIndexRef.current];
        const hasEnded = audio.ended || (
          activeTrack && 
          activeTrack.use_hook && 
          audio.currentTime >= (activeTrack.hook_start || 0) + (activeTrack.hook_duration || 30)
        );
        
        if (hasEnded) {
          const nextIndex = currentTrackIndexRef.current + 1;
          if (nextIndex < tracks.length) {
            handleTrackChange(nextIndex);
          } else {
            setIsPlaying(false);
            setCurrentTime(0);
            clearInterval(progressInterval.current);
          }
        }
      }
    }, 200);
  };

  // Cleanup timers
  useEffect(() => {
    const currentBg = getCurrentTrackBackground();

  return () => clearInterval(progressInterval.current);
  }, []);

  // Sync audio ref with first track
  useEffect(() => {
    if (tracks.length > 0 && audioRef.current && !audioRef.current.src) {
      audioRef.current.src = musicApi.getBaseUrl() + tracks[0].filepath;
    }
  }, [tracks]);

  // Track progress calculations
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPlaylistDuration = () => {
    return tracks.reduce((sum, t) => {
      const d = t.use_hook ? (t.hook_duration || 30) : (t.duration || 0);
      return sum + d;
    }, 0);
  };

  // Get current play position in overall playlist
  const getOverallCurrentTime = () => {
    let sum = 0;
    for (let i = 0; i < currentTrackIndex; i++) {
      if (tracks[i]) {
        const trackDuration = tracks[i].use_hook 
          ? (tracks[i].hook_duration || 30) 
          : (tracks[i].duration || 0);
        sum += trackDuration;
      }
    }
    
    const activeTrack = tracks[currentTrackIndex];
    const trackElapsed = activeTrack && activeTrack.use_hook
      ? Math.max(0, currentTime - (activeTrack.hook_start || 0))
      : currentTime;
      
    return sum + trackElapsed;
  };

  const handleTimelineScrub = (e) => {
    const targetOverallTime = parseFloat(e.target.value);
    let accum = 0;
    let targetTrackIdx = 0;
    let trackLocalTime = 0;
    
    // Find which track contains this time
    for (let i = 0; i < tracks.length; i++) {
      const trackDuration = tracks[i].use_hook 
        ? (tracks[i].hook_duration || 30) 
        : (tracks[i].duration || 0);
        
      if (accum + trackDuration >= targetOverallTime) {
        targetTrackIdx = i;
        const elapsedInTrack = targetOverallTime - accum;
        trackLocalTime = tracks[i].use_hook
          ? (tracks[i].hook_start || 0) + elapsedInTrack
          : elapsedInTrack;
        break;
      }
      accum += trackDuration;
      if (i === tracks.length - 1) {
        targetTrackIdx = i;
        const elapsedInTrack = targetOverallTime - accum;
        trackLocalTime = tracks[i].use_hook
          ? (tracks[i].hook_start || 0) + elapsedInTrack
          : elapsedInTrack;
      }
    }
    
    currentTrackIndexRef.current = targetTrackIdx;
    setCurrentTrackIndex(targetTrackIdx);
    setCurrentTime(trackLocalTime);
    
    const audio = audioRef.current;
    if (audio) {
      audio.src = musicApi.getBaseUrl() + tracks[targetTrackIdx].filepath;
      audio.currentTime = trackLocalTime;
      if (isPlaying) {
        audio.play().catch(err => console.log(err));
      }
    }
  };

  // Video Export Execution
  const handleExport = async () => {
    if (tracks.length === 0) {
      alert("กรุณาเพิ่มเพลงใน Playlist อย่างน้อย 1 เพลงก่อนทำการ Export");
      return;
    }
    if (!activeBg) {
      alert("กรุณาอัปโหลดและเลือก Background Media");
      return;
    }
    
    setShowExportModal(true);
    setExportState({
      status: 'processing',
      progress: 0.0,
      step: 'Connecting to server...',
      output_video: '',
      output_timeline: '',
      output_songlist: '',
      error: ''
    });

    try {
      // First save state
      const stateObj = {
        tracks,
        backgrounds,
        active_background: activeBg,
        subtitles: subtitles.map(s => ({
          ...s,
          start: parseFloat(s.start) || 0,
          end: parseFloat(s.end) || 0
        })),
        quote_overlay: quoteOverlay,
        subtitle_settings: subtitleSettings,
        settings: {
          main_title: mainTitle,
          genre: genreText,
          description: descText,
          watermark,
          resolution,
          fps,
          visualizer_style: visStyle,
          color_theme: colorTheme,
          custom_color: customColor,
          visualizer_opacity: visOpacity,
          visualizer_height: visHeight,
          visualizer_y: visYPos,
          font_family: fontFamily,
          title_font_size: titleFontSize,
          ken_burns: kenBurns,
          ken_burns_speed: kenBurnsSpeed,
          background_filter: bgFilter,
          bgs_per_track: bgsPerTrack,
          selected_bg_paths: selectedBgPaths
        }
      };
      await musicApi.saveState(stateObj);
      
      // Start export
      await musicApi.startExport();
      
      // Setup status polling
      const pollInterval = setInterval(async () => {
        try {
          const status = await musicApi.getExportStatus();
          setExportState(status);
          
          if (status.status === 'success' || status.status === 'failed') {
            clearInterval(pollInterval);
          }
        } catch (pollErr) {
          console.error("Polling error: ", pollErr);
        }
      }, 1500);

    } catch (err) {
      setExportState({
        status: 'failed',
        progress: 0.0,
        step: 'Failed to start export pipeline',
        output_video: '',
        output_timeline: '',
        output_songlist: '',
        error: err.message
      });
    }
  };

  const handleAiTranscribe = async () => {
    if (!openrouterApiKey) {
      alert("กรุณากรอก OpenRouter API Key ก่อนใช้งาน");
      return;
    }
    if (tracks.length === 0) {
      alert("กรุณาอัพโหลดและเพิ่มเพลงใน Playlist ก่อน");
      return;
    }
    
    setIsTranscribing(true);
    try {
      const activeTrack = tracks[0];
      const result = await musicApi.transcribeLyrics(
        activeTrack.filepath,
        openrouterApiKey,
        activeTrack.use_hook,
        activeTrack.hook_start || 0,
        activeTrack.hook_duration || 30
      );
      setSubtitles(result.subtitles || []);
      alert("เอไอแกะเนื้อร้องพร้อมเวลาเรียบร้อยแล้ว!");
    } catch (err) {
      console.error(err);
      alert("การแกะเนื้อร้องล้มเหลว: " + err.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSubtitleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await musicApi.parseSubtitles(file);
      setSubtitles(result.subtitles || []);
      alert("นำเข้าไฟล์ซับไตเติลสำเร็จ!");
    } catch (err) {
      console.error(err);
      alert("นำเข้าล้มเหลว: " + err.message);
    }
  };

  const handleSubtitleExport = () => {
    if (subtitles.length === 0) {
      alert("ไม่มีข้อมูลคำบรรยายสำหรับการส่งออก");
      return;
    }
    
    const formatSRTTime = (seconds) => {
      const totalMs = Math.round(seconds * 1000);
      const ms = totalMs % 1000;
      const totalSecs = Math.floor(totalMs / 1000);
      const s = totalSecs % 60;
      const totalMins = Math.floor(totalSecs / 60);
      const m = totalMins % 60;
      const h = Math.floor(totalMins / 60);
      
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    
    // Sort subtitles chronologically
    const sortedSubs = [...subtitles].sort((a, b) => parseFloat(a.start) - parseFloat(b.start));
    
    let srtContent = "";
    sortedSubs.forEach((sub, idx) => {
      const startSec = parseFloat(sub.start) || 0;
      const endSec = parseFloat(sub.end) || 0;
      
      srtContent += `${idx + 1}\n`;
      srtContent += `${formatSRTTime(startSec)} --> ${formatSRTTime(endSec)}\n`;
      srtContent += `${sub.text.replace(/\r?\n/g, '\n')}\n\n`;
    });
    
    const blob = new Blob([srtContent], { type: "text/srt;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = (mainTitle.trim() || "subtitles") + ".srt";
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBurnSubtitles = async () => {
    if (!exportState.output_video) {
      alert("กรุณาทำการ Export Video (รอบแรก) เพื่อสร้างวิดีโอตั้งต้นก่อนทำการฝังซับไตเติล");
      return;
    }
    setIsBurning(true);
    try {
      const baseVideoFilename = 'base_' + exportState.output_video.split('/').pop();
      const result = await musicApi.burnSubtitles(
        baseVideoFilename,
        subtitles.map(s => ({
          ...s,
          start: parseFloat(s.start) || 0,
          end: parseFloat(s.end) || 0
        })),
        quoteOverlay,
        subtitleSettings
      );
      
      // Update exportState with the new video url
      setExportState(prev => ({
        ...prev,
        output_video: result.output_video
      }));
      alert("ฝังซับไตเติลและสเตตัสลงในวิดีโอสำเร็จ!");
    } catch (err) {
      console.error(err);
      alert("ฝังซับไตเติลล้มเหลว: " + err.message);
    } finally {
      setIsBurning(false);
    }
  };

  const updateSub = (index, key, value) => {
    setSubtitles(prev => prev.map((sub, idx) => idx === index ? { ...sub, [key]: value } : sub));
  };

  const addSubLine = () => {
    setSubtitles(prev => {
      const lastSub = prev[prev.length - 1];
      const nextStart = lastSub ? lastSub.end : 0.0;
      return [...prev, { start: nextStart, end: nextStart + 3.0, text: 'เนื้อร้องใหม่' }];
    });
  };

  const removeSub = (index) => {
    setSubtitles(prev => prev.filter((_, idx) => idx !== index));
  };

  const autoWrapText = (text, fontSizeStr = 'Medium', isQuote = false) => {
    if (!text) return text;
    if (text.includes('\n') || text.includes('\\N')) return text; // Respect manual wrapping
    
    let wrapLimitMap = { Small: 38, Medium: 28, Large: 22 };
    if (isQuote) {
      wrapLimitMap = { Small: 42, Medium: 31, Large: 24 };
    }
    const maxChars = wrapLimitMap[fontSizeStr] || (isQuote ? 31 : 28);
    
    if (text.length <= maxChars) return text;
    
    // Wrap by space if there is any
    if (text.includes(' ')) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = [];
      let currentLen = 0;
      for (const word of words) {
        const wordLen = word.length;
        if (currentLen + wordLen + (currentLine.length > 0 ? 1 : 0) <= maxChars) {
          currentLine.push(word);
          currentLen += wordLen + (currentLine.length > 1 ? 1 : 0);
        } else {
          if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
          }
          currentLine = [word];
          currentLen = wordLen;
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      return lines.join('\n');
    }
    
    // Safe Thai wrap fallback
    const CANNOT_START_LINE = new Set([
      '\u0e30', '\u0e31', '\u0e32', '\u0e33', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e38', '\u0e39', '\u0e3a',  // Vowels
      '\u0e47', '\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c', '\u0e4d', '\u0e4e',  // Tone marks & diacritics
      '\u0e46', // ๆ Mai Yamok
      '\u0e45' // ๅ Lakkhang Yao
    ]);
    const LEADING_VOWELS = new Set(['\u0e40', '\u0e41', '\u0e42', '\u0e43', '\u0e44']); // เ, แ, โ, ใ, ไ

    const thaiWrapLine = (t, limit) => {
      if (t.length <= limit) return t;
      
      let splitIdx = limit;
      while (splitIdx > 0) {
        const charAtSplit = t[splitIdx];
        const charBeforeSplit = t[splitIdx - 1];
        
        if (!CANNOT_START_LINE.has(charAtSplit) && !LEADING_VOWELS.has(charBeforeSplit)) {
          break;
        }
        splitIdx--;
      }
      
      if (splitIdx === 0) {
        splitIdx = limit + 1;
        while (splitIdx < t.length) {
          const charAtSplit = t[splitIdx];
          const charBeforeSplit = t[splitIdx - 1];
          if (!CANNOT_START_LINE.has(charAtSplit) && !LEADING_VOWELS.has(charBeforeSplit)) {
            break;
          }
          splitIdx++;
        }
      }
      
      if (splitIdx >= t.length || splitIdx === 0) {
        splitIdx = limit;
      }
      
      const left = t.substring(0, splitIdx).trim();
      const right = t.substring(splitIdx).trim();
      return left + '\n' + thaiWrapLine(right, limit);
    };

    return thaiWrapLine(text, maxChars);
  };

  const renderHighlightedText = (text) => {
    if (!text) return null;
    
    // Auto tag keywords if no brackets are present
    let processedText = text;
    if (!text.includes('[') && !text.includes(']')) {
      const THAI_EMOTIONAL_KEYWORDS = [
        "เจ็บปวด", "ความรัก", "คิดถึงเธอ", "ร้องไห้",
        "ความจริง", "คนเดียว", "เสียใจ", "รักเธอ", "ห่วงหา", "ไม่รัก",
        "คิดถึง", "เหนื่อย", "น้ำตา", "รัก", "เจ็บ", "รอ", "ลืม", "เหงา", 
        "กอด", "ใจ", "ทิ้ง", "พัง", "จบ"
      ];
      // Find the first match
      for (const kw of THAI_EMOTIONAL_KEYWORDS) {
        if (text.includes(kw)) {
          processedText = text.replace(kw, `[${kw}]`);
          break; // Wrap only the first match
        }
      }
    }
    
    // Parse brackets and render as styled spans
    const parts = processedText.split(/\[(.*?)\]/g);
    
    const highlightColor = quoteOverlay.highlight_color || '#ff007a';
    const highlightScale = quoteOverlay.highlight_scale !== undefined ? quoteOverlay.highlight_scale : 1.25;
    
    return parts.map((part, idx) => {
      // Odd indices are the bracket contents (emphasized words)
      if (idx % 2 === 1) {
        return (
          <span 
            key={idx} 
            className="font-bold inline-block mx-0.5"
            style={{ 
              fontSize: `${highlightScale}em`,
              color: highlightColor,
              textShadow: `0 0 10px ${highlightColor}66, 2px 2px 4px rgba(0,0,0,0.8)`
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const getCssFilter = (filterName) => {
    switch (filterName) {
      case 'vintage':
        return 'sepia(0.3) contrast(1.1) brightness(0.95) saturate(0.85)';
      case 'cinematic':
        return 'contrast(1.15) brightness(1.02) saturate(0.9)';
      case 'noir':
        return 'grayscale(1) contrast(1.4) brightness(0.85)';
      case 'sepia':
        return 'sepia(1) contrast(0.95) brightness(0.95)';
      case 'warm':
        return 'sepia(0.25) saturate(1.15) contrast(1.05)';
      case 'cool':
        return 'hue-rotate(15deg) saturate(0.9) brightness(0.95) contrast(1.05)';
      case 'vivid':
        return 'saturate(1.4) contrast(1.15)';
      case 'grayscale':
        return 'grayscale(1)';
      case 'cyberpunk':
        return 'hue-rotate(280deg) saturate(1.4) contrast(1.2)';
      case 'vibrant':
        return 'saturate(1.3) contrast(1.1)';
      case 'dreamy':
        return 'blur(1px) brightness(1.05) saturate(1.05)';
      case 'blur':
        return 'blur(4px)';
      case 'negate':
        return 'invert(1)';
      default:
        return 'none';
    }
  };

  const currentBg = getCurrentTrackBackground();

  const activeTrack = tracks[currentTrackIndex];
  const relativeTime = activeTrack && activeTrack.use_hook 
    ? currentTime - (activeTrack.hook_start || 0) 
    : currentTime;
  const activeSub = subtitles.find(s => {
    const startVal = parseFloat(s.start);
    const endVal = parseFloat(s.end);
    return !isNaN(startVal) && !isNaN(endVal) && startVal <= relativeTime && relativeTime <= endVal;
  });

  return (
    <div className="flex-1 flex flex-row min-h-screen bg-[#0a0b0e] text-[#ededed] overflow-hidden select-none">
      
      {/* Collapsible Left Sidebar */}
      <aside className={`shrink-0 border-r border-white/[0.04] bg-[#0d0e12]/95 transition-all duration-300 flex flex-col z-40 relative ${sidebarOpen ? 'w-72 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[#ff007a]" />
            <span className="font-bold text-sm tracking-wide text-white">คลังโปรเจคของคุณ</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 cursor-pointer"
            title="ซ่อนแถบข้าง"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
        </div>

        {/* New Project Button */}
        <div className="p-4">
          <button 
            onClick={handleNewProjectClick}
            className="w-full py-2.5 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>สร้างโปรเจคใหม่</span>
          </button>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
          {projectList.length > 0 ? (
            projectList.map((proj) => (
              <div 
                key={proj.name}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all group cursor-pointer ${mainTitle === proj.name ? 'bg-gradient-to-r from-[#ff007a]/10 to-transparent border-[#ff007a]/30' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}
                onClick={() => handleLoadProject(proj.name)}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate transition-all ${mainTitle === proj.name ? 'text-[#ff007a]' : 'text-white/80'}`}>
                    {proj.name}
                  </p>
                  <p className="text-[9px] text-white/30 mt-0.5 font-mono">
                    แก้ไขเมื่อ: {new Date(proj.updated_at * 1000).toLocaleDateString('th-TH')}
                  </p>
                </div>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(proj.name);
                  }}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="ลบโปรเจค"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
              <FolderOpen className="w-6 h-6 text-white/10 mb-2" />
              <p className="text-[10px] text-white/30 text-center">ไม่มีโปรเจคที่บันทึกไว้</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto p-4 lg:p-6 select-none relative bg-[#0a0b0e]">
        {/* Hidden audio element */}
        <audio ref={audioRef} crossOrigin="anonymous" />
        
        {/* Header Bar */}
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle button */}
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 sm:px-3 sm:py-2 text-xs font-semibold rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all flex items-center gap-1.5 active:scale-95 text-white/80 cursor-pointer"
              title={sidebarOpen ? "ซ่อนแถบข้าง" : "เปิดแถบข้าง"}
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{sidebarOpen ? 'ซ่อนแถบข้าง' : 'คลังโปรเจค'}</span>
            </button>
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#ff007a] to-[#8a00ff] shadow-md shadow-[#ff007a]/20">
              <Video className="w-6 h-6 text-white" />
            </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-[#f3f4f6] to-[#aaa]">
              Music Longplay
            </h1>
            <p className="text-xs text-white/40">Music visualizer creator</p>
          </div>
        </div>

        {/* Global Action Inputs */}
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="ตั้งชื่อโปรเจค..."
            value={mainTitle}
            onChange={(e) => setMainTitle(e.target.value)}
            className="hidden sm:block px-4 py-2 text-sm rounded-lg glass-input w-56 text-white"
          />
          {autoSaveStatus && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-white/40 mr-1 select-none">
              {autoSaveStatus === "Saving..." && <Loader2 className="w-3 h-3 animate-spin text-[#ff007a]" />}
              {autoSaveStatus === "Auto-saved" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              {autoSaveStatus === "Error" && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
              <span>{autoSaveStatus === "Auto-saved" ? "Auto-saved" : autoSaveStatus === "Saving..." ? "Autosaving..." : autoSaveStatus}</span>
            </div>
          )}
          <button 
            onClick={handleSaveState} 
            disabled={isSaving}
            className="p-2 sm:px-4 sm:py-2 text-sm rounded-lg border border-white/10 hover:border-white/20 transition-all flex items-center gap-2 hover:bg-white/5 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Save Project</span>
          </button>
          
          <button 
            onClick={handleExport}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#ff007a] to-[#d60067] hover:from-[#ff1a88] hover:to-[#e60070] transition-all flex items-center gap-2 shadow-lg shadow-[#ff007a]/20 active:scale-95 cursor-pointer text-white"
          >
            <Download className="w-4 h-4" />
            <span>Export Video</span>
          </button>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Workspace & Previews) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Combined Audio & Preview Panel */}
          <div className="w-full glass-panel rounded-3xl p-6 flex flex-col gap-5 shadow-2xl">
            {/* Header: Audio & Preview */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#ff007a]/10 text-[#ff007a] flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide">Audio & Preview</h2>
                  <p className="text-xs text-white/40 font-medium">
                    {tracks.length} tracks • {formatTime(getPlaylistDuration())}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => audioInputRef.current?.click()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Track</span>
              </button>
            </div>

            {/* Black Preview Box */}
            <div 
              onClick={togglePlay}
              className={`relative bg-black rounded-2xl overflow-hidden flex flex-col justify-end group shadow-xl transition-all duration-300 ${isVertical ? 'aspect-[9/16] h-[550px] mx-auto' : 'w-full aspect-video'} ${tracks.length > 0 ? 'cursor-pointer' : ''}`}
              style={{ containerType: 'inline-size' }}
            >
              {/* Background Layer with Optional Ken Burns Animation */}
              {currentBg ? (
                currentBg.toLowerCase().endsWith('.mp4') || currentBg.includes('_video_') ? (
                  <video 
                    key={currentBg}
                    src={musicApi.getBaseUrl() + currentBg} 
                    autoPlay 
                    loop 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover z-0"
                    style={{ filter: getCssFilter(bgFilter) }}
                  />
                ) : (
                  <img 
                    key={currentBg}
                    src={musicApi.getBaseUrl() + currentBg} 
                    alt="Video background preview" 
                    className="absolute inset-0 w-full h-full object-cover z-0"
                    style={{ filter: getCssFilter(bgFilter) }}
                  />
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-2 z-10 pointer-events-none">
                  <ImageIcon className="w-12 h-12 text-white/10" />
                  <span className="text-xs text-white/30 font-medium">Add images to see visualizer preview</span>
                </div>
              )}
              
              {/* Ambient Dark Overlay to ensure readability */}
              {currentBg && (
                <div 
                  className="absolute inset-0 z-10 pointer-events-none"
                  style={{
                    background: bgFilter === 'vignette' 
                      ? 'radial-gradient(ellipse, transparent 40%, rgba(0,0,0,0.65) 95%)' 
                      : bgFilter === 'vignette_heavy'
                      ? 'radial-gradient(ellipse, transparent 25%, rgba(0,0,0,0.85) 90%)'
                      : 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.3) 100%)'
                  }}
                />
              )}
              
              {/* Hover Play/Pause Overlay */}
              {tracks.length > 0 && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-25 pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-all duration-200 pointer-events-auto">
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </div>
                </div>
              )}
              
              {/* Active song name below visualizer - outlined style */}
              <div 
                className="absolute left-0 right-0 z-30 flex flex-col items-center select-none pointer-events-none"
                style={{ top: `${(visYPos + 0.025) * 100}%` }}
              >
                {tracks.length > 0 && currentBg && (
                  <div 
                    className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-semibold tracking-wide"
                    style={{
                      fontFamily: fontFamily === 'Noto Sans Thai' 
                        ? 'var(--font-noto-sans-thai), sans-serif' 
                        : (fontFamily === 'was@kaikhiea'
                          ? 'was@kaikhiea, var(--font-sarabun), sans-serif'
                          : (fontFamily === 'Mali'
                            ? 'var(--font-mali), var(--font-sarabun), sans-serif'
                            : (fontFamily === 'Sarabun'
                              ? 'var(--font-sarabun), sans-serif'
                              : 'var(--font-inter), var(--font-sarabun), sans-serif'))),
                      fontSize: titleFontSize === 'Small' ? '2.8cqw' : (titleFontSize === 'Large' ? '4.8cqw' : '3.8cqw'),
                      textShadow: '3px 4px 6px rgba(0, 0, 0, 0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
                    }}
                  >
                    {tracks[currentTrackIndex]?.filename.replace(/\.[^/.]+$/, "")}{watermark ? ` - ${watermark}` : ''}
                  </div>
                )}
              </div>

   
              {/* Subtitle/Lyrics Live Overlay */}
              {activeSub && (
                <div 
                  className="absolute z-30 text-center transform -translate-x-1/2 pointer-events-none select-none px-4 py-1 max-w-[85%] break-words"
                  style={{
                    left: '50%',
                    width: '85%',
                    top: `${subtitleSettings.position_y * 100}%`,
                    fontFamily: subtitleSettings.font_family === 'was@kaikhiea'
                      ? 'was@kaikhiea, var(--font-sarabun), sans-serif'
                      : (subtitleSettings.font_family === 'Mali' 
                        ? 'var(--font-mali), var(--font-sarabun), sans-serif' 
                        : (subtitleSettings.font_family === 'Sarabun'
                          ? 'var(--font-sarabun), sans-serif'
                          : (subtitleSettings.font_family === 'Noto Sans Thai'
                            ? 'var(--font-noto-sans-thai), sans-serif'
                            : 'var(--font-inter), var(--font-sarabun), sans-serif'))),
                    fontSize: subtitleSettings.font_size === 'Small' ? '2.4cqw' : (subtitleSettings.font_size === 'Large' ? '4.4cqw' : '3.4cqw'),
                    color: subtitleSettings.color,
                    WebkitTextStroke: `${subtitleSettings.outline_width}px ${subtitleSettings.outline_color}`,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    backgroundColor: subtitleSettings.show_background_box ? subtitleSettings.background_box_color : 'transparent',
                    borderRadius: '0.5cqw',
                    whiteSpace: 'pre-line'
                  }}
                >
                  {autoWrapText(activeSub.text, subtitleSettings.font_size)}
                </div>
              )}

              {/* Quote/Status Live Overlay */}
              {quoteOverlay.enabled && quoteOverlay.text && (
                <div 
                  className="absolute z-30 pointer-events-none select-none text-white px-4 max-w-[85%] break-words animate-fade-in"
                  style={{
                    left: `${(quoteOverlay.position_x !== undefined ? quoteOverlay.position_x : 0.50) * 100}%`,
                    width: '85%',
                    top: `${quoteOverlay.position_y * 100}%`,
                    textAlign: quoteOverlay.alignment || 'center',
                    transform: (quoteOverlay.alignment === 'left') 
                      ? 'none' 
                      : ((quoteOverlay.alignment === 'right') ? 'translateX(-100%)' : 'translateX(-50%)'),
                    fontFamily: subtitleSettings.font_family === 'was@kaikhiea'
                      ? 'was@kaikhiea, var(--font-sarabun), sans-serif'
                      : (subtitleSettings.font_family === 'Mali' 
                        ? 'var(--font-mali), var(--font-sarabun), sans-serif' 
                        : (subtitleSettings.font_family === 'Sarabun'
                          ? 'var(--font-sarabun), sans-serif'
                          : (subtitleSettings.font_family === 'Noto Sans Thai'
                            ? 'var(--font-noto-sans-thai), sans-serif'
                            : 'var(--font-inter), var(--font-sarabun), sans-serif'))),
                    fontSize: subtitleSettings.font_size === 'Small' ? '2.2cqw' : (subtitleSettings.font_size === 'Large' ? '4.0cqw' : '3.0cqw'),
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
                    whiteSpace: 'pre-line'
                  }}
                >
                  {/* Large Background Quote Decorator */}
                  {quoteOverlay.decorator_style === 'background' && (
                    <span 
                      className="absolute pointer-events-none select-none font-bold"
                      style={{
                        left: (quoteOverlay.alignment === 'left') ? '0px' : ((quoteOverlay.alignment === 'right') ? 'auto' : '50%'),
                        right: (quoteOverlay.alignment === 'right') ? '0px' : 'auto',
                        top: '-0.5em',
                        transform: (quoteOverlay.alignment === 'center') ? 'translateX(-50%)' : 'none',
                        fontSize: '3em',
                        color: '#FFFFFF',
                        opacity: 0.20,
                        zIndex: -1,
                        lineHeight: 1
                      }}
                    >
                      “
                    </span>
                  )}
                  
                  {/* Inline Quote Decorator */}
                  {quoteOverlay.decorator_style === 'inline' && (
                    <span 
                      className="font-bold inline-block mr-1 align-middle"
                      style={{ 
                        fontSize: `${(quoteOverlay.highlight_scale !== undefined ? quoteOverlay.highlight_scale : 1.25) * 1.2}em`,
                        color: quoteOverlay.highlight_color || '#ff007a',
                        textShadow: `0 0 10px ${(quoteOverlay.highlight_color || '#ff007a')}66, 2px 2px 4px rgba(0,0,0,0.8)`
                      }}
                    >
                      “
                    </span>
                  )}

                  {renderHighlightedText(autoWrapText(quoteOverlay.text, subtitleSettings.font_size, true))}
                </div>
              )}

              {/* Active Canvas Visualizer Overlay */}
              {activeBg && (
                <CanvasVisualizer 
                  audioRef={audioRef}
                  style={visStyle}
                  theme={colorTheme}
                  customColor={customColor}
                  isPlaying={isPlaying}
                  opacity={visOpacity}
                  heightScale={visHeight}
                  yPosScale={visYPos}
                />
              )}
            </div>
   
            {/* Player Control Capsule (Outside the preview frame) */}
            <div className="w-full bg-[#181922]/90 border border-white/[0.04] rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 shadow-inner">
              <span className="text-xs text-white/50 font-mono w-10 text-left tabular-nums">
                {formatTime(getOverallCurrentTime())}
              </span>
              <input 
                type="range"
                min={0}
                max={getPlaylistDuration() || 1}
                value={getOverallCurrentTime()}
                onChange={handleTimelineScrub}
                disabled={tracks.length === 0}
                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a] transition-all"
              />
              <span className="text-xs text-white/50 font-mono w-10 text-right tabular-nums">
                {formatTime(getPlaylistDuration())}
              </span>
            </div>
          </div>

          {/* ADVANCED SETTINGS ROW */}
          <div className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Advanced Settings</h3>
              <p className="text-xs text-white/40">Fine-tune preview animations and watermark details</p>
            </div>
            
            <div className="flex items-center gap-6">
              {/* Background Filter Select */}
              <div className="flex items-center gap-2">
                <label htmlFor="bgFilterSelect" className="text-xs text-white/70">Filter</label>
                <select
                  id="bgFilterSelect"
                  value={bgFilter}
                  onChange={(e) => setBgFilter(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer hover:bg-white/10 transition-all focus:outline-none"
                >
                  <option value="none" className="bg-[#181922] text-white">None (ปกติ)</option>
                  <option value="vintage" className="bg-[#181922] text-white">Vintage (วินเทจ)</option>
                  <option value="cinematic" className="bg-[#181922] text-white">Cinematic (ซีเนมาติก)</option>
                  <option value="noir" className="bg-[#181922] text-white">Noir (ขาวดำคอนทราสต์)</option>
                  <option value="sepia" className="bg-[#181922] text-white">Sepia (ซีเปีย)</option>
                  <option value="warm" className="bg-[#181922] text-white">Warm (โทนอุ่น)</option>
                  <option value="cool" className="bg-[#181922] text-white">Cool (โทนเย็น)</option>
                  <option value="vivid" className="bg-[#181922] text-white">Vivid (สีสด)</option>
                  <option value="grayscale" className="bg-[#181922] text-white">Grayscale (ขาวดำ)</option>
                  <option value="cyberpunk" className="bg-[#181922] text-white">Cyberpunk (ไซเบอร์พังก์)</option>
                  <option value="vibrant" className="bg-[#181922] text-white">Vibrant (สีอิ่มตัว)</option>
                  <option value="dreamy" className="bg-[#181922] text-white">Dreamy (ฝันฟุ้ง)</option>
                  <option value="blur" className="bg-[#181922] text-white">Blur (เบลอ)</option>
                  <option value="vignette" className="bg-[#181922] text-white">Vignette (ขอบมืด)</option>
                  <option value="vignette_heavy" className="bg-[#181922] text-white">Vignette Heavy (ขอบมืดหนา)</option>
                  <option value="negate" className="bg-[#181922] text-white">Negative (เนกาทีฟ)</option>
                </select>
              </div>

              {/* Watermark input */}
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Watermark text..."
                  value={watermark}
                  onChange={(e) => setWatermark(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg glass-input w-36 text-white"
                />
              </div>
            </div>
          </div>

          {/* AUDIO PLAYLIST & FILE UPLOAD SECTION */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 border-b border-white/[0.04] pb-3">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-[#ff007a]" />
                <h3 className="font-semibold text-sm">Playlist Tracks</h3>
              </div>
              <span className="text-xs text-white/40">
                Manage Tracks
              </span>
            </div>

            {/* List of track items */}
            {tracks.length > 0 ? (
              <div className="flex flex-col gap-2 mb-4">
                {tracks.map((track, index) => (
                  <div 
                    key={track.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${index === currentTrackIndex ? 'bg-gradient-to-r from-[#ff007a]/10 to-transparent border-[#ff007a]/30' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Drag handle */}
                      <div className="cursor-grab text-white/20 hover:text-white/40 px-1 py-2 flex flex-col gap-0.5">
                        <span className="w-3 h-0.5 bg-current rounded-full" />
                        <span className="w-3 h-0.5 bg-current rounded-full" />
                        <span className="w-3 h-0.5 bg-current rounded-full" />
                      </div>
                      
                      {/* Track Indicator circle */}
                      <button 
                        onClick={() => handleTrackChange(index)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${index === currentTrackIndex && isPlaying ? 'bg-[#ff007a] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                      >
                        {index === currentTrackIndex && isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{track.filename.replace(/\.[^/.]+$/, "")}</p>
                        <p className="text-xs text-white/30">Jaihug Music</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Background Selection Dropdown */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBgSelectorTrackId(activeBgSelectorTrackId === track.id ? null : track.id);
                            setActiveHookSelectorTrackId(null); // Close hook selector
                          }}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer select-none ${track.background ? 'bg-[#ff007a]/10 border-[#ff007a]/30 text-[#ff007a]' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>
                            {Array.isArray(track.background)
                              ? `Slideshow (${track.background.length})`
                              : track.background 
                                ? 'Custom BG' 
                                : 'Default BG'
                            }
                          </span>
                        </button>

                        {activeBgSelectorTrackId === track.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-1.5 w-60 max-h-64 overflow-y-auto glass-panel border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 text-left"
                          >
                            <span className="text-[9px] text-white/30 font-bold px-2 py-1 uppercase tracking-wider block border-b border-white/[0.04] mb-1">
                              เลือกพื้นหลังเพลงนี้
                            </span>
                            
                            {/* Option: Default background */}
                            <button
                              onClick={() => {
                                updateTrackBackground(track.id, null);
                              }}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${!track.background ? 'bg-white/5 text-[#ff007a] font-medium' : 'text-white/70 hover:bg-white/[0.02] hover:text-white'}`}
                            >
                              <span>ตามพื้นหลังหลัก</span>
                              {!track.background && <Check className="w-3.5 h-3.5" />}
                            </button>

                            {/* Option: Uploaded backgrounds */}
                            {backgrounds.map((bg) => {
                              const isSelected = Array.isArray(track.background)
                                ? track.background.includes(bg.filepath)
                                : track.background === bg.filepath;
                                
                              return (
                                <button
                                  key={bg.filepath}
                                  onClick={() => {
                                    toggleTrackBackgroundSelection(track.id, bg.filepath);
                                  }}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all ${isSelected ? 'bg-white/5 text-[#ff007a] font-medium' : 'text-white/70 hover:bg-white/[0.02] hover:text-white'}`}
                                >
                                  {/* Small Thumbnail */}
                                  {bg.filepath.toLowerCase().endsWith('.mp4') || bg.filepath.includes('_video_') ? (
                                    <div className="w-6 h-6 rounded bg-black border border-white/5 flex items-center justify-center text-[7px] font-bold text-white/40 flex-shrink-0">MP4</div>
                                  ) : (
                                    <img 
                                      src={musicApi.getBaseUrl() + bg.filepath} 
                                      alt="" 
                                      className="w-6 h-6 rounded object-cover border border-white/5 flex-shrink-0"
                                    />
                                  )}
                                  <span className="truncate flex-1">{bg.filename}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 ml-1 flex-shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Hook/Trim Dropdown */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHookSelectorTrackId(activeHookSelectorTrackId === track.id ? null : track.id);
                            setActiveBgSelectorTrackId(null); // Close background dropdown
                          }}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer select-none ${track.use_hook ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
                        >
                          <span className="text-xs">✂️</span>
                          <span>
                            {track.use_hook 
                              ? `Hook (${Math.round(track.hook_duration || 30)}s)`
                              : 'Full Song'
                            }
                          </span>
                        </button>

                        {activeHookSelectorTrackId === track.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-1.5 w-64 glass-panel border border-white/10 rounded-xl shadow-2xl p-3 z-50 flex flex-col gap-2 text-left"
                          >
                            <span className="text-[9px] text-white/30 font-bold px-1 py-0.5 uppercase tracking-wider block border-b border-white/[0.04] mb-1">
                              ✂️ ตั้งค่าท่อนฮุก (Custom Hook)
                            </span>
                            
                            {/* Toggle Use Hook */}
                            <label className="flex items-center justify-between gap-2 text-xs text-white/80 cursor-pointer p-1 rounded hover:bg-white/5 select-none">
                              <span>เปิดใช้งานท่อนฮุก</span>
                              <input 
                                type="checkbox"
                                checked={!!track.use_hook}
                                onChange={(e) => {
                                  updateTrackHook(track.id, 'use_hook', e.target.checked);
                                  if (e.target.checked) {
                                    if (track.hook_start === undefined) updateTrackHook(track.id, 'hook_start', 0);
                                    if (track.hook_duration === undefined) updateTrackHook(track.id, 'hook_duration', Math.min(30, Math.round(track.duration)));
                                  }
                                }}
                                className="accent-[#ff007a] cursor-pointer"
                              />
                            </label>

                            {track.use_hook && (
                              <div className="flex flex-col gap-2 mt-1 border-t border-white/5 pt-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-white/50">เริ่มที่วินาทีที่ (Start Time):</label>
                                  <input 
                                    type="number"
                                    min="0"
                                    max={Math.max(0, Math.round(track.duration) - 1)}
                                    value={track.hook_start !== undefined ? track.hook_start : 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, Math.min(Math.round(track.duration) - 1, parseFloat(e.target.value) || 0));
                                      updateTrackHook(track.id, 'hook_start', val);
                                    }}
                                    className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10 text-white w-full focus:outline-none focus:border-[#ff007a]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-white/50">ความยาวท่อน (Duration):</label>
                                  <input 
                                    type="number"
                                    min="1"
                                    max={Math.max(1, Math.round(track.duration) - (track.hook_start || 0))}
                                    value={track.hook_duration !== undefined ? track.hook_duration : 30}
                                    onChange={(e) => {
                                      const maxDur = Math.max(1, Math.round(track.duration) - (track.hook_start || 0));
                                      const val = Math.max(1, Math.min(maxDur, parseFloat(e.target.value) || 1));
                                      updateTrackHook(track.id, 'hook_duration', val);
                                    }}
                                    className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10 text-white w-full focus:outline-none focus:border-[#ff007a]"
                                  />
                                </div>
                                <div className="text-[9px] text-white/40 mt-1 italic leading-tight">
                                  * ความยาวเพลงจริง {Math.round(track.duration)} วินาที<br/>
                                  * เล่นท่อน {Math.round(track.hook_start || 0)}s ถึง {Math.round((track.hook_start || 0) + (track.hook_duration || 30))}s
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <span className="text-xs text-white/40 tabular-nums w-10 text-right">{formatTime(track.duration)}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setTracks(prev => prev.filter(t => t.id !== track.id));
                          if (currentTrackIndex >= tracks.length - 1 && currentTrackIndex > 0) {
                            setCurrentTrackIndex(prev => prev - 1);
                          }
                        }}
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01] mb-4">
                <Music className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-xs text-white/30">Your playlist is empty. Upload audio files below.</p>
              </div>
            )}

            {/* Dropzone Upload Input */}
            <div className="relative border border-dashed border-white/10 hover:border-white/20 transition-all rounded-xl p-6 bg-white/[0.01] flex flex-col items-center justify-center cursor-pointer group">
              <input 
                ref={audioInputRef}
                type="file" 
                multiple
                accept="audio/mp3,audio/wav,audio/flac,audio/ogg,audio/m4a"
                onChange={(e) => handleFileUpload(e, 'audio')}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              />
              <div className="flex flex-col items-center text-center">
                <Plus className="w-8 h-8 text-white/20 group-hover:text-white/40 transition-all mb-2" />
                <span className="text-xs font-semibold">Add more tracks — click or drop files here</span>
                <span className="text-[10px] text-white/30 mt-1">MP3, WAV, FLAC, OGG, M4A</span>
              </div>
            </div>
          </div>

          {/* BACKGROUND MEDIA UPLOADER SECTION */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 border-b border-white/[0.04] pb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#ff007a]" />
                <h3 className="font-semibold text-sm">Background Media</h3>
                <span className="text-xs text-white/30 ml-1">({backgrounds.length} items)</span>
              </div>
              
              {backgrounds.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/60">ภาพ/วิดีโอต่อ 1 เพลง:</span>
                    <div className="flex items-center bg-black/40 rounded-lg border border-white/10 px-1">
                      <button
                        onClick={() => setBgsPerTrack(prev => Math.max(1, prev - 1))}
                        className="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 rounded"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-bold tabular-nums">{bgsPerTrack}</span>
                      <button
                        onClick={() => setBgsPerTrack(prev => prev + 1)}
                        className="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 rounded"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleAutoDistributeBackgrounds}
                    disabled={selectedBgPaths.length === 0}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ff007a] hover:bg-[#ff007a]/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    จัดสรรอัตโนมัติ ({selectedBgPaths.length} รูปที่เลือก)
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {backgrounds.map((bg, idx) => {
                const isVideo = bg.filepath.toLowerCase().endsWith('.mp4') || bg.filepath.includes('_video_');
                const dims = bgDimensions[bg.filepath];
                let typeText = 'แนวนอน';
                if (dims) {
                  if (dims.w < dims.h) typeText = 'แนวตั้ง';
                  else if (dims.w === dims.h) typeText = 'จัตุรัส';
                }
                
                const isSelectedForMapping = selectedBgPaths.includes(bg.filepath);
                
                return (
                  <div 
                    key={idx}
                    onClick={() => {
                      setSelectedBgPaths(prev => 
                        prev.includes(bg.filepath) 
                          ? prev.filter(p => p !== bg.filepath)
                          : [...prev, bg.filepath]
                      );
                      if (!selectedBgPaths.includes(bg.filepath)) {
                        setActiveBg(bg.filepath);
                      }
                    }}
                    className={`group aspect-video rounded-xl overflow-hidden border relative cursor-pointer transition-all hover:scale-105 active:scale-95 ${isSelectedForMapping ? 'border-[#ff007a] ring-2 ring-[#ff007a]/20' : 'border-white/5 hover:border-white/20'}`}
                  >
                    {/* Selection Checkbox indicator at top-left */}
                    <div className="absolute top-1.5 left-1.5 z-10">
                      {isSelectedForMapping ? (
                        <div className="w-4 h-4 rounded-full bg-[#ff007a] flex items-center justify-center text-white border border-[#ff007a]">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-black/40 border border-white/30" />
                      )}
                    </div>

                    {isVideo ? (
                      <>
                        <video
                          src={musicApi.getBaseUrl() + bg.filepath}
                          className="hidden"
                          onLoadedMetadata={(e) => {
                            const { videoWidth, videoHeight } = e.target;
                            setBgDimensions(prev => ({
                              ...prev,
                              [bg.filepath]: { w: videoWidth, h: videoHeight }
                            }));
                          }}
                        />
                        <div className="w-full h-full bg-black flex flex-col items-center justify-center text-xs font-bold text-white/40">
                          <Video className="w-6 h-6 mb-1 text-white/30" />
                          <span>วิดีโอ (MP4)</span>
                        </div>
                      </>
                    ) : (
                      <img 
                        src={musicApi.getBaseUrl() + bg.filepath} 
                        alt="Background thumbnail" 
                        className="w-full h-full object-cover"
                        onLoad={(e) => {
                          const { naturalWidth, naturalHeight } = e.target;
                          setBgDimensions(prev => ({
                            ...prev,
                            [bg.filepath]: { w: naturalWidth, h: naturalHeight }
                          }));
                        }}
                      />
                    )}
                    
                    {activeBg === bg.filepath && (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#ff007a] text-[8px] font-bold text-white z-10 uppercase tracking-wider">
                        Active
                      </div>
                    )}
                    
                    {dims && (
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[8px] font-semibold text-white/90 z-5 select-none pointer-events-none">
                        {dims.w}x{dims.h} ({typeText})
                      </div>
                    )}
                    
                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBackground(bg.filepath);
                      }}
                      className="absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-black/60 hover:bg-red-500/80 text-white/80 hover:text-white transition-all z-10 opacity-0 group-hover:opacity-100"
                      title="ลบพื้นหลัง"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              
              {/* Background media upload item */}
              <div className="aspect-video border border-dashed border-white/10 hover:border-white/20 transition-all rounded-xl relative flex flex-col items-center justify-center cursor-pointer group bg-white/[0.01]">
                <input 
                  type="file"
                  multiple
                  accept="image/jpg,image/jpeg,image/png,image/webp,video/mp4"
                  onChange={(e) => handleFileUpload(e, 'background')}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <Plus className="w-5 h-5 text-white/20 group-hover:text-white/40 mb-1" />
                <span className="text-[10px] text-white/40">Upload Media</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (Visualizer & Output Sidebar Settings) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* TAB SWITCHER */}
          <div className="flex gap-2 p-1 bg-[#181922] border border-white/[0.04] rounded-xl">
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'settings' ? 'bg-[#ff007a] text-white shadow-md shadow-[#ff007a]/20' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              Settings
            </button>
            <button 
              onClick={() => setActiveTab('subtitles')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'subtitles' ? 'bg-[#ff007a] text-white shadow-md shadow-[#ff007a]/20' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              Lyrics & Subtitles
            </button>
          </div>

          {activeTab === 'settings' ? (
            <>
              {/* EXPORT FORMAT SETTINGS CARD */}
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-3">
                  <Sliders className="w-5 h-5 text-[#ff007a]" />
                  <h3 className="font-semibold text-sm">Export Settings</h3>
                </div>

                {/* Resolution Selector */}
                <div className="mb-4">
                  <label className="text-xs text-white/50 block mb-2 font-medium">RESOLUTION</label>
                  <div className="flex flex-col gap-2">
                    <div>
                      <span className="text-[10px] text-white/30 block mb-1 font-semibold">HORIZONTAL (16:9)</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['HD', '2K', '4K'].map((res) => (
                          <button 
                            key={res}
                            onClick={() => setResolution(res)}
                            className={`py-2 rounded-lg text-xs font-semibold border transition-all focus:outline-none ${resolution === res ? 'bg-[#ff007a] border-[#ff007a] text-white shadow-lg shadow-[#ff007a]/20' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/30 block mb-1 font-semibold">VERTICAL (9:16)</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Vertical HD', 'Vertical 2K', 'Vertical 4K'].map((res) => (
                          <button 
                            key={res}
                            onClick={() => setResolution(res)}
                            className={`py-2 rounded-lg text-xs font-semibold border transition-all focus:outline-none ${resolution === res ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white shadow-lg shadow-[#8b5cf6]/20' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}
                          >
                            {res.replace('Vertical ', '')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Frame Rate Selector */}
                <div>
                  <label className="text-xs text-white/50 block mb-2 font-medium">FRAME RATE</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[24, 30].map((rate) => (
                      <button 
                        key={rate}
                        onClick={() => setFps(rate)}
                        className={`py-2.5 rounded-lg border transition-all flex flex-col items-center justify-center ${fps === rate ? 'bg-[#ff007a] border-[#ff007a] text-white' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}
                      >
                        <span className="text-xs font-semibold">{rate} fps</span>
                        <span className="text-[9px] opacity-40">{rate === 24 ? 'Faster Encode' : 'High Quality'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family Selector */}
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <label className="text-xs text-white/50 block mb-2 font-medium">FONT FAMILY</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'Inter', label: 'Inter' },
                      { value: 'Noto Sans Thai', label: 'Noto Sans' },
                      { value: 'Mali', label: 'Mali (ลายมือ)' },
                      { value: 'Sarabun', label: 'Sarabun' },
                      { value: 'was@kaikhiea', label: 'was@kaikhiea' }
                    ].map((font) => (
                      <button 
                        key={font.value}
                        onClick={() => setFontFamily(font.value)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-all ${fontFamily === font.value ? 'bg-[#ff007a] border-[#ff007a] text-white' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'} ${font.value === 'was@kaikhiea' ? 'col-span-2 font-mono' : ''}`}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Song Title Size Selector */}
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <label className="text-xs text-white/50 block mb-2 font-medium">SONG TITLE SIZE</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Small', 'Medium', 'Large'].map((sz) => (
                      <button 
                        key={sz}
                        onClick={() => setTitleFontSize(sz)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-all ${titleFontSize === sz ? 'bg-[#ff007a] border-[#ff007a] text-white' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* VISUALIZER STYLE SELECTION */}
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-3">
                  <Video className="w-5 h-5 text-[#ff007a]" />
                  <h3 className="font-semibold text-sm">Visualizer Style</h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Waveform', 'Spectrum Bars', 'Circular Pulse', 'Particle Burst', 
                    'Geometric', 'Minimal Lines', 'Shockwave', 'Galaxy Vortex'
                  ].map((style) => (
                    <button 
                      key={style}
                      onClick={() => setVisStyle(style)}
                      className={`py-3 px-2 rounded-xl text-[11px] font-semibold border transition-all text-left flex items-center justify-between ${visStyle === style ? 'bg-white/5 border-[#ff007a] text-white ring-2 ring-[#ff007a]/10' : 'bg-white/[0.01] border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                    >
                      <span>{style}</span>
                      {visStyle === style && <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a]" />}
                    </button>
                  ))}
                </div>

                {/* Visualizer Opacity Slider */}
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-white/50 font-medium">VISUALIZER OPACITY</span>
                    <span className="text-xs font-bold text-[#ff007a] tabular-nums">{Math.round(visOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="1.0" 
                    step="0.05" 
                    value={visOpacity} 
                    onChange={(e) => setVisOpacity(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                  />
                </div>

                {/* Visualizer Height & Y-Position Sliders */}
                <div className="mt-4 pt-4 border-t border-white/[0.04] flex flex-col gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-white/50 font-medium">VISUALIZER SIZE (HEIGHT)</span>
                      <span className="text-xs font-bold text-[#ff007a] tabular-nums">{Math.round(visHeight * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.05" 
                      max="0.40" 
                      step="0.01" 
                      value={visHeight} 
                      onChange={(e) => setVisHeight(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-white/50 font-medium">VISUALIZER POSITION (Y-POS)</span>
                      <span className="text-xs font-bold text-[#ff007a] tabular-nums">{Math.round(visYPos * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.50" 
                      max="0.95" 
                      step="0.01" 
                      value={visYPos} 
                      onChange={(e) => setVisYPos(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                    />
                  </div>
                </div>
              </div>

              {/* COLOR THEME PANEL */}
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-3">
                  <Palette className="w-5 h-5 text-[#ff007a]" />
                  <h3 className="font-semibold text-sm">Color Theme</h3>
                </div>

                {/* Custom Color Selector */}
                <div className="mb-4">
                  <label className="text-xs text-white/50 block mb-2 font-medium">Custom Color</label>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <input 
                      type="color" 
                      value={customColor || '#FFFFFF'} 
                      onChange={(e) => {
                        setCustomColor(e.target.value);
                        setColorTheme('');
                      }}
                      className="w-10 h-10 rounded-lg overflow-hidden border-0 bg-transparent cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-semibold">Custom Tint</p>
                      <p className="text-[9px] text-white/40">{customColor ? customColor.toUpperCase() : 'NO CUSTOM COLOR'}</p>
                    </div>
                    {customColor && (
                      <button 
                        onClick={() => setCustomColor('')}
                        className="ml-auto text-xs text-white/30 hover:text-white/60 p-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Color Presets */}
                <div>
                  <label className="text-xs text-white/50 block mb-2 font-medium">OR CHOOSE A PRESET</label>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(THEME_COLORS).map(([name, hex]) => (
                      <button 
                        key={name}
                        onClick={() => {
                          setColorTheme(name);
                          setCustomColor('');
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${colorTheme === name ? 'bg-white/5 border-[#ff007a] text-white' : 'bg-white/[0.01] border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hex }} />
                          <span>{name}</span>
                        </div>
                        {colorTheme === name && <span className="text-[10px] text-[#ff007a] font-bold">Selected</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* SUBTITLES TAB CONTENT */}
              <div className="glass-panel rounded-2xl p-5 flex flex-col gap-5">
                {/* Check constraint: Hook Mode or Single Song */}
                {!(tracks.some(t => t.use_hook) || tracks.length === 1) ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300">ระบบซับไตเติลและเนื้อเพลง ถูกจำกัดการใช้งาน:</span> 
                      <p className="mt-1 opacity-90 leading-relaxed">ฟีเจอร์นี้รองรับเฉพาะในโหมด Hook (ท่อนฮุค 30 วินาที) หรือโหมด Single (เพลงเดี่ยว 1 เพลง) เท่านั้น กรุณาตั้งค่าท่อนฮุคหรือลบเพลงในเพลย์ลิสต์ให้เหลือเพลงเดี่ยว</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* OpenRouter API Key Input */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-white/50 font-medium">OPENROUTER API KEY</label>
                        <a 
                          href="https://openrouter.ai/keys" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] text-[#ff007a] hover:underline"
                        >
                          รับ API Key
                        </a>
                      </div>
                      <input 
                        type="password" 
                        placeholder="sk-or-v1-..."
                        value={openrouterApiKey}
                        onChange={(e) => {
                          setOpenrouterApiKey(e.target.value);
                          localStorage.setItem('openrouter_api_key', e.target.value);
                        }}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#ff007a]"
                      />
                      <span className="text-[9px] text-white/30 mt-1 block">API Key นี้เก็บอย่างปลอดภัยในเบราว์เซอร์ของคุณ</span>
                    </div>

                    <div className="border-t border-white/[0.04] pt-4 flex flex-col gap-3">
                      <span className="text-xs text-white/50 font-semibold">นำเข้าเนื้อเพลง & จัดเรียงเวลา</span>
                      
                      {/* AI Auto Transcribe button */}
                      <button 
                        onClick={handleAiTranscribe}
                        disabled={isTranscribing}
                        className="w-full py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d60067] hover:from-[#ff1a88] text-white transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 animate-pulse-subtle"
                      >
                        {isTranscribing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>เอไอกำลังแกะเนื้อร้อง... (Gemini)</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>AI Auto-Transcribe (แกะเนื้ออัตโนมัติ)</span>
                          </>
                        )}
                      </button>

                      {/* Manual subtitle file import & export */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <input 
                            type="file" 
                            accept=".srt,.ass"
                            onChange={handleSubtitleImport}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer hover:bg-white/5 transition-all"
                          />
                          <button className="w-full py-2 text-[11px] font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-center transition-all">
                            นำเข้าไฟล์ (.SRT / .ASS)
                          </button>
                        </div>
                        <button 
                          onClick={handleSubtitleExport}
                          className="w-full py-2 text-[11px] font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ส่งออกไฟล์ (.SRT)</span>
                        </button>
                      </div>
                    </div>

                    {/* Timeline Editor */}
                    <div className="border-t border-white/[0.04] pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-white/50 font-semibold">แก้ไขท่อนร้อง & เวลา</span>
                        <button 
                          onClick={addSubLine}
                          className="px-2 py-1 text-[10px] font-semibold text-[#ff007a] border border-[#ff007a]/30 rounded-lg hover:bg-[#ff007a]/5 active:scale-95 transition-all"
                        >
                          + เพิ่มแถวร้อง
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 pr-1 select-text">
                        {subtitles.length > 0 ? (
                          subtitles.map((sub, idx) => (
                             <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
                              {/* Start Time Wrapper */}
                              <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded px-1">
                                <input 
                                  type="text" 
                                  placeholder="Start"
                                  value={sub.start} 
                                  onChange={(e) => updateSub(idx, 'start', e.target.value)}
                                  className="w-10 text-center py-1 bg-transparent border-0 text-[10px] text-white focus:outline-none focus:ring-0"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    updateSub(idx, 'start', Number(getOverallCurrentTime().toFixed(1)));
                                  }}
                                  className="p-0.5 text-white/40 hover:text-[#ff007a] transition-all cursor-pointer flex items-center"
                                  title="ดึงเวลาปัจจุบัน"
                                >
                                  <Clock className="w-3 h-3" />
                                </button>
                              </div>
                              
                              <span className="text-white/30 text-[9px]">-</span>
                              
                              {/* End Time Wrapper */}
                              <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded px-1">
                                <input 
                                  type="text" 
                                  placeholder="End"
                                  value={sub.end} 
                                  onChange={(e) => updateSub(idx, 'end', e.target.value)}
                                  className="w-10 text-center py-1 bg-transparent border-0 text-[10px] text-white focus:outline-none focus:ring-0"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    updateSub(idx, 'end', Number(getOverallCurrentTime().toFixed(1)));
                                  }}
                                  className="p-0.5 text-white/40 hover:text-[#ff007a] transition-all cursor-pointer flex items-center"
                                  title="ดึงเวลาปัจจุบัน"
                                >
                                  <Clock className="w-3 h-3" />
                                </button>
                              </div>
                              
                              <textarea 
                                value={sub.text} 
                                onChange={(e) => updateSub(idx, 'text', e.target.value)}
                                rows={sub.text.includes('\n') ? 2 : 1}
                                className="flex-1 min-w-0 px-1.5 py-1 bg-black/40 border border-white/10 rounded text-[11px] text-white resize-none align-middle focus:outline-none focus:border-[#ff007a]/50"
                                placeholder="พิมพ์เนื้อเพลง..."
                                onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}
                              />
                              <button 
                                type="button"
                                onClick={() => removeSub(idx)}
                                className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                title="ลบแถว"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="py-6 text-center text-[10px] text-white/30 border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                            ยังไม่มีเนื้อเพลงในระบบ
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quote / Status Overlay Settings */}
                    <div className="border-t border-white/[0.04] pt-4 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-white/70 font-semibold block">สเตตัส / คำคม</span>
                          <span className="text-[10px] text-white/30 block">แสดงด้านบนกึ่งกลางของจอภาพ</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={quoteOverlay.enabled}
                          onChange={(e) => setQuoteOverlay(prev => ({ ...prev, enabled: e.target.checked }))}
                          className="w-4 h-4 accent-[#ff007a] cursor-pointer"
                        />
                      </div>

                      {quoteOverlay.enabled && (
                        <>
                          <div>
                            <label className="text-[10px] text-white/50 block mb-1">ข้อความคำคม</label>
                            <textarea 
                              placeholder="ตัวอย่าง: เจ็บที่สุดคือการอยู่ แต่ไม่มีความหมาย..."
                              value={quoteOverlay.text}
                              onChange={(e) => setQuoteOverlay(prev => ({ ...prev, text: e.target.value }))}
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#ff007a] resize-none"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] text-white/50 block">แนวตั้ง (Y-POS)</label>
                                <span className="text-[10px] font-bold text-[#ff007a] tabular-nums">{Math.round((quoteOverlay.position_y !== undefined ? quoteOverlay.position_y : 0.20) * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0.05" 
                                max="0.60" 
                                step="0.01" 
                                value={quoteOverlay.position_y !== undefined ? quoteOverlay.position_y : 0.20} 
                                onChange={(e) => setQuoteOverlay(prev => ({ ...prev, position_y: parseFloat(e.target.value) }))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] text-white/50 block">แนวนอน (X-POS)</label>
                                <span className="text-[10px] font-bold text-[#ff007a] tabular-nums">{Math.round((quoteOverlay.position_x !== undefined ? quoteOverlay.position_x : 0.50) * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0.05" 
                                max="0.95" 
                                step="0.01" 
                                value={quoteOverlay.position_x !== undefined ? quoteOverlay.position_x : 0.50} 
                                onChange={(e) => setQuoteOverlay(prev => ({ ...prev, position_x: parseFloat(e.target.value) }))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] text-white/50 block mb-1">การจัดวางข้อความ</label>
                              <select 
                                value={quoteOverlay.alignment || 'center'}
                                onChange={(e) => setQuoteOverlay(prev => ({ ...prev, alignment: e.target.value }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                              >
                                <option value="left" className="bg-[#181922] text-white">ชิดซ้าย (Left)</option>
                                <option value="center" className="bg-[#181922] text-white">กึ่งกลาง (Center)</option>
                                <option value="right" className="bg-[#181922] text-white">ชิดขวา (Right)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-white/50 block mb-1">รูปแบบคำคม (Decorator)</label>
                              <select 
                                value={quoteOverlay.decorator_style || 'none'}
                                onChange={(e) => setQuoteOverlay(prev => ({ ...prev, decorator_style: e.target.value }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                              >
                                <option value="none" className="bg-[#181922] text-white">ไม่มี (None)</option>
                                <option value="inline" className="bg-[#181922] text-white">เครื่องหมายด้านหน้า (Inline)</option>
                                <option value="background" className="bg-[#181922] text-white">พื้นหลังโปร่งแสง (Background)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] text-white/50 block mb-1">สีเน้นคำ (Highlight)</label>
                              <div className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
                                <input 
                                  type="color" 
                                  value={quoteOverlay.highlight_color || '#ff007a'} 
                                  onChange={(e) => setQuoteOverlay(prev => ({ ...prev, highlight_color: e.target.value }))}
                                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                                />
                                <span className="text-[10px] font-mono">{(quoteOverlay.highlight_color || '#ff007a').toUpperCase()}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-white/50 block mb-1">ขนาดคำเน้น (Scale)</label>
                              <select 
                                value={quoteOverlay.highlight_scale !== undefined ? quoteOverlay.highlight_scale : 1.25}
                                onChange={(e) => setQuoteOverlay(prev => ({ ...prev, highlight_scale: parseFloat(e.target.value) }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                              >
                                <option value="1.1" className="bg-[#181922] text-white">1.10 เท่า</option>
                                <option value="1.2" className="bg-[#181922] text-white">1.20 เท่า</option>
                                <option value="1.25" className="bg-[#181922] text-white">1.25 เท่า</option>
                                <option value="1.35" className="bg-[#181922] text-white">1.35 เท่า</option>
                                <option value="1.5" className="bg-[#181922] text-white">1.50 เท่า</option>
                                <option value="2.0" className="bg-[#181922] text-white">2.00 เท่า</option>
                                <option value="5.0" className="bg-[#181922] text-white">5.00 เท่า</option>
                                <option value="10.0" className="bg-[#181922] text-white">10.00 เท่า</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Subtitle Font Styles */}
                    <div className="border-t border-white/[0.04] pt-4 flex flex-col gap-4">
                      <span className="text-xs text-white/50 font-semibold">ปรับแต่งรูปแบบตัวอักษร</span>

                      {/* Font Family Dropdown */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">แบบฟอนต์ (Font Family)</label>
                        <select 
                          value={subtitleSettings.font_family}
                          onChange={(e) => setSubtitleSettings(prev => ({ ...prev, font_family: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                        >
                          <option value="was@kaikhiea" className="bg-[#181922] text-white">was@kaikhiea (ฟอนต์เขียนมือ)</option>
                          <option value="Mali" className="bg-[#181922] text-white">Mali (ลายมือสุดชิค)</option>
                          <option value="Sarabun" className="bg-[#181922] text-white">Sarabun (ทางการเรียบร้อย)</option>
                          <option value="Noto Sans Thai" className="bg-[#181922] text-white">Noto Sans Thai (ทันสมัยไม่มีหัว)</option>
                          <option value="Inter" className="bg-[#181922] text-white">Inter (ภาษาอังกฤษสากล)</option>
                        </select>
                      </div>

                      {/* Size, Color, Outline Width & Color */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">ขนาดอักษร</label>
                          <select 
                            value={subtitleSettings.font_size}
                            onChange={(e) => setSubtitleSettings(prev => ({ ...prev, font_size: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                          >
                            <option value="Small" className="bg-[#181922] text-white">เล็ก (Small)</option>
                            <option value="Medium" className="bg-[#181922] text-white">กลาง (Medium)</option>
                            <option value="Large" className="bg-[#181922] text-white">ใหญ่ (Large)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">ลักษณะเอฟเฟกต์</label>
                          <select 
                            value={subtitleSettings.effect}
                            onChange={(e) => setSubtitleSettings(prev => ({ ...prev, effect: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
                          >
                            <option value="Static Shadow" className="bg-[#181922] text-white">Static (เงาเรียบง่าย)</option>
                            <option value="Karaoke Highlight" className="bg-[#181922] text-white">Karaoke (ไฮไลท์คำ)</option>
                            <option value="Karaoke Glow" className="bg-[#181922] text-white">Glow (เรืองแสงคาราโอเกะ)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">สีตัวอักษร</label>
                          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
                            <input 
                              type="color" 
                              value={subtitleSettings.color} 
                              onChange={(e) => setSubtitleSettings(prev => ({ ...prev, color: e.target.value }))}
                              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                            />
                            <span className="text-[10px] font-mono">{subtitleSettings.color.toUpperCase()}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">สีเส้นขอบ</label>
                          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
                            <input 
                              type="color" 
                              value={subtitleSettings.outline_color} 
                              onChange={(e) => setSubtitleSettings(prev => ({ ...prev, outline_color: e.target.value }))}
                              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                            />
                            <span className="text-[10px] font-mono">{subtitleSettings.outline_color.toUpperCase()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-white/50">ขนาดขอบ</label>
                            <span className="text-[10px] font-bold text-[#ff007a]">{subtitleSettings.outline_width}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="5" 
                            step="1" 
                            value={subtitleSettings.outline_width} 
                            onChange={(e) => setSubtitleSettings(prev => ({ ...prev, outline_width: parseInt(e.target.value) }))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-white/50">ตำแหน่งแนวตั้ง (Y)</label>
                            <span className="text-[10px] font-bold text-[#ff007a]">{Math.round(subtitleSettings.position_y * 100)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0.50" 
                            max="0.95" 
                            step="0.01" 
                            value={subtitleSettings.position_y} 
                            onChange={(e) => setSubtitleSettings(prev => ({ ...prev, position_y: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                          />
                        </div>
                      </div>

                      {/* Background Box Option */}
                      <div className="border-t border-white/[0.04] pt-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/70 font-semibold">กล่องพื้นหลังซับไตเติล (Background Box)</span>
                          <input 
                            type="checkbox" 
                            checked={subtitleSettings.show_background_box}
                            onChange={(e) => setSubtitleSettings(prev => ({ ...prev, show_background_box: e.target.checked }))}
                            className="w-4 h-4 accent-[#ff007a] cursor-pointer"
                          />
                        </div>
                        {subtitleSettings.show_background_box && (
                          <div className="flex items-center justify-between gap-3 px-2 py-1 bg-[#181922] border border-white/10 rounded-lg">
                            <span className="text-[10px] text-white/50">สีพื้นหลังกล่อง (โปร่งแสง)</span>
                            <div className="flex items-center gap-2">
                              <input 
                                type="color" 
                                value={subtitleSettings.background_box_color.substring(0, 7)} 
                                onChange={(e) => setSubtitleSettings(prev => ({ ...prev, background_box_color: e.target.value + '80' }))}
                                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                              />
                              <span className="text-[10px] font-mono">{subtitleSettings.background_box_color.toUpperCase()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Burn Subtitles controls */}
                    <div className="border-t border-white/[0.04] pt-4 mt-2">
                      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <span className="w-5 h-5 rounded-full bg-[#ff007a]/20 text-[#ff007a] flex items-center justify-center text-[10px]">2</span>
                          <span>ขั้นตอนที่ 2: ฝังซับไตเติลลงวิดีโอ</span>
                        </div>
                        <p className="text-[10px] text-white/40 leading-relaxed">หลังจาก Export วิดีโอหลัก (แบบไม่มีซับ) เรียบร้อยแล้ว สามารถกดปุ่มนี้เพื่อฝังซับไตเติลลงวิดีโอทันทีโดยไม่ต้องเรนเดอร์ภาพใหม่ ใช้เวลาเพียง 5-10 วินาที</p>
                        
                        <button 
                          onClick={handleBurnSubtitles}
                          disabled={isBurning || !exportState.output_video}
                          className="mt-1 w-full py-2.5 text-xs font-bold rounded-xl bg-white border border-[#ff007a] hover:bg-[#ff007a]/10 text-[#ff007a] hover:text-white transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isBurning ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>กำลังฝังซับลงในวิดีโอ...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>ฝังซับไตเติลและบันทึกวิดีโอ</span>
                            </>
                          )}
                        </button>
                        {!exportState.output_video && (
                          <span className="text-[9px] text-rose-400 text-center font-medium block">โปรด Export วิดีโอในขั้นตอนแรกก่อน</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

        </div>

      </div>

      {/* DYNAMIC METRIC FOOTER BAR */}
      <footer className="mt-6 pt-4 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
        <div className="flex items-center gap-4">
          <span>Project Path: <code className="text-white/50">Jaihug_Longplay</code></span>
          <span>•</span>
          <span>Output: <code className="text-white/50">/output</code></span>
        </div>
        <div>
          <span>Developed with Antigravity AI • 2026</span>
        </div>
      </footer>

      {/* EXPORT POPUP STATUS MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-white/10 flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              {exportState.status === 'processing' && <Loader2 className="w-5 h-5 text-[#ff007a] animate-spin" />}
              {exportState.status === 'success' && <Sparkles className="w-5 h-5 text-green-400" />}
              {exportState.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-400" />}
              <span>Exporting Longplay Video</span>
            </h3>
            <p className="text-xs text-white/50 mb-6">Generating audio visualizer matching your playlist length</p>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-semibold text-white/70">{exportState.step || "Processing..."}</span>
                <span className="font-bold text-[#ff007a] tabular-nums">{exportState.progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#ff007a] to-[#8a00ff] transition-all duration-300 rounded-full"
                  style={{ width: `${exportState.progress}%` }}
                />
              </div>
            </div>

            {/* Error logs display */}
            {exportState.status === 'failed' && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-6">
                <p className="font-semibold">Error occurred:</p>
                <p className="font-mono mt-1 whitespace-pre-wrap">{exportState.error}</p>
              </div>
            )}

            {/* Success Download buttons */}
            {exportState.status === 'success' && (
              <div className="flex flex-col gap-2 mb-6 p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                <p className="text-xs text-green-400 font-semibold mb-2">🎉 Video generated successfully! Download files below:</p>
                
                {/* Video Link */}
                <a 
                  href={`${musicApi.getBaseUrl()}${exportState.output_video}?t=${Date.now()}`}
                  download
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-xs font-semibold text-white/90 border border-white/5"
                >
                  <span className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#ff007a]" />
                    <span>Download Longplay Video (.mp4)</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </a>

                {/* Timeline Link */}
                <a 
                  href={`${musicApi.getBaseUrl()}${exportState.output_timeline}?t=${Date.now()}`}
                  download
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-xs font-semibold text-white/80 border border-white/5"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>Download Track Timeline (.txt)</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </a>

                {/* Song List Link */}
                <a 
                  href={`${musicApi.getBaseUrl()}${exportState.output_songlist}?t=${Date.now()}`}
                  download
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-xs font-semibold text-white/80 border border-white/5"
                >
                  <span className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-purple-400" />
                    <span>Download Song List (.txt)</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </a>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 border-t border-white/5 pt-4 mt-auto">
              {exportState.status !== 'processing' && (
                <button 
                  onClick={() => {
                    setShowExportModal(false);
                    musicApi.resetExport();
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                >
                  Close
                </button>
              )}
              {exportState.status === 'failed' && (
                <button 
                  onClick={handleExport}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#ff007a] hover:bg-[#d60067] transition-all flex items-center gap-1.5 cursor-pointer text-white"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Export</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROJECTS SELECTOR MODAL */}
      {showProjectsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10 flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-[#ff007a]" />
                <span>เปิดโปรเจคที่บันทึกไว้</span>
              </h3>
              <button 
                onClick={() => setShowProjectsModal(false)}
                className="text-xs text-white/40 hover:text-white/80 p-1"
              >
                ปิด
              </button>
            </div>

            {projectList.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto mb-4 pr-1">
                {projectList.map((proj) => (
                  <div 
                    key={proj.name}
                    className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] hover:border-white/10 transition-all group"
                  >
                    <button 
                      onClick={() => handleLoadProject(proj.name)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-semibold truncate text-white group-hover:text-[#ff007a] transition-all">
                        {proj.name}
                      </p>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        แก้ไขล่าสุด: {new Date(proj.updated_at * 1000).toLocaleString('th-TH')}
                      </p>
                    </button>
                    
                    <button 
                      onClick={() => handleDeleteProject(proj.name)}
                      className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="ลบโปรเจค"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01] mb-4">
                <FolderOpen className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-xs text-white/30">ไม่พบโปรเจคที่บันทึกไว้</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button 
                onClick={() => {
                  if (confirm("คุณต้องการสร้างโปรเจคใหม่ใช่หรือไม่? ข้อมูลปัจจุบันที่ไม่ได้เซฟจะหายไป")) {
                    isInitialLoad.current = true;
                    applyProjectState({
                      settings: {
                        main_title: 'โปรเจคใหม่'
                      }
                    });
                    setShowProjectsModal(false);
                    setTimeout(() => {
                      isInitialLoad.current = false;
                      setAutoSaveStatus("Saved");
                    }, 1000);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all active:scale-95"
              >
                + สร้างโปรเจคใหม่
              </button>
              
              <button 
                onClick={() => setShowProjectsModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#ff007a] hover:bg-[#d60067] text-white transition-all active:scale-95"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </div>
  );
}
