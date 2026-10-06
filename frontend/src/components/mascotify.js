// Mascotify web runtime: play a Mascotify .riv mascot's moves by name.
//
//   import * as rive from "@rive-app/canvas";      // free, MIT-licensed Rive runtime
//   import { Mascot } from "./mascotify.js";
//   const mascot = await Mascot.load(document.querySelector("canvas"), "/mascot.riv", { rive });
//   mascot.play("wave");                  // one-shot, returns to idle
//   mascot.play("dance", { loop: true }); // keeps looping until another move is played
//   await mascot.play("jump");            // resolves when a one-shot move finishes
//
// How it plays:
//  * "idle" loops underneath everything. One-shot moves are layered on top of it, so the character
//    keeps breathing while it waves. Looping moves (dance, walk, happy) replace idle while they run.
//  * A natural blink is layered in every few seconds, even in the middle of another move.

const LOOPING = ["idle", "happy", "dance", "walk"];

export class Mascot {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string | ArrayBuffer | Uint8Array} src  URL of the .riv file, or its bytes
   * @param {{ rive: any, idle?: string | null, autoBlink?: boolean, wasmUrl?: string, loops?: string[] }} options
   *   loops: names of moves that loop (defaults to the built-in looping moves).
   */
  static load(canvas, src, options) {
    return new Promise((resolve, reject) => {
      const m = new Mascot(canvas, src, options, () => resolve(m), reject);
    });
  }

  constructor(canvas, src, options, onReady, onError) {
    if (!options || !options.rive) throw new Error("Mascot: pass { rive } (import * as rive from '@rive-app/canvas').");
    const R = options.rive;
    if (options.wasmUrl) R.RuntimeLoader.setWasmUrl(options.wasmUrl);
    this.idle = options.idle === undefined ? "idle" : options.idle;
    this.autoBlink = options.autoBlink !== false;
    this.loops = new Set(options.loops || LOOPING);
    this.listeners = {};
    this.current = null;
    this.resolvers = new Map();
    this.names = [];
    const source = typeof src === "string" ? { src } : { buffer: src instanceof Uint8Array ? src.slice().buffer : src };
    this.r = new R.Rive({
      ...source,
      canvas,
      autoplay: false,
      layout: new R.Layout({ fit: R.Fit.Contain, alignment: R.Alignment.Center }),
      onLoad: () => {
        this.r.resizeDrawingSurfaceToCanvas();
        this.names = this.r.animationNames;
        if (this.idle && this.names.includes(this.idle)) this._start(this.idle);
        this._scheduleBlink();
        onReady && onReady();
      },
      onLoadError: (e) => onError && onError(e),
      onStop: (e) => this._onStop(e && e.data),
    });
  }

  /** Names of every move in the file, e.g. ["idle", "blink", "wave", ...]. */
  presets() {
    return [...this.names];
  }

  /**
   * Play a move by name.
   * @param {string} name
   * @param {{ loop?: boolean, then?: string | null }} [opts]
   *   loop: keep repeating this move. Moves made to loop (idle, dance, walk, happy) always loop.
   *   then: what to play after a one-shot move (default: idle, which keeps running underneath).
   */
  play(name, opts = {}) {
    if (!this.names.includes(name)) {
      return Promise.reject(new Error(`Mascot: unknown move "${name}". Available: ${this.names.join(", ")}`));
    }
    if (name === this.idle) {
      this._stopAllExcept([this.idle, "blink"]);
      if (!this.r.playingAnimationNames.includes(this.idle)) this._start(this.idle);
      this.current = null;
      this._emit("start", name, !!opts._auto);
      return Promise.resolve();
    }
    const loop = !!opts.loop || this.loops.has(name);
    this._stopAllExcept([this.idle, "blink"]);
    if (loop && this.idle) this.r.stop(this.idle);
    else if (this.idle && !this.r.playingAnimationNames.includes(this.idle)) this._start(this.idle);
    this.current = { name, loop, then: opts.then === undefined ? this.idle : opts.then };
    this._start(name);
    this._emit("start", name, !!opts._auto);
    if (loop) return Promise.resolve();
    return new Promise((resolve) => this.resolvers.set(name, resolve));
  }

  stop() {
    this.r.stop();
    this.current = null;
  }

  /** Events: "start" (name, auto), "complete" (name). `auto` is true when the player started it itself. */
  on(event, cb) {
    (this.listeners[event] ||= []).push(cb);
    return () => (this.listeners[event] = this.listeners[event].filter((f) => f !== cb));
  }

  /** Call after the canvas changes size. */
  resize() {
    this.r.resizeDrawingSurfaceToCanvas();
  }

  destroy() {
    clearTimeout(this._blinkTimer);
    this.r.cleanup();
    this.listeners = {};
  }

  _start(name) {
    this.r.stop(name); // restart from the beginning
    this.r.play(name);
  }

  _stopAllExcept(keep) {
    for (const n of this.r.playingAnimationNames) if (!keep.includes(n)) this.r.stop(n);
  }

  _emit(event, a, b) {
    for (const cb of this.listeners[event] || []) cb(a, b);
  }

  _onStop(names) {
    for (const name of names || []) {
      const resolve = this.resolvers.get(name);
      if (resolve) {
        this.resolvers.delete(name);
        resolve();
      }
      const cur = this.current;
      if (name === "blink" || !cur || cur.name !== name || cur.loop) continue;
      this.current = null;
      this._emit("complete", name);
      if (cur.then && cur.then !== this.idle && this.names.includes(cur.then)) this.play(cur.then, { _auto: true });
      else if (this.idle) this.play(this.idle, { _auto: true });
    }
  }

  _scheduleBlink() {
    if (!this.autoBlink || !this.names.includes("blink")) return;
    this._blinkTimer = setTimeout(() => {
      if (!this.r.playingAnimationNames.includes("blink") && this.current?.name !== "blink") this._start("blink");
      this._scheduleBlink();
    }, 2500 + Math.random() * 3500);
  }
}
