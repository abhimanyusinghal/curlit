import { useState, useCallback, useEffect, useRef } from 'react';

interface UseResizableOptions {
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  minSize: number;
  maxSize: number;
  storageKey?: string;
}

export function useResizable({ direction, initialSize, minSize, maxSize, storageKey }: UseResizableOptions) {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) return Math.max(minSize, Math.min(maxSize, parseInt(saved, 10)));
    }
    return initialSize;
  });

  const isResizing = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, size]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      const newSize = Math.max(minSize, Math.min(maxSize, startSize.current + delta));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (storageKey) {
          localStorage.setItem(storageKey, size.toString());
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minSize, maxSize, storageKey, size]);

  return { size, handleMouseDown };
}
