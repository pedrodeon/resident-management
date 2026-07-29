"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

export type SignaturePadHandle = {
  /** PNG of the drawing, or null if nothing has been drawn. */
  getBlob: () => Promise<Blob | null>;
  clear: () => void;
};

const INK = "#1b2a4a"; // navy — matches --color-navy

/**
 * Finger/stylus/mouse signature capture on a plain canvas. No dependencies.
 * `touch-action: none` is what makes finger-signing work on phones — without
 * it the page scrolls instead of drawing.
 */
export function SignaturePad({
  ref,
  onDirtyChange,
  disabled = false,
}: {
  ref?: Ref<SignaturePadHandle>;
  onDirtyChange?: (hasStrokes: boolean) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  // Size the bitmap to the element * devicePixelRatio so strokes stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot counts as a stroke (initials, marks).
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    if (!dirty) {
      setDirty(true);
      onDirtyChange?.(true);
    }
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handleUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setDirty(false);
    onDirtyChange?.(false);
  }

  useImperativeHandle(ref, () => ({
    getBlob: () =>
      new Promise<Blob | null>((resolve) => {
        if (!dirty || !canvasRef.current) return resolve(null);
        canvasRef.current.toBlob((b) => resolve(b), "image/png");
      }),
    clear,
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        aria-label="Signature area — draw with your finger"
        className={`h-40 w-full rounded-md border-2 bg-white ${
          disabled
            ? "cursor-not-allowed border-gray-200"
            : "cursor-crosshair border-gray-300"
        }`}
        style={{ touchAction: "none" }}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {dirty ? "" : "Sign above with your finger"}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !dirty}
          className="text-xs font-medium text-gray-500 hover:text-navy disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
