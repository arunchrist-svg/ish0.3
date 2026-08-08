import { SCOUT_CITIES, type ScoutCity } from "@/lib/scouting-data";

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Mysore: { lat: 12.2958, lng: 76.6394 },
  Mysuru: { lat: 12.2958, lng: 76.6394 },
  Mangalore: { lat: 12.9141, lng: 74.856 },
  Mangaluru: { lat: 12.9141, lng: 74.856 },
  Hubli: { lat: 15.3647, lng: 75.124 },
  Hubballi: { lat: 15.3647, lng: 75.124 },
  Tumkur: { lat: 13.3379, lng: 77.1172 },
  Tumakuru: { lat: 13.3379, lng: 77.1172 },
  Hassan: { lat: 13.0072, lng: 76.0962 },
  Belgaum: { lat: 15.8497, lng: 74.4977 },
  Belagavi: { lat: 15.8497, lng: 74.4977 },
  Davanagere: { lat: 14.4644, lng: 75.9218 },
  Shivamogga: { lat: 13.9299, lng: 75.5681 },
  Bellary: { lat: 15.1394, lng: 76.9214 },
  Ballari: { lat: 15.1394, lng: 76.9214 },
  Udupi: { lat: 13.3409, lng: 74.7421 },
  Hosur: { lat: 12.7409, lng: 77.8253 },
  Krishnagiri: { lat: 12.5186, lng: 78.2137 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  "New Delhi": { lat: 28.6139, lng: 77.209 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Kochi: { lat: 9.9312, lng: 76.2673 },
  Coimbatore: { lat: 11.0168, lng: 76.9558 },
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
  return (findNearestScoutLocation(lat, lng, [...SCOUT_CITIES]) ?? SCOUT_CITIES[0]) as ScoutCity;
}

export function findNearestScoutLocation(
  lat: number,
  lng: number,
  candidates: string[],
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const label of candidates) {
    const coords = CITY_COORDS[label];
    if (!coords) continue;
    const d = haversineKm({ lat, lng }, coords);
    if (d < bestDist) {
      bestDist = d;
      best = label;
    }
  }
  return best;
}
