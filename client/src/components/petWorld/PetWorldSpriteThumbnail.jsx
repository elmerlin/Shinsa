import React, { useEffect, useRef } from 'react';
import { renderBuildingThumbnail } from './petWorldSprites';

export default function PetWorldSpriteThumbnail({
  type,
  biome,
  size = 40,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    renderBuildingThumbnail(canvasRef.current, type, biome, size);
  }, [type, biome, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size }}
    />
  );
}
