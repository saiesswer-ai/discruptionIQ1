/**
 * Geographic and spherical geometry calculation utilities
 */

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

/**
 * Calculates bearing (heading) in degrees [0, 360) from point 1 to point 2
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * TO_RAD;
  const phi2 = lat2 * TO_RAD;
  let dLon = lon2 - lon1;

  // Handle antimeridian crossing
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;

  const dLambda = dLon * TO_RAD;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);

  return (theta * TO_DEG + 360) % 360;
}

/**
 * Great-circle spherical distance between two points in kilometers
 */
export function haversineDistanceKm(p1: [number, number], p2: [number, number]): number {
  const R = 6371; // Earth radius in km
  const dLat = (p2[0] - p1[0]) * TO_RAD;
  let dLon = p2[1] - p1[1];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLambda = dLon * TO_RAD;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1[0] * TO_RAD) * Math.cos(p2[0] * TO_RAD) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface GreatCircleResult {
  segments: [number, number][][];
  rawPoints: [number, number][];
}

/**
 * Computes a great-circle arc (50-100 points) between two points and
 * splits the polyline at the antimeridian (+/-180 deg) so trans-Pacific routes
 * (e.g. Taipei TPE -> Chicago ORD) render seamlessly without wrapping across the map.
 */
export function computeGreatCircleSegments(
  start: [number, number],
  end: [number, number],
  numPoints: number = 80
): GreatCircleResult {
  try {
    const lat1 = start[0];
    const lon1 = start[1];
    const lat2 = end[0];
    const lon2 = end[1];

    const p1 = lat1 * TO_RAD;
    const l1 = lon1 * TO_RAD;
    const p2 = lat2 * TO_RAD;
    const l2 = lon2 * TO_RAD;

    // Angular distance d between points
    let dLon = lon2 - lon1;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dLambda = dLon * TO_RAD;

    const sinHalfDLat = Math.sin((p2 - p1) / 2);
    const sinHalfDLon = Math.sin(dLambda / 2);
    const d = 2 * Math.asin(
      Math.min(
        1,
        Math.sqrt(
          sinHalfDLat * sinHalfDLat +
          Math.cos(p1) * Math.cos(p2) * sinHalfDLon * sinHalfDLon
        )
      )
    );

    if (d < 1e-6) {
      return {
        segments: [[start, end]],
        rawPoints: [start, end],
      };
    }

    const rawPoints: [number, number][] = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);

      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);

      const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * TO_DEG;
      let lon = Math.atan2(y, x) * TO_DEG;

      // Normalize longitude to [-180, 180]
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;

      rawPoints.push([lat, lon]);
    }

    // Split polyline at the antimeridian
    const segments: [number, number][][] = [];
    let currentSegment: [number, number][] = [];

    for (let i = 0; i < rawPoints.length; i++) {
      const curr = rawPoints[i];
      if (currentSegment.length === 0) {
        currentSegment.push(curr);
        continue;
      }

      const prev = currentSegment[currentSegment.length - 1];
      const prevLon = prev[1];
      const currLon = curr[1];
      const diff = currLon - prevLon;

      if (Math.abs(diff) > 180) {
        // Antimeridian crossing detected
        if (prevLon > 0 && currLon < 0) {
          // Heading East across 180 meridian (e.g. +175 -> -175)
          const currLonShifted = currLon + 360;
          const ratio = (180 - prevLon) / (currLonShifted - prevLon);
          const splitLat = prev[0] + ratio * (curr[0] - prev[0]);
          currentSegment.push([splitLat, 179.9999]);
          segments.push(currentSegment);
          currentSegment = [[splitLat, -179.9999], curr];
        } else if (prevLon < 0 && currLon > 0) {
          // Heading West across -180 meridian
          const prevLonShifted = prevLon + 360;
          const ratio = (180 - prevLonShifted) / (currLon - prevLonShifted);
          const splitLat = prev[0] + ratio * (curr[0] - prev[0]);
          currentSegment.push([splitLat, -179.9999]);
          segments.push(currentSegment);
          currentSegment = [[splitLat, 179.9999], curr];
        } else {
          segments.push(currentSegment);
          currentSegment = [curr];
        }
      } else {
        currentSegment.push(curr);
      }
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return { segments, rawPoints };
  } catch (err) {
    console.error('Failed to compute great-circle arc, falling back to straight line:', err);
    return {
      segments: [[start, end]],
      rawPoints: [start, end],
    };
  }
}

/**
 * Fetches driving geometry from public OSRM API, with a timeout fallback to a straight line
 */
export async function fetchRoadRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<[number, number][]> {
  const originLng = origin[1];
  const originLat = origin[0];
  const destLng = destination[1];
  const destLat = destination[0];

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM HTTP status ${response.status}`);
    }

    const data = await response.json();
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length > 0) {
      // OSRM returns coordinates in [lng, lat]; convert to Leaflet [lat, lng]
      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      return coords;
    }

    throw new Error('OSRM returned empty geometry');
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('OSRM route fetch failed or timed out, falling back to straight line:', error);
    return [origin, destination];
  }
}

/**
 * Interpolates vehicle position and heading along an ordered list of coordinates given progress (0.0 to 1.0)
 */
export function interpolatePositionAlongPath(
  path: [number, number][],
  progress: number
): { position: [number, number]; heading: number } {
  if (!path || path.length === 0) {
    return { position: [0, 0], heading: 0 };
  }
  if (path.length === 1) {
    return { position: path[0], heading: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Compute segment lengths
  const segmentDistances: number[] = [];
  let totalDistance = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const d = haversineDistanceKm(path[i], path[i + 1]);
    segmentDistances.push(d);
    totalDistance += d;
  }

  if (totalDistance === 0) {
    return { position: path[0], heading: 0 };
  }

  const targetDistance = clampedProgress * totalDistance;
  let accumulatedDistance = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    const segDist = segmentDistances[i];
    if (accumulatedDistance + segDist >= targetDistance || i === segmentDistances.length - 1) {
      const remainingDist = targetDistance - accumulatedDistance;
      const segFraction = segDist > 0 ? Math.max(0, Math.min(1, remainingDist / segDist)) : 0;

      const p1 = path[i];
      const p2 = path[i + 1];

      // Interpolate lat/lng
      const lat = p1[0] + segFraction * (p2[0] - p1[0]);

      // Longitude interpolation with antimeridian awareness
      let lon1 = p1[1];
      let lon2 = p2[1];
      let dLon = lon2 - lon1;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;

      let lon = lon1 + segFraction * dLon;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;

      const heading = calculateBearing(p1[0], p1[1], p2[0], p2[1]);

      return {
        position: [lat, lon],
        heading,
      };
    }

    accumulatedDistance += segDist;
  }

  const lastPoint = path[path.length - 1];
  const secondLast = path[path.length - 2];
  return {
    position: lastPoint,
    heading: calculateBearing(secondLast[0], secondLast[1], lastPoint[0], lastPoint[1]),
  };
}
