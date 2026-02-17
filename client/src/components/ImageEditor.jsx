import React, { useState, useRef, useEffect } from 'react';

export default function ImageEditor({ file, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [img, setImg] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  // Load image from file
  useEffect(() => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw rotated image on canvas
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const isRotated = rotation % 180 !== 0;
    const rw = isRotated ? nh : nw;
    const rh = isRotated ? nw : nh;

    const maxW = Math.min(window.innerWidth - 48, 560);
    const maxH = window.innerHeight * 0.5;
    const scale = Math.min(maxW / rw, maxH / rh, 1);
    const dw = Math.round(rw * scale);
    const dh = Math.round(rh * scale);

    canvas.width = dw;
    canvas.height = dh;
    setCanvasSize({ w: dw, h: dh });

    ctx.clearRect(0, 0, dw, dh);
    ctx.save();
    ctx.translate(dw / 2, dh / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -(nw * scale) / 2, -(nh * scale) / 2, nw * scale, nh * scale);
    ctx.restore();

    setCrop(null);
  }, [img, rotation]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(clientX - rect.left, canvasSize.w)),
      y: Math.max(0, Math.min(clientY - rect.top, canvasSize.h)),
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setDragStart(getPos(e));
    setCrop(null);
  };

  const handlePointerMove = (e) => {
    if (!dragStart) return;
    e.preventDefault();
    const pos = getPos(e);
    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const w = Math.abs(pos.x - dragStart.x);
    const h = Math.abs(pos.y - dragStart.y);
    if (w > 5 || h > 5) setCrop({ x, y, w, h });
  };

  const handlePointerUp = () => {
    setDragStart(null);
    if (crop && (crop.w < 10 || crop.h < 10)) setCrop(null);
  };

  const handleDone = () => {
    if (!img) return;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const isRotated = rotation % 180 !== 0;
    const rw = isRotated ? nh : nw;
    const rh = isRotated ? nw : nh;

    // Draw full rotated image at natural resolution
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = rw;
    fullCanvas.height = rh;
    const fctx = fullCanvas.getContext('2d');
    fctx.translate(rw / 2, rh / 2);
    fctx.rotate((rotation * Math.PI) / 180);
    fctx.drawImage(img, -nw / 2, -nh / 2);

    // Compute crop in natural pixels
    let sx = 0, sy = 0, sw = rw, sh = rh;
    if (crop && canvasSize.w > 0 && canvasSize.h > 0) {
      const scaleX = rw / canvasSize.w;
      const scaleY = rh / canvasSize.h;
      sx = Math.round(crop.x * scaleX);
      sy = Math.round(crop.y * scaleY);
      sw = Math.round(crop.w * scaleX);
      sh = Math.round(crop.h * scaleY);
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = sw;
    outCanvas.height = sh;
    outCanvas.getContext('2d').drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    outCanvas.toBlob((blob) => {
      if (blob) {
        const editedFile = new File([blob], file.name || 'edited.webp', { type: 'image/webp' });
        onDone(editedFile);
      }
    }, 'image/webp', 0.92);
  };

  if (!img) {
    return (
      <div className="fixed inset-0 bg-black/95 z-[110] flex items-center justify-center">
        <span className="text-gray-400 font-display">Loading...</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-[110] flex flex-col items-center justify-center p-4">
      {/* Canvas with crop overlay */}
      <div className="relative flex-shrink-0 mb-4 select-none">
        <canvas
          ref={canvasRef}
          className="rounded-lg block"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ cursor: 'crosshair', touchAction: 'none' }}
        />
        {crop && (
          <div
            className="absolute border-2 border-dashed border-white/90 pointer-events-none rounded"
            style={{
              left: crop.x, top: crop.y, width: crop.w, height: crop.h,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
        <button
          onClick={() => setRotation(r => (r - 90 + 360) % 360)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-piu-dark text-gray-300 hover:text-white hover:bg-piu-card text-xs font-display font-bold transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h1.168a2 2 0 011.896 1.368l.592 1.776A2 2 0 008.552 14.5H12m-9-4.5V4m0 1.5L1.5 4M3 5.5L4.5 4" transform="scale(-1,1) translate(-24,0)" />
          </svg>
          Rotate Left
        </button>
        <button
          onClick={() => setRotation(r => (r + 90) % 360)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-piu-dark text-gray-300 hover:text-white hover:bg-piu-card text-xs font-display font-bold transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h1.168a2 2 0 011.896 1.368l.592 1.776A2 2 0 008.552 14.5H12m-9-4.5V4m0 1.5L1.5 4M3 5.5L4.5 4" />
          </svg>
          Rotate Right
        </button>
        {crop && (
          <button
            onClick={() => setCrop(null)}
            className="px-3 py-2 rounded-lg bg-piu-dark text-gray-400 hover:text-red-400 text-xs font-display font-bold transition-colors"
          >
            Reset Crop
          </button>
        )}
      </div>

      <p className="text-gray-600 text-[10px] font-display mb-4">Drag on image to crop</p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-lg bg-piu-dark text-gray-400 hover:text-white text-sm font-display font-bold transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDone}
          className="btn-primary px-5 py-2 text-sm font-display font-bold"
        >
          {crop || rotation ? 'Apply' : 'Done'}
        </button>
      </div>
    </div>
  );
}
