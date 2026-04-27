import { Polyline } from 'react-leaflet'
import polyline from '@mapbox/polyline'

export default function RoadRoute({ waypoints, geometryEncoded, color = '#22c55e', opacity = 0.8 }) {
  let positions

  if (geometryEncoded) {
    try {
      positions = polyline.decode(geometryEncoded) // [[lat, lng], ...]
    } catch {
      positions = null
    }
  }

  if (!positions?.length) {
    if (!waypoints?.length || waypoints.length < 2) return null
    positions = waypoints.map(wp => [wp.lat, wp.lng])
  }

  return (
    <>
      {/* Glow layer */}
      <Polyline
        positions={positions}
        pathOptions={{ color, weight: 6, opacity: 0.2 }}
      />
      {/* Main line */}
      <Polyline
        positions={positions}
        pathOptions={{ color, weight: 2.5, opacity, dashArray: '8, 6' }}
      />
    </>
  )
}
