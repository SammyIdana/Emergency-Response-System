import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * A high-fidelity map component using Leaflet with a premium dark theme.
 * Replaces the Google Maps requirement while maintaining aesthetic excellence.
 */
export default function UniversalMapComponent({ 
  center = { lat: 5.6037, lng: -0.1870 }, // Accra
  zoom = 13, 
  markers = [], 
  onMapClick = null,
  className = ""
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom: zoom,
      zoomControl: false,
      attributionControl: false
    });

    // High-fidelity Voyager Theme (Better legibility than DarkMatter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add new markers
    markers.forEach(m => {
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        fillColor: m.color || "#f97316",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map).bindPopup(m.title);
      
      markersRef.current.push(marker);
    });
  }, [markers]);

  // Update View
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([center.lat, center.lng], zoom, { duration: 1 });
  }, [center.lat, center.lng, zoom]);

  return (
    <div 
      ref={mapContainerRef} 
      className={`bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 ${className}`} 
      style={{ width: '100%', height: '100%', minHeight: '400px' }} 
    />
  );
}
