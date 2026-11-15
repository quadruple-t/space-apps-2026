"use client";

import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import { catalogToFreeplay, type CatalogSite, type FreeplaySite } from "@/data/sites";
import { fetchCatalogSites } from "@/lib/lunar-data";
import { useFreeplay } from "@/lib/freeplay-store";
import { listZones } from "@/lib/firestore/zonesService";
import type { ProtectionZone } from "@/lib/model/types";
import { getFactSheet } from "@/lib/firestore/factsService";
import { meteorStreamsFromFacts, streamIncidence } from "@/lib/science/meteor-streams";
import { publishAnchor } from "./anchor";
import { loadCesium, type Cesium } from "./load-cesium";
import { LAYERS } from "./moon-layers";
import { globeAssetUrl, type GlobeArchive } from "@/lib/globe-archive";


const starImage = (fill: string, stroke: string, size = 28) => {
  const pts = [...Array(10)].map((_, i) => {
    const r = i % 2 ? 0.42 : 1, a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(14 + Math.cos(a) * 12 * r).toFixed(2)},${(14 + Math.sin(a) * 12 * r).toFixed(2)}`;
  }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const EMPTY_SITES: FreeplaySite[] = [];

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
  const meteorOverlayRef = useRef<CesiumNS.ImageryLayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const site = useFreeplay((s) => s.site);
  const savedSites = useFreeplay((s) => s.savedSites);
  const showCatalog = useFreeplay((s) => s.showCatalog);
  const layers = useFreeplay((s) => s.layers);
  const needsCatalog = showCatalog || layers.landings.on || layers.impacts.on || layers.artemis.on;
  const [catalogEntries, setCatalogEntries] = useState<CatalogSite[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [catalogSites, setCatalogSites] = useState<FreeplaySite[]>([]);
  const catalogRef = useRef<FreeplaySite[]>([]);
  useEffect(() => {
    if (!needsCatalog || catalogRef.current.length) return;
    let alive = true;
    fetchCatalogSites().then((list) => {
      if (!alive) return;
      setCatalogEntries(list);
      setDataError(null);
      catalogRef.current = list.map((c) => catalogToFreeplay(c));
      setCatalogSites(catalogRef.current);
    }).catch(() => { if (alive) setDataError("Catalog layers could not load. Toggle a layer to retry."); });
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
    listZones().then((data) => { if (alive) { setZones(data); setDataError(null); } })
      .catch(() => { if (alive) setDataError("Region layers could not load. Toggle a layer to retry."); });
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
    }).catch(() => { if (alive) setDataError("Meteor exposure could not load. Check the reference facts in the data API."); });
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
    Promise.all([loadCesium(), fetch("/api/v1/globe/manifest").then(async (response) => {
      if (!response.ok) throw new Error("Firebase globe snapshots are unavailable. Import the collected maps first.");
      return await response.json() as GlobeArchive;
    })]).then(([C, archive]) => {
      if (destroyed || !containerRef.current) return;
      cesiumRef.current = C;
      const moon = C.Ellipsoid.MOON;
      C.Ellipsoid.default = moon;
      C.Ion.defaultAccessToken = "";

      const baseAsset = archive.assets.find((asset) => asset.id === "base");
      if (!baseAsset) throw new Error("The stored globe base image is missing");
      const base = new C.SingleTileImageryProvider({
        url: globeAssetUrl(baseAsset), tileWidth: baseAsset.width!, tileHeight: baseAsset.height!,
        rectangle: C.Rectangle.MAX_VALUE, ellipsoid: moon, credit: "NASA Moon Trek · Firebase snapshot",
      });
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

      // Overlay layers: created hidden, toggled by the store.
      for (const def of LAYERS) {
        const made: CesiumNS.ImageryLayer[] = [];
        for (let index = 0; index < def.sources.length; index++) {
          const asset = archive.assets.find((entry) => entry.layerId === def.id && entry.sourceIndex === index);
          if (!asset?.rectangle) throw new Error(`Stored imagery is missing for ${def.label}`);
          const provider = new C.SingleTileImageryProvider({
            url: globeAssetUrl(asset), tileWidth: asset.width!, tileHeight: asset.height!,
            rectangle: C.Rectangle.fromDegrees(...asset.rectangle), ellipsoid: moon, credit: def.credit,
          });
          provider.errorEvent.addEventListener(() => setDataError(`Stored imagery could not load: ${def.label}`));
          if (destroyed) return;
          const layer = viewer.imageryLayers.addImageryProvider(provider);
          layer.show = false;
          made.push(layer);
        }
        overlays.set(def.id, made);
      }

      // Click: pin → that site; empty ground → custom site.
      const handler = new C.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
        const picked = scene.pick(e.position);
        const id = picked?.id instanceof C.Entity ? picked.id.id : null;
        const { savedSites, selectSite, selectCustom, site: current } = useFreeplay.getState();
        if (id && id !== "radius") {
          const hit = savedSites.find((s) => s.id === id) ?? guidedSites?.find((s) => s.id === id) ?? (current?.id === id ? current : null)
            ?? (useFreeplay.getState().showCatalog ? catalogRef.current.find((s) => s.id === id) : undefined);
          if (hit) { selectSite(hit, true); return; }
        }
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
    return () => { destroyed = true; cleanup(); viewerRef.current = null; overlays.clear(); };
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

  // ── Overlay visibility and opacity ────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;
    for (const def of LAYERS) {
      const state = layers[def.id];
      for (const layer of overlayRefs.current.get(def.id) ?? []) { layer.show = state.on; layer.alpha = state.opacity; }
    }
    viewer.scene.requestRender();
  }, [ready, layers]);

  return <div className="absolute inset-0">
    <div ref={containerRef} className="absolute inset-0 [&_.cesium-viewer-bottom]:hidden" />
    {!ready && !error && <div className="absolute inset-0 grid place-items-center bg-void"><span className="type-data animate-pulse text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Loading Moon globe…</span></div>}
    {dataError && <p role="alert" className="absolute left-3 top-12 rounded bg-void/90 p-2 text-xs text-destructive">{dataError}</p>}
    {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-void p-6 text-center text-xs text-destructive">{error}</div>}
  </div>;
}
