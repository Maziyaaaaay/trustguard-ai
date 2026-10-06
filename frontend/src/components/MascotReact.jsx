// React wrapper for the Mascotify web runtime.
//
//   npm i @rive-app/canvas
//   import { MascotView } from "./MascotReact";
//   const ref = useRef(null);
//   <MascotView ref={ref} src="/mascot.riv" style={{ width: 200, height: 200 }} />
//   ref.current.play("wave");
//
// Or declaratively: <MascotView src="/mascot.riv" preset="dance" loop />
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as rive from "@rive-app/canvas";
import { Mascot } from "./mascotify.js";

export const MascotView = forwardRef(function MascotView({ src, preset, loop, idle, autoBlink = true, style, className, onReady }, ref) {
  const canvas = useRef(null);
  const mascot = useRef(null);

  useEffect(() => {
    let alive = true;
    Mascot.load(canvas.current, src, { rive, idle, autoBlink }).then((m) => {
      if (!alive) return m.destroy();
      mascot.current = m;
      if (preset) m.play(preset, { loop });
      onReady && onReady(m);
    });
    const ro = new ResizeObserver(() => mascot.current && mascot.current.resize());
    ro.observe(canvas.current);
    return () => {
      alive = false;
      ro.disconnect();
      mascot.current && mascot.current.destroy();
      mascot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (mascot.current && preset) mascot.current.play(preset, { loop });
  }, [preset, loop]);

  useImperativeHandle(ref, () => ({
    play: (name, opts) => mascot.current?.play(name, opts),
    stop: () => mascot.current?.stop(),
    presets: () => mascot.current?.presets() ?? [],
  }));

  return (
    <div style={style} className={className}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
});
