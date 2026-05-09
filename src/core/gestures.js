export function attach(target, cb) {
  const pointers = new Map(); // pointerId → {x, y, startX, startY}
  let panActive = false;

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) {
      panActive = true;
      cb.onPanStart && cb.onPanStart({ x: e.clientX, y: e.clientY, event: e });
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("pointercancel", onPointerUp, true);
    }
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2 && cb.onPinch) {
      const ps = [...pointers.values()];
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const startDist = Math.hypot(ps[0].startX - ps[1].startX, ps[0].startY - ps[1].startY) || 1;
      cb.onPinch({ factor: dist / startDist, anchorX: (ps[0].x + ps[1].x) / 2, event: e });
      return;
    }
    if (panActive && pointers.size === 1) {
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      cb.onPanMove && cb.onPanMove({ dx, dy, x: e.clientX, y: e.clientY, event: e });
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && panActive) {
      panActive = false;
      cb.onPanEnd && cb.onPanEnd({ event: e });
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
    }
  }

  function onWheel(e) {
    if (!e.ctrlKey) return;
    if (!cb.onZoom) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY / 500);
    const rect = target.getBoundingClientRect();
    cb.onZoom({ factor, anchorX: e.clientX - rect.left, event: e });
  }

  function onDblClick(e) {
    cb.onDoubleTap && cb.onDoubleTap({ event: e });
  }

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("dblclick", onDblClick);

  return function detach() {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("dblclick", onDblClick);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
  };
}
