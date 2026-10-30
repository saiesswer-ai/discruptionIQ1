import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, AlertCircle, RefreshCw, Radio, Navigation } from 'lucide-react';
import { Shipment } from '../../types';
import { Badge } from './Badge';
import { useSimulatedTracking } from '../../hooks/useSimulatedTracking';
import { MAP_CONFIG } from '../../constants/trackingConstants';

interface LiveLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment | null;
}

export const LiveLocationModal: React.FC<LiveLocationModalProps> = ({
  isOpen,
  onClose,
  shipment,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);

  const {
    isLoading,
    error,
    originCoords,
    destinationCoords,
    routeSegments,
    flatPath,
    currentPosition,
    heading,
    progressPercent,
    latestEvent,
    isPaused,
  } = useSimulatedTracking(shipment);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Initialize and clean up Leaflet map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Reset mapReady
    setMapReady(false);

    // If an instance exists already, remove it first
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [30, 15],
      zoom: 3,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: false,
    });

    // Tile resilience: use CARTO Dark Matter as primary, and on tileerror switch to OSM fallback
    let failureCount = 0;
    let usingFallback = false;
    let activeTileLayer: L.TileLayer | null = null;

    const switchToFallback = () => {
      if (usingFallback) return;
      usingFallback = true;
      if (activeTileLayer && map.hasLayer(activeTileLayer)) {
        map.removeLayer(activeTileLayer);
      }
      activeTileLayer = L.tileLayer(MAP_CONFIG.fallbackTileLayerUrl, {
        attribution: MAP_CONFIG.fallbackAttribution,
        minZoom: 2,
        maxZoom: 18,
      });
      activeTileLayer.addTo(map);
    };

    const primaryTileLayer = L.tileLayer(MAP_CONFIG.tileLayerUrl, {
      attribution: MAP_CONFIG.attribution,
      subdomains: 'abcd',
      minZoom: 2,
      maxZoom: 18,
    });

    primaryTileLayer.on('tileerror', () => {
      failureCount++;
      if (failureCount >= 3 && !usingFallback) {
        switchToFallback();
      }
    });

    primaryTileLayer.addTo(map);
    activeTileLayer = primaryTileLayer;

    mapInstanceRef.current = map;
    setMapReady(true);

    // ResizeObserver to handle container sizing smoothly
    const container = mapContainerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(container);
    }

    // Invalidate size ~200ms after modal opens and fit bounds
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        if (polylineLayerRef.current) {
          try {
            const bounds = polylineLayerRef.current.getBounds();
            if (bounds.isValid()) {
              mapInstanceRef.current.fitBounds(bounds, { padding: [45, 45] });
            }
          } catch (e) {
            console.warn('fitBounds error:', e);
          }
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      vehicleMarkerRef.current = null;
      polylineLayerRef.current = null;
      originMarkerRef.current = null;
      destMarkerRef.current = null;
      setMapReady(false);
    };
  }, [isOpen, shipment?.id]);

  // Update Route Polyline and Origin / Destination Markers when route data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || routeSegments.length === 0 || !shipment) return;

    // Remove existing polyline and markers
    if (polylineLayerRef.current) {
      polylineLayerRef.current.remove();
      polylineLayerRef.current = null;
    }
    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    const mode = shipment.transportMode;
    const modeColor =
      mode === 'Air'
        ? MAP_CONFIG.colors.air
        : mode === 'Ocean'
        ? MAP_CONFIG.colors.ocean
        : MAP_CONFIG.colors.road;

    // 1. Draw Polyline (handles single or multi-segment polylines e.g. antimeridian split)
    const polyline = L.polyline(routeSegments as any, {
      color: modeColor,
      weight: 3.5,
      opacity: 0.88,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    polylineLayerRef.current = polyline;

    // 2. Origin Marker
    const originIcon = L.divIcon({
      className: 'live-location-origin-pin',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%);">
          <div style="background: rgba(15, 23, 42, 0.9); color: #34d399; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(52, 211, 153, 0.6); white-space: nowrap; margin-bottom: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.6);">
            ORIGIN
          </div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #10b981; border: 2px solid #ffffff; box-shadow: 0 0 8px #10b981;"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const originMarker = L.marker(originCoords, { icon: originIcon, zIndexOffset: 800 })
      .bindPopup(
        `<div style="font-family: sans-serif; font-size: 12px; color: #0f172a;">
          <strong>Origin Hub:</strong> ${shipment.origin}
        </div>`
      )
      .addTo(map);
    originMarkerRef.current = originMarker;

    // 3. Destination Marker
    const destIcon = L.divIcon({
      className: 'live-location-dest-pin',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%);">
          <div style="background: rgba(15, 23, 42, 0.9); color: #f43f5e; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(244, 63, 94, 0.6); white-space: nowrap; margin-bottom: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.6);">
            DESTINATION
          </div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #f43f5e; border: 2px solid #ffffff; box-shadow: 0 0 8px #f43f5e;"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const destMarker = L.marker(destinationCoords, { icon: destIcon, zIndexOffset: 800 })
      .bindPopup(
        `<div style="font-family: sans-serif; font-size: 12px; color: #0f172a;">
          <strong>Destination Hub:</strong> ${shipment.destination}
        </div>`
      )
      .addTo(map);
    destMarkerRef.current = destMarker;

    // 4. Auto-fit bounds
    try {
      const bounds = polyline.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [45, 45],
          maxZoom: mode === 'Road' ? 9 : 6,
        });
      }
    } catch (e) {
      console.warn('Error auto-fitting bounds:', e);
    }
  }, [mapReady, routeSegments, originCoords, destinationCoords, shipment]);

  // Update Moving Vehicle Marker on position / heading changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !shipment || !currentPosition) return;

    const emoji = MAP_CONFIG.vehicleEmoji[shipment.transportMode] || '🚚';
    // For ✈️ Air emoji, standard Unicode glyph points at 45deg (NE), so subtract 45deg to point along heading
    const rotationDeg = shipment.transportMode === 'Air' ? Math.round(heading - 45) : 0;

    const vehicleIcon = L.divIcon({
      className: 'live-tracking-vehicle-icon',
      html: `
        <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transform: rotate(${rotationDeg}deg); transform-origin: center; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.8)); font-size: 22px; cursor: pointer; transition: transform 0.4s ease-out;">
          ${emoji}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (!vehicleMarkerRef.current) {
      const marker = L.marker(currentPosition, {
        icon: vehicleIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindPopup(
        `<div style="font-family: sans-serif; font-size: 12px; color: #0f172a;">
          <strong>${shipment.carrierName} (${shipment.trackingNumber})</strong><br/>
          Mode: ${shipment.transportMode}<br/>
          Heading: ${Math.round(heading)}°<br/>
          Status: ${shipment.status}
        </div>`
      );

      vehicleMarkerRef.current = marker;
    } else {
      vehicleMarkerRef.current.setLatLng(currentPosition);
      vehicleMarkerRef.current.setIcon(vehicleIcon);
    }
  }, [mapReady, currentPosition, heading, shipment]);

  // Recenter helper
  const handleRecenter = () => {
    if (!mapInstanceRef.current || !polylineLayerRef.current) return;
    try {
      mapInstanceRef.current.invalidateSize();
      const bounds = polylineLayerRef.current.getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch (e) {
      console.warn('Recenter failed:', e);
    }
  };

  if (!isOpen || !shipment) return null;

  return (
    <div
      onMouseDown={e => {
        // Close on outside backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#080908]/75 backdrop-blur-md animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Live tracking modal for ${shipment.trackingNumber}`}
    >
      <div className="w-full max-w-4xl bg-[#171917] border border-[#2E332E] rounded-3xl shadow-2xl text-[#F7F9F4] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-[#2E332E] gap-3 bg-[#0E100E]">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-base font-bold text-[#F7F9F4] tracking-tight">
                {shipment.trackingNumber}
              </span>
              <span className="text-xs text-slate-400 font-sans font-medium">
                {shipment.carrierName}
              </span>

              {/* Simulated Live Badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#C8FF32]/10 border border-[#C8FF32]/30 text-[#C8FF32] text-[10px] font-semibold tracking-wider uppercase shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C8FF32] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C8FF32]"></span>
                </span>
                Simulated Live
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="text-slate-200 font-medium">
                {shipment.origin} <span className="text-slate-500">→</span> {shipment.destination}
              </span>
              <span className="text-slate-600">•</span>
              <div>
                {shipment.status === 'delayed' && <Badge variant="critical">Delayed</Badge>}
                {shipment.status === 'customs_hold' && <Badge variant="warning">Customs Hold</Badge>}
                {shipment.status === 'on_schedule' && <Badge variant="success">On Schedule</Badge>}
                {shipment.status === 'delivered' && <Badge variant="neutral">Delivered</Badge>}
              </div>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">
                ETA:{' '}
                <strong className="text-slate-200">
                  {new Date(shipment.estimatedDeliveryDate).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  {new Date(shipment.estimatedDeliveryDate).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </span>
              <span className="text-slate-600">•</span>
              <span>
                {shipment.delayHours > 0 ? (
                  <span className="text-amber-400 font-bold">+{shipment.delayHours}h Delay</span>
                ) : (
                  <span className="text-emerald-400 font-semibold">On Time</span>
                )}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleRecenter}
              title="Reset view bounds"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#242624] hover:bg-[#2E322E] text-[#F7F9F4] border border-[#363936] text-xs font-medium transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Fit Route</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#A0A39D] hover:text-white hover:bg-[#242624] transition-colors"
              aria-label="Close live tracking dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs">
          {/* Latest Carrier Event Ticker Banner */}
          {latestEvent && (
            <div
              className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                latestEvent.type === 'shipment_delayed'
                  ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                  : latestEvent.type === 'shipment_delivered'
                  ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                  : 'bg-sky-950/20 border-sky-900/40 text-sky-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Radio className="w-4 h-4 shrink-0 mt-0.5 text-purple-400 animate-pulse" />
                <div>
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span>{latestEvent.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-900/60 border border-slate-700/50 text-slate-300">
                      {latestEvent.type}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{latestEvent.description}</div>
                </div>
              </div>

              <div className="text-right sm:shrink-0 text-[11px] text-slate-400">
                <div>{latestEvent.location}</div>
                <div className="font-mono text-[10px] text-slate-500">{latestEvent.timestamp}</div>
              </div>
            </div>
          )}

          {/* Route Progress indicator */}
          <div className="bg-[#080908] border border-[#2B2E2B] rounded-2xl px-3 py-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Corridor Mode:</span>
              <span className="font-semibold text-white">
                {MAP_CONFIG.vehicleEmoji[shipment.transportMode]} {shipment.transportMode}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Route Progress:</span>
              <span className="font-mono text-[#C8FF32] font-bold">{progressPercent}%</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Status:</span>
              {isPaused ? (
                <span className="text-amber-400 font-medium">Paused (Mid-Route Event)</span>
              ) : (
                <span className="text-emerald-400 font-medium">Transponder Active (2.5s telemetry)</span>
              )}
            </div>
          </div>

          {/* Interactive Leaflet Map Container */}
          <div className="relative w-full h-[430px] rounded-2xl border border-[#2B2E2B] overflow-hidden bg-[#080908]">
            {isLoading && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#080908]/75 backdrop-blur-md text-slate-300 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#C8FF32]" />
                <span className="text-xs font-medium">Computing route geometry and telemetry...</span>
              </div>
            )}

            {error && (
              <div className="absolute top-3 left-3 right-3 z-30 p-2.5 rounded bg-rose-950/80 border border-rose-800/80 text-rose-200 flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* The Leaflet Map DOM Element with explicit height */}
            <div
              ref={mapContainerRef}
              className="w-full h-[430px]"
              style={{ height: '430px', minHeight: '430px', width: '100%' }}
            />

            {/* Visual Legend Overlay */}
            <div className="absolute bottom-3 left-3 z-20 bg-[#171917]/90 border border-[#363936] rounded-xl p-2.5 text-[10px] text-slate-300 flex items-center gap-3 backdrop-blur-xs shadow-lg">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C8FF32] inline-block"></span>
                <span>Origin</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                <span>Destination</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{MAP_CONFIG.vehicleEmoji[shipment.transportMode]}</span>
                <span>Telematic Marker</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
