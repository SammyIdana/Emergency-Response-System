import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function LocationSearch({ onSelect, placeholder = "Search location in Ghana..." }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Toggle dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        // Photon API (OpenStreetMap) - Restricted to Ghana bounding box
        // BBox approx: -3.25, 4.72, 1.2, 11.17
        const res = await axios.get(`https://photon.komoot.io/api/`, {
            params: {
                q: query,
                limit: 5,
                lat: 5.6037, // Accra center
                lon: -0.1870,
                bbox: '-3.25,4.72,1.2,11.17'
            }
        });
        setResults(res.data.features || []);
        setIsOpen(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const name = feature.properties.name || feature.properties.street || "Selected Location";
    const city = feature.properties.city || feature.properties.state || "";
    const address = `${name} ${city ? ', ' + city : ''}`;
    
    setQuery(address);
    setResults([]);
    setIsOpen(false);
    onSelect({ lat, lng, address });
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <input
          type="text"
          className="input pl-10"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0 text-left"
            >
              <MapPin size={18} className="mt-0.5 text-orange-500 shrink-0" />
              <div>
                <div className="text-zinc-100 font-medium text-sm">
                  {r.properties.name || r.properties.street || "Unknown Place"}
                </div>
                <div className="text-zinc-500 text-xs">
                  {[r.properties.city, r.properties.district, r.properties.state].filter(Boolean).join(', ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
