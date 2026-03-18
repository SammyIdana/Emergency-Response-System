/**
 * Haversine formula — calculates straight-line distance between two lat/lng points in kilometers.
 */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Determines which responder type to use based on incident type.
 */
function getResponderTypeForIncident(incidentType) {
    switch (incidentType) {
        case 'medical': return ['ambulance'];
        case 'fire': return ['fire'];
        case 'crime': return ['police'];
        case 'accident': return ['ambulance', 'police']; // dispatch both
        case 'other': return null; // manual assignment
        default: return null;
    }
}

/**
 * Selects the nearest available responder unit from a list.
 * For medical emergencies, also validates hospital bed availability.
 */
function selectNearestResponder(units, incidentLat, incidentLng, incidentType) {
    let candidates = units.filter((u) => u.is_available);

    if (incidentType === 'medical' || incidentType === 'accident') {
        candidates = candidates.filter((u) => {
            if (u.unit_type !== 'ambulance') return true; // non-ambulance units not filtered
            return u.available_beds > 0;
        });
    }

    if (!candidates.length) return null;

    return candidates
        .map((u) => ({
            ...u,
            distance_km: haversine(incidentLat, incidentLng, parseFloat(u.latitude), parseFloat(u.longitude)),
        }))
        .sort((a, b) => a.distance_km - b.distance_km)[0];
}

module.exports = { haversine, getResponderTypeForIncident, selectNearestResponder };
