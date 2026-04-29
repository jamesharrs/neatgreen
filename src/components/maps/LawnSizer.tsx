'use client'
// src/components/maps/LawnSizer.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { getGardenSizeFromArea, GardenSize, GARDEN_PRICES, formatPrice } from '@/types'

interface LawnSizerProps {
  address: string
  postcode: string
  onMeasured: (data: {
    areaM2: number
    gardenSize: GardenSize
    priceInPence: number
    lat: number
    lng: number
  }) => void
}

export default function LawnSizer({ address, postcode, onMeasured }: LawnSizerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null)
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null)
  const [areaM2, setAreaM2] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'drawing' | 'measured'>('loading')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
      libraries: ['drawing', 'geometry', 'places'],
    })

    loader.load().then(async (google) => {
      if (!mapRef.current) return

      // Geocode the address
      const geocoder = new google.maps.Geocoder()
      const fullAddress = `${address}, ${postcode}, UK`

      geocoder.geocode({ address: fullAddress }, (results, gStatus) => {
        if (gStatus !== 'OK' || !results?.[0]) {
          setStatus('ready')
          return
        }

        const location = results[0].geometry.location
        const lat = location.lat()
        const lng = location.lng()
        setCoords({ lat, lng })

        const mapInstance = new google.maps.Map(mapRef.current!, {
          center: { lat, lng },
          zoom: 20,
          mapTypeId: 'satellite',
          tilt: 0,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        })

        // Drawing manager for polygon
        const dm = new google.maps.drawing.DrawingManager({
          drawingMode: google.maps.drawing.OverlayType.POLYGON,
          drawingControl: false,
          polygonOptions: {
            fillColor: '#2dba60',
            fillOpacity: 0.35,
            strokeColor: '#2dba60',
            strokeWeight: 2,
            clickable: true,
            editable: true,
            zIndex: 1,
          },
        })

        dm.setMap(mapInstance)

        google.maps.event.addListener(dm, 'polygoncomplete', (poly: google.maps.Polygon) => {
          dm.setDrawingMode(null)
          setPolygon(poly)

          const area = google.maps.geometry.spherical.computeArea(poly.getPath())
          const rounded = Math.round(area * 10) / 10
          setAreaM2(rounded)
          setStatus('measured')

          const size = getGardenSizeFromArea(rounded)
          const price = GARDEN_PRICES[size]
          onMeasured({ areaM2: rounded, gardenSize: size, priceInPence: price, lat, lng })

          // Update area when polygon is edited
          poly.getPath().addListener('set_at', () => {
            const newArea = google.maps.geometry.spherical.computeArea(poly.getPath())
            const newRounded = Math.round(newArea * 10) / 10
            setAreaM2(newRounded)
            const newSize = getGardenSizeFromArea(newRounded)
            onMeasured({ areaM2: newRounded, gardenSize: newSize, priceInPence: GARDEN_PRICES[newSize], lat, lng })
          })
          poly.getPath().addListener('insert_at', () => {
            const newArea = google.maps.geometry.spherical.computeArea(poly.getPath())
            const newRounded = Math.round(newArea * 10) / 10
            setAreaM2(newRounded)
            const newSize = getGardenSizeFromArea(newRounded)
            onMeasured({ areaM2: newRounded, gardenSize: newSize, priceInPence: GARDEN_PRICES[newSize], lat, lng })
          })
        })

        setMap(mapInstance)
        setDrawingManager(dm)
        setStatus('ready')
      })
    })
  }, [address, postcode])

  const resetDrawing = useCallback(() => {
    if (polygon) {
      polygon.setMap(null)
      setPolygon(null)
    }
    if (drawingManager) {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON)
    }
    setAreaM2(null)
    setStatus('ready')
  }, [polygon, drawingManager])

  const gardenSize = areaM2 ? getGardenSizeFromArea(areaM2) : null
  const price = gardenSize ? GARDEN_PRICES[gardenSize] : null

  return (
    <div className="lawn-sizer">
      {/* Instructions */}
      <div className="sizer-instructions">
        {status === 'loading' && (
          <div className="sizer-status loading">
            <span className="spinner" /> Finding your property on the map...
          </div>
        )}
        {status === 'ready' && (
          <div className="sizer-status ready">
            🖱️ <strong>Draw around your lawn</strong> — click to place points, double-click to finish
          </div>
        )}
        {status === 'measured' && areaM2 && (
          <div className="sizer-status measured">
            <div className="measured-result">
              <span className="measured-area">✅ {areaM2}m² measured</span>
              <span className="measured-size">{gardenSize?.replace('_', ' ')} garden</span>
              {price && <span className="measured-price">{formatPrice(price)} per cut</span>}
            </div>
            <button onClick={resetDrawing} className="btn-redraw">↩ Redraw</button>
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapRef} className="map-container" />

      <style jsx>{`
        .lawn-sizer { display: flex; flex-direction: column; gap: 12px; }
        .map-container {
          width: 100%; height: 380px; border-radius: 12px;
          overflow: hidden; border: 2px solid #d4e8da;
          background: #eaf2eb;
        }
        .sizer-instructions { min-height: 44px; }
        .sizer-status {
          padding: 10px 14px; border-radius: 8px;
          font-size: 14px; display: flex; align-items: center;
          justify-content: space-between; gap: 12px;
        }
        .sizer-status.loading { background: #f5f5f5; color: #666; }
        .sizer-status.ready { background: #e8f5e9; color: #1a5c2a; border: 1px solid #b6f5ce; }
        .sizer-status.measured { background: #e8f5e9; color: #1a5c2a; border: 1px solid #2dba60; }
        .measured-result { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
        .measured-area { font-weight: 700; }
        .measured-size { 
          background: #1a5c2a; color: white; padding: 2px 10px;
          border-radius: 99px; font-size: 12px; font-weight: 600;
        }
        .measured-price {
          font-size: 20px; font-weight: 800; color: #1a6b35;
        }
        .btn-redraw {
          background: transparent; border: 1px solid #2dba60; color: #1a5c2a;
          padding: 6px 14px; border-radius: 99px; cursor: pointer; font-size: 13px;
          white-space: nowrap; transition: all 0.2s;
        }
        .btn-redraw:hover { background: #d4f5e0; }
        .spinner {
          width: 14px; height: 14px; border: 2px solid #ddd;
          border-top-color: #2dba60; border-radius: 50%;
          animation: spin 0.7s linear infinite; display: inline-block;
          margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
