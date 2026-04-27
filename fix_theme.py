import re

with open('frontend/src/components/ui/RerouteModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "Navigation\n} from 'lucide-react';",
    "Navigation, RefreshCw\n} from 'lucide-react';"
)
content = content.replace(
    "import { useShipmentStore } from '../../stores/shipmentStore';",
    "import { useShipmentStore } from '../../stores/shipmentStore';\nimport { useUIStore } from '../../stores/uiStore';"
)

# 2. Add theme parameter and useUIStore
content = content.replace(
    "function RouteMap({ alternatives, primaryWaypoints, primaryGeometryEncoded, originCoords, destCoords, currentRoute, hoveredId, incidents }) {",
    "function RouteMap({ alternatives, primaryWaypoints, primaryGeometryEncoded, originCoords, destCoords, currentRoute, hoveredId, incidents, theme }) {"
)
content = content.replace(
    '<TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />',
    '<TileLayer url={theme === "light" ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} />'
)

# 3. Colors in RouteMap Inner details
content = content.replace('bg-black/70', 'bg-theme-secondary/80')
content = content.replace('border-white/10', 'border-theme')
content = content.replace('text-slate-400', 'text-theme-secondary')
content = content.replace('text-slate-600', 'text-theme-secondary')
content = content.replace('bg-black/50', 'bg-theme-secondary/80')
content = content.replace('border-white/[0.06]', 'border-theme')

# 4. CurrentRouteCard colors
content = content.replace('border-white/[0.08]', 'border-theme')
content = content.replace('bg-white/[0.03]', 'bg-theme-tertiary/60')
content = content.replace('bg-white/[0.05]', 'bg-theme-tertiary/60')
content = content.replace('text-slate-500', 'text-theme-secondary')
content = content.replace('text-white', 'text-theme-primary')
content = content.replace('bg-white/[0.07]', 'bg-theme-tertiary/60')

# 5. RouteCard
content = content.replace('#1e293b', 'transparent')
content = content.replace('border-t border-white/[0.05]', 'border-t border-theme')

# 6. RerouteModal Hooks
content = content.replace(
    "const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {\n  const { data, isLoading, error } = useRerouting(shipmentId);",
    "const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {\n  const theme = useUIStore(state => state.theme);\n  const { data, isLoading, error, refetch, isFetching } = useRerouting(shipmentId);"
)

# 7. Add theme to RouteMap invocation
content = content.replace(
    'incidents={routeIncidents}\n                    />',
    'incidents={routeIncidents}\n                      theme={theme}\n                    />'
)

# 8. Main Modal Background
content = content.replace('bg-black/72', 'bg-theme-primary/70')
content = content.replace('bg-[#0d1117]', 'bg-theme-secondary')
content = content.replace('border border-white/[0.07]', 'border border-theme')

# 9. Header Buttons
old_header = """              <button
                onClick={onClose}
                className="p-1.5 text-slate-600 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>"""
new_header = """              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setScoredAlts(null); refetch(); }}
                  disabled={isFetching || isScoring}
                  className="p-1.5 text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-tertiary transition-colors cursor-pointer disabled:opacity-50"
                  title="Recalculate Routes"
                >
                  <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-tertiary transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>"""
content = content.replace(old_header, new_header)

old_route_card_classes = """      className={cn(
        'relative rounded-2xl border flex flex-col overflow-hidden cursor-default',
        meta.border, meta.bg,
        isRec && 'ring-1 ring-indigo-500/35 shadow-lg shadow-indigo-900/30'
      )}"""
new_route_card_classes = """      className={cn(
        'relative rounded-2xl border flex flex-col overflow-hidden cursor-default transition-shadow',
        meta.bg,
        isRec ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/20' : 'border-theme'
      )}"""
content = content.replace(old_route_card_classes, new_route_card_classes)

# Minor explicit text-white fixes left over
content = content.replace('text-slate-300', 'text-theme-secondary')
content = content.replace('hover:text-white', 'hover:text-theme-primary')
content = content.replace('border-t border-white/[0.06]', 'border-t border-theme')
content = content.replace('bg-white/[0.06]', 'bg-theme-tertiary')
content = content.replace('text-slate-700', 'text-theme-secondary')

with open('frontend/src/components/ui/RerouteModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
