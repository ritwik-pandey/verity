import exifr from "exifr";
import "dotenv/config";

const MAX_AGE_HOURS = Number(process.env.EXIF_MAX_AGE_HOURS || 48);
const DISASTER_LAT = Number(process.env.DISASTER_LAT);
const DISASTER_LNG = Number(process.env.DISASTER_LNG);
const RADIUS_KM = Number(process.env.DISASTER_RADIUS_KM || 50);
const DISASTER_GEOFENCE = process.env.DISASTER_GEOFENCE || process.env.DISASTER_GEOJSON || process.env.DISASTER_POLYGON || "";
const SOFTWARE_INDICATORS = [
  "photoshop",
  "canva",
  "lightroom",
  "snapseed",
  "pixlr",
  "adobe",
  "fotor",
  "illustrator",
  "gimp",
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasValidCoordinates(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}

function parseExifDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})\s+/, "$1-$2-$3T");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function normalizeGeoFenceConfig() {
  const candidates = [DISASTER_GEOFENCE, process.env.DISASTER_GEOJSON, process.env.DISASTER_GEOFENCE, process.env.DISASTER_POLYGON];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
      const zones = extractZones(parsed);
      if (zones.length > 0) {
        return {
          configured: true,
          mode: "geojson",
          zoneCount: zones.length,
          zones,
        };
      }
    } catch {
      // Ignore malformed configured zone values
    }
  }

  if (Number.isFinite(DISASTER_LAT) && Number.isFinite(DISASTER_LNG)) {
    return {
      configured: true,
      mode: "legacy-radius",
      zoneCount: 1,
      zones: [{ type: "circle", center: [DISASTER_LNG, DISASTER_LAT], radiusKm: RADIUS_KM }],
    };
  }

  return {
    configured: false,
    mode: "none",
    zoneCount: 0,
    zones: [],
  };
}

function extractZones(value) {
  if (!value) return [];

  const zones = [];

  const pushZone = (zone) => {
    if (zone) zones.push(zone);
  };

  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0]) && Number.isFinite(Number(value[0][0]))) {
      pushZone({ type: "polygon", coordinates: [value] });
      return zones;
    }

    for (const item of value) {
      zones.push(...extractZones(item));
    }
    return zones;
  }

  if (typeof value !== "object") return zones;

  if (value.type === "FeatureCollection") {
    for (const feature of value.features || []) {
      pushZone(extractFeatureGeometry(feature));
    }
    return zones;
  }

  if (value.type === "Feature") {
    pushZone(extractFeatureGeometry(value));
    return zones;
  }

  if (value.type === "Polygon") {
    pushZone({ type: "polygon", coordinates: value.coordinates });
    return zones;
  }

  if (value.type === "MultiPolygon") {
    for (const polygon of value.coordinates || []) {
      pushZone({ type: "polygon", coordinates: polygon });
    }
    return zones;
  }

  if (value.type === "GeometryCollection") {
    for (const geometry of value.geometries || []) {
      zones.push(...extractZones(geometry));
    }
    return zones;
  }

  if (value.minLat != null && value.maxLat != null && value.minLng != null && value.maxLng != null) {
    pushZone({
      type: "bbox",
      minLat: Number(value.minLat),
      maxLat: Number(value.maxLat),
      minLng: Number(value.minLng),
      maxLng: Number(value.maxLng),
    });
  }

  return zones;
}

function extractFeatureGeometry(feature) {
  if (!feature || !feature.geometry) return null;

  const geometry = feature.geometry;

  if (geometry.type === "Polygon") {
    return { type: "polygon", coordinates: geometry.coordinates };
  }

  if (geometry.type === "MultiPolygon") {
    return { type: "multiPolygon", coordinates: geometry.coordinates };
  }

  if (geometry.type === "BBox") {
    return {
      type: "bbox",
      minLat: Number(geometry.minLat),
      maxLat: Number(geometry.maxLat),
      minLng: Number(geometry.minLng),
      maxLng: Number(geometry.maxLng),
    };
  }

  return null;
}

function pointInPolygon(point, polygonCoords) {
  const rings = Array.isArray(polygonCoords[0]) && Array.isArray(polygonCoords[0][0]) ? polygonCoords : [polygonCoords];

  return rings.some((ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return false;

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];

      const intersects =
        yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  });
}

function isPointInZone(point, zone) {
  if (!point || !zone || !hasValidCoordinates(point.lat, point.lng)) {
    return false;
  }

  if (zone.type === "bbox") {
    return (
      point.lat >= zone.minLat &&
      point.lat <= zone.maxLat &&
      point.lng >= zone.minLng &&
      point.lng <= zone.maxLng
    );
  }

  if (zone.type === "circle") {
    const distKm = haversineKm(point.lat, point.lng, zone.center[1], zone.center[0]);
    return distKm <= zone.radiusKm;
  }

  if (zone.type === "polygon") {
    return pointInPolygon(point, zone.coordinates);
  }

  if (zone.type === "multiPolygon") {
    return (zone.coordinates || []).some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function getGpsPoint(data) {
  if (!data || !hasValidCoordinates(data.latitude, data.longitude)) {
    return null;
  }

  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
  };
}

function extractSoftwareIndicators(data) {
  const candidates = [
    data.Software,
    data.SoftwareVersion,
    data.ImageDescription,
    data.ProcessingSoftware,
    data.Artist,
    data.Creator,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const detected = SOFTWARE_INDICATORS.filter((indicator) => candidates.includes(indicator));
  return [...new Set(detected)];
}

export async function checkExifIntegrity(imageBuffer) {
  let data;

  try {
    data = await exifr.parse(imageBuffer, { gps: true, tiff: true, exif: true, ifd0: true, interop: true });
  } catch (error) {
    return {
      hasGps: false,
      gps: null,
      hasTimestamp: false,
      timestamp: null,
      withinBounds: null,
      withinAgeLimit: null,
      hardFail: false,
      missingExif: true,
      reasons: [`Unable to parse EXIF metadata: ${error.message || "unknown file format"}`],
      metadataWarnings: ["No readable EXIF metadata"],
      tamperingIndicators: [],
      softwareEditingDetected: false,
      geofence: {
        configured: normalizeGeoFenceConfig().configured,
        mode: normalizeGeoFenceConfig().mode,
        zoneCount: normalizeGeoFenceConfig().zoneCount,
        withinBounds: null,
      },
    };
  }

  const geofenceConfig = normalizeGeoFenceConfig();
  const gpsPoint = getGpsPoint(data);
  const timestampResult = (() => {
    const rawTimestamp = data?.DateTimeOriginal || data?.CreateDate || data?.DateTimeDigitized || data?.ModifyDate;
    const parsedDate = parseExifDate(rawTimestamp);

    if (!parsedDate) {
      return {
        timestamp: null,
        hasTimestamp: false,
        withinAgeLimit: null,
      };
    }

    const ageHours = (Date.now() - parsedDate.getTime()) / 36e5;

    return {
      timestamp: parsedDate.toISOString(),
      hasTimestamp: true,
      withinAgeLimit: ageHours <= MAX_AGE_HOURS,
      ageHours,
    };
  })();

  const result = {
    hasGps: Boolean(gpsPoint),
    gps: gpsPoint,
    hasTimestamp: timestampResult.hasTimestamp,
    timestamp: timestampResult.timestamp,
    withinBounds: null,
    withinAgeLimit: timestampResult.withinAgeLimit,
    hardFail: false,
    missingExif: false,
    reasons: [],
    metadataWarnings: [],
    tamperingIndicators: [],
    softwareEditingDetected: false,
    geofence: {
      configured: geofenceConfig.configured,
      mode: geofenceConfig.mode,
      zoneCount: geofenceConfig.zoneCount,
      withinBounds: null,
    },
  };

  if (!data) {
    result.hardFail = false;
    result.missingExif = true;
    result.reasons.push("No EXIF metadata attached (common for web downloads, messaging apps, or screenshots)");
    result.metadataWarnings.push("Missing camera EXIF metadata");
    return result;
  }

  if (result.hasTimestamp) {
    if (!result.withinAgeLimit) {
      result.hardFail = true;
      result.reasons.push(
        `Image timestamp is ${timestampResult.ageHours.toFixed(1)}h old, exceeds ${MAX_AGE_HOURS}h limit`
      );
    }
  } else {
    result.reasons.push("No timestamp in EXIF");
  }

  if (result.hasGps) {
    result.geofence.withinBounds = geofenceConfig.configured
      ? geofenceConfig.zones.some((zone) => isPointInZone(gpsPoint, zone))
      : null;

    if (geofenceConfig.configured && result.geofence.withinBounds === false) {
      const distances = geofenceConfig.zones
        .map((zone) => {
          if (zone.type === "circle") {
            return haversineKm(gpsPoint.latitude, gpsPoint.longitude, zone.center[1], zone.center[0]);
          }
          return null;
        })
        .filter((distance) => Number.isFinite(distance));

      const nearestDistance = distances.length > 0 ? Math.min(...distances) : null;
      if (nearestDistance != null) {
        result.hardFail = true;
        result.reasons.push(
          `GPS is ${nearestDistance.toFixed(1)}km from the configured disaster zone boundary`
        );
      } else {
        result.hardFail = true;
        result.reasons.push("GPS location falls outside the configured disaster geofence");
      }
    }
  } else {
    result.reasons.push("No GPS data in EXIF");
  }

  const detectedSoftware = extractSoftwareIndicators(data);
  if (detectedSoftware.length > 0) {
    result.softwareEditingDetected = true;
    result.hardFail = true;
    result.tamperingIndicators = detectedSoftware.map(
      (indicator) => `Editing software indicator detected: ${indicator}`
    );
    result.reasons.push(...result.tamperingIndicators);
  }

  if (!data.Make && !data.Model && !data.LensModel) {
    result.metadataWarnings.push("Missing camera make/model metadata");
  }

  if (data.Software || data.ImageDescription || data.Artist || data.Creator) {
    result.metadataWarnings.push("EXIF metadata contains editing/annotation fields that may indicate post-processing");
  }

  return result;
}