import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-routing-machine'

export default function RoadRoute({ waypoints, color = '#22c55e' }) {
  const map = useMap()

  useEffect(() => {
    if (!waypoints?.length || waypoints.length < 2) return

    const control = L.Routing.control({
      waypoints: waypoints.map(wp => L.latLng(wp.lat, wp.lng)),
      routeWhileDragging: false,
      show: false,
      addWaypoints: false,
      fitSelectedRoutes: false,
      lineOptions: {
        styles: [{ color, weight: 3, opacity: 0.7, dashArray: '6, 10' }]
      },
      createMarker: () => null,  // no extra markers at each waypoint
      containerClassName: 'hidden-routing-panel'
    }).addTo(map)

    return () => map.removeControl(control)
  }, [map, waypoints, color])

  return null
}

