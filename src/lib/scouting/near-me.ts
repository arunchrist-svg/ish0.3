import { SCOUT_CITIES, type ScoutCity } from "@/lib/scouting-data";

const CITY_COORDS: Record<ScoutCity, { lat: number; lng: number }> = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mysore: { lat: 12.2958, lng: 76.6394 },
  Mangalore: { lat: 12.9141, lng: 74.856 },
  Hubli: { lat: 15.3647, lng: 75.124 },
  Tumkur: { lat: 13.3379, lng: 77.1172 },
  Hassan: { lat: 13.0072, lng: 76.0962 },
  Belgaum: { lat: 15.8497, lng: 74.4977 },
  Davanagere: { lat: 14.4644, lng: 75.9218 },
  Shivamogga: { lat: 13.9299, lng: 75.5681 },
  Bellary: { lat: 15.1394, lng: 76.9214 },
  Udupi: { lat: 13.3409, lng: 74.7421 },
  Hosur: { lat: 12.7409, lng: 77.8253 },
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function findNearestScoutCity(lat: number, lng: number): ScoutCity {
  let best: ScoutCity = SCOUT_CITIES[0];
  let bestDist = Infinity;
  for (const city of SCOUT_CITIES) {
    const coords = CITY_COORDS[city];
    const d = haversineKm({ lat, lng }, coords);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return best;
}
