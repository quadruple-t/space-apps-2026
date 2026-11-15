"use client";

import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import { LoadingIndicator } from "@/components/freeplay/loading-indicator";
import { catalogToFreeplay, type CatalogSite, type FreeplaySite } from "@/data/sites";
import { fetchCatalogSites } from "@/lib/lunar-data";
import { useFreeplay } from "@/lib/freeplay-store";
import { useLayerLoad } from "@/lib/layer-load-store";
import { listZones } from "@/lib/firestore/zonesService";
import type { ProtectionZone } from "@/lib/model/types";
import { getFactSheet } from "@/lib/firestore/factsService";
import { meteorStreamsFromFacts, streamIncidence } from "@/lib/science/meteor-streams";
import { publishAnchor } from "./anchor";
import { loadCesium, type Cesium } from "./load-cesium";
import { LAYERS } from "./moon-layers";
import { globeAssetUrl, globeDisplayAsset, type GlobeArchive } from "@/lib/globe-archive";


const starImage = (fill: string, stroke: string, size = 28) => {
  const pts = [...Array(10)].map((_, i) => {
    const r = i % 2 ? 0.42 : 1, a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(14 + Math.cos(a) * 12 * r).toFixed(2)},${(14 + Math.sin(a) * 12 * r).toFixed(2)}`;
  }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const EMPTY_SITES: FreeplaySite[] = [];

// React Strict Mode and returning to the map can otherwise request the same
// manifest several times before the first request finishes.
let manifestPromise: Promise<GlobeArchive> | null = null;
function loadManifest(): Promise<GlobeArchive> {
  if (!manifestPromise) {
    manifestPromise = fetch("/api/v1/globe/manifest").then(async (response) => {
      if (!response.ok) throw new Error("Firebase globe snapshots are unavailable. Check the connection and try again.");
      return await response.json() as GlobeArchive;
    });
    manifestPromise.catch(() => { manifestPromise = null; });
  }
  return manifestPromise;
}

/** Pins float slightly above the ellipsoid so the globe doesn't depth-clip them. */
const PIN_HEIGHT_M = 1500;

/** Wheel/pinch zoom limits: close enough for a landing radius, far enough to see the whole Moon. */
const MIN_ALTITUDE_M = 1_500;
const MAX_ALTITUDE_M = 7_000_000;

const PIN = {
  saved: starImage("#a986ff", "#080712"),
  impact: starImage("#ff9955", "#080712", 22),
  artemis: starImage("#a986ff", "#080712", 22),
  catalog: starImage("#f0ebf7", "#080712", 22),
  selected: starImage("#ff5364", "#fff2f5", 36),
};

export default function MoonGlobe({ guidedSites }: { guidedSites?: FreeplaySite[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const cesiumRef = useRef<Cesium | null>(null);
  const overlayRefs = useRef(new Map<string, CesiumNS.ImageryLayer[]>());
  const archiveRef = useRef<GlobeArchive | null>(null);
  const meteorOverlayRef = useRef<CesiumNS.ImageryLayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [baseLoading, setBaseLoading] = useState(true);

  const site = useFreeplay((s) => s.site);
  const savedSites = useFreeplay((s) => s.savedSites);
  const showCatalog = useFreeplay((s) => s.showCatalog);
  const layers = useFreeplay((s) => s.layers);
  const statuses = useLayerLoad((s) => s.statuses);
  const needsCatalog = showCatalog || layers.landings.on || layers.impacts.on || layers.artemis.on;
  const [catalogEntries, setCatalogEntries] = useState<CatalogSite[]>([]);
  const [catalogSites, setCatalogSites] = useState<FreeplaySite[]>([]);
  const catalogRef = useRef<FreeplaySite[]>([]);
  useEffect(() => {
    if (!needsCatalog || catalogRef.current.length) return;
    let alive = true;
    const setStatus = useLayerLoad.getState().setStatus;
    for (const id of ["catalog", "landings", "impacts", "artemis"] as const) setStatus(id, { state: "loading" });
    fetchCatalogSites().then((list) => {
      if (!alive) return;
      setCatalogEntries(list);
      catalogRef.current = list.map((c) => catalogToFreeplay(c));
      setCatalogSites(catalogRef.current);
      for (const id of ["catalog", "landings", "impacts", "artemis"] as const) setStatus(id, { state: "ready" });
    }).catch(() => { if (alive) for (const id of ["catalog", "landings", "impacts", "artemis"] as const) setStatus(id, { state: "error", message: "Catalog could not load. Turn the layer off and on to retry." }); });
    return () => { alive = false; };
  }, [needsCatalog]);
  const shownCatalog = needsCatalog ? catalogSites.filter((_, i) => {
    const entry = catalogEntries[i];
    return showCatalog || (entry.family === "artemis-candidate" ? layers.artemis.on
      : entry.siteKind === "impact" || entry.siteKind === "rover-final" ? layers.impacts.on : layers.landings.on);
  }) : EMPTY_SITES;
  const [zones, setZones] = useState<ProtectionZone[]>([]);
  const needsZones = layers.heritage.on || layers.coldTraps.on || layers.resources.on;
  useEffect(() => {
    if (!needsZones) return;
    let alive = true;
    const setStatus = useLayerLoad.getState().setStatus;
    for (const id of ["heritage", "coldTraps", "resources"] as const) setStatus(id, { state: "loading" });
    listZones().then((data) => { if (alive) { setZones(data); for (const id of ["heritage", "coldTraps", "resources"] as const) setStatus(id, { state: "ready" }); } })
      .catch(() => { if (alive) for (const id of ["heritage", "coldTraps", "resources"] as const) setStatus(id, { state: "error", message: "Regions could not load. Turn the layer off and on to retry." }); });
    return () => { alive = false; };
  }, [needsZones]);

  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    const source = new C.CustomDataSource("resource-and-heritage-regions");
    void viewer.dataSources.add(source);
    for (const zone of zones) {
      if (zone.needsData) continue;
      const id = zone.kind === "heritage-buffer" ? "heritage" : "resources";
      const cold = zone.kind === "psr-ice" && (zone.coldTrapFraction ?? 0) > 0 && layers.coldTraps.on;
      if (!layers[id].on && !cold) continue;
      const color = C.Color.fromCssColorString(cold ? "#55ddee" : id === "heritage" ? "#ffcf66" : "#69e6aa");
      const opacity = layers[cold ? "coldTraps" : id].opacity;
      const geometry = zone.geometry;
      if (geometry.type === "Circle") {
        source.entities.add({ id: `zone-${zone.id}`, name: zone.name,
          position: C.Cartesian3.fromDegrees(geometry.center.lonDeg, geometry.center.latDeg, 0, C.Ellipsoid.MOON),
          ellipse: { semiMajorAxis: geometry.radiusKm * 1000, semiMinorAxis: geometry.radiusKm * 1000,
            height: 50, material: color.withAlpha(opacity * 0.3), outline: true, outlineColor: color.withAlpha(opacity) } });
      } else if (geometry.coordinates[0]?.length) {
        const ring = (points: number[][]) => C.Cartesian3.fromDegreesArray(points.flatMap(([lon, lat]) => [lon, lat]), C.Ellipsoid.MOON);
        source.entities.add({ id: `zone-${zone.id}`, name: zone.name,
          polygon: { hierarchy: new C.PolygonHierarchy(ring(geometry.coordinates[0]), geometry.coordinates.slice(1).map((hole) => new C.PolygonHierarchy(ring(hole)))),
            height: 50, material: color.withAlpha(opacity * 0.4), outline: true, outlineColor: color.withAlpha(opacity) } });
      }
    }
    return () => { viewer.dataSources.remove(source, true); };
  }, [ready, zones, layers]);

  const meteorStream = useFreeplay((s) => s.meteorStream);
  const meteorOn = layers.meteorStreams.on, meteorOpacity = layers.meteorStreams.opacity;
  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current;
    if (!ready || !C || !viewer || !meteorOn) return;
    let alive = true;
    let overlay: CesiumNS.ImageryLayer | undefined;
    const setStatus = useLayerLoad.getState().setStatus;
    setStatus("meteorStreams", { state: "loading" });
    getFactSheet("meteor-streams-2026").then(async (sheet) => {
      if (!alive) return;
      if (!sheet) throw new Error("Missing meteor reference data");
      const stream = meteorStreamsFromFacts(sheet).find((s) => s.name === meteorStream);
      if (!stream) throw new Error("Missing meteor stream");
      const canvas = document.createElement("canvas");
      canvas.width = 720; canvas.height = 360;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to draw meteor exposure");
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const incidence = streamIncidence(90 - (y + 0.5) * 180 / canvas.height, -180 + (x + 0.5) * 360 / canvas.width, stream);
        const i = (y * canvas.width + x) * 4;
        pixels.data[i] = 255; pixels.data[i + 1] = 136; pixels.data[i + 2] = 51;
        pixels.data[i + 3] = Math.round(incidence * 220);
      }
      context.putImageData(pixels, 0, 0);
      const provider = await C.SingleTileImageryProvider.fromUrl(canvas.toDataURL(), {
        rectangle: C.Rectangle.MAX_VALUE, ellipsoid: C.Ellipsoid.MOON,
        credit: "Modeled reference exposure · TUM 2026 radiants · NAIF IAU_MOON",
      });
      if (!alive || viewer.isDestroyed()) return;
      overlay = viewer.imageryLayers.addImageryProvider(provider);
      overlay.alpha = useFreeplay.getState().layers.meteorStreams.opacity;
      meteorOverlayRef.current = overlay;
      setStatus("meteorStreams", { state: "ready" });
    }).catch(() => { if (alive) setStatus("meteorStreams", { state: "error", message: "Meteor exposure could not load. Turn the layer off and on to retry." }); });
    return () => {
      alive = false;
      if (overlay && !viewer.isDestroyed()) viewer.imageryLayers.remove(overlay, true);
      if (meteorOverlayRef.current === overlay) meteorOverlayRef.current = null;
    };
  }, [ready, meteorOn, meteorStream]);

  useEffect(() => {
    const viewer = viewerRef.current, overlay = meteorOverlayRef.current;
    if (!ready || !viewer || viewer.isDestroyed() || !overlay) return;
    overlay.alpha = meteorOpacity;
    viewer.scene.requestRender();
  }, [ready, meteorOpacity]);

  // ── Create the viewer once ────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    let cleanup = () => {};
    const overlays = overlayRefs.current;
    Promise.all([loadCesium(), loadManifest()]).then(([C, archive]) => {
      if (destroyed || !containerRef.current) return;
      cesiumRef.current = C;
      archiveRef.current = archive;
      const moon = C.Ellipsoid.MOON;
      C.Ellipsoid.default = moon;
      C.Ion.defaultAccessToken = "";

      const originalBase = archive.assets.find((asset) => asset.id === "base");
      if (!originalBase) throw new Error("The stored globe base image is missing");
      const baseAsset = globeDisplayAsset(archive, originalBase);
      const base = new C.SingleTileImageryProvider({
        url: globeAssetUrl(baseAsset), tileWidth: baseAsset.width!, tileHeight: baseAsset.height!,
        rectangle: C.Rectangle.MAX_VALUE, ellipsoid: moon, credit: "NASA Moon Trek · Firebase snapshot",
      });
      const requestBase = base.requestImage.bind(base);
      base.requestImage = (...args) => {
        const result = requestBase(...args);
        if (!result) return result;
        return result.then((image) => { if (!destroyed) setBaseLoading(false); return image; }, (failure) => {
          if (!destroyed) { setBaseLoading(false); setError("The stored Moon image could not load. Check your connection and try again."); }
          throw failure;
        });
      };
      if (destroyed || !containerRef.current) return;

      const credit = document.createElement("div");
      const viewer = new C.Viewer(containerRef.current, {
        globe: new C.Globe(moon),
        baseLayer: new C.ImageryLayer(base),
        baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
        infoBox: false, selectionIndicator: false, skyAtmosphere: false,
        // Cesium only adds its Tycho-2 star background for Earth, so add it explicitly.
        skyBox: C.SkyBox.createEarthSkyBox(),
        // Continuous rendering: on-demand mode misses async pin images and circle geometry.
        creditContainer: credit,
      });
      viewerRef.current = viewer;
      cleanup = () => { if (!viewer.isDestroyed()) viewer.destroy(); };
      const scene = viewer.scene;
      scene.globe.enableLighting = false;
      scene.globe.showGroundAtmosphere = false;
      scene.globe.baseColor = C.Color.fromCssColorString("#151327");
      if (scene.moon) scene.moon.show = false;
      if (scene.sun) scene.sun.show = false;
      scene.backgroundColor = C.Color.fromCssColorString("#080712");

      // Wheel zoom moves straight toward/away from the Moon's centre. Cesium's default
      // zooms toward the cursor, which swings the camera around the Moon when zooming out.
      const ssc = scene.screenSpaceCameraController;
      ssc.zoomEventTypes = [C.CameraEventType.PINCH];
      ssc.minimumZoomDistance = MIN_ALTITUDE_M;
      ssc.maximumZoomDistance = MAX_ALTITUDE_M;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const pos = viewer.camera.positionWC;
        const altitude = moon.cartesianToCartographic(pos)?.height ?? MAX_ALTITUDE_M;
        const target = Math.min(MAX_ALTITUDE_M, Math.max(MIN_ALTITUDE_M, altitude * Math.exp(e.deltaY * 0.0012)));
        const towardCentre = C.Cartesian3.normalize(C.Cartesian3.negate(pos, new C.Cartesian3()), new C.Cartesian3());
        viewer.camera.move(towardCentre, altitude - target);
      };
      scene.canvas.addEventListener("wheel", onWheel, { passive: false });

      // Click: pin → that site; empty ground → custom site.
      const handler = new C.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
        const picked = scene.pick(e.position);
        const id = picked?.id instanceof C.Entity ? picked.id.id : null;
        const { savedSites, selectSite, selectCustom, setCalloutOpen, calloutOpen, siteDraft, site: current } = useFreeplay.getState();
        if (id && id !== "radius") {
          const hit = savedSites.find((s) => s.id === id) ?? guidedSites?.find((s) => s.id === id) ?? (current?.id === id ? current : null)
            ?? catalogRef.current.find((s) => s.id === id);
          if (hit) { selectSite(hit, true); return; }
        }
        if (calloutOpen && siteDraft) { setCalloutOpen(false); return; }
        const cart = viewer.camera.pickEllipsoid(e.position, moon);
        if (!cart) return;
        const c = moon.cartesianToCartographic(cart);
        selectCustom(C.Math.toDegrees(c.latitude), C.Math.toDegrees(c.longitude));
      }, C.ScreenSpaceEventType.LEFT_CLICK);

      // Publish the selected site's screen position for the callout.
      const removePostRender = scene.postRender.addEventListener(() => {
        const s = useFreeplay.getState().site;
        if (!s) { publishAnchor(null); return; }
        const pos = C.Cartesian3.fromDegrees(s.longitudeDeg, s.latitudeDeg, PIN_HEIGHT_M, moon);
        const win = C.SceneTransforms.worldToWindowCoordinates(scene, pos);
        const occluder = new C.EllipsoidalOccluder(moon, viewer.camera.positionWC);
        publishAnchor(win ? { x: win.x, y: win.y, visible: occluder.isPointVisible(pos) } : null);
      });

      // Open on the whole Moon (near side, tilted toward the south pole) with stars around it.
      const s = useFreeplay.getState().site;
      viewer.camera.setView({ destination: s
        ? C.Cartesian3.fromDegrees(s.longitudeDeg, s.latitudeDeg, 3_200_000, moon)
        : C.Cartesian3.fromDegrees(10, -35, 5_200_000, moon) });
      setReady(true);
      cleanup = () => { scene.canvas.removeEventListener("wheel", onWheel); removePostRender(); handler.destroy(); if (!viewer.isDestroyed()) viewer.destroy(); };
    }).catch((e: unknown) => { if (!destroyed) setError(e instanceof Error ? e.message : String(e)); });
    return () => { destroyed = true; cleanup(); viewerRef.current = null; archiveRef.current = null; overlays.clear(); useLayerLoad.getState().reset(); };
  }, [guidedSites]);

  // ── Pins and radius circle ────────────────────────────────────────────────
  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    // Update entities in place: removing and re-adding the same id in one batch
    // makes Cesium's visualizers drop the new graphics.
    const moon = C.Ellipsoid.MOON;
    const sourceSites = guidedSites ?? shownCatalog;
    const all: FreeplaySite[] = [...savedSites, ...sourceSites.filter((c) => !savedSites.some((s) => s.catalogId && s.catalogId === c.catalogId))];
    if (site && !all.some((s) => s.id === site.id)) all.push(site);
    const keep = new Set(all.map((s) => s.id).concat("radius"));
    for (const e of [...viewer.entities.values]) if (!keep.has(e.id)) viewer.entities.remove(e);

    for (const s of all) {
      const selected = s.id === site?.id;
      const entry = catalogEntries.find((c) => c.id === s.catalogId);
      const group = entry?.family === "artemis-candidate" ? "artemis"
        : ["impact", "rover-final"].includes(entry?.siteKind ?? "") ? "impacts" : "landings";
      const props = {
        position: new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(s.longitudeDeg, s.latitudeDeg, PIN_HEIGHT_M, moon)),
        billboard: new C.BillboardGraphics({
          color: C.Color.WHITE.withAlpha(selected || s.kind !== "catalog" || guidedSites !== undefined || showCatalog ? 1 : layers[group].opacity),
          image: selected ? PIN.selected : s.kind !== "catalog" ? PIN.saved
            : group === "artemis" ? PIN.artemis : group === "impacts" ? PIN.impact : PIN.catalog,
          verticalOrigin: C.VerticalOrigin.CENTER,
          scale: selected ? 1 : 0.8,
        }),
        label: new C.LabelGraphics({
          text: s.name, font: "11px 'IBM Plex Mono', monospace", fillColor: C.Color.fromCssColorString("#f0ebf7"),
          outlineColor: C.Color.fromCssColorString("#080712"), outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new C.Cartesian2(0, -20), show: !selected,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 900_000),
        }),
      };
      const existing = viewer.entities.getById(s.id);
      if (existing) Object.assign(existing, props);
      else viewer.entities.add({ id: s.id, ...props });
    }

    const radius = viewer.entities.getById("radius");
    if (!site) { if (radius) viewer.entities.remove(radius); return; }
    const circle = {
      position: new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(site.longitudeDeg, site.latitudeDeg, 0, moon)),
      ellipse: new C.EllipseGraphics({
        semiMajorAxis: site.radiusKm * 1000, semiMinorAxis: site.radiusKm * 1000, height: 0,
        material: C.Color.fromCssColorString("#ff5364").withAlpha(0.14),
        outline: true, outlineColor: C.Color.fromCssColorString("#ff5364"),
      }),
    };
    if (radius) Object.assign(radius, circle);
    else viewer.entities.add({ id: "radius", ...circle });
  }, [ready, site, savedSites, shownCatalog, guidedSites, layers, showCatalog, catalogEntries]);

  // ── Fly to a saved site when it's chosen (not for points picked in view) ──
  const siteId = site?.id, siteKind = site?.kind;
  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current;
    const s = useFreeplay.getState().site;
    if (!ready || !C || !viewer || !s || siteKind !== "saved") return;
    viewer.camera.flyTo({
      // Frame the radius circle: roughly a sixth of the view height.
      destination: C.Cartesian3.fromDegrees(s.longitudeDeg, s.latitudeDeg, Math.min(3_000_000, Math.max(40_000, s.radiusKm * 1000 * 10)), C.Ellipsoid.MOON),
      duration: 1.6,
    });
  }, [ready, siteId, siteKind]);

  // ── Fly to the selected site when something outside the globe asks (the assistant) ──
  const focusNonce = useFreeplay((s) => s.focusNonce);
  const handledFocus = useRef(0);
  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current;
    const s = useFreeplay.getState().site;
    if (!ready || !C || !viewer || !s || focusNonce === handledFocus.current) return;
    handledFocus.current = focusNonce;
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(s.longitudeDeg, s.latitudeDeg, Math.min(3_000_000, Math.max(40_000, s.radiusKm * 1000 * 10)), C.Ellipsoid.MOON),
      duration: 1.6,
    });
  }, [ready, focusNonce]);

  // ── Load imagery only when selected; removing it lets a failed layer retry. ──
  useEffect(() => {
    const viewer = viewerRef.current, C = cesiumRef.current, archive = archiveRef.current;
    if (!ready || !viewer || !C || !archive) return;
    const setStatus = useLayerLoad.getState().setStatus;
    for (const def of LAYERS) {
      if (def.sources.length === 0) continue;
      const state = layers[def.id];
      let made = overlayRefs.current.get(def.id);
      if (!state.on) {
        if (made) {
          overlayRefs.current.delete(def.id);
          for (const layer of made) viewer.imageryLayers.remove(layer, true);
        }
        setStatus(def.id, null);
        continue;
      }
      if (!made) {
        const assets = def.sources.map((_, index) => {
          const original = archive.assets.find((entry) => entry.layerId === def.id && entry.sourceIndex === index);
          return original && globeDisplayAsset(archive, original);
        });
        if (assets.some((asset) => !asset?.rectangle || !asset.width || !asset.height)) {
          setStatus(def.id, { state: "error", message: "This stored map is unavailable." });
          continue;
        }
        made = [];
        const group = made;
        let pending = 0, failed = false;
        overlayRefs.current.set(def.id, group);
        setStatus(def.id, { state: "loading" });
        for (const asset of assets) {
          const provider = new C.SingleTileImageryProvider({
            url: globeAssetUrl(asset!), tileWidth: asset!.width!, tileHeight: asset!.height!,
            rectangle: C.Rectangle.fromDegrees(...asset!.rectangle!), ellipsoid: C.Ellipsoid.MOON, credit: def.credit,
          });
          const requestImage = provider.requestImage.bind(provider);
          provider.requestImage = (...args) => {
            const result = requestImage(...args);
            if (!result) return result;
            pending++;
            if (overlayRefs.current.get(def.id) === group) setStatus(def.id, { state: "loading" });
            return result.then((image) => {
              pending--;
              if (!failed && pending === 0 && overlayRefs.current.get(def.id) === group) setStatus(def.id, { state: "ready" });
              return image;
            }, (failure) => {
              pending--; failed = true;
              if (overlayRefs.current.get(def.id) === group) setStatus(def.id, { state: "error", message: "Map image could not load. Turn the layer off and on to retry." });
              throw failure;
            });
          };
          const layer = viewer.imageryLayers.addImageryProvider(provider);
          layer.alpha = state.opacity;
          group.push(layer);
        }
      }
      for (const layer of made) layer.alpha = state.opacity;
    }
    viewer.scene.requestRender();
  }, [ready, layers]);

  const loadingLayers = Object.entries(statuses).some(([id, status]) => status?.state === "loading" && (id === "catalog" ? showCatalog : layers[id as keyof typeof layers]?.on));
  const layerError = Object.entries(statuses).find(([id, status]) => status?.state === "error" && (id === "catalog" ? showCatalog : layers[id as keyof typeof layers]?.on))?.[1];

  return <div className="absolute inset-0">
    <div ref={containerRef} className="absolute inset-0 [&_.cesium-viewer-bottom]:hidden" />
    {!ready && !error && <div className="absolute inset-0 grid place-items-center bg-void"><LoadingIndicator label="Moon globe" /></div>}
    {ready && (baseLoading || loadingLayers) && <div className="pointer-events-none absolute left-3 top-12 rounded bg-void/90 px-3 py-2"><LoadingIndicator label={baseLoading ? "Moon imagery" : "map layers"} /></div>}
    {layerError && <p role="alert" className="absolute left-3 top-20 rounded bg-void/90 p-2 text-xs text-destructive">{layerError.message}</p>}
    {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-void p-6 text-center text-xs text-destructive"><div>{error}<button type="button" onClick={() => window.location.reload()} className="ml-2 underline">Try again</button></div></div>}
  </div>;
}
