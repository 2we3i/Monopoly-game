// usePanZoom.js
// Camera for the Cosmic Encounter board: a fixed-size stage inside a
// viewport.
//
//   wheel            smooth zoom that keeps the point under the cursor still
//   middle button    pan from anywhere on the board
//   left button      pan when the drag starts on empty space (a small
//                    threshold keeps clicks and drags apart)
//   touch            one finger pans, two fingers pinch
//
// The view is written straight to the DOM - pans and zoom frames run at
// screen refresh rate - and scale and position are clamped so the board
// can never be lost off screen or zoomed into a blur.

import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';

const PAD = 16;

export default function usePanZoom({
  width, height, maxScale = 2.4, minFactor = 0.75,
}) {
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const target = useRef({ s: 1, x: 0, y: 0 });
  const rafRef = useRef(0);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const touchedRef = useRef(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [panning, setPanning] = useState(false);

  const limits = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { fit: 1, min: 0.3, max: maxScale };
    const fit = Math.min((el.clientWidth - PAD * 2) / width, (el.clientHeight - PAD * 2) / height);
    return { fit, min: fit * minFactor, max: Math.max(maxScale, fit * 3) };
  }, [width, height, maxScale, minFactor]);

  const clamp = useCallback((s, x, y) => {
    const el = viewportRef.current;
    const { min, max } = limits();
    const ns = Math.min(max, Math.max(min, s));
    if (!el) return { s: ns, x, y };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const cw = width * ns;
    const ch = height * ns;
    const nx = cw + PAD * 2 <= vw ? (vw - cw) / 2 : Math.min(PAD, Math.max(vw - cw - PAD, x));
    const ny = ch + PAD * 2 <= vh ? (vh - ch) / 2 : Math.min(PAD, Math.max(vh - ch - PAD, y));
    return { s: ns, x: nx, y: ny };
  }, [limits, width, height]);

  const paint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { s, x, y } = view.current;
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    const pct = Math.round(s * 100);
    setZoomPct((prev) => (prev === pct ? prev : pct));
  }, []);

  const tick = useCallback(() => {
    const cur = view.current;
    const tgt = target.current;
    const k = 0.22;
    const next = { s: cur.s + (tgt.s - cur.s) * k, x: cur.x + (tgt.x - cur.x) * k, y: cur.y + (tgt.y - cur.y) * k };
    const done = Math.abs(next.s - tgt.s) < 0.0008 && Math.abs(next.x - tgt.x) < 0.4 && Math.abs(next.y - tgt.y) < 0.4;
    view.current = done ? { ...tgt } : next;
    paint();
    rafRef.current = done ? 0 : requestAnimationFrame(tick);
  }, [paint]);

  const setTarget = useCallback((s, x, y, immediate = false) => {
    target.current = clamp(s, x, y);
    if (immediate) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      view.current = { ...target.current };
      paint();
    } else if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [clamp, paint, tick]);

  const fit = useCallback((immediate = false) => {
    const el = viewportRef.current;
    if (!el) return;
    const { fit: s } = limits();
    setTarget(s, (el.clientWidth - width * s) / 2, (el.clientHeight - height * s) / 2, immediate);
  }, [limits, setTarget, width, height]);

  // Built on the TARGET view so quick wheel ticks add up; scale and offset
  // interpolate together, which keeps the anchor point still.
  const zoomAt = useCallback((factor, ax, ay, immediate = false) => {
    const tgt = target.current;
    const { min, max } = limits();
    const ns = Math.min(max, Math.max(min, tgt.s * factor));
    const wx = (ax - tgt.x) / tgt.s;
    const wy = (ay - tgt.y) / tgt.s;
    setTarget(ns, ax - wx * ns, ay - wy * ns, immediate);
  }, [limits, setTarget]);

  const zoomStep = useCallback((factor) => {
    const el = viewportRef.current;
    if (!el) return;
    touchedRef.current = true;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  }, [zoomAt]);

  const resetView = useCallback(() => {
    touchedRef.current = false;
    fit();
  }, [fit]);

  useLayoutEffect(() => {
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      if (touchedRef.current) {
        const { s, x, y } = target.current;
        setTarget(s, x, y, true);
      } else {
        fit(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, setTarget]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * (e.ctrlKey ? 0.01 : 0.0022));
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    // The browser's middle-button autoscroll would fight the pan.
    const onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
    };
  }, [zoomAt]);

  const onPointerDown = (e) => {
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button !== 0 && e.button !== 1) return;
    // A left drag that starts on a planet, ship or card is a click, not a pan.
    if (mouse && e.button === 0 && e.target.closest('[data-interactive]')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    draggedRef.current = false;
    if (pointers.current.size === 1) {
      gesture.current = {
        mode: 'pan', startX: e.clientX, startY: e.clientY, originX: target.current.x, originY: target.current.y, middle: mouse && e.button === 1,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: target.current.s };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { ...pointers.current.get(e.pointerId), x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const el = viewportRef.current;
    const rect = el.getBoundingClientRect();
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      draggedRef.current = true;
      touchedRef.current = true;
      zoomAt((g.startScale * dist) / g.startDist / target.current.s, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, true);
      return;
    }
    if (g.mode === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!draggedRef.current && !g.middle && Math.hypot(dx, dy) < 5) return;
      if (!draggedRef.current) {
        draggedRef.current = true;
        touchedRef.current = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        setPanning(true);
      }
      setTarget(target.current.s, g.originX + dx, g.originY + dy, true);
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (draggedRef.current) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    draggedRef.current = false;
    if (pointers.current.size === 0) {
      gesture.current = null;
      setPanning(false);
    } else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      gesture.current = {
        mode: 'pan', startX: only.x, startY: only.y, originX: target.current.x, originY: target.current.y, middle: false,
      };
    }
  };

  const onClickCapture = (e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  return {
    viewportRef,
    stageRef,
    zoomPct,
    panning,
    zoomStep,
    resetView,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
