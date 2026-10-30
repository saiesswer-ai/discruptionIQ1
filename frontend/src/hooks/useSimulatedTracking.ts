import { useState, useEffect, useRef } from 'react';
import { Shipment } from '../types';
import {
  resolveHubCoordinate,
  OCEAN_WAYPOINTS_YOKOHAMA_TO_ROTTERDAM,
  MAP_CONFIG,
} from '../constants/trackingConstants';
import {
  computeGreatCircleSegments,
  fetchRoadRoute,
  interpolatePositionAlongPath,
} from '../utils/geoUtils';

export interface CarrierEvent {
  id: string;
  type: 'shipment_in_transit' | 'shipment_delayed' | 'shipment_delivered';
  title: string;
  description: string;
  timestamp: string;
  location: string;
}

export interface SimulatedTrackingData {
  isLoading: boolean;
  error: string | null;
  originCoords: [number, number];
  destinationCoords: [number, number];
  routeSegments: [number, number][][];
  flatPath: [number, number][];
  currentPosition: [number, number];
  heading: number;
  progressPercent: number;
  latestEvent: CarrierEvent | null;
  events: CarrierEvent[];
  isPaused: boolean;
  isDelivered: boolean;
}

export function useSimulatedTracking(shipment: Shipment | null): SimulatedTrackingData {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [routeSegments, setRouteSegments] = useState<[number, number][][]>([]);
  const [flatPath, setFlatPath] = useState<[number, number][]>([]);
  const [progress, setProgress] = useState<number>(0.5);

  const originCoords: [number, number] = shipment ? resolveHubCoordinate(shipment.origin) : [50, 10];
  const destinationCoords: [number, number] = shipment ? resolveHubCoordinate(shipment.destination) : [51, 10];

  const trackingId = shipment?.trackingNumber || '';
  const isCustomsHold = trackingId === 'FDX-PRI-3310' || shipment?.status === 'customs_hold';
  const isDelayedMaritime = trackingId === 'MSKU-781920-4' || (shipment?.transportMode === 'Ocean' && shipment?.status === 'delayed');
  const isDelivered = trackingId === 'DBS-ROAD-119' || shipment?.status === 'delivered';
  const isPaused = isCustomsHold || isDelayedMaritime || isDelivered;

  // Build route when shipment changes
  useEffect(() => {
    if (!shipment) {
      setRouteSegments([]);
      setFlatPath([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const origin = resolveHubCoordinate(shipment.origin);
    const dest = resolveHubCoordinate(shipment.destination);

    async function loadRoute() {
      try {
        if (shipment?.transportMode === 'Ocean') {
          // MSKU-781920-4 Yokohama -> Rotterdam Maasvlakte or other sea route
          const oceanPath = OCEAN_WAYPOINTS_YOKOHAMA_TO_ROTTERDAM;
          if (isMounted) {
            setRouteSegments([oceanPath]);
            setFlatPath(oceanPath);
            // Mid-route pause for delayed maritime
            setProgress(isDelayedMaritime ? 0.64 : 0.45);
            setIsLoading(false);
          }
        } else if (shipment?.transportMode === 'Air') {
          // Great-circle arc split at antimeridian
          const { segments, rawPoints } = computeGreatCircleSegments(origin, dest, 80);
          if (isMounted) {
            setRouteSegments(segments);
            setFlatPath(rawPoints);
            // FDX-PRI-3310 paused mid-route
            setProgress(isCustomsHold ? 0.52 : 0.48);
            setIsLoading(false);
          }
        } else {
          // Road route with OSRM, fallback to straight line
          const roadPoints = await fetchRoadRoute(origin, dest);
          if (isMounted) {
            setRouteSegments([roadPoints]);
            setFlatPath(roadPoints);
            setProgress(isDelivered ? 1.0 : trackingId === 'DHL-EXP-7702' ? 0.38 : 0.45);
            setIsLoading(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error constructing shipment route:', err);
          setError('Failed to compute route geometry; using direct corridor.');
          const fallback: [number, number][] = [origin, dest];
          setRouteSegments([fallback]);
          setFlatPath(fallback);
          setProgress(0.5);
          setIsLoading(false);
        }
      }
    }

    loadRoute();

    return () => {
      isMounted = false;
    };
  }, [trackingId, shipment?.transportMode, shipment?.origin, shipment?.destination, isCustomsHold, isDelayedMaritime, isDelivered]);

  // Periodic simulation timer for moving vehicles (every 2.5s)
  useEffect(() => {
    if (isLoading || isPaused || flatPath.length < 2) return;

    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + 0.005;
        // Loop back after reaching near completion for continuous live simulation
        return next >= 0.96 ? 0.15 : next;
      });
    }, MAP_CONFIG.updateIntervalMs);

    return () => clearInterval(timer);
  }, [isLoading, isPaused, flatPath]);

  // Interpolate position and heading
  const fallbackPath: [number, number][] = [originCoords, destinationCoords];
  const { position: currentPosition, heading } = interpolatePositionAlongPath(
    flatPath.length > 0 ? flatPath : fallbackPath,
    progress
  );

  // Generate carrier events
  const latestEvent: CarrierEvent | null = shipment
    ? isDelivered
      ? {
          id: `ev-del-${shipment.id}`,
          type: 'shipment_delivered',
          title: 'Delivered to Destination',
          description: `Consignment signed and accepted at ${shipment.destination}. Proof of Delivery archived.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          location: shipment.destination,
        }
      : isCustomsHold
      ? {
          id: `ev-hold-${shipment.id}`,
          type: 'shipment_delayed',
          title: 'Customs Hold - Regulatory Clearance',
          description: `Shipment paused mid-route (+${shipment.delayHours || 24}h). Awaiting physical import clearance and tariff validation.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          location: 'Gateway Border Customs Checkpoint',
        }
      : isDelayedMaritime
      ? {
          id: `ev-delay-${shipment.id}`,
          type: 'shipment_delayed',
          title: 'Carrier Delay - Berth Berthage Queue',
          description: `Vessel speed reduced at holding coordinate (+${shipment.delayHours || 48}h delay). Terminal congestion rescheduling in progress.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          location: 'Maritime Sea Transit Anchorage',
        }
      : {
          id: `ev-transit-${shipment.id}`,
          type: 'shipment_in_transit',
          title: 'Shipment In Transit - Active Telematic Feed',
          description: `Operating on schedule. Telemetry transponder ping verified along ${shipment.transportMode.toLowerCase()} corridor.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          location: `En route to ${shipment.destination}`,
        }
    : null;

  const events = latestEvent ? [latestEvent] : [];

  return {
    isLoading,
    error,
    originCoords,
    destinationCoords,
    routeSegments,
    flatPath,
    currentPosition,
    heading,
    progressPercent: Math.round(progress * 100),
    latestEvent,
    events,
    isPaused,
    isDelivered,
  };
}
