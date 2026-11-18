"use client";

/**
 * Camera QR scanner without a new dependency: the browser's native BarcodeDetector (Chrome / Edge / Android, Safari 17+ on some
 * devices). Where it does not exist the page says so and the handheld-scanner input + manual lookup remain. The camera starts
 * only on an explicit click (permission prompt), and every track is stopped on "Stop" and when the component unmounts.
 * The decoded code is handed to `onCode` and never rendered.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { useLocale } from "@/components/common/Providers";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
type State = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

export function QRScanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const { t } = useLocale();
  const x = t.gala.checkin;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    pausedRef.current = paused;
    onCodeRef.current = onCode;
  }, [paused, onCode]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]); // leaving the page always releases the camera

  const start = async () => {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      const detector = new Ctor({ formats: ["qr_code"] });
      setState("running");
      timer.current = setInterval(async () => {
        if (pausedRef.current || !video.current || video.current.readyState < 2) return;
        try {
          const found = await detector.detect(video.current);
          if (found[0]?.rawValue) onCodeRef.current(found[0].rawValue);
        } catch {
          /* a frame that cannot be decoded */
        }
      }, 250);
    } catch (e) {
      stop();
      setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error");
    }
  };

  const running = state === "running" || state === "starting";
  return (
    <div className="space-y-3" data-testid="qr-scanner" data-state={state}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-deep-green/90">
        <video ref={video} className={`h-full w-full object-cover ${running ? "" : "hidden"}`} muted playsInline aria-label={x.camera} />
        {!running && <div className="absolute inset-0 grid place-items-center text-mint/70"><CameraOff className="size-10" aria-hidden="true" /></div>}
        {running && <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-gold/80" aria-hidden="true" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button type="button" className="btn-admin btn-ghost" onClick={() => { stop(); setState("idle"); }}><CameraOff className="size-4" aria-hidden="true" /> {x.stopCamera}</button>
        ) : (
          <button type="button" className="btn-admin btn-primary" onClick={() => void start()}><Camera className="size-4" aria-hidden="true" /> {x.startCamera}</button>
        )}
        <span className="text-xs text-muted">{x.cameraHint}</span>
      </div>
      {state === "denied" && <p className="text-sm text-danger" role="alert">{x.cameraDenied}</p>}
      {state === "unsupported" && <p className="text-sm text-warn" role="alert">{x.cameraUnsupported}</p>}
      {state === "error" && <p className="text-sm text-danger" role="alert">{x.cameraError}</p>}
    </div>
  );
}
