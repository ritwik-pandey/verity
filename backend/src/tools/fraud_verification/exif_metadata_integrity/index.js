import exifr from "exifr";
import "dotenv/config";

const MAX_AGE_HOURS = Number(process.env.EXIF_MAX_AGE_HOURS || 48);
const DISASTER_LAT = Number(process.env.DISASTER_LAT);
const DISASTER_LNG = Number(process.env.DISASTER_LNG);
const RADIUS_KM = Number(process.env.DISASTER_RADIUS_KM || 50);

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

export async function checkExifIntegrity(imageBuffer) {
  const data = await exifr.parse(imageBuffer, { gps: true, tiff: true });

  const result = {
    hasGps: false,
    hasTimestamp: false,
    withinBounds: null,
    withinAgeLimit: null,
    hardFail: false,
    reasons: [],
  };

  if (!data) {
    result.hardFail = true;
    result.reasons.push("No EXIF data found (possible screenshot/edited image)");
    return result;
  }

  if (data.DateTimeOriginal) {
    result.hasTimestamp = true;
    const ageHours = (Date.now() - new Date(data.DateTimeOriginal).getTime()) / 36e5;
    result.withinAgeLimit = ageHours <= MAX_AGE_HOURS;
    if (!result.withinAgeLimit) {
      result.hardFail = true;
      result.reasons.push(`Image timestamp is ${ageHours.toFixed(1)}h old, exceeds ${MAX_AGE_HOURS}h limit`);
    }
  } else {
    result.reasons.push("No timestamp in EXIF");
  }

  if (data.latitude && data.longitude) {
    result.hasGps = true;
    const distKm = haversineKm(DISASTER_LAT, DISASTER_LNG, data.latitude, data.longitude);
    result.withinBounds = distKm <= RADIUS_KM;
    if (!result.withinBounds) {
      result.hardFail = true;
      result.reasons.push(`GPS is ${distKm.toFixed(1)}km from disaster zone, exceeds ${RADIUS_KM}km bound`);
    }
  } else {
    result.reasons.push("No GPS data in EXIF");
  }

  return result;
}