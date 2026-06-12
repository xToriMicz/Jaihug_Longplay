import React, { useEffect, useRef } from 'react';

// Preset color themes mapped to hex colors
export const THEME_COLORS = {
  "Lo-fi / Chill": "#FF7A00",  // Orange
  "Synthwave": "#FF007A",      // Pink
  "Ambient": "#10B981",        // Emerald Green
  "EDM": "#00E5FF",            // Cyan Blue
  "Jazz": "#8B5CF6",           // Violet Purple
};

export function getHexColor(theme, customColor) {
  if (customColor) return customColor;
  return THEME_COLORS[theme] || '#FFFFFF';
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

export default function CanvasVisualizer({ audioRef, style, theme, customColor, isPlaying, opacity = 0.8, heightScale = 0.15, yPosScale = 0.92 }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  
  // Particles for Particle Burst and Galaxy Vortex
  const particlesRef = useRef([]);
  
  // Initialize particles once
  useEffect(() => {
    const list = [];
    for (let i = 0; i < 100; i++) {
      list.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.random() * 300 + 40,
        speed: Math.random() * 3 + 1,
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.6 + 0.2,
        x: 0,
        y: 0,
        rotSpeed: (Math.random() - 0.5) * 0.02 // For galaxy spiral
      });
    }
    particlesRef.current = list;
  }, []);

  useEffect(() => {
    if (!audioRef.current || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    // Initialize Web Audio API on first user interaction
    const initAudio = () => {
      try {
        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          
          // Connect audio source
          sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        }
        
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
      } catch (e) {
        console.warn("Web Audio API not allowed or initialization failed:", e);
      }
    };

    initAudio();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Set matching canvas physical pixels
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    
    // Track dynamic shockwaves
    let shockwaveRadius = 0;
    let shockwaveAlpha = 0;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) return;

      // Fetch audio data
      if (analyserRef.current) {
        if (style.toLowerCase() === 'waveform') {
          analyserRef.current.getByteTimeDomainData(dataArray);
        } else {
          analyserRef.current.getByteFrequencyData(dataArray);
        }
      } else {
        // Fallback mockup animation if audio nodes aren't loaded yet
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(Date.now() * 0.005 + i * 0.1) * 30 + 40;
        }
      }

      // Clear with transparency (preview has background image underneath canvas)
      ctx.clearRect(0, 0, W, H);

      const colorHex = getHexColor(theme, customColor);
      const colorRgb = hexToRgb(colorHex);
      
      // Calculate volumes
      let bassVolume = 0;
      let midVolume = 0;
      let overallVolume = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        overallVolume += dataArray[i];
        if (i < bufferLength * 0.15) {
          bassVolume += dataArray[i];
        } else {
          midVolume += dataArray[i];
        }
      }
      overallVolume /= bufferLength;
      bassVolume /= (bufferLength * 0.15);
      midVolume /= (bufferLength * 0.85);

      const styleLower = style.toLowerCase();

      if (styleLower === 'waveform') {
        // Horizontal Waveform Line near bottom
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = colorHex;
        ctx.shadowBlur = 10;
        ctx.shadowColor = colorHex;

        const sliceWidth = W / bufferLength;
        let x = 0;
        const baseY = H * yPosScale;

        for (let i = 0; i < bufferLength; i++) {
          // Normalize wave value
          const v = dataArray[i] / 128.0;
          // Scale amplitude based on heightScale
          const y = baseY + (v - 1.0) * (H * heightScale * 0.6);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(W, baseY);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

      } else if (styleLower === 'spectrum bars') {
        // Draw vertical frequency bars at center bottom (80 bars, independent)
        const visW = W * 0.65;
        const visH = H * heightScale;
        const startX = (W - visW) / 2;
        const baseY = H * yPosScale;
        
        const numBars = 80;
        const barW = visW / numBars;
        const barWidth = Math.floor(barW * 0.70); // 70% slot width
        const barGap = barW - barWidth;

        ctx.shadowBlur = 4;
        ctx.shadowColor = colorHex;

        // Group frequency bins into 80 values (independent, low to mid range)
        const vals = [];
        for (let j = 0; j < numBars; j++) {
          // Map j linearly to cover lower/mid frequency range (fft size is 256, so buffer is 128 bins)
          // We limit the active spectrum range to the first 80 bins (similar to the backend)
          const binIdx = Math.min(Math.floor((j / numBars) * 80), dataArray.length - 1);
          const v = (dataArray[binIdx] || 0) / 255.0;
          vals.push(v);
        }

        for (let i = 0; i < numBars; i++) {
          const val = vals[i] || 0;
          const bh = val * visH;
          
          if (bh > 2) {
            const bx = startX + i * barW;
            ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.9)`;
            ctx.beginPath();
            ctx.rect(bx + Math.floor(barGap / 2), baseY - bh, barWidth, bh);
            ctx.fill();
          }
        }
        ctx.shadowBlur = 0;

      } else if (styleLower === 'circular pulse') {
        // Pulsing Circle centered at Y position
        const cx = W / 2;
        const cy = H * yPosScale;
        const baseRadius = H * heightScale + (bassVolume / 255.0) * (H * heightScale * 0.4);

        // Draw pulsing outer glow rings
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 12 * (heightScale / 0.15), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.2)`;
        ctx.lineWidth = 10 * (heightScale / 0.15);
        ctx.stroke();

        // Radiating frequency lines
        for (let i = 0; i < bufferLength; i += 2) {
          const angle = (i / bufferLength) * Math.PI * 2;
          const val = dataArray[i] / 255.0;
          const barLen = val * (H * heightScale * 0.8);

          const xStart = cx + baseRadius * Math.cos(angle);
          const yStart = cy + baseRadius * Math.sin(angle);
          const xEnd = cx + (baseRadius + barLen) * Math.cos(angle);
          const yEnd = cy + (baseRadius + barLen) * Math.sin(angle);

          ctx.beginPath();
          ctx.moveTo(xStart, yStart);
          ctx.lineTo(xEnd, yEnd);
          ctx.lineWidth = 3 * (heightScale / 0.15);
          ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`;
          ctx.stroke();
        }

        // Dark cover circle
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 17, 23, 0.9)';
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3 * (heightScale / 0.15);
        ctx.fill();
        ctx.stroke();

      } else if (styleLower === 'particle burst') {
        // Draw particles exploding from center Y position
        const cx = W / 2;
        const cy = H * yPosScale;
        
        particlesRef.current.forEach(p => {
          // Speed up particles with beat
          const speed = p.speed * (1.0 + overallVolume / 255.0 * 2.0);
          p.dist += speed;
          
          if (p.dist > Math.max(W, H) / 2 + 30) {
            p.dist = Math.random() * 20;
            p.angle = Math.random() * Math.PI * 2;
          }
          
          const px = cx + p.dist * (heightScale / 0.15) * Math.cos(p.angle);
          const py = cy + p.dist * (heightScale / 0.15) * Math.sin(p.angle);
          
          const alpha = p.alpha * (0.4 + (overallVolume / 255.0) * 0.6);
          const size = p.size * (1.0 + (bassVolume / 255.0) * 0.8) * (heightScale / 0.15);
          
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${alpha})`;
          ctx.fill();
        });

        // Pulsing ring
        ctx.beginPath();
        ctx.arc(cx, cy, (H * heightScale * 1.5) + (bassVolume / 255.0) * (H * heightScale * 0.4), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.5)`;
        ctx.lineWidth = 2 * (heightScale / 0.15);
        ctx.stroke();

      } else if (styleLower === 'minimal lines') {
        // Sleek wave lines near bottom
        const startX = W * 0.2;
        const visW = W * 0.6;
        const baseY = H * yPosScale;
        const stepX = visW / bufferLength;

        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = colorHex;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i] / 255.0;
          const py = baseY - val * (H * heightScale);
          const px = startX + i * stepX;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();

      } else if (styleLower === 'geometric') {
        // Draw overlapping transparent diamonds or polygons scaling with beat
        const cx = W / 2;
        const cy = H * yPosScale;
        const scale = (1.0 + (overallVolume / 255.0) * 0.4) * (heightScale / 0.15);
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        
        // Large diamond
        ctx.beginPath();
        ctx.moveTo(0, -110);
        ctx.lineTo(110, 0);
        ctx.lineTo(0, 110);
        ctx.lineTo(-110, 0);
        ctx.closePath();
        ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.4)`;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Small inner diamond rotating
        ctx.rotate(Date.now() * 0.001);
        ctx.beginPath();
        ctx.moveTo(0, -60);
        ctx.lineTo(60, 0);
        ctx.lineTo(0, 60);
        ctx.lineTo(-60, 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.15)`;
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();

      } else if (styleLower === 'shockwave') {
        // Circular shockwaves shooting out on beats (bass peaks)
        const cx = W / 2;
        const cy = H * yPosScale;
        
        if (bassVolume > 160) {
          // Trigger/Boost shockwave
          shockwaveRadius = 50 * (heightScale / 0.15);
          shockwaveAlpha = 1.0;
        }
        
        if (shockwaveAlpha > 0.01) {
          ctx.beginPath();
          ctx.arc(cx, cy, shockwaveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${shockwaveAlpha})`;
          ctx.lineWidth = 4 * (heightScale / 0.15);
          ctx.stroke();
          
          shockwaveRadius += 10 * (heightScale / 0.15);
          shockwaveAlpha *= 0.92; // decay
        }
        
        // Main base ring
        ctx.beginPath();
        ctx.arc(cx, cy, (H * heightScale * 1.8) + (bassVolume / 255.0) * (H * heightScale * 0.3), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.7)`;
        ctx.lineWidth = 2 * (heightScale / 0.15);
        ctx.stroke();

      } else if (styleLower === 'galaxy vortex') {
        // Particles orbiting spirally
        const cx = W / 2;
        const cy = H * yPosScale;
        
        particlesRef.current.forEach((p, idx) => {
          // Orbit angle rotates
          p.angle += p.rotSpeed * (1.0 + overallVolume / 255.0 * 2.0);
          
          // Distance pulsates with volume
          const dynamicDist = p.dist * (heightScale / 0.15) * (0.8 + (bassVolume / 255.0) * 0.4);
          
          const px = cx + dynamicDist * Math.cos(p.angle);
          const py = cy + dynamicDist * Math.sin(p.angle);
          
          ctx.beginPath();
          ctx.arc(px, py, p.size * (heightScale / 0.15), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${p.alpha * 0.9})`;
          ctx.fill();
        });
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [style, theme, customColor, isPlaying, audioRef, heightScale, yPosScale]);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      style={{ opacity: opacity }}
    />
  );
}
