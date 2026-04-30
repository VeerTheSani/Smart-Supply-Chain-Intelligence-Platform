import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function LocationAutocomplete({ 
  placeholder, 
  value, 
  onChange, 
  error,
  name 
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced fetch for suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length < 3) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await response.json();
        setSuggestions(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    // Use a small timeout to avoid spamming the API on every keystroke
    const timeoutId = setTimeout(() => {
      fetchSuggestions();
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (suggestion) => {
    const formattedName = suggestion.display_name.split(',').slice(0, 3).join(', ');
    setQuery(formattedName);
    onChange(formattedName); // Send back to react-hook-form
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value); // keep form in sync even if not selected
          }}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          className={cn(
            'w-full bg-theme-tertiary border text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all',
            error ? 'border-danger' : 'border-theme'
          )}
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute right-3 top-3.5">
            <Loader2 className="w-4 h-4 text-theme-secondary animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 border border-theme rounded-xl shadow-2xl py-1 overflow-hidden" style={{ background: 'var(--dropdown-bg, #1a1a1a)' }}>
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.place_id}
              onClick={() => handleSelect(suggestion)}
              className="px-4 py-2 cursor-pointer flex items-start gap-3 transition-colors" style={{ }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'} onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <MapPin className="w-4 h-4 text-theme-secondary mt-0.5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-theme-primary">
                  {suggestion.display_name.split(',')[0]}
                </span>
                <span className="text-xs text-theme-secondary line-clamp-1">
                  {suggestion.display_name.split(',').slice(1).join(', ').trim()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
