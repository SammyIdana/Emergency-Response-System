/**
 * Ghana Region Detector
 * Detects which of Ghana's 16 regions a coordinate falls in
 * using bounding box polygons for each region.
 * 
 * Usage: const { detectGhanaRegion } = require('./ghanaRegions');
 *        const region = detectGhanaRegion(5.5502, -0.2174); // → "Greater Accra"
 */

// Ghana's 16 regions with approximate bounding boxes and center points
// Format: { name, minLat, maxLat, minLng, maxLng, center }
const GHANA_REGIONS = [
  {
    name: 'Greater Accra',
    minLat: 5.4500, maxLat: 5.9500,
    minLng: -0.5500, maxLng: 0.1000,
  },
  {
    name: 'Ashanti',
    minLat: 6.0000, maxLat: 7.5000,
    minLng: -2.5000, maxLng: -0.8000,
  },
  {
    name: 'Western',
    minLat: 4.5000, maxLat: 6.5000,
    minLng: -3.2000, maxLng: -1.9000,
  },
  {
    name: 'Western North',
    minLat: 5.8000, maxLat: 7.2000,
    minLng: -3.2000, maxLng: -2.4000,
  },
  {
    name: 'Central',
    minLat: 5.0000, maxLat: 6.2000,
    minLng: -2.0000, maxLng: -0.5000,
  },
  {
    name: 'Eastern',
    minLat: 5.8000, maxLat: 7.2000,
    minLng: -1.2000, maxLng: 0.2000,
  },
  {
    name: 'Volta',
    minLat: 5.7000, maxLat: 8.7000,
    minLng: -0.2000, maxLng: 1.2000,
  },
  {
    name: 'Oti',
    minLat: 7.8000, maxLat: 9.2000,
    minLng: -0.1000, maxLng: 0.9000,
  },
  {
    name: 'Bono',
    minLat: 7.0000, maxLat: 8.5000,
    minLng: -2.8000, maxLng: -1.5000,
  },
  {
    name: 'Bono East',
    minLat: 7.5000, maxLat: 9.0000,
    minLng: -1.8000, maxLng: -0.5000,
  },
  {
    name: 'Ahafo',
    minLat: 6.8000, maxLat: 7.8000,
    minLng: -2.8000, maxLng: -2.0000,
  },
  {
    name: 'Northern',
    minLat: 9.0000, maxLat: 10.7000,
    minLng: -2.8000, maxLng: -0.2000,
  },
  {
    name: 'Savannah',
    minLat: 8.5000, maxLat: 10.5000,
    minLng: -2.8000, maxLng: -1.5000,
  },
  {
    name: 'North East',
    minLat: 10.0000, maxLat: 11.0000,
    minLng: -0.8000, maxLng: 0.5000,
  },
  {
    name: 'Upper East',
    minLat: 10.5000, maxLat: 11.2000,
    minLng: -1.2000, maxLng: 0.6000,
  },
  {
    name: 'Upper West',
    minLat: 9.8000, maxLat: 11.2000,
    minLng: -2.8000, maxLng: -1.5000,
  },
];

/**
 * Detect which Ghana region a coordinate falls in.
 * Falls back to nearest region centroid if no exact match.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string} Region name e.g. "Greater Accra"
 */
function detectGhanaRegion(latitude, longitude) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) return 'Unknown';

  // First pass: exact bounding box match
  const match = GHANA_REGIONS.find(r =>
    lat >= r.minLat && lat <= r.maxLat &&
    lng >= r.minLng && lng <= r.maxLng
  );

  if (match) return match.name;

  // Second pass: find nearest region by center distance
  // (handles edge cases near borders)
  const centers = {
    'Greater Accra': { lat: 5.6037, lng: -0.1870 },
    'Ashanti':       { lat: 6.7470, lng: -1.5209 },
    'Western':       { lat: 5.1390, lng: -2.4675 },
    'Western North': { lat: 6.3000, lng: -2.8000 },
    'Central':       { lat: 5.5557, lng: -1.0584 },
    'Eastern':       { lat: 6.5720, lng: -0.4600 },
    'Volta':         { lat: 6.5700, lng: 0.4500  },
    'Oti':           { lat: 8.4000, lng: 0.3000  },
    'Bono':          { lat: 7.7500, lng: -2.2000 },
    'Bono East':     { lat: 8.0000, lng: -1.1000 },
    'Ahafo':         { lat: 7.3000, lng: -2.3500 },
    'Northern':      { lat: 9.5000, lng: -1.0000 },
    'Savannah':      { lat: 9.0000, lng: -2.0000 },
    'North East':    { lat: 10.5000, lng: -0.2000 },
    'Upper East':    { lat: 10.7000, lng: -0.3000 },
    'Upper West':    { lat: 10.2500, lng: -2.1000 },
  };

  let nearest = 'Greater Accra';
  let minDist = Infinity;

  for (const [region, center] of Object.entries(centers)) {
    const dist = Math.sqrt(
      Math.pow(lat - center.lat, 2) +
      Math.pow(lng - center.lng, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = region;
    }
  }

  return nearest;
}

/**
 * Get all 16 Ghana region names
 */
function getAllRegions() {
  return GHANA_REGIONS.map(r => r.name);
}

module.exports = { detectGhanaRegion, getAllRegions, GHANA_REGIONS };
