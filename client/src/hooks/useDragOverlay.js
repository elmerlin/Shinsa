import { useState, useCallback, useRef } from 'react';

let nextId = 1;

export default function useDragOverlay() {
  const [items, setItems] = useState([]);
  const activeRef = useRef(null); // { id, offsetX, offsetY }
  const containerRef = useRef(null);

  const addItem = useCallback((item) => {
    const id = `overlay-${nextId++}`;
    setItems((prev) => [...prev, { ...item, id, x: 50, y: 50, size: item.size || 14 }]);
    return id;
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateItem = useCallback((id, updates) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  }, []);

  const handlePointerDown = useCallback((e, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const pointerX = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((e.clientY - rect.top) / rect.height) * 100;

    activeRef.current = {
      id: itemId,
      offsetX: pointerX - item.x,
      offsetY: pointerY - item.y,
    };

    const onMove = (me) => {
      if (!activeRef.current) return;
      const mx = ((me.clientX - rect.left) / rect.width) * 100;
      const my = ((me.clientY - rect.top) / rect.height) * 100;
      const nx = Math.max(5, Math.min(95, mx - activeRef.current.offsetX));
      const ny = Math.max(5, Math.min(95, my - activeRef.current.offsetY));
      setItems((prev) => prev.map((i) => (i.id === activeRef.current?.id ? { ...i, x: nx, y: ny } : i)));
    };

    const onUp = () => {
      activeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [items]);

  return {
    items,
    setItems,
    containerRef,
    addItem,
    removeItem,
    updateItem,
    handlePointerDown,
  };
}
