export type GeoPosition = { latitude: number; longitude: number };

export async function getCurrentPosition(): Promise<GeoPosition> {
  if (typeof window === "undefined") {
    throw new Error("Geolocation unavailable");
  }

  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== "granted") throw new Error("Location permission denied");
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (e) => reject(new Error(e.message || "Could not get location")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
