// tourist-management-dashboard/public/script.js
let tourists = [];
let activities = [];
let safeZones = [];
let unsafeZones = [];
let mapInstance;
let touristMarkers = {}; // docId -> Marker
let safeZoneCircles = {}; // docId -> Circle
let unsafeZoneCircles = {}; // docId -> Circle
let currentTouristDocId = null;

// UX state for smoother map experience
let mapInitialized = false;
let userInteracting = false;
let interactionCooldownTimer = null;
let autoFocusTimer = null; // deprecated: no auto cycle
let lastAutoFocusIndex = -1; // deprecated
let followTargetDocId = null; // keep centering on this tourist across updates

let safeZonesMapInstance;
let selectedZoneLatLng = null;
let currentZoneType = 'safe'; // 'safe' or 'unsafe'
let geocoderControl;

// India map bounds and center
const INDIA_CENTER = [21.7679, 78.8718]; // India center
const INDIA_BOUNDS = [
  [6.7432, 68.1767],   // Southwest
  [37.0927, 97.3953]   // Northeast
];

// Initialize EventSource for real-time updates
const eventSource = new EventSource('http://localhost:3000/stream');

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'users') {
    const prevOpen = currentTouristDocId;
    tourists = update.data.map(u => {
      const docId = u.docId || u.id;
      const displayId = u.userId || u.id || docId;
      const latitude = u.location?.latitude ?? 0;
      const longitude = u.location?.longitude ?? 0;
      const safetyScore = u.safetyScore ?? 85;
      const status = safetyScore > 80 ? 'normal' : safetyScore > 60 ? 'abnormal' : 'critical';
      return {
        docId,
        displayId,
        name: u.name || 'Unknown',
        country: u.nationality || 'N/A',
        status,
        location: [latitude, longitude],
        complaint: u.complaints || 0,
        safetyScore,
        phone: u.phone || 'N/A',
      };
    }).filter(t => !!t.docId);

    renderTourists();
    renderMap();
    updateHeaderStats();

    // If the modal is open, refresh the live lat/lng fields without allowing edits
    if (prevOpen) {
      const t = tourists.find(x => x.docId === prevOpen);
      if (t) {
        document.getElementById('modalLat')?.setAttribute('disabled', 'true');
        document.getElementById('modalLng')?.setAttribute('disabled', 'true');
        document.getElementById('modalLat').value = t.location?.[0] ?? 0;
        document.getElementById('modalLng').value = t.location?.[1] ?? 0;
      }
    }
  } else if (update.type === 'panics') {
    activities = update.data.map(p => ({
      type: p.type,
      text: p.text,
      time: p.time,
    }));
    renderActivities();
    updateHeaderStats();
  } else if (update.type === 'safeZones') {
    safeZones = update.data;
    renderSafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderSafeZonesList();
    }
  } else if (update.type === 'unsafeZones') {
    unsafeZones = update.data;
    renderUnsafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderUnsafeZonesList();
    }
  }
};

// Update header stats - Updated for new layout
function updateHeaderStats() {
  const active = tourists.filter(t => t.status === 'normal').length;
  const abnormal = tourists.filter(t => t.status === 'abnormal').length;
  const critical = tourists.filter(t => t.status === 'critical').length;
  
  // Update new header stats
  const activeCount = document.getElementById('activeCount');
  const abnormalCount = document.getElementById('abnormalCount');
  const criticalCount = document.getElementById('criticalCount');
  
  if (activeCount) activeCount.textContent = active;
  if (abnormalCount) abnormalCount.textContent = abnormal;
  if (criticalCount) criticalCount.textContent = critical;
  
  // Also update activity summary
  const activitySummary = document.querySelector('.activity-summary');
  if (activitySummary) {
    const criticalSummary = activitySummary.querySelector('.summary-item.critical .summary-number');
    const warningSummary = activitySummary.querySelector('.summary-item.warning .summary-number');
    const infoSummary = activitySummary.querySelector('.summary-item.info .summary-number');
    
    if (criticalSummary) criticalSummary.textContent = critical;
    if (warningSummary) warningSummary.textContent = abnormal;
    if (infoSummary) infoSummary.textContent = activities.filter(a => a.type === 'info').length || 1;
  }
}

// Render tourists - Updated for new card design
function renderTourists() {
  const list = document.getElementById('touristList');
  if (!list) return;

  list.innerHTML = '';
  tourists.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tourist-card';
    card.innerHTML = `
      <h4>
        <i class="fas fa-user-circle"></i>
        ${t.displayId} 
        <span class="status ${t.status}">${t.status}</span>
      </h4>
      <p><strong>${t.name}</strong> • ${t.country}</p>
      <p><i class="fas fa-shield-alt"></i> Safety: ${t.safetyScore}%</p>
      <p><i class="fas fa-location-dot"></i> Live location tracked</p>
      ${t.complaint > 0 ? `<p style="color: #d93025;"><i class="fas fa-exclamation-triangle"></i> ${t.complaint} active complaint(s)</p>` : ''}
    `;
    card.addEventListener('click', () => openTouristModal(t.docId));
    // Smooth hover focus on map
    card.addEventListener('mouseenter', () => focusTourist(t.docId));
    card.addEventListener('focus', () => focusTourist(t.docId));
    list.appendChild(card);
  });

  document.getElementById('touristCount').textContent = tourists.length;
}

// Render activities - Updated for new card design
function renderActivities() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  feed.innerHTML = '';
  activities.forEach(a => {
    const card = document.createElement('div');
    card.className = `activity-card ${a.type}`;
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
        <i class="fas fa-${a.type === 'critical' ? 'exclamation-triangle' : a.type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
        <strong>${a.type.charAt(0).toUpperCase() + a.type.slice(1)} Alert</strong>
      </div>
      <div>${a.text}</div>
      <div style="font-size: 12px; color: #5f6368; margin-top: 4px;">${a.time}</div>
    `;
    feed.appendChild(card);
  });
}

// Render map - Updated for fullscreen layout
function renderMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // Initialize once, then update smoothly
  if (!mapInitialized) {
    mapInstance = L.map('map', {
      zoomControl: true,
      zoomAnimation: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      inertia: true,
      inertiaDeceleration: 3000,
      wheelDebounceTime: 50,
      minZoom: 5,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    }).setView(INDIA_CENTER, 6); // India center, zoom level 6 for better overview

    try { window.mapInstance = mapInstance; } catch (_) {}

    // Use satellite/hybrid tiles for better visual appeal
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri, Maxar, Earthstar Geographics',
      subdomains: 'abcd',
      maxZoom: 18,
      minZoom: 5
    }).addTo(mapInstance);

    // Add labels overlay
    L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png', {
      attribution: '© Stamen Design, © OpenStreetMap contributors',
      maxZoom: 18,
      opacity: 0.7
    }).addTo(mapInstance);

    // Track user interaction to avoid fighting with auto-fit
    mapInstance.on('movestart', () => {
      userInteracting = true;
      if (interactionCooldownTimer) clearTimeout(interactionCooldownTimer);
    });
    mapInstance.on('moveend', () => {
      if (interactionCooldownTimer) clearTimeout(interactionCooldownTimer);
      interactionCooldownTimer = setTimeout(() => { userInteracting = false; }, 2500);
    });

    mapInitialized = true;
    // Disable any previous auto-focus cycles if present
    if (autoFocusTimer) { 
      try { clearInterval(autoFocusTimer); } 
      catch (_) {} 
      autoFocusTimer = null; 
    }
  }

  const statusColors = {
    normal: '#137333',
    abnormal: '#f9ab00',
    critical: '#d93025',
  };

  // Update or create markers
  const nextIds = new Set();
  tourists.forEach(t => {
    // Filter out tourists outside India bounds
    if (t.location[0] < INDIA_BOUNDS[0][0] || t.location[0] > INDIA_BOUNDS[1][0] ||
        t.location[1] < INDIA_BOUNDS[0][1] || t.location[1] > INDIA_BOUNDS[1][1]) {
      return;
    }
    
    nextIds.add(t.docId);
    const existing = touristMarkers[t.docId];
    if (existing) {
      // Smoothly move marker to new position
      existing.setStyle({
        fillColor: statusColors[t.status],
        color: statusColors[t.status]
      });
      existing.setLatLng(t.location);
    } else {
      const marker = L.circleMarker(t.location, {
        radius: 10,
        fillColor: statusColors[t.status],
        color: statusColors[t.status],
        weight: 3,
        opacity: 1,
        fillOpacity: 0.8,
        className: `tourist-marker status-${t.status}`
      }).addTo(mapInstance);
      
      marker.bindPopup(`
        <div style="text-align: center; padding: 8px;">
          <h4 style="margin: 0 0 8px 0; color: #202124;">${t.name}</h4>
          <p style="margin: 4px 0; color: #5f6368;"><i class="fas fa-flag"></i> ${t.country}</p>
          <p style="margin: 4px 0; color: #5f6368;"><i class="fas fa-shield-alt"></i> Safety: ${t.safetyScore}%</p>
          <div style="margin: 8px 0;">
            <span class="status ${t.status}" style="font-size: 12px;">${t.status.toUpperCase()}</span>
          </div>
          <button onclick="openTouristModal('${t.docId}')" style="background: #1a73e8; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
            View Details
          </button>
        </div>
      `);
      touristMarkers[t.docId] = marker;
    }
  });

  // Remove markers for tourists that no longer exist
  Object.keys(touristMarkers).forEach(id => {
    if (!nextIds.has(id)) {
      try {
        mapInstance.removeLayer(touristMarkers[id]);
      } catch (_) {}
      delete touristMarkers[id];
      if (followTargetDocId === id) followTargetDocId = null;
    }
  });

  renderSafeZonesOnMap();
  renderUnsafeZonesOnMap();

  // If following a panic alert center from realtime.js, honor it
  try {
    if (window.followAlertActive) {
      const latInput = document.getElementById('panicLat');
      const lngInput = document.getElementById('panicLng');
      const lat = latInput ? Number(latInput.value) : null;
      const lng = lngInput ? Number(lngInput.value) : null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // Ensure panic alert is within India bounds
        if (lat >= INDIA_BOUNDS[0][0] && lat <= INDIA_BOUNDS[1][0] &&
            lng >= INDIA_BOUNDS[0][1] && lng <= INDIA_BOUNDS[1][1]) {
          if (typeof mapInstance.flyTo === 'function') {
            mapInstance.flyTo([lat, lng], Math.max(mapInstance.getZoom(), 13), { 
              animate: true, 
              duration: 0.6,
              maxZoom: 18
            });
          } else {
            mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 13), { animate: true });
          }
        }
        return; // skip auto-fit while following alert
      }
    }
  } catch (_) {}

  // If following a specific tourist, keep centering on them and skip auto-fit
  if (followTargetDocId && touristMarkers[followTargetDocId]) {
    const latLng = touristMarkers[followTargetDocId].getLatLng();
    if (typeof mapInstance.flyTo === 'function') {
      mapInstance.flyTo(latLng, Math.max(mapInstance.getZoom(), 13), { 
        animate: true, 
        duration: 0.6,
        maxZoom: 18
      });
    } else {
      mapInstance.setView(latLng, Math.max(mapInstance.getZoom(), 13), { animate: true });
    }
    try { touristMarkers[followTargetDocId].openPopup(); } catch (_) {}
    return;
  }

  // Auto-fit bounds if not interacting and we have multiple tourists
  if (!userInteracting) {
    const ids = Object.keys(touristMarkers);
    if (ids.length === 1) {
      const only = tourists.find(x => x.docId === ids[0]);
      if (only) {
        mapInstance.setView(only.location, Math.max(mapInstance.getZoom(), 8, 12), { 
          animate: true,
          maxZoom: 18
        });
      }
    } else if (ids.length > 1) {
      const bounds = L.latLngBounds(ids.map(id => touristMarkers[id].getLatLng()));
      // Ensure bounds fit within India
      const indiaBounds = L.latLngBounds(INDIA_BOUNDS);
      const fitBounds = bounds.intersect(indiaBounds);
      try {
        mapInstance.flyToBounds(fitBounds.pad(0.2), { 
          animate: true, 
          duration: 0.6,
          maxZoom: 15
        });
      } catch (_) {
        mapInstance.fitBounds(fitBounds.pad(0.2), { 
          animate: true,
          maxZoom: 15
        });
      }
    }
  }
}

function renderSafeZonesOnMap() {
  if (!mapInstance) return;

  // Clear existing circles
  Object.values(safeZoneCircles).forEach(circle => {
    if (mapInstance) mapInstance.removeLayer(circle);
  });
  safeZoneCircles = {};

  safeZones.forEach(zone => {
    // Filter safe zones within India bounds
    if (zone.lat < INDIA_BOUNDS[0][0] || zone.lat > INDIA_BOUNDS[1][0] ||
        zone.lng < INDIA_BOUNDS[0][1] || zone.lng > INDIA_BOUNDS[1][1]) {
      return;
    }
    
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      fillColor: '#137333',
      color: '#0d652d',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.15,
      className: 'safe-zone-circle'
    }).addTo(mapInstance);
    circle.bindPopup(`
      <div style="text-align: center; padding: 8px;">
        <h4 style="margin: 0 0 8px 0; color: #137333;"><i class="fas fa-shield-alt"></i> Safe Zone</h4>
        <p style="margin: 4px 0; color: #5f6368;">Radius: ${zone.radius}m</p>
        <p style="margin: 4px 0; color: #5f6368; font-size: 12px;">Lat: ${zone.lat.toFixed(4)}, Lng: ${zone.lng.toFixed(4)}</p>
      </div>
    `);
    safeZoneCircles[zone.id] = circle;
  });
}

function renderUnsafeZonesOnMap() {
  if (!mapInstance) return;

  // Clear existing circles
  Object.values(unsafeZoneCircles).forEach(circle => {
    if (mapInstance) mapInstance.removeLayer(circle);
  });
  unsafeZoneCircles = {};

  unsafeZones.forEach(zone => {
    // Filter unsafe zones within India bounds
    if (zone.lat < INDIA_BOUNDS[0][0] || zone.lat > INDIA_BOUNDS[1][0] ||
        zone.lng < INDIA_BOUNDS[0][1] || zone.lng > INDIA_BOUNDS[1][1]) {
      return;
    }
    
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      fillColor: '#d93025',
      color: '#b52d20',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.1,
      className: 'unsafe-zone-circle'
    }).addTo(mapInstance);
    circle.bindPopup(`
      <div style="text-align: center; padding: 8px;">
        <h4 style="margin: 0 0 8px 0; color: #d93025;"><i class="fas fa-exclamation-triangle"></i> Unsafe Zone</h4>
        <p style="margin: 4px 0; color: #5f6368;">Radius: ${zone.radius}m</p>
        <p style="margin: 4px 0; color: #5f6368; font-size: 12px;">Lat: ${zone.lat.toFixed(4)}, Lng: ${zone.lng.toFixed(4)}</p>
      </div>
    `);
    unsafeZoneCircles[zone.id] = circle;
  });
}

// Manual refresh fallback
function refreshDashboard() {
  // Add loading state
  const refreshBtn = document.querySelector('.control-btn.primary');
  if (refreshBtn) {
    refreshBtn.classList.add('loading');
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading...</span>';
  }

  fetch('http://localhost:3000/tourists')
    .then(res => res.json())
    .then(data => {
      tourists = data.map(u => {
        const docId = u.docId || u.id;
        const displayId = u.userId || u.id || docId;
        const latitude = u.location?.latitude ?? 0;
        const longitude = u.location?.longitude ?? 0;
        const safetyScore = u.safetyScore ?? 85;
        const status = safetyScore > 80 ? 'normal' : safetyScore > 60 ? 'abnormal' : 'critical';
        return {
          docId,
          displayId,
          name: u.name || 'Unknown',
          country: u.nationality || 'N/A',
          status,
          location: [latitude, longitude],
          complaint: u.complaints || 0,
          safetyScore,
          phone: u.phone || 'N/A',
        };
      }).filter(t => !!t.docId);
      renderTourists();
      renderMap();
      updateHeaderStats();
    })
    .catch(error => console.error('Error fetching tourists:', error))
    .finally(() => {
      // Remove loading state
      if (refreshBtn) {
        refreshBtn.classList.remove('loading');
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Refresh</span>';
      }
    });
    
  fetch('http://localhost:3000/activities')
    .then(res => res.json())
    .then(data => {
      activities = data;
      renderActivities();
      updateHeaderStats();
    })
    .catch(error => console.error('Error fetching activities:', error));
  fetchSafeZones();
  fetchUnsafeZones();
}

// Widget toggle functionality for mobile
function toggleWidget(widgetClass) {
  const widget = document.querySelector('.' + widgetClass);
  if (!widget) return;
  
  const content = widget.querySelector('.widget-content');
  const btn = widget.querySelector('.minimize-btn i');
  
  if (!content || !btn) return;
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    btn.className = 'fas fa-minus';
    widget.classList.remove('minimized');
    
    // For mobile, add open class
    if (window.innerWidth <= 768) {
      widget.classList.add('open');
    }
  } else {
    content.style.display = 'none';
    btn.className = 'fas fa-plus';
    widget.classList.add('minimized');
    
    // For mobile, remove open class
    if (window.innerWidth <= 768) {
      widget.classList.remove('open');
    }
  }
}

// Rest of the functions remain the same...
// Fetch safe zones
async function fetchSafeZones() {
  try {
    const res = await fetch('http://localhost:3000/safe-zones');
    safeZones = await res.json();
    renderSafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderSafeZonesList();
    }
  } catch (error) {
    console.error('Error fetching safe zones:', error);
  }
}

// Fetch unsafe zones
async function fetchUnsafeZones() {
  try {
    const res = await fetch('http://localhost:3000/unsafe-zones');
    unsafeZones = await res.json();
    renderUnsafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderUnsafeZonesList();
    }
  } catch (error) {
    console.error('Error fetching unsafe zones:', error);
  }
}

// Safe Zones Modal
function openSafeZonesModal() {
  document.getElementById('safeZonesModal').style.display = 'flex';
  currentZoneType = 'safe';
  initSafeZonesMap();
  renderSafeZonesList();
  renderUnsafeZonesList();
  fetchSafeZones();
  fetchUnsafeZones();
  updateZoneTypeToggle();
  
  // Reset search
  const searchInput = document.getElementById('placeSearch');
  const searchResults = document.getElementById('searchResults');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) searchInput.value = '';
  if (searchResults) {
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
  }
  if (clearBtn) clearBtn.style.display = 'none';
  selectedZoneLatLng = null;
  const saveBtn = document.getElementById('saveSafeZoneBtn');
  if (saveBtn) saveBtn.disabled = true;
}

function closeSafeZonesModal() {
  document.getElementById('safeZonesModal').style.display = 'none';
  selectedZoneLatLng = null;
  const saveBtn = document.getElementById('saveSafeZoneBtn');
  if (saveBtn) saveBtn.disabled = true;
  
  // Reset search
  const searchInput = document.getElementById('placeSearch');
  const searchResults = document.getElementById('searchResults');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) searchInput.value = '';
  if (searchResults) {
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
  }
  if (clearBtn) clearBtn.style.display = 'none';
  
  if (safeZonesMapInstance) {
    safeZonesMapInstance.off('click');
  }
}

function updateZoneTypeToggle() {
  document.querySelectorAll('.zone-toggle-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === currentZoneType) {
      btn.classList.add('active');
    }
  });
  const saveBtn = document.getElementById('saveSafeZoneBtn');
  if (saveBtn) {
    saveBtn.textContent = currentZoneType === 'safe' ? 'Save Safe Zone' : 'Save Unsafe Zone';
  }
}

function initSafeZonesMap() {
  const mapEl = document.getElementById('safeZonesMap');
  if (safeZonesMapInstance) safeZonesMapInstance.remove();

  safeZonesMapInstance = L.map('safeZonesMap', {
    zoomControl: true,
    minZoom: 5,
    maxBounds: INDIA_BOUNDS,
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    center: INDIA_CENTER,
    zoom: 5,
  }).setView(INDIA_CENTER, 5);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    subdomains: 'abcd',
    maxZoom: 18,
    minZoom: 5
  }).addTo(safeZonesMapInstance);

  // Initialize Geocoder for place search
  if (geocoderControl) {
    safeZonesMapInstance.removeControl(geocoderControl);
  }
  
  geocoderControl = L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: 'Search for places...',
    errorMessage: 'Place not found',
    geocoder: L.Control.Geocoder.nominatim({
      geocodingQueryParams: {
        countrycodes: 'in', // Restrict to India
        viewbox: `${INDIA_BOUNDS[0][1]},${INDIA_BOUNDS[0][0]},${INDIA_BOUNDS[1][1]},${INDIA_BOUNDS[1][0]}`, // India bounding box
        bounded: 1 // Restrict results to bounding box
      }
    })
  }).on('markgeocode', function(e) {
    const bbox = e.geocode.bbox;
    safeZonesMapInstance.fitBounds(bbox);
    
    // Set the selected location for zone creation
    selectedZoneLatLng = e.geocode.center;
    const saveBtn = document.getElementById('saveSafeZoneBtn');
    if (saveBtn) saveBtn.disabled = false;
    
    // Clear previous marker
    safeZonesMapInstance.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.options.icon.options.html) {
        safeZonesMapInstance.removeLayer(layer);
      }
    });
    
    const markerColor = currentZoneType === 'safe' ? '#137333' : '#d93025';
    L.marker(selectedZoneLatLng, {
      icon: L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(safeZonesMapInstance).bindPopup(
      `Selected: ${e.geocode.name}<br>${currentZoneType === 'safe' ? 'Safe' : 'Unsafe'} Zone Center`
    ).openPopup();
    
    // Hide search results
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.style.display = 'none';
    const placeSearch = document.getElementById('placeSearch');
    if (placeSearch) placeSearch.value = e.geocode.name;
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'inline-block';
  }).addTo(safeZonesMapInstance);

  // Click to mark spot - restrict to India bounds
  safeZonesMapInstance.on('click', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Check if click is within India bounds
    if (lat >= INDIA_BOUNDS[0][0] && lat <= INDIA_BOUNDS[1][0] &&
        lng >= INDIA_BOUNDS[0][1] && lng <= INDIA_BOUNDS[1][1]) {
      selectedZoneLatLng = e.latlng;
      const saveBtn = document.getElementById('saveSafeZoneBtn');
      if (saveBtn) saveBtn.disabled = false;
      
      // Clear previous marker
      safeZonesMapInstance.eachLayer(layer => {
        if (layer instanceof L.Marker && layer.options.icon.options.html) {
          safeZonesMapInstance.removeLayer(layer);
        }
      });
      
      const markerColor = currentZoneType === 'safe' ? '#137333' : '#d93025';
      L.marker(selectedZoneLatLng, {
        icon: L.divIcon({
          className: 'custom-marker',
          html: `<div style="background: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      }).addTo(safeZonesMapInstance).bindPopup(
        `${currentZoneType === 'safe' ? 'Safe' : 'Unsafe'} Zone Center<br>Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`
      ).openPopup();
    } else {
      alert('Please click within India boundaries to create a zone.');
    }
  });

  // Render existing zones on this map
  safeZones.forEach(zone => {
    if (zone.lat >= INDIA_BOUNDS[0][0] && zone.lat <= INDIA_BOUNDS[1][0] &&
        zone.lng >= INDIA_BOUNDS[0][1] && zone.lng <= INDIA_BOUNDS[1][1]) {
      L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        fillColor: '#137333',
        color: '#0d652d',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.15,
        className: 'safe-zone-circle'
      }).addTo(safeZonesMapInstance).bindPopup(`Safe Zone<br>Radius: ${zone.radius}m`);
    }
  });

  unsafeZones.forEach(zone => {
    if (zone.lat >= INDIA_BOUNDS[0][0] && zone.lat <= INDIA_BOUNDS[1][0] &&
        zone.lng >= INDIA_BOUNDS[0][1] && zone.lng <= INDIA_BOUNDS[1][1]) {
      L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        fillColor: '#d93025',
        color: '#b52d20',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.1,
        className: 'unsafe-zone-circle'
      }).addTo(safeZonesMapInstance).bindPopup(`Unsafe Zone<br>Radius: ${zone.radius}m`);
    }
  });

  // Center map view
  safeZonesMapInstance.setView(INDIA_CENTER, 5);
}

function renderSafeZonesList() {
  const list = document.getElementById('safeZonesList');
  if (!list) return;
  list.innerHTML = '';
  safeZones.forEach(zone => {
    const card = document.createElement('div');
    card.className = 'zone-card safe';
    card.innerHTML = `
      <span>${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)} (${zone.radius}m)</span>
      <button class="btn delete" onclick="deleteZone('safe', '${zone.id}')">Delete</button>
    `;
    list.appendChild(card);
  });
  const countEl = document.getElementById('safeZonesCount');
  if (countEl) countEl.textContent = safeZones.length;
}

function renderUnsafeZonesList() {
  const list = document.getElementById('unsafeZonesList');
  if (!list) return;
  list.innerHTML = '';
  unsafeZones.forEach(zone => {
    const card = document.createElement('div');
    card.className = 'zone-card unsafe';
    card.innerHTML = `
      <span>${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)} (${zone.radius}m)</span>
      <button class="btn delete" onclick="deleteZone('unsafe', '${zone.id}')">Delete</button>
    `;
    list.appendChild(card);
  });
  const countEl = document.getElementById('unsafeZonesCount');
  if (countEl) countEl.textContent = unsafeZones.length;
}

async function saveZone() {
  if (!selectedZoneLatLng) return;
  const radiusInput = document.getElementById('zoneRadius');
  const radius = radiusInput ? Number(radiusInput.value) : 500;
  if (!Number.isFinite(radius) || radius < 50 || radius > 5000) {
    const errorEl = document.getElementById('safeZonesError');
    if (errorEl) errorEl.textContent = 'Radius must be 50-5000m.';
    return;
  }

  const errorEl = document.getElementById('safeZonesError');
  if (errorEl) errorEl.textContent = '';

  try {
    const endpoint = currentZoneType === 'safe' ? '/safe-zones' : '/unsafe-zones';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: selectedZoneLatLng.lat,
        lng: selectedZoneLatLng.lng,
        radius
      })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save zone');
    }
    closeSafeZonesModal();
    if (currentZoneType === 'safe') {
      fetchSafeZones();
    } else {
      fetchUnsafeZones();
    }
  } catch (e) {
    if (errorEl) errorEl.textContent = `❌ ${e.message}`;
  }
}

async function deleteZone(type, zoneId) {
  if (!confirm(`Delete this ${type} zone?`)) return;
  try {
    const endpoint = type === 'safe' ? `/safe-zones/${zoneId}` : `/unsafe-zones/${zoneId}`;
    const res = await fetch(endpoint, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete zone');
    if (type === 'safe') {
      fetchSafeZones();
    } else {
      fetchUnsafeZones();
    }
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

function switchZoneType(type) {
  currentZoneType = type;
  updateZoneTypeToggle();
  initSafeZonesMap(); // Reinitialize to clear marker and update visuals
}

// Modal logic
function getTouristByDocId(docId) {
  return tourists.find(t => t.docId === docId);
}

function openTouristModal(docId) {
  currentTouristDocId = docId;
  const t = getTouristByDocId(docId);
  if (!t) return;

  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) modalTitle.textContent = `Tourist: ${t.name}`;
  
  const fields = {
    modalId: t.displayId,
    modalName: t.name || '',
    modalCountry: t.country || '',
    modalPhone: t.phone || '',
    modalSafety: t.safetyScore ?? 0,
    modalLat: t.location?.[0] ?? 0,
    modalLng: t.location?.[1] ?? 0
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  // Lat/Lng are read-only and driven by RTDB
  const latEl = document.getElementById('modalLat');
  const lngEl = document.getElementById('modalLng');
  if (latEl) latEl.setAttribute('disabled', 'true');
  if (lngEl) lngEl.setAttribute('disabled', 'true');

  const errorEl = document.getElementById('modalError');
  if (errorEl) errorEl.textContent = '';

  // Show delete button
  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'block';

  const modal = document.getElementById('touristModal');
  if (modal) modal.style.display = 'flex';
}

function closeTouristModal() {
  currentTouristDocId = null;
  const modal = document.getElementById('touristModal');
  if (modal) modal.style.display = 'none';
  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';
}

async function saveTouristChanges() {
  if (!currentTouristDocId) {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'Cannot save: missing document reference.';
    return;
  }
  
  const nameEl = document.getElementById('modalName');
  const countryEl = document.getElementById('modalCountry');
  const phoneEl = document.getElementById('modalPhone');
  const safetyEl = document.getElementById('modalSafety');
  
  const name = nameEl ? nameEl.value.trim() : '';
  const country = countryEl ? countryEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const safetyScore = safetyEl ? Number(safetyEl.value) : 0;

  const errorEl = document.getElementById('modalError');
  if (errorEl) errorEl.textContent = '';

  if (!Number.isFinite(safetyScore) || safetyScore < 0 || safetyScore > 100) {
    if (errorEl) errorEl.textContent = 'Safety score must be between 0 and 100.';
    return;
  }
  try {
    // Do NOT send location; it is controlled by RTDB/device
    const res = await fetch(`/tourists/${encodeURIComponent(currentTouristDocId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        nationality: country,
        phone,
        safetyScore
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save changes');
    }
    closeTouristModal(); // SSE will refresh UI
  } catch (e) {
    if (errorEl) errorEl.textContent = `❌ ${e.message}`;
  }
}

async function deleteTourist() {
  if (!currentTouristDocId) {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'Cannot delete: missing document reference.';
    return;
  }

  const t = getTouristByDocId(currentTouristDocId);
  if (!t) {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'Tourist not found.';
    return;
  }

  // Confirm deletion
  if (!confirm(`Are you sure you want to delete tourist "${t.name}" (${t.displayId})? This action cannot be undone.`)) {
    return;
  }

  const errorEl = document.getElementById('modalError');
  if (errorEl) errorEl.textContent = 'Deleting tourist...';

  try {
    const res = await fetch(`/tourists/${encodeURIComponent(currentTouristDocId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete tourist');
    }

    alert('Tourist deleted successfully.');
    closeTouristModal();
    refreshDashboard(); // Refresh to update UI
  } catch (e) {
    if (errorEl) errorEl.textContent = `❌ ${e.message}`;
  }
}

function contactTourist() {
  const t = currentTouristDocId ? getTouristByDocId(currentTouristDocId) : null;
  if (t?.phone && t.phone !== 'N/A') {
    window.location.href = `tel:${t.phone}`;
  } else {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'No phone number available.';
  }
}

function trackTourist() {
  const t = currentTouristDocId ? getTouristByDocId(currentTouristDocId) : null;
  if (!t || !mapInstance) return;
  const marker = touristMarkers[t.docId];
  if (marker) {
    if (typeof mapInstance.flyTo === 'function') {
      mapInstance.flyTo(t.location, 15, { 
        animate: true, 
        duration: 0.8,
        maxZoom: 18
      });
    } else {
      mapInstance.setView(t.location, 15, { animate: true });
    }
    marker.openPopup();
    // Persist follow target so refreshes keep us on the same tourist
    followTargetDocId = t.docId;
    
    // Close modal after tracking
    closeTouristModal();
  }
}

// Smooth focus on hover over tourist cards
function focusTourist(docId, zoom) {
  const t = tourists.find(x => x.docId === docId);
  if (!t || !mapInstance) return;
  const marker = touristMarkers[docId];
  const targetZoom = Number.isFinite(zoom) ? zoom : Math.max(mapInstance.getZoom(), 13);
  if (typeof mapInstance.flyTo === 'function') {
    mapInstance.flyTo(t.location, targetZoom, { 
      animate: true, 
      duration: 0.6,
      maxZoom: 18
    });
  } else {
    mapInstance.setView(t.location, targetZoom, { animate: true });
  }
  if (marker) { 
    try { marker.openPopup(); } 
    catch (_) {} 
  }
}

// Modal functions for adding tourist
function openAddTouristModal() {
  const modal = document.getElementById('addTouristModal');
  const errorMsg = document.getElementById('addErrorMsg');
  
  // Clear all input fields
  const fields = [
    'touristFullName', 'touristNationality', 'touristIdType', 'touristIdNumber',
    'touristPhone', 'touristAltPhone', 'touristEmail', 'touristLanguage',
    'familyMemberName', 'familyMemberNationality', 'familyMemberIdType', 'familyMemberBloodGroup'
  ];
  
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const familyDetails = document.getElementById('familyMemberDetails');
  if (familyDetails) familyDetails.style.display = 'none';
  
  if (errorMsg) errorMsg.textContent = '';
  if (modal) modal.style.display = 'flex';
}

function closeAddTouristModal() {
  const modal = document.getElementById('addTouristModal');
  if (modal) modal.style.display = 'none';
}

async function createNewTourist() {
  const getFieldValue = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  
  const fullName = getFieldValue('touristFullName');
  const nationality = getFieldValue('touristNationality');
  const idType = getFieldValue('touristIdType');
  const idNumber = getFieldValue('touristIdNumber');
  const phone = getFieldValue('touristPhone');
  const altPhone = getFieldValue('touristAltPhone');
  const email = getFieldValue('touristEmail');
  const language = getFieldValue('touristLanguage');
  
  // Family member data
  const familyMemberName = getFieldValue('familyMemberName');
  const familyMemberNationality = getFieldValue('familyMemberNationality');
  const familyMemberIdType = getFieldValue('familyMemberIdType');
  const familyMemberBloodGroup = getFieldValue('familyMemberBloodGroup');
  
  const errorEl = document.getElementById('addErrorMsg');
  if (!errorEl) return;

  // Validate required fields
  const validations = [
    [!fullName, 'Please enter the full name.'],
    [!nationality, 'Please select nationality.'],
    [!idType, 'Please enter the type of identification.'],
    [!idNumber, 'Please enter the identification number.'],
    [!phone, 'Please enter the phone number.'],
    [!email || !email.includes('@'), 'Please enter a valid email address.'],
    [!language, 'Please enter the preferred language.']
  ];

  for (const [condition, message] of validations) {
    if (condition) {
      errorEl.textContent = message;
      return;
    }
  }
  
  // Validate family member details if name is provided
  if (familyMemberName) {
    const familyValidations = [
      [!familyMemberNationality, 'Please select family member nationality.'],
      [!familyMemberIdType, 'Please enter family member type of identification.'],
      [!familyMemberBloodGroup, 'Please select family member blood group.']
    ];

    for (const [condition, message] of familyValidations) {
      if (condition) {
        errorEl.textContent = message;
        return;
      }
    }
  }

  try {
    // Prepare family member data
    let familyMemberData = null;
    if (familyMemberName) {
      familyMemberData = {
        name: familyMemberName,
        nationality: familyMemberNationality,
        idType: familyMemberIdType,
        bloodGroup: familyMemberBloodGroup
      };
    }
    
    const res = await fetch('/add-tourist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName, 
        nationality, 
        idType, 
        idNumber, 
        phone, 
        altPhone, 
        email, 
        language,
        familyMember: familyMemberData
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create tourist');
    }

    // Show success message
    if (data.resetLink) {
      alert('Tourist created successfully! Please check the email for password setup instructions.');
    } else {
      alert('Tourist created successfully! Please ask the user to reset their password.');
    }
    
    closeAddTouristModal();
    refreshDashboard(); // Refresh to show new user
  } catch (e) {
    errorEl.textContent = `❌ ${e.message}`;
  }
}

// Initial load and wire up buttons
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = 'login.html';
    return;
  }

  refreshDashboard();

  // Header buttons - Updated for new layout
  const logoutBtn = document.querySelector('.control-btn.logout');
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'login.html';
  });

  // Add New Tourist button
  const addTouristBtn = document.getElementById('addTouristBtn');
  addTouristBtn?.addEventListener('click', openAddTouristModal);

  // Add event listener for family member name input
  const familyMemberNameInput = document.getElementById('familyMemberName');
  familyMemberNameInput?.addEventListener('input', function() {
    const familyDetails = document.getElementById('familyMemberDetails');
    if (familyDetails) {
      familyDetails.style.display = this.value.trim() !== '' ? 'block' : 'none';
    }
  });

  // Manage Safe Zones button
  const manageSafeZonesBtn = document.getElementById('manageSafeZonesBtn');
  manageSafeZonesBtn?.addEventListener('click', openSafeZonesModal);

  // Close add modal
  const closeAddModalBtn = document.getElementById('closeAddModalBtn');
  closeAddModalBtn?.addEventListener('click', closeAddTouristModal);
  
  const cancelAddBtn = document.getElementById('cancelAddBtn');
  cancelAddBtn?.addEventListener('click', closeAddTouristModal);
  
  const addTouristModal = document.getElementById('addTouristModal');
  addTouristModal?.addEventListener('click', (e) => {
    if (e.target.id === 'addTouristModal') closeAddTouristModal();
  });

  // Create tourist
  const createTouristBtn = document.getElementById('createTouristBtn');
  createTouristBtn?.addEventListener('click', createNewTourist);

  // Safe zones
  const closeSafeZonesBtn = document.getElementById('closeSafeZonesBtn');
  closeSafeZonesBtn?.addEventListener('click', closeSafeZonesModal);
  
  const saveSafeZoneBtn = document.getElementById('saveSafeZoneBtn');
  saveSafeZoneBtn?.addEventListener('click', saveZone);
  
  const safeZonesModal = document.getElementById('safeZonesModal');
  safeZonesModal?.addEventListener('click', (e) => {
    if (e.target.id === 'safeZonesModal') closeSafeZonesModal();
  });

  // Zone type toggle
  document.querySelectorAll('.zone-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchZoneType(btn.dataset.type);
    });
  });

  // Tourist modal buttons
  const closeModalBtn = document.getElementById('closeModalBtn');
  closeModalBtn?.addEventListener('click', closeTouristModal);
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn?.addEventListener('click', saveTouristChanges);
  
  const contactBtn = document.getElementById('contactBtn');
  contactBtn?.addEventListener('click', contactTourist);
  
  const trackBtn = document.getElementById('trackBtn');
  trackBtn?.addEventListener('click', trackTourist);
  
  const deleteBtn = document.getElementById('deleteBtn');
  deleteBtn?.addEventListener('click', deleteTourist);
  
  const touristModal = document.getElementById('touristModal');
  touristModal?.addEventListener('click', (e) => {
    if (e.target.id === 'touristModal') closeTouristModal();
  });

  // Mobile responsive handlers
  if (window.innerWidth <= 768) {
    // Make widgets toggleable on mobile
    const touristWidget = document.querySelector('.tourist-widget');
    const activityWidget = document.querySelector('.activity-widget');
    
    if (touristWidget) {
      const header = touristWidget.querySelector('.widget-header');
      header?.addEventListener('click', () => {
        touristWidget.classList.toggle('open');
      });
    }
    
    if (activityWidget) {
      const header = activityWidget.querySelector('.widget-header');
      header?.addEventListener('click', () => {
        activityWidget.classList.toggle('open');
      });
    }
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = [
        'touristModal', 'safeZonesModal', 'addTouristModal', 'panicAlertOverlay'
      ];
      
      for (const modalId of modals) {
        const modal = document.getElementById(modalId);
        if (modal?.style.display === 'flex') {
          if (modalId === 'touristModal') closeTouristModal();
          else if (modalId === 'safeZonesModal') closeSafeZonesModal();
          else if (modalId === 'addTouristModal') closeAddTouristModal();
          else if (modalId === 'panicAlertOverlay') {
            const closeBtn = document.getElementById('panicCloseBtn');
            if (closeBtn) closeBtn.click();
          }
          break;
        }
      }
    }
  });

  // Window resize handler for responsive design
  window.addEventListener('resize', () => {
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 100);
    }
    
    if (safeZonesMapInstance) {
      setTimeout(() => {
        safeZonesMapInstance.invalidateSize();
      }, 100);
    }
  });
});