import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, Box, Building2, Check, ChevronRight, CircleHelp, ClipboardList,
  ExternalLink, FileQuestion, FileText, Grid2X2, Info, Layers3, LocateFixed,
  Map as MapIcon, MapPin, Menu, Moon, PackageSearch, Search, ShieldCheck,
  SlidersHorizontal, Sun, Truck, Warehouse, X,
} from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, Tooltip, useMap, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import {
  facilities,
  searchableFacilityText,
  type DisplayStatus,
  type Facility,
  type FacilityStatus,
} from './data/facilities'

type Tab = 'Overview' | 'Site Plan' | 'Photos' | 'Documents' | 'Operations'
type Theme = 'light' | 'dark'
type StatusFilter = 'All' | DisplayStatus
type StatusAssignments = Record<string, FacilityStatus>

const STATUS_STORAGE_KEY = 'facility-status-assignments-v1'
const tabs: Tab[] = ['Overview', 'Site Plan', 'Photos', 'Documents', 'Operations']
const assignableStatuses: DisplayStatus[] = ['Unassigned', 'Active', 'Coming Soon', 'Planned']
const statusColor: Record<DisplayStatus, string> = {
  Active: '#13a663',
  'Coming Soon': '#f4b71b',
  Planned: '#753bbd',
  Unassigned: '#7a8798',
}

function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem('locations-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialStatuses(): StatusAssignments {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STATUS_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(saved).filter(([id, value]) =>
        facilities.some((facility) => facility.id === id) &&
        (value === 'Active' || value === 'Coming Soon' || value === 'Planned'),
      ),
    ) as StatusAssignments
  } catch {
    return {}
  }
}

function getFacilityTitle(facility: Facility) {
  return facility.city ? `${facility.city}, ${facility.state}` : `${facility.street}, ${facility.state}`
}

function statusClass(status: DisplayStatus) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function pinIcon(facility: Facility, status: DisplayStatus, selected: boolean) {
  return L.divIcon({
    className: 'location-marker-wrap',
    html: `<span class="location-pin${selected ? ' is-selected' : ''}${facility.coordinatePrecision === 'Approximate' ? ' is-approximate' : ''}" style="--pin:${statusColor[status]}"><span></span></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    tooltipAnchor: [14, -19],
  })
}

function MapFocus({ selected, recenterSignal }: { selected: Facility; recenterSignal: number }) {
  const map = useMap()
  const previous = useRef(selected.id)

  useEffect(() => {
    if (previous.current !== selected.id) {
      map.flyTo(selected.coordinates, 12, { duration: 0.8 })
      previous.current = selected.id
    }
  }, [map, selected])

  useEffect(() => {
    if (recenterSignal > 0) map.flyTo([37.8, -96.2], 4, { duration: 0.7 })
  }, [map, recenterSignal])

  return null
}

function EmptyState({ icon: Icon = FileText, title, body }: { icon?: typeof FileText; title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [selected, setSelected] = useState<Facility>(facilities[0])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [statusAssignments, setStatusAssignments] = useState<StatusAssignments>(getInitialStatuses)
  const [tab, setTab] = useState<Tab>('Overview')
  const [layer, setLayer] = useState<'street' | 'satellite'>('satellite')
  const [recenterSignal, setRecenterSignal] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('locations-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusAssignments))
  }, [statusAssignments])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDetailsOpen(false)
      setAboutOpen(false)
      setMobileNav(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const facilityStatus = (facility: Facility): DisplayStatus => statusAssignments[facility.id] ?? 'Unassigned'
  const selectedStatus = facilityStatus(selected)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const isStateAbbreviation = query.length === 2 && facilities.some((facility) => facility.state.toLowerCase() === query)
    return facilities.filter((facility) => {
      const matchesText = !query || (isStateAbbreviation ? facility.state.toLowerCase() === query : searchableFacilityText(facility).includes(query))
      const currentStatus = statusAssignments[facility.id] ?? 'Unassigned'
      return matchesText && (statusFilter === 'All' || currentStatus === statusFilter)
    })
  }, [search, statusAssignments, statusFilter])

  const counts = useMemo(() => ({
    total: facilities.length,
    active: Object.values(statusAssignments).filter((item) => item === 'Active').length,
    coming: Object.values(statusAssignments).filter((item) => item === 'Coming Soon').length,
    planned: Object.values(statusAssignments).filter((item) => item === 'Planned').length,
    unassigned: facilities.length - Object.keys(statusAssignments).length,
  }), [statusAssignments])

  const chooseFacility = (facility: Facility) => {
    setSelected(facility)
    setTab('Overview')
  }

  const assignStatus = (facility: Facility, status: DisplayStatus) => {
    setStatusAssignments((current) => {
      const next = { ...current }
      if (status === 'Unassigned') delete next[facility.id]
      else next[facility.id] = status
      return next
    })
    setNotice(status === 'Unassigned' ? 'Local status cleared.' : `Local status set to ${status}.`)
  }

  const openMaps = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.fullAddress)}`, '_blank', 'noopener,noreferrer')
  }

  const navItems = [
    ['Dashboard', Grid2X2], ['Locations', MapIcon], ['Facilities', Warehouse], ['Inventory', Box],
    ['Operations', SlidersHorizontal], ['Analytics', PackageSearch], ['Reports', ClipboardList],
  ] as const

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
        <div className="brand" aria-label="ITEM Locations Network"><img src="/brand/item-logo-fullcolor-whitetxt.svg" alt="ITEM" /><span>LOCATIONS NETWORK</span></div>
        <nav className={mobileNav ? 'nav-links is-open' : 'nav-links'} aria-label="Primary navigation">
          {navItems.map(([label, Icon]) => (
            <button key={label} className={label === 'Locations' ? 'active' : ''} aria-current={label === 'Locations' ? 'page' : undefined} onClick={() => { setMobileNav(false); if (label !== 'Locations') setNotice(`${label} is outside this reference prototype.`) }}>
              <Icon size={17} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <label className="global-search">
            <Search size={17} /><span className="sr-only">Search facilities</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address, city, state, ZIP..." />
            {search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
          </label>
          <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} data-testid="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon /> : <Sun />}</button>
          <button className="icon-button" aria-label="Notifications" onClick={() => setNotice('No new notifications.')}><Bell /></button>
          <button className="avatar" aria-label="Open profile menu" onClick={() => setNotice('Signed in as reference viewer.')}>RV</button>
        </div>
      </header>

      <main className="dashboard">
        <section className="workspace" aria-label="Facility map and roster">
          <section className="map-stage" aria-label="Facility network map">
            <MapContainer center={[37.8, -96.2]} zoom={4} minZoom={3} maxZoom={18} zoomControl={false} scrollWheelZoom className="map" preferCanvas>
              {layer === 'street' ? (
                <TileLayer key="street" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              ) : (
                <TileLayer key="satellite" attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              )}
              <ZoomControl position="topright" />
              <MapFocus selected={selected} recenterSignal={recenterSignal} />
              {filtered.map((facility) => {
                const currentStatus = facilityStatus(facility)
                return (
                  <Marker key={facility.id} position={facility.coordinates} icon={pinIcon(facility, currentStatus, facility.id === selected.id)} eventHandlers={{ click: () => chooseFacility(facility) }} title={facility.fullAddress}>
                    <Tooltip permanent direction="right" className="pin-label" opacity={1}>#{facility.number} {facility.city ?? 'TN'}{facility.coordinatePrecision === 'Approximate' ? ' · approx.' : ''}</Tooltip>
                  </Marker>
                )
              })}
            </MapContainer>

            <div className="overview-panel">
              <div className="panel-title"><strong>Facility Network</strong><button aria-label="About this prototype" onClick={() => setAboutOpen(true)}><Info size={16} /></button></div>
              <div className="overview-metrics five-metrics">
                <div><Building2 /><b>{counts.total}</b><span>Facilities</span></div>
                <div><MapPin /><b>{counts.active}</b><span>Active</span></div>
                <div><MapPin /><b>{counts.coming}</b><span>Coming Soon</span></div>
                <div><MapPin /><b>{counts.planned}</b><span>Planned</span></div>
                <div><FileQuestion /><b>{counts.unassigned}</b><span>Unassigned</span></div>
              </div>
            </div>

            <div className="map-tools" aria-label="Map layers">
              <span><Layers3 size={16} />Layers</span>
              <div className="layer-switch" role="group" aria-label="Map layer">
                <button className={layer === 'street' ? 'active' : ''} aria-pressed={layer === 'street'} onClick={() => setLayer('street')}>Street</button>
                <button className={layer === 'satellite' ? 'active' : ''} aria-pressed={layer === 'satellite'} onClick={() => setLayer('satellite')}>Satellite</button>
              </div>
            </div>
            <button className="recenter-control" aria-label="Recenter map" title="Recenter map" onClick={() => setRecenterSignal((value) => value + 1)}><LocateFixed size={18} /></button>
            <div className="map-legend" aria-label="Local facility status legend">
              {assignableStatuses.map((item) => <span key={item}><i style={{ background: statusColor[item] }} />{item}</span>)}
            </div>
            {filtered.length === 0 && <div className="no-map-results"><Search size={20} /><strong>No facilities found</strong><button onClick={() => { setSearch(''); setStatusFilter('All') }}>Clear filters</button></div>}
          </section>

          <section className="lower-grid roster-grid">
            <div className="locations-card tool-card">
              <div className="card-heading"><div><span className="eyebrow">User-provided roster</span><h2>Facilities</h2></div><span>{filtered.length} of {facilities.length}</span></div>
              <div className="list-filters">
                <label><Search size={16} /><span className="sr-only">Filter facilities</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search street, city, state, ZIP..." /></label>
                <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="All">All statuses</option><option>Active</option><option>Coming Soon</option><option>Planned</option><option>Unassigned</option>
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Facility address</th><th>City / State</th><th>Status</th><th><span className="sr-only">Select</span></th></tr></thead>
                  <tbody>
                    {filtered.map((facility) => {
                      const currentStatus = facilityStatus(facility)
                      return (
                        <tr key={facility.id} className={facility.id === selected.id ? 'selected' : ''} onClick={() => chooseFacility(facility)}>
                          <td>{facility.number}</td>
                          <td><button onClick={() => chooseFacility(facility)} aria-label={`Select ${facility.fullAddress}`}><MapPin size={15} /><span>{facility.fullAddress}</span></button></td>
                          <td>{facility.city ? `${facility.city}, ${facility.state}` : `City not provided · ${facility.state}`}</td>
                          <td><span className={`status-pill ${statusClass(currentStatus)}`}>{currentStatus}</span></td>
                          <td><ChevronRight size={15} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && <EmptyState icon={Search} title="No matching facilities" body="Try a street, city, state name or abbreviation, ZIP, or another status." />}
              </div>
            </div>
          </section>
        </section>

        <aside className="detail-panel" aria-label={`${selected.fullAddress} details`}>
          <div className="facility-identity">
            <div className="facility-symbol"><Warehouse /></div>
            <div><span className="eyebrow">Facility {String(selected.number).padStart(2, '0')}</span><strong>{getFacilityTitle(selected)}</strong><small>Logistics network location</small></div>
            <span className={`precision-chip ${selected.coordinatePrecision === 'Approximate' ? 'approximate' : ''}`}><ShieldCheck size={13} />{selected.coordinatePrecision}</span>
          </div>
          <div className="detail-header">
            <div className="title-line"><MapPin /><h1>Facility {String(selected.number).padStart(2, '0')}</h1><span className={`status-pill ${statusClass(selectedStatus)}`}>{selectedStatus}</span></div>
            <div className="address-line"><MapPin size={15} /><span>{selected.fullAddress}</span><button onClick={openMaps}>Open in Maps <ExternalLink size={13} /></button></div>
          </div>
          <div className="tabs" role="tablist" aria-label="Facility details">
            {tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
          </div>
          <div className="detail-content">
            {tab === 'Overview' && <OverviewContent facility={selected} status={selectedStatus} onStatusChange={(value) => assignStatus(selected, value)} />}
            {tab === 'Site Plan' && <EmptyState icon={MapIcon} title="Site plan not provided" body="No site plan was supplied for this facility." />}
            {tab === 'Photos' && <EmptyState icon={Warehouse} title="Photos not provided" body="No facility photos were supplied for this property." />}
            {tab === 'Documents' && <EmptyState title="Documents not provided" body="No property or operating documents were supplied for this facility." />}
            {tab === 'Operations' && <EmptyState icon={Truck} title="Operations data unavailable" body="This prototype does not connect to WMS, YMS, inventory, or operational systems." />}
          </div>
          <div className="detail-footer"><button className="secondary-button" onClick={() => setAboutOpen(true)}><CircleHelp size={16} />About data</button><button className="primary-button" onClick={() => setDetailsOpen(true)}>View Full Details <ChevronRight size={17} /></button></div>
        </aside>
      </main>

      {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}

      {detailsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsOpen(false) }}>
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="details-title">
            <div className="modal-head"><div><span className="eyebrow">Facility record {String(selected.number).padStart(2, '0')}</span><h2 id="details-title">{getFacilityTitle(selected)}</h2></div><button className="icon-button" aria-label="Close details" onClick={() => setDetailsOpen(false)}><X /></button></div>
            <div className="drawer-content">
              <div className="drawer-banner"><Warehouse /><div><strong>{selected.fullAddress}</strong><span>User-provided facility address</span></div></div>
              <dl className="detail-list">
                <div><dt>Status</dt><dd>{selectedStatus === 'Unassigned' ? 'Not provided · locally unassigned' : `${selectedStatus} · local assignment`}</dd></div>
                <div><dt>Street / building</dt><dd>{selected.street}</dd></div>
                <div><dt>City</dt><dd>{selected.city ?? 'Not provided'}</dd></div>
                <div><dt>State</dt><dd>{selected.state} · {selected.stateName}</dd></div>
                <div><dt>ZIP</dt><dd>{selected.zip ?? 'Not provided'}</dd></div>
                <div><dt>Coordinates</dt><dd>{selected.coordinates.map((value) => value.toFixed(6)).join(', ')}</dd></div>
                <div><dt>Coordinate precision</dt><dd>{selected.coordinatePrecision}</dd></div>
                <div><dt>Coordinate source</dt><dd>{selected.coordinateSource}</dd></div>
              </dl>
              <section className="geocode-detail"><strong>Geocoder match</strong><p>{selected.geocoderMatch}</p>{selected.geocodeNote && <p className="geocode-warning"><Info size={15} />{selected.geocodeNote}</p>}</section>
              <p className="source-note"><Info size={15} />No property size, dock, photo, site-plan, or operational data was supplied. Those fields are intentionally not inferred.</p>
            </div>
          </section>
        </div>
      )}

      {aboutOpen && (
        <div className="modal-backdrop centered" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAboutOpen(false) }}>
          <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <div className="modal-head"><div><span className="eyebrow">About this experience</span><h2 id="about-title">Reference prototype</h2></div><button className="icon-button" aria-label="Close about" onClick={() => setAboutOpen(false)}><X /></button></div>
            <p>This screenshot-based prototype uses exactly 17 user-provided facility addresses. It is not connected to WMS, YMS, inventory, facility, or operational APIs.</p>
            <p>No official statuses or property attributes were supplied. Statuses begin unassigned and any changes are saved only in this browser. Coordinates were geocoded for map placement; source and precision are shown in Full Details.</p>
            <button className="primary-button" onClick={() => setAboutOpen(false)}>Understood</button>
          </section>
        </div>
      )}
    </div>
  )
}

function OverviewContent({ facility, status, onStatusChange }: { facility: Facility; status: DisplayStatus; onStatusChange: (status: DisplayStatus) => void }) {
  return (
    <>
      <section className="status-assignment">
        <div><span className="eyebrow">Local planning field</span><h2>Status not provided</h2><p>Assign a working status for this browser only. It is not an official facility status.</p></div>
        <label><span>Local status</span><select aria-label={`Set status for ${facility.fullAddress}`} value={status} onChange={(event) => onStatusChange(event.target.value as DisplayStatus)}>{assignableStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>

      <section className="known-details info-section">
        <h2><Building2 />Known location details</h2>
        <dl>
          <div><dt>Street / building</dt><dd>{facility.street}</dd></div>
          <div><dt>City</dt><dd>{facility.city ?? 'Not provided'}</dd></div>
          <div><dt>State</dt><dd>{facility.state} · {facility.stateName}</dd></div>
          <div><dt>ZIP</dt><dd>{facility.zip ?? 'Not provided'}</dd></div>
        </dl>
      </section>

      <section className="unavailable-section info-section">
        <h2><FileQuestion />Property attributes</h2>
        <div className="unavailable-grid"><span><b>Total area</b>Not provided</span><span><b>Dock doors</b>Not provided</span><span><b>Grade doors</b>Not provided</span><span><b>Clear height</b>Not provided</span></div>
      </section>

      <section className="coordinate-section info-section">
        <h2><ShieldCheck />Map placement</h2>
        <div className="coordinate-row"><span className={`precision-chip ${facility.coordinatePrecision === 'Approximate' ? 'approximate' : ''}`}>{facility.coordinatePrecision}</span><span>{facility.coordinateSource}</span></div>
        {facility.geocodeNote && <p className="geocode-warning"><Info size={14} />{facility.geocodeNote}</p>}
      </section>
    </>
  )
}

export default App
