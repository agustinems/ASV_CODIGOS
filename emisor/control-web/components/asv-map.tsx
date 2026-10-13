'use client';
/* oxlint-disable react/react-compiler -- Leaflet's imperative map instance is managed outside React rendering. */

import type {
  LatLngExpression,
  Map as LeafletMap,
  Marker,
  Polyline,
} from 'leaflet';
import { useEffect, useRef } from 'react';

import type { Telemetry } from '@/lib/asv-types';
import { EMBEDDED } from '@/lib/runtime';

const SAN_ROQUE_CENTER: [number, number] = [-31.3673581, -64.4641370];

type LakeGeometry = {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};

export function AsvMap({
  telemetry,
  hasTelemetry,
  centerSignal,
  resizeSignal = false,
}: {
  telemetry: Telemetry;
  hasTelemetry: boolean;
  centerSignal: number;
  resizeSignal?: boolean;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const pathRef = useRef<Polyline | null>(null);
  const pointsRef = useRef<LatLngExpression[]>([]);
  const initialPositionRef = useRef<[number, number]>([telemetry.lat, telemetry.lon]);
  const latestPositionRef = useRef<[number, number]>([telemetry.lat, telemetry.lon]);
  const hasTelemetryRef = useRef(hasTelemetry);

  useEffect(() => {
    hasTelemetryRef.current = hasTelemetry;
  }, [hasTelemetry]);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    let disposed = false;
    let initializedMap: LeafletMap | null = null;
    void import('leaflet').then(async ({ default: L }) => {
      if (disposed || !nodeRef.current) return;
      const map = L.map(nodeRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
      }).setView(EMBEDDED ? SAN_ROQUE_CENTER : initialPositionRef.current, EMBEDDED ? 13 : 16);
      initializedMap = map;
      mapRef.current = map;
      if (EMBEDDED) {
        map.attributionControl.addAttribution(
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
        );
        try {
          const response = await fetch('/maps/san-roque.geojson');
          if (!response.ok) throw new Error(`Mapa HTTP ${response.status}`);
          const lake = (await response.json()) as LakeGeometry;
          if (disposed) return;
          if (lake.geometry.type !== 'Polygon') throw new Error('Geometría del lago inválida');
          const rings = lake.geometry.coordinates.map((ring) =>
            ring.map(([lon, lat]): [number, number] => [lat, lon]),
          );
          const shore = L.polygon(rings, {
            color: '#70b9c1',
            weight: 2,
            opacity: 0.9,
            fillColor: '#176a78',
            fillOpacity: 0.72,
          }).addTo(map);
          const bounds = shore.getBounds();
          for (let lat = -31.42; lat <= -31.32; lat += 0.02) {
            L.polyline([[lat, -64.52], [lat, -64.42]], {
              color: '#a8d6d4', opacity: 0.18, weight: 1, dashArray: '3 7', interactive: false,
            }).addTo(map);
          }
          for (let lon = -64.50; lon <= -64.44; lon += 0.02) {
            L.polyline([[-31.43, lon], [-31.30, lon]], {
              color: '#a8d6d4', opacity: 0.18, weight: 1, dashArray: '3 7', interactive: false,
            }).addTo(map);
          }
          L.marker(SAN_ROQUE_CENTER, {
            interactive: false,
            icon: L.divIcon({ className: 'asv-lake-label', html: 'LAGO SAN ROQUE' }),
          }).addTo(map);
          map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
        } catch (error) {
          console.error('No se pudo cargar el mapa local', error);
        }
      } else {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
      }
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
      const icon = L.divIcon({
        className: 'asv-map-marker',
        html: '<span class="asv-map-pulse"></span><span class="asv-map-arrow">▲</span>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      markerRef.current = L.marker(initialPositionRef.current, { icon });
      pathRef.current = L.polyline([], {
        color: '#42d7d2',
        opacity: 0.72,
        weight: 3,
        dashArray: '4 7',
      });
      if (hasTelemetryRef.current) {
        markerRef.current.addTo(map);
        pathRef.current.addTo(map);
      }
      setTimeout(() => map.invalidateSize(), 0);
    });
    return () => {
      disposed = true;
      initializedMap?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasTelemetry) {
      if (mapRef.current && markerRef.current) mapRef.current.removeLayer(markerRef.current);
      if (mapRef.current && pathRef.current) mapRef.current.removeLayer(pathRef.current);
      pointsRef.current = [];
      return;
    }
    const position: LatLngExpression = [telemetry.lat, telemetry.lon];
    latestPositionRef.current = [telemetry.lat, telemetry.lon];
    if (mapRef.current && markerRef.current && !mapRef.current.hasLayer(markerRef.current)) {
      markerRef.current.addTo(mapRef.current);
    }
    if (mapRef.current && pathRef.current && !mapRef.current.hasLayer(pathRef.current)) {
      pathRef.current.addTo(mapRef.current);
    }
    markerRef.current?.setLatLng(position);
    const arrow = markerRef.current?.getElement()?.querySelector<HTMLElement>('.asv-map-arrow');
    if (arrow) arrow.style.transform = `rotate(${telemetry.headingDeg}deg)`;
    const points = pointsRef.current;
    const previous = points.at(-1) as [number, number] | undefined;
    if (!previous || Math.abs(previous[0] - telemetry.lat) + Math.abs(previous[1] - telemetry.lon) > 0.000001) {
      points.push(position);
      if (points.length > 300) points.shift();
      pathRef.current?.setLatLngs(points);
    }
  }, [telemetry, hasTelemetry]);

  useEffect(() => {
    if (EMBEDDED && !hasTelemetryRef.current) {
      mapRef.current?.flyTo(SAN_ROQUE_CENTER, 13, { duration: 0.55 });
    } else {
      mapRef.current?.flyTo(latestPositionRef.current, Math.max(mapRef.current.getZoom(), 16), {
        duration: 0.55,
      });
    }
  }, [centerSignal]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }));
    const timeout = window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 240);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [resizeSignal]);

  return <div ref={nodeRef} className={`leaflet-host ${EMBEDDED ? 'offline-map' : ''}`} aria-label="Mapa de Lago San Roque con posición del ASV" />;
}
