"use client";

import { useEffect, useState, useRef } from 'react';

interface Rect {
  width: number;
  height: number;
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Hook to measure element dimensions and position
 * Uses ResizeObserver for efficient size tracking
 */
export function useMeasure<T extends HTMLElement = HTMLElement>(): [React.RefObject<T | null>, Rect, () => void] {
  const ref = useRef<T>(null);
  const [rect, setRect] = useState<Rect>({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  const measure = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setRect({
        width: r.width,
        height: r.height,
        x: r.x,
        y: r.y,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
      });
    }
  };

  useEffect(() => {
    if (!ref.current) return;

    // Initial measurement
    measure();

    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      measure();
    });

    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return [ref, rect, measure];
}
