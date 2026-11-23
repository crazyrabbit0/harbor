import { Play } from "@/components/icons/play-filled";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, RotateCcw, RotateCw } from "lucide-react";
import type { SkinViewer } from "skinview3d";
import { useT } from "@/lib/i18n";
import type { SkinModel } from "@/lib/games/minecraft-skin";

const loadSkinview = () => import("skinview3d");

function skinCanvas(pixels: Uint8ClampedArray) {
  const source = document.createElement("canvas");
  source.width = 64;
  source.height = 64;
  const context = source.getContext("2d");
  if (!context) throw new Error("skin_canvas");
  const image = context.createImageData(64, 64);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return source;
}

export function MinecraftSkinViewer({
  pixels,
  model,
  active,
  cape,
}: {
  pixels: Uint8ClampedArray;
  model: SkinModel;
  active: boolean;
  cape?: string;
}) {
  const t = useT(),
    host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    viewer = useRef<SkinViewer | null>(null);
  const [ready, setReady] = useState(0),
    [failed, setFailed] = useState(false),
    [rotate, setRotate] = useState(false),
    [animate, setAnimate] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (active) setFailed(false);
  }
  const showFailed = failed || pixels.length !== 64 * 64 * 4;
  const latestSkin = useRef({ pixels, model });
  useLayoutEffect(() => {
    latestSkin.current = { pixels, model };
  }, [pixels, model]);
  const uploadedSkin = useRef<{ pixels: Uint8ClampedArray; model: SkinModel } | null>(null);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!active || !canvas.current || !host.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const canvasEl = canvas.current;
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvasEl.addEventListener("webglcontextlost", onLost);
    void loadSkinview()
      .then(({ SkinViewer }) => {
        if (disposed || !canvas.current || !host.current) return;
        const instance = new SkinViewer({
          canvas: canvas.current,
          width: host.current.clientWidth,
          height: host.current.clientHeight,
          renderPaused: true,
        });
        viewer.current = instance;
        instance.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        instance.fov = 40;
        instance.zoom = 0.85;
        instance.playerObject.rotation.y = -0.35;
        instance.controls.enablePan = false;
        instance.controls.minDistance = 35;
        instance.controls.maxDistance = 100;
        instance.globalLight.intensity = 2;
        instance.cameraLight.intensity = 0.6;
        instance.controls.addEventListener("change", () => instance.render());
        const initial = latestSkin.current;
        if (initial.pixels.length === 64 * 64 * 4) {
          const source = skinCanvas(initial.pixels);
          instance.loadSkin(source, { model: initial.model === "classic" ? "default" : "slim" });
          instance.render();
          uploadedSkin.current = initial;
        }
        observer = new ResizeObserver(() => {
          if (host.current) {
            instance.setSize(host.current.clientWidth, host.current.clientHeight);
            instance.render();
          }
        });
        observer.observe(host.current);
        setReady((n) => n + 1);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      canvasEl.removeEventListener("webglcontextlost", onLost);
      observer?.disconnect();
      viewer.current?.dispose();
      viewer.current = null;
      uploadedSkin.current = null;
    };
  }, [active]);
  useEffect(() => {
    const instance = viewer.current;
    if (!instance || pixels.length !== 64 * 64 * 4) return;
    if (uploadedSkin.current?.pixels === pixels && uploadedSkin.current?.model === model) return;
    uploadedSkin.current = { pixels, model };
    const skinModel = model === "classic" ? "default" : "slim";
    try {
      const source = skinCanvas(pixels);
      instance.loadSkin(source, { model: skinModel });
      instance.render();
    } catch {
      // Initial setup and webglcontextlost report context or canvas failures asynchronously.
    }
  }, [pixels, model, ready]);
  useEffect(() => {
    const instance = viewer.current;
    if (!instance) return;
    let cancelled = false;
    instance.loadCape(null);
    instance.render();
    if (cape) {
      const image = new Image();
      image.src = cape;
      void image
        .decode()
        .then(() => {
          if (cancelled || viewer.current !== instance) return;
          instance.loadCape(image);
          instance.render();
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [cape, ready]);
  useEffect(() => {
    const visibility = () => {
      if (viewer.current)
        viewer.current.renderPaused = document.hidden || reduced || (!rotate && !animate);
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [ready, rotate, animate, reduced]);
  useEffect(() => {
    const instance = viewer.current;
    if (instance) instance.autoRotate = active && rotate && !reduced;
  }, [active, rotate, reduced, ready]);
  useEffect(() => {
    const instance = viewer.current;
    if (!instance) return;
    let disposed = false;
    if (!animate || reduced) {
      instance.animation = null;
      instance.render();
    } else
      void loadSkinview().then(({ WalkingAnimation }) => {
        if (!disposed && viewer.current === instance) {
          instance.animation = new WalkingAnimation();
          instance.animation.speed = 0.65;
        }
      });
    return () => {
      disposed = true;
    };
  }, [animate, reduced, ready]);
  return (
    <div className="mc-skin-preview">
      <div className="mc-skin-stage" ref={host}>
        <div className="mc-skin-plinth" aria-hidden="true" />
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={t("games.minecraft.preview")}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const v = viewer.current;
            if (!v || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(e.key))
              return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "ArrowLeft" || e.key === "ArrowRight")
              v.playerObject.rotation.y += e.key === "ArrowLeft" ? -0.2 : 0.2;
            else if (e.key === "Home") {
              v.controls.reset();
              v.zoom = 0.85;
              v.playerObject.rotation.y = -0.35;
            } else
              v.zoom = Math.max(0.5, Math.min(1.8, v.zoom + (e.key === "ArrowUp" ? 0.1 : -0.1)));
            v.render();
          }}
        />
        {showFailed && (
          <div className="mc-skin-webgl" role="status">
            <Box size={32} />
            <p>{t("games.minecraft.webgl")}</p>
          </div>
        )}
      </div>
      <div className="mc-skin-camera" role="group" aria-label={t("games.minecraft.preview")}>
        <button
          type="button"
          title={t("games.minecraft.rotate")}
          aria-label={t("games.minecraft.rotate")}
          aria-pressed={rotate}
          disabled={showFailed || reduced}
          onClick={() => setRotate((v) => !v)}
        >
          <RotateCw size={18} />
        </button>
        <button
          type="button"
          title={t("games.minecraft.animate")}
          aria-label={t("games.minecraft.animate")}
          aria-pressed={animate}
          disabled={showFailed || reduced}
          onClick={() => setAnimate((v) => !v)}
        >
          <Play size={18} />
        </button>
        <button
          type="button"
          title={t("games.minecraft.resetView")}
          aria-label={t("games.minecraft.resetView")}
          disabled={showFailed}
          onClick={() => {
            const v = viewer.current;
            if (v) {
              v.controls.reset();
              v.zoom = 0.85;
              v.playerObject.rotation.y = -0.35;
              v.render();
            }
          }}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <p className="mc-skin-preview-hint">{t("games.minecraft.previewHint")}</p>
    </div>
  );
}
