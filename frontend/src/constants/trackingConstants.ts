/**
 * Constants for Live Location Tracking and Map Rendering
 */

export const LIVE_TRACKING_TRACKING_IDS: readonly string[] = [
  'DBS-ROAD-119',
  'DHL-EX-00918',
  'KAL-CARGO-802',
  'FDX-PRI-3310',
  'DHL-EXP-7702',
  'MSKU-781920-4',
];

/** Real coordinates [latitude, longitude] for hubs and ports */
export const HUB_COORDINATES: Record<string, [number, number]> = {
  // Road & Inland Hubs
  stuttgart: [48.7758, 9.1829],
  'stuttgart hub': [48.7758, 9.1829],
  'frankfurt cargocity': [50.0333, 8.5706],
  munich: [48.1351, 11.582],
  'munich logistics park': [48.1351, 11.582],
  'rotterdam central hub': [51.9244, 4.4777],
  nuremberg: [49.4521, 11.0767],
  'nuremberg tech center': [49.4521, 11.0767],

  // Airports
  'seoul incheon icn': [37.4602, 126.4407],
  'seoul icn': [37.4602, 126.4407],
  'frankfurt fra hub': [50.0379, 8.5622],
  'frankfurt fra': [50.0379, 8.5622],
  'taipei taoyuan tpe': [25.0797, 121.2342],
  'taipei tpe': [25.0797, 121.2342],
  "chicago o'hare ord": [41.9742, -87.9073],
  'chicago ord': [41.9742, -87.9073],

  // Maritime Ports
  'port of yokohama': [35.4437, 139.638],
  'rotterdam maasvlakte': [51.9566, 4.015],
  'port of kaohsiung': [22.6163, 120.2812],
  'port of busan': [35.1017, 129.0403],
};

/**
 * Resolves a hub/port name to [lat, lng].
 * Falls back to fuzzy token matching or default coordinates.
 */
export function resolveHubCoordinate(name: string): [number, number] {
  if (!name) return [50.0, 10.0];
  const cleaned = name.trim().toLowerCase();

  if (HUB_COORDINATES[cleaned]) {
    return HUB_COORDINATES[cleaned];
  }

  // Token matching
  for (const [key, coord] of Object.entries(HUB_COORDINATES)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return coord;
    }
  }

  if (cleaned.includes('stuttgart')) return HUB_COORDINATES['stuttgart'];
  if (cleaned.includes('cargocity') || cleaned.includes('frankfurt cargo')) return HUB_COORDINATES['frankfurt cargocity'];
  if (cleaned.includes('munich')) return HUB_COORDINATES['munich'];
  if (cleaned.includes('rotterdam central')) return HUB_COORDINATES['rotterdam central hub'];
  if (cleaned.includes('incheon') || cleaned.includes('icn') || cleaned.includes('seoul')) return HUB_COORDINATES['seoul incheon icn'];
  if (cleaned.includes('frankfurt fra') || cleaned.includes('fra hub')) return HUB_COORDINATES['frankfurt fra hub'];
  if (cleaned.includes('taipei') || cleaned.includes('tpe') || cleaned.includes('taoyuan')) return HUB_COORDINATES['taipei taoyuan tpe'];
  if (cleaned.includes('chicago') || cleaned.includes('ord') || cleaned.includes("o'hare")) return HUB_COORDINATES["chicago o'hare ord"];
  if (cleaned.includes('nuremberg')) return HUB_COORDINATES['nuremberg'];
  if (cleaned.includes('yokohama')) return HUB_COORDINATES['port of yokohama'];
  if (cleaned.includes('maasvlakte')) return HUB_COORDINATES['rotterdam maasvlakte'];
  if (cleaned.includes('rotterdam')) return HUB_COORDINATES['rotterdam central hub'];

  return [51.5, 5.0];
}

/**
 * Maritime sea route waypoints: Yokohama -> Taiwan Strait -> Singapore/Malacca ->
 * Colombo -> Bab-el-Mandeb -> Suez -> Gibraltar -> English Channel -> Rotterdam Maasvlakte
 */
export const OCEAN_WAYPOINTS_YOKOHAMA_TO_ROTTERDAM: [number, number][] = [
  [35.4437, 139.638], // Yokohama Port
  [34.8, 139.75], // Uraga Channel / Tokyo Bay Exit
  [33.8, 137.5], // Enshu Nada / South of Honshu
  [32.8, 134.0], // South of Shikoku
  [30.5, 130.5], // Osumi Strait
  [28.0, 126.0], // East China Sea
  [25.5, 122.5], // North of Taiwan
  [24.5, 119.8], // Taiwan Strait
  [21.5, 117.0], // South China Sea entrance
  [18.0, 114.5], // South China Sea Central Basin
  [13.5, 111.5], // East of Vietnam
  [8.5, 108.5], // South of Con Son
  [4.0, 105.5], // Peninsular Malaysia approaches
  [1.25, 103.8], // Singapore Strait / Malacca
  [2.2, 102.1], // Strait of Malacca (Malacca)
  [3.8, 100.5], // Strait of Malacca (Port Klang)
  [5.5, 97.5], // North exit of Malacca Strait
  [6.0, 93.0], // Nicobar channel
  [5.8, 85.0], // Southern Bay of Bengal
  [5.8, 80.5], // South of Dondra Head, Sri Lanka
  [6.93, 79.84], // Colombo Port approach
  [8.0, 75.0], // Arabian Sea crossing
  [10.5, 65.0], // Central Arabian Sea
  [12.5, 55.0], // Socotra approach
  [12.0, 48.0], // Gulf of Aden East
  [12.3, 45.0], // Gulf of Aden West
  [12.6, 43.3], // Bab-el-Mandeb Strait
  [15.0, 41.8], // Southern Red Sea
  [19.0, 39.5], // Central Red Sea
  [24.0, 36.5], // Northern Red Sea
  [27.5, 34.0], // Gulf of Suez entrance
  [29.97, 32.56], // Suez Canal South (Port Tawfiq)
  [30.6, 32.35], // Bitter Lakes
  [31.25, 32.3], // Port Said (Suez North)
  [32.5, 31.0], // Mediterranean Levant
  [34.0, 25.0], // South of Crete
  [35.5, 18.0], // Ionian Sea
  [37.0, 11.5], // Strait of Sicily
  [37.8, 8.0], // South of Sardinia
  [37.5, 1.0], // Western Mediterranean
  [36.5, -2.5], // Alboran Sea
  [35.95, -5.6], // Strait of Gibraltar
  [36.5, -8.0], // Gulf of Cadiz
  [37.0, -9.5], // Cape St. Vincent
  [40.5, -9.8], // Off Central Portugal
  [43.2, -9.5], // Cape Finisterre
  [45.5, -7.5], // Bay of Biscay shipping lane
  [48.0, -5.8], // Off Ushant, Brittany
  [49.5, -3.5], // English Channel West
  [50.2, -0.5], // English Channel Central
  [51.1, 1.6], // Strait of Dover
  [51.75, 2.8], // Southern North Sea transit lane
  [51.98, 3.85], // Maas Approach Fairway
  [51.9566, 4.015], // Rotterdam Maasvlakte Terminal
];

export const MAP_CONFIG = {
  // Leaflet + OpenStreetMap dark theme tile provider (CartoDB Dark Matter, open & free)
  tileLayerUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  fallbackTileLayerUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
  fallbackAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',

  // Animation update frequency (every 2.5 seconds)
  updateIntervalMs: 2500,

  // Mode specific colors matching current dark UI
  colors: {
    road: '#10b981', // emerald-500
    air: '#a855f7', // purple-500
    ocean: '#38bdf8', // sky-400
    origin: '#10b981', // emerald-500
    destination: '#f43f5e', // rose-500
    routeGlow: '#020617',
  },

  // Vehicle emojis
  vehicleEmoji: {
    Road: '🚚',
    Air: '✈️',
    Ocean: '🚢',
  } as Record<string, string>,
};
