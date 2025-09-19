// Enhanced Tourist Management Dashboard Script
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
let followTargetDocId = null; // keep centering on this tourist across updates
let currentMapStyle = 'light';

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

// Map tile layers
const MAP_STYLES = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors, © CARTO'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics'
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap contributors'
  }
};

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
    updateDashboardStats();

    // If the modal is open, refresh the live lat/lng fields without allowing edits
    if (prevOpen) {
      const t = tourists.find(x => x.docId === prevOpen);
      if (t) {
        const latInput = document.getElementById('modalLat');
        const lngInput = document.getElementById('modalLng');
        if (latInput && lngInput) {
          latInput.value = t.location?.[0] ?? 0;
          lngInput.value = t.location?.[1] ?? 0;
          updateSafetyIndicator(t.safetyScore);
        }
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

// Enhanced header stats update
function updateHeaderStats() {
  const active = tourists.filter(t => t.status === 'normal').length;
  const abnormal = tourists.filter(t => t.status === 'abnormal').length;
  const critical = tourists.filter(t => t.status === 'critical').length;
  
  // Update topbar indicators
  document.getElementById('activeCount').textContent = active;
  document.getElementById('warningCount').textContent = abnormal;
  document.getElementById('criticalCount').textContent = critical;
}

// Update dashboard summary stats
function updateDashboardStats() {
  const critical = activities.filter(a => a.type === 'critical').length;
  const warning = activities.filter(a => a.type === 'warning').length;
  const info = activities.filter(a => a.type === 'info').length;
  
  const summaryItems = document.querySelectorAll('.summary-item');
  summaryItems[0]?.querySelector('.summary-count')?.replaceWith(Object.assign(document.createElement('div'), {
    className: 'summary-count',
    textContent: critical
  }));
  summaryItems[1]?.querySelector('.summary-count')?.replaceWith(Object.assign(document.createElement('div'), {
    className: 'summary-count',
    textContent: warning
  }));
  summaryItems[2]?.querySelector('.summary-count')?.replaceWith(Object.assign(document.createElement('div'), {
    className: 'summary-count',
    textContent: info
  }));
}

// Enhanced tourist rendering with better UX
function renderTourists() {
  const list = document.getElementById('touristList');
  if (!list) return;

  // Add loading state
  list.classList.add('loading');

  // Clear and rebuild list
  list.innerHTML = '';
  tourists.forEach((t, index) => {
    const card = document.createElement('div');
    card.className = 'tourist-card';
    card.style.animationDelay = `${index * 50}ms`;
    
    const lastSeen = new Date().toLocaleTimeString();
    card.innerHTML = `
      <h4>
        ${t.displayId} 
        <span class="status ${t.status}">${t.status}</span>
      </h4>
      <p><i class="fas fa-user"></i><strong>${t.name}</strong> • ${t.country}</p>
      <p><i class="fas fa-shield-alt"></i>Safety Score: <strong>${t.safetyScore}%</strong></p>
      <p><i class="fas fa-clock"></i>Last seen: ${lastSeen}</p>
      <p><i class="fas fa-map-marker-alt"></i>Location: ${t.location[0].toFixed(4)}, ${t.location[1].toFixed(4)}</p>
      ${t.complaint > 0 ? `<p class="complaint-warning"><i class="fas fa-exclamation-triangle"></i>${t.complaint} active complaint(s)</p>` : ''}
    `;
    
    // Enhanced click and hover handlers
    card.addEventListener('click', () => {
      openTouristModal(t.docId);
      card.classList.add('clicked');
      setTimeout(() => card.classList.remove('clicked'), 300);
    });
    
    // Smooth hover focus on map
    card.addEventListener('mouseenter', () => {
      focusTourist(t.docId);
      card.classList.add('hovered');
    });
    
    card.addEventListener('mouseleave', () => {
      card.classList.remove('hovered');
    });
    
    list.appendChild(card);
  });

  // Update count badge
  document.getElementById('touristCount').textContent = tourists.length;
  
  // Remove loading state
  setTimeout(() => list.classList.remove('loading'), 300);
}

// Enhanced activity rendering
function renderActivities() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  feed.innerHTML = '';
  activities.forEach((a, index) => {
    const card = document.createElement('div');
    card.className = `activity-card ${a.type}`;
    card.style.animationDelay = `${index * 100}ms`;
    
    const timeAgo = getTimeAgo(a.time);
    card.innerHTML = `
      <div class="activity-content">
        <div class="activity-icon">
          <i class="fas ${getActivityIcon(a.type)}"></i>
        </div>
        <div class="activity-text">
          <span class="activity-message">${a.text}</span>
          <span class="activity-time">${timeAgo}</span>
        </div>
      </div>
    `;
    
    feed.appendChild(card);
  });
}

// Utility functions
function getTimeAgo(timeString) {
  try {
    const time = new Date(timeString);
    const now = new Date();
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  } catch {
    return timeString;
  }
}

function getActivityIcon(type) {
  switch (type) {
    case 'critical': return 'fa-exclamation-circle';
    case 'warning': return 'fa-exclamation-triangle';
    case 'info': return 'fa-info-circle';
    default: return 'fa-bell';
  }
}

// Enhanced map rendering with better performance
function renderMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // Initialize map once with enhanced settings
  if (!mapInitialized) {
    mapInstance = L.map('map', {
      zoomControl: false, // We'll add custom controls
      zoomAnimation: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      inertia: true,
      inertiaDeceleration: 3000,
      wheelDebounceTime: 50,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      preferCanvas: true, // Better performance
    }).setView(INDIA_CENTER, 5);

    // Add custom zoom control
    L.control.zoom({
      position: 'topright'
    }).addTo(mapInstance);

    // Expose map instance globally
    try { window.mapInstance = mapInstance; } catch (_) {}

    // Add initial tile layer
    L.tileLayer(MAP_STYLES[currentMapStyle].url, {
      attribution: MAP_STYLES[currentMapStyle].attribution,
      subdomains: 'abcd',
      maxZoom: 18,
      minZoom: 5
    }).addTo(mapInstance);

    // Enhanced interaction tracking
    mapInstance.on('movestart zoomstart', () => {
      userInteracting = true;
      if (interactionCooldownTimer) clearTimeout(interactionCooldownTimer);
    });
    
    mapInstance.on('moveend zoomend', () => {
      if (interactionCooldownTimer) clearTimeout(interactionCooldownTimer);
      interactionCooldownTimer = setTimeout(() => { 
        userInteracting = false; 
      }, 3000);
    });

    mapInitialized = true;
  }

  // Enhanced marker styling
  const statusColors = {
    normal: '#10b981',
    abnormal: '#f59e0b',
    critical: '#ef4444',
  };

  // Update or create markers with smooth animations
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
      // Smoothly update existing marker
      existing.setStyle({
        fillColor: statusColors[t.status],
        color: statusColors[t.status]
      });
      
      // Animate position change
      const currentLatLng = existing.getLatLng();
      const newLatLng = L.latLng(t.location);
      if (currentLatLng.distanceTo(newLatLng) > 10) { // Only animate if moved significantly
        existing.setLatLng(newLatLng);
      }
    } else {
      // Create new marker with enhanced styling
      const marker = L.circleMarker(t.location, {
        radius: 10,
        fillColor: statusColors[t.status],
        color: statusColors[t.status],
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9,
        className: `tourist-marker status-${t.status}`
      }).addTo(mapInstance);

      // Enhanced popup with more info
      const popupContent = `
        <div class="marker-popup">
          <div class="popup-header">
            <strong>${t.name}</strong>
            <span class="status ${t.status}">${t.status}</span>
          </div>
          <div class="popup-info">
            <p><i class="fas fa-flag"></i> ${t.country}</p>
            <p><i class="fas fa-shield-alt"></i> Safety: ${t.safetyScore}%</p>
            <p><i class="fas fa-map-marker-alt"></i> ${t.location[0].toFixed(4)}, ${t.location[1].toFixed(4)}</p>
            ${t.phone !== 'N/A' ? `<p><i class="fas fa-phone"></i> ${t.phone}</p>` : ''}
          </div>
          <div class="popup-actions">
            <button onclick="openTouristModal('${t.docId}')" class="popup-btn">
              <i class="fas fa-info-circle"></i> Details
            </button>
            <button onclick="trackTourist('${t.docId}')" class="popup-btn track">
              <i class="fas fa-crosshairs"></i> Track
            </button>
          </div>
        </div>
      `;
      
      marker.bindPopup(popupContent, {
        className: 'enhanced-popup',
        maxWidth: 300,
        minWidth: 250
      });

      // Add click handler
      marker.on('click', () => {
        followTargetDocId = t.docId;
      });

      touristMarkers[t.docId] = marker;
    }
  });

  // Remove obsolete markers
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

  // Handle panic alert following
  try {
    if (window.followAlertActive) {
      const latInput = document.getElementById('panicLat');
      const lngInput = document.getElementById('panicLng');
      const lat = latInput ? Number(latInput.value) : null;
      const lng = lngInput ? Number(lngInput.value) : null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (lat >= INDIA_BOUNDS[0][0] && lat <= INDIA_BOUNDS[1][0] &&
            lng >= INDIA_BOUNDS[0][1] && lng <= INDIA_BOUNDS[1][1]) {
          mapInstance.flyTo([lat, lng], Math.max(mapInstance.getZoom(), 15), { 
            animate: true, 
            duration: 0.8,
            maxZoom: 18
          });
        }
        return;
      }
    }
  } catch (_) {}

  // Handle tourist following
  if (followTargetDocId && touristMarkers[followTargetDocId]) {
    const latLng = touristMarkers[followTargetDocId].getLatLng();
    mapInstance.flyTo(latLng, Math.max(mapInstance.getZoom(), 14), { 
      animate: true, 
      duration: 0.8,
      maxZoom: 18
    });
    try { 
      touristMarkers[followTargetDocId].openPopup(); 
    } catch (_) {}
    return;
  }

  // Auto-fit bounds intelligently
  if (!userInteracting) {
    const ids = Object.keys(touristMarkers);
    if (ids.length === 1) {
      const only = tourists.find(x => x.docId === ids[0]);
      if (only) {
        mapInstance.setView(only.location, Math.max(mapInstance.getZoom(), 10), { 
          animate: true,
          maxZoom: 18
        });
      }
    } else if (ids.length > 1) {
      const bounds = L.latLngBounds(ids.map(id => touristMarkers[id].getLatLng()));
      const indiaBounds = L.latLngBounds(INDIA_BOUNDS);
      const fitBounds = bounds.intersect(indiaBounds);
      try {
        mapInstance.flyToBounds(fitBounds.pad(0.15), { 
          animate: true, 
          duration: 1.0,
          maxZoom: 16
        });
      } catch (_) {
        mapInstance.fitBounds(fitBounds.pad(0.15), { 
          animate: true,
          maxZoom: 16
        });
      }
    }
  }
}

// Enhanced zone rendering
function renderSafeZonesOnMap() {
  if (!mapInstance) return;

  // Clear existing circles
  Object.values(safeZoneCircles).forEach(circle => {
    if (mapInstance) mapInstance.removeLayer(circle);
  });
  safeZoneCircles = {};

  safeZones.forEach(zone => {
    if (zone.lat < INDIA_BOUNDS[0][0] || zone.lat > INDIA_BOUNDS[1][0] ||
        zone.lng < INDIA_BOUNDS[0][1] || zone.lng > INDIA_BOUNDS[1][1]) {
      return;
    }
    
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      fillColor: '#10b981',
      color: '#059669',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.25,
      className: 'safe-zone-circle'
    }).addTo(mapInstance);
    
    circle.bindPopup(`
      <div class="zone-popup safe">
        <h4><i class="fas fa-shield-alt"></i> Safe Zone</h4>
        <p><strong>Radius:</strong> ${zone.radius}m</p>
        <p><strong>Location:</strong> ${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)}</p>
      </div>
    `, { className: 'zone-popup-wrapper' });
    
    safeZoneCircles[zone.id] = circle;
  });
}

function renderUnsafeZonesOnMap() {
  if (!mapInstance) return;

  Object.values(unsafeZoneCircles).forEach(circle => {
    if (mapInstance) mapInstance.removeLayer(circle);
  });
  unsafeZoneCircles = {};

  unsafeZones.forEach(zone => {
    if (zone.lat < INDIA_BOUNDS[0][0] || zone.lat > INDIA_BOUNDS[1][0] ||
        zone.lng < INDIA_BOUNDS[0][1] || zone.lng > INDIA_BOUNDS[1][1]) {
      return;
    }
    
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      fillColor: '#ef4444',
      color: '#dc2626',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.2,
      className: 'unsafe-zone-circle'
    }).addTo(mapInstance);
    
    circle.bindPopup(`
      <div class="zone-popup unsafe">
        <h4><i class="fas fa-exclamation-triangle"></i> Unsafe Zone</h4>
        <p><strong>Radius:</strong> ${zone.radius}m</p>
        <p><strong>Location:</strong> ${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)}</p>
      </div>
    `, { className: 'zone-popup-wrapper' });
    
    unsafeZoneCircles[zone.id] = circle;
  });
}

// Map utility functions
function centerMapOnIndia() {
  if (mapInstance) {
    mapInstance.flyTo(INDIA_CENTER, 5, { animate: true, duration: 1.0 });
    followTargetDocId = null;
    try { window.followAlertActive = false; } catch (_) {}
  }
}

function toggleMapStyle() {
  if (!mapInstance) return;
  
  const styles = Object.keys(MAP_STYLES);
  const currentIndex = styles.indexOf(currentMapStyle);
  const nextIndex = (currentIndex + 1) % styles.length;
  currentMapStyle = styles[nextIndex];
  
  // Remove current layer and add new one
  mapInstance.eachLayer(layer => {
    if (layer instanceof L.TileLayer) {
      mapInstance.removeLayer(layer);
    }
  });
  
  L.tileLayer(MAP_STYLES[currentMapStyle].url, {
    attribution: MAP_STYLES[currentMapStyle].attribution,
    subdomains: 'abcd',
    maxZoom: 18,
    minZoom: 5
  }).addTo(mapInstance);
  
  // Show notification
  showNotification(`Map style changed to ${currentMapStyle}`, 'info');
}

// Enhanced modal functions
function openTouristModal(docId) {
  currentTouristDocId = docId;
  const t = getTouristByDocId(docId);
  if (!t) return;

  const modal = document.getElementById('touristModal');
  modal.classList.add('opening');

  document.getElementById('modalTitle').textContent = `${t.name} (${t.displayId})`;
  document.getElementById('modalId').value = t.displayId;
  document.getElementById('modalName').value = t.name || '';
  document.getElementById('modalCountry').value = t.country || '';
  document.getElementById('modalPhone').value = t.phone || '';
  document.getElementById('modalSafety').value = t.safetyScore ?? 0;

  // Location fields are read-only
  const latInput = document.getElementById('modalLat');
  const lngInput = document.getElementById('modalLng');
  latInput.value = t.location?.[0] ?? 0;
  lngInput.value = t.location?.[1] ?? 0;
  latInput.setAttribute('readonly', 'true');
  lngInput.setAttribute('readonly', 'true');
  
  updateSafetyIndicator(t.safetyScore);
  document.getElementById('modalError').textContent = '';
  modal.style.display = 'flex';
  
  setTimeout(() => modal.classList.remove('opening'), 300);
}

function updateSafetyIndicator(score) {
  const indicator = document.getElementById('safetyIndicator');
  if (!indicator) return;
  
  let color = '#10b981'; // green
  if (score <= 60) color = '#ef4444'; // red
  else if (score <= 80) color = '#f59e0b'; // yellow
  
  indicator.style.backgroundColor = color;
  indicator.style.animation = `pulse 2s ease-in-out infinite`;
}

// Enhanced notification system
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="fas ${getNotificationIcon(type)}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 100);
  
  // Remove after duration
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => document.body.removeChild(notification), 300);
  }, duration);
}

function getNotificationIcon(type) {
  switch (type) {
    case 'success': return 'fa-check-circle';
    case 'error': return 'fa-exclamation-circle';
    case 'warning': return 'fa-exclamation-triangle';
    default: return 'fa-info-circle';
  }
}

// Rest of the functions remain the same as in the original script.js
// (refreshDashboard, fetchSafeZones, modal functions, etc.)
// I'll include the most important ones here:

// Manual refresh with enhanced feedback
function refreshDashboard() {
  const refreshBtn = document.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.classList.add('loading');
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Refreshing...</span>';
  }
  
  Promise.all([
    fetch('http://localhost:3000/tourists').then(res => res.json()),
    fetch('http://localhost:3000/activities').then(res => res.json()),
    fetch('http://localhost:3000/safe-zones').then(res => res.json()),
    fetch('http://localhost:3000/unsafe-zones').then(res => res.json())
  ]).then(([touristsData, activitiesData, safeZonesData, unsafeZonesData]) => {
    tourists = touristsData.map(u => {
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
    
    activities = activitiesData;
    safeZones = safeZonesData;
    unsafeZones = unsafeZonesData;
    
    renderTourists();
    renderMap();
    renderActivities();
    updateHeaderStats();
    updateDashboardStats();
    
    showNotification('Dashboard refreshed successfully', 'success');
  }).catch(error => {
    console.error('Error refreshing dashboard:', error);
    showNotification('Failed to refresh dashboard', 'error');
  }).finally(() => {
    if (refreshBtn) {
      refreshBtn.classList.remove('loading');
      refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Refresh</span>';
    }
  });
}

// Enhanced focus function
function focusTourist(docId, zoom) {
  const t = tourists.find(x => x.docId === docId);
  if (!t || !mapInstance) return;
  
  const marker = touristMarkers[docId];
  const targetZoom = Number.isFinite(zoom) ? zoom : Math.max(mapInstance.getZoom(), 12);
  
  mapInstance.flyTo(t.location, targetZoom, { 
    animate: true, 
    duration: 0.6,
    maxZoom: 18
  });
  
  if (marker) { 
    try { 
      marker.openPopup(); 
      // Add temporary highlight effect
      marker.setStyle({ radius: 15 });
      setTimeout(() => marker.setStyle({ radius: 10 }), 1000);
    } catch (_) {} 
  }
}

// Utility functions for modal management
function getTouristByDocId(docId) {
  return tourists.find(t => t.docId === docId);
}

function closeTouristModal() {
  currentTouristDocId = null;
  const modal = document.getElementById('touristModal');
  modal.classList.add('closing');
  setTimeout(() => {
    modal.style.display = 'none';
    modal.classList.remove('closing');
  }, 200);
}

function trackTourist(docId = null) {
  const targetId = docId || currentTouristDocId;
  const t = targetId ? getTouristByDocId(targetId) : null;
  if (!t || !mapInstance) return;
  
  const marker = touristMarkers[t.docId];
  if (marker) {
    mapInstance.flyTo(t.location, 15, { 
      animate: true, 
      duration: 0.8,
      maxZoom: 18
    });
    marker.openPopup();
    followTargetDocId = t.docId;
    
    // Close modal if open
    if (currentTouristDocId) {
      closeTouristModal();
    }
    
    showNotification(`Now tracking ${t.name}`, 'info');
  }
}

function contactTourist() {
  const t = currentTouristDocId ? getTouristByDocId(currentTouristDocId) : null;
  if (t?.phone && t.phone !== 'N/A') {
    window.location.href = `tel:${t.phone}`;
  } else {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'No phone number available.';
    showNotification('No phone number available', 'warning');
  }
}

// Enhanced save function with validation
async function saveTouristChanges() {
  if (!currentTouristDocId) {
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = 'Cannot save: missing document reference.';
    return;
  }
  
  const name = document.getElementById('modalName').value.trim();
  const country = document.getElementById('modalCountry').value.trim();
  const phone = document.getElementById('modalPhone').value.trim();
  const safetyScore = Number(document.getElementById('modalSafety').value);

  const errorEl = document.getElementById('modalError');
  const saveBtn = document.getElementById('saveBtn');
  
  if (errorEl) errorEl.textContent = '';

  // Validation
  if (!name) {
    if (errorEl) errorEl.textContent = 'Name is required.';
    return;
  }
  
  if (!Number.isFinite(safetyScore) || safetyScore < 0 || safetyScore > 100) {
    if (errorEl) errorEl.textContent = 'Safety score must be between 0 and 100.';
    return;
  }
  
  // Add loading state
  if (saveBtn) {
    saveBtn.classList.add('loading');
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving...</span>';
  }
  
  try {
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
    
    showNotification('Tourist information updated successfully', 'success');
    closeTouristModal();
  } catch (e) {
    if (errorEl) errorEl.textContent = `❌ ${e.message}`;
    showNotification('Failed to save changes', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.classList.remove('loading');
      saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Save Changes</span>';
    }
  }
}

// Enhanced delete function with confirmation
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

  // Enhanced confirmation dialog
  const confirmed = await showConfirmDialog(
    'Delete Tourist',
    `Are you sure you want to delete "${t.name}" (${t.displayId})? This action cannot be undone.`,
    'danger'
  );
  
  if (!confirmed) return;

  const errorEl = document.getElementById('modalError');
  const deleteBtn = document.getElementById('deleteBtn');
  
  if (deleteBtn) {
    deleteBtn.classList.add('loading');
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Deleting...</span>';
  }
  
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

    showNotification('Tourist deleted successfully', 'success');
    closeTouristModal();
    refreshDashboard();
  } catch (e) {
    if (errorEl) errorEl.textContent = `❌ ${e.message}`;
    showNotification('Failed to delete tourist', 'error');
  } finally {
    if (deleteBtn) {
      deleteBtn.classList.remove('loading');
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i><span>Delete</span>';
    }
  }
}

// Enhanced confirmation dialog
function showConfirmDialog(title, message, type = 'info') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay';
    overlay.innerHTML = `
      <div class="modal confirm-modal">
        <div class="modal-header ${type}-header">
          <div class="modal-title-section">
            <div class="modal-icon">
              <i class="fas ${type === 'danger' ? 'fa-exclamation-triangle' : 'fa-question-circle'}"></i>
            </div>
            <h3>${title}</h3>
          </div>
        </div>
        <div class="modal-body">
          <p class="confirm-message">${message}</p>
          <div class="modal-actions">
            <button class="action-btn cancel-btn" id="confirmCancel">
              <i class="fas fa-times"></i>
              <span>Cancel</span>
            </button>
            <button class="action-btn ${type === 'danger' ? 'delete-btn' : 'save-btn'}" id="confirmOk">
              <i class="fas ${type === 'danger' ? 'fa-trash' : 'fa-check'}"></i>
              <span>${type === 'danger' ? 'Delete' : 'Confirm'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add click handlers
    overlay.querySelector('#confirmCancel').onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };
    
    overlay.querySelector('#confirmOk').onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    };
  });
}

// Add New Tourist Modal Functions
function openAddTouristModal() {
  const modal = document.getElementById('addTouristModal');
  const errorMsg = document.getElementById('addErrorMsg');
  
  // Clear all input fields
  const inputs = modal.querySelectorAll('input, select');
  inputs.forEach(input => {
    if (input.type === 'checkbox') {
      input.checked = false;
    } else {
      input.value = '';
    }
  });
  
  // Hide family member details
  document.getElementById('familyMemberDetails').style.display = 'none';
  
  if (errorMsg) errorMsg.textContent = '';
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('opening');
    setTimeout(() => modal.classList.remove('opening'), 300);
  }
}

function closeAddTouristModal() {
  const modal = document.getElementById('addTouristModal');
  if (modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('closing');
    }, 200);
  }
}

async function createNewTourist() {
  const form = document.getElementById('addTouristModal');
  const inputs = {
    fullName: document.getElementById('touristFullName').value.trim(),
    nationality: document.getElementById('touristNationality').value,
    idType: document.getElementById('touristIdType').value.trim(),
    idNumber: document.getElementById('touristIdNumber').value.trim(),
    phone: document.getElementById('touristPhone').value.trim(),
    altPhone: document.getElementById('touristAltPhone').value.trim(),
    email: document.getElementById('touristEmail').value.trim(),
    language: document.getElementById('touristLanguage').value.trim(),
    familyMemberName: document.getElementById('familyMemberName').value.trim(),
    familyMemberNationality: document.getElementById('familyMemberNationality').value,
    familyMemberIdType: document.getElementById('familyMemberIdType').value.trim(),
    familyMemberBloodGroup: document.getElementById('familyMemberBloodGroup').value
  };
  
  const errorEl = document.getElementById('addErrorMsg');
  const createBtn = document.getElementById('createTouristBtn');

  if (!errorEl) return;

  // Validation
  const requiredFields = [
    { field: inputs.fullName, name: 'Full name' },
    { field: inputs.nationality, name: 'Nationality' },
    { field: inputs.idType, name: 'ID type' },
    { field: inputs.idNumber, name: 'ID number' },
    { field: inputs.phone, name: 'Phone number' },
    { field: inputs.email, name: 'Email address' },
    { field: inputs.language, name: 'Preferred language' }
  ];

  for (const { field, name } of requiredFields) {
    if (!field) {
      errorEl.textContent = `${name} is required.`;
      return;
    }
  }

  if (!inputs.email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address.';
    return;
  }

  // Validate family member details if name is provided
  if (inputs.familyMemberName) {
    if (!inputs.familyMemberNationality || !inputs.familyMemberIdType || !inputs.familyMemberBloodGroup) {
      errorEl.textContent = 'Please complete all family member details.';
      return;
    }
  }

  // Add loading state
  if (createBtn) {
    createBtn.classList.add('loading');
    createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Creating...</span>';
  }

  try {
    let familyMemberData = null;
    if (inputs.familyMemberName) {
      familyMemberData = {
        name: inputs.familyMemberName,
        nationality: inputs.familyMemberNationality,
        idType: inputs.familyMemberIdType,
        bloodGroup: inputs.familyMemberBloodGroup
      };
    }
    
    const res = await fetch('/add-tourist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName: inputs.fullName,
        nationality: inputs.nationality,
        idType: inputs.idType,
        idNumber: inputs.idNumber,
        phone: inputs.phone,
        altPhone: inputs.altPhone,
        email: inputs.email,
        language: inputs.language,
        familyMember: familyMemberData
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create tourist');
    }

    showNotification('Tourist created successfully! Password reset email sent.', 'success', 5000);
    closeAddTouristModal();
    refreshDashboard();
  } catch (e) {
    errorEl.textContent = `❌ ${e.message}`;
    showNotification('Failed to create tourist', 'error');
  } finally {
    if (createBtn) {
      createBtn.classList.remove('loading');
      createBtn.innerHTML = '<i class="fas fa-plus-circle"></i><span>Create Tourist</span>';
    }
  }
}

// Safe Zones Management
function openSafeZonesModal() {
  const modal = document.getElementById('safeZonesModal');
  modal.style.display = 'flex';
  modal.classList.add('opening');
  
  currentZoneType = 'safe';
  initSafeZonesMap();
  renderSafeZonesList();
  renderUnsafeZonesList();
  fetchSafeZones();
  fetchUnsafeZones();
  updateZoneTypeToggle();
  
  selectedZoneLatLng = null;
  document.getElementById('saveSafeZoneBtn').disabled = true;
  
  setTimeout(() => modal.classList.remove('opening'), 300);
}

function closeSafeZonesModal() {
  const modal = document.getElementById('safeZonesModal');
  modal.classList.add('closing');
  
  setTimeout(() => {
    modal.style.display = 'none';
    modal.classList.remove('closing');
    selectedZoneLatLng = null;
    document.getElementById('saveSafeZoneBtn').disabled = true;
    
    if (safeZonesMapInstance) {
      safeZonesMapInstance.off('click');
    }
  }, 200);
}

// Initialize enhanced event listeners
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = 'login.html';
    return;
  }

  // Initial load
  refreshDashboard();

  // Enhanced header button handlers
  const refreshBtn = document.querySelector('.refresh-btn');
  refreshBtn?.addEventListener('click', refreshDashboard);
  
  const logoutBtn = document.querySelector('.logout-btn');
  logoutBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog(
      'Logout',
      'Are you sure you want to logout?',
      'info'
    );
    
    if (confirmed) {
      localStorage.removeItem('isLoggedIn');
      showNotification('Logged out successfully', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    }
  });

  // Modal event listeners
  const addTouristBtn = document.getElementById('addTouristBtn');
  addTouristBtn?.addEventListener('click', openAddTouristModal);

  const manageSafeZonesBtn = document.getElementById('manageSafeZonesBtn');
  manageSafeZonesBtn?.addEventListener('click', openSafeZonesModal);

  // Family member details toggle
  const familyMemberNameInput = document.getElementById('familyMemberName');
  familyMemberNameInput?.addEventListener('input', function() {
    const familyDetails = document.getElementById('familyMemberDetails');
    if (this.value.trim() !== '') {
      familyDetails.style.display = 'block';
    } else {
      familyDetails.style.display = 'none';
    }
  });

  // Modal close handlers
  document.getElementById('closeModalBtn')?.addEventListener('click', closeTouristModal);
  document.getElementById('closeAddModalBtn')?.addEventListener('click', closeAddTouristModal);
  document.getElementById('cancelAddBtn')?.addEventListener('click', closeAddTouristModal);
  document.getElementById('closeSafeZonesBtn')?.addEventListener('click', closeSafeZonesModal);

  // Modal action handlers
  document.getElementById('saveBtn')?.addEventListener('click', saveTouristChanges);
  document.getElementById('contactBtn')?.addEventListener('click', contactTourist);
  document.getElementById('trackBtn')?.addEventListener('click', () => trackTourist());
  document.getElementById('deleteBtn')?.addEventListener('click', deleteTourist);
  document.getElementById('createTouristBtn')?.addEventListener('click', createNewTourist);

  // Zone type toggle handlers
  document.querySelectorAll('.zone-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchZoneType(btn.dataset.type);
    });
  });

  // Modal overlay click handlers
  ['touristModal', 'addTouristModal', 'safeZonesModal'].forEach(modalId => {
    document.getElementById(modalId)?.addEventListener('click', (e) => {
      if (e.target.id === modalId) {
        if (modalId === 'touristModal') closeTouristModal();
        else if (modalId === 'addTouristModal') closeAddTouristModal();
        else if (modalId === 'safeZonesModal') closeSafeZonesModal();
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = ['touristModal', 'addTouristModal', 'safeZonesModal'];
      for (const modalId of modals) {
        const modal = document.getElementById(modalId);
        if (modal?.style.display === 'flex') {
          if (modalId === 'touristModal') closeTouristModal();
          else if (modalId === 'addTouristModal') closeAddTouristModal();
          else if (modalId === 'safeZonesModal') closeSafeZonesModal();
          break;
        }
      }
    }
    
    // Quick refresh with Ctrl/Cmd + R
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      refreshDashboard();
    }
  });

  // Add safety score input handler for real-time indicator update
  document.getElementById('modalSafety')?.addEventListener('input', (e) => {
    updateSafetyIndicator(Number(e.target.value));
  });

  console.log('Enhanced dashboard initialized successfully');
});

// Additional utility functions that were in the original script
// (fetchSafeZones, fetchUnsafeZones, zone management functions, etc.)
// These remain largely unchanged but with enhanced error handling

async function fetchSafeZones() {
  try {
    const res = await fetch('http://localhost:3000/safe-zones');
    if (!res.ok) throw new Error('Failed to fetch safe zones');
    safeZones = await res.json();
    renderSafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderSafeZonesList();
    }
  } catch (error) {
    console.error('Error fetching safe zones:', error);
    showNotification('Failed to load safe zones', 'error');
  }
}

async function fetchUnsafeZones() {
  try {
    const res = await fetch('http://localhost:3000/unsafe-zones');
    if (!res.ok) throw new Error('Failed to fetch unsafe zones');
    unsafeZones = await res.json();
    renderUnsafeZonesOnMap();
    if (document.getElementById('safeZonesModal')?.style.display === 'flex') {
      renderUnsafeZonesList();
    }
  } catch (error) {
    console.error('Error fetching unsafe zones:', error);
    showNotification('Failed to load unsafe zones', 'error');
  }
}

// Zone management functions remain the same with enhanced error handling
function updateZoneTypeToggle() {
  document.querySelectorAll('.zone-type-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === currentZoneType) {
      btn.classList.add('active');
    }
  });
  document.getElementById('saveSafeZoneBtn').textContent = 
    currentZoneType === 'safe' ? 'Save Safe Zone' : 'Save Unsafe Zone';
}

function switchZoneType(type) {
  currentZoneType = type;
  updateZoneTypeToggle();
  selectedZoneLatLng = null;
  document.getElementById('saveSafeZoneBtn').disabled = true;
  
  // Clear any selected markers and reinitialize map click handler
  if (safeZonesMapInstance) {
    safeZonesMapInstance.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.options.icon?.options?.html) {
        safeZonesMapInstance.removeLayer(layer);
      }
    });
  }
}