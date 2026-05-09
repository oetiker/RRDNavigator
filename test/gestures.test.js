import { describe, test, expect, vi } from "vitest";
import { attach } from "../src/core/gestures.js";

function pe(type, init = {}) {
  // happy-dom may not implement PointerEvent constructor with all init members; fall back to MouseEvent
  const Ctor = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  return new Ctor(type, { bubbles: true, cancelable: true, ...init });
}

describe("gestures.attach", () => {
  test("emits onPanStart/onPanMove/onPanEnd on horizontal drag", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onPanStart = vi.fn();
    const onPanMove = vi.fn();
    const onPanEnd = vi.fn();
    const detach = attach(el, { onPanStart, onPanMove, onPanEnd });

    el.dispatchEvent(pe("pointerdown", { clientX: 10, clientY: 20, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
    document.dispatchEvent(pe("pointermove", { clientX: 30, clientY: 22, pointerId: 1, pointerType: "mouse" }));
    document.dispatchEvent(pe("pointerup", { clientX: 30, clientY: 22, pointerId: 1, pointerType: "mouse" }));

    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(onPanMove).toHaveBeenCalledTimes(1);
    expect(onPanMove).toHaveBeenCalledWith(expect.objectContaining({ dx: 20, dy: 2 }));
    expect(onPanEnd).toHaveBeenCalledTimes(1);

    detach();
    document.body.removeChild(el);
  });

  test("emits onZoom on ctrl+wheel", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onZoom = vi.fn();
    attach(el, { onZoom });

    // happy-dom's WheelEvent doesn't inherit MouseEvent so ctrlKey isn't set from init;
    // patch it onto the event object so our handler sees it.
    const wheelEvt = new WheelEvent("wheel", {
      bubbles: true, cancelable: true, clientX: 50, deltaY: -100, ctrlKey: true
    });
    if (!wheelEvt.ctrlKey) Object.defineProperty(wheelEvt, "ctrlKey", { value: true, configurable: true });
    el.dispatchEvent(wheelEvt);

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0].factor).toBeGreaterThan(0);
    expect(onZoom.mock.calls[0][0]).toHaveProperty("anchorX");

    document.body.removeChild(el);
  });

  test("ignores wheel without ctrl", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onZoom = vi.fn();
    attach(el, { onZoom });
    el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    expect(onZoom).not.toHaveBeenCalled();
    document.body.removeChild(el);
  });

  test("emits onDoubleTap on dblclick", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onDoubleTap = vi.fn();
    attach(el, { onDoubleTap });
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });
});
