// tourist-management-dashboard/public/script.js
let tourists = [];
let activities = [];
let mapInstance;
let touristMarkers = {}; // docId -> Marker
let currentTouristDocId = null;

// Initialize EventSource for real-time updates
const eventSource = new EventSource('http://localhost:3000/stream');

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'users') {
    tourists = update.data.map(u => {
      // Strictly use Firestore docId; ignore any top-level "id" field from user data
      const docId = u.docId;
      const displayId = u.userId || u.id || docId; // show-friendly; never used to save
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
    }).filter(t => !!t.docId); // drop any records without docId (safety)
    renderTourists();
    renderMap();
    updateHeaderStats();
  } else if (update.type === 'panics') {
    activities = update.data.map(p => ({
      type: p.type,
      text: p.text,
      time: p.time,
    }));
    renderActivities();
    updateHeaderStats();
  }
};

// Update header stats
function updateHeaderStats() {
  const active = tourists.filter(t => t.status === 'normal').length;
  const abnormal = tourists.filter(t => t.status === 'abnormal').length;
  const critical = tourists.filter(t => t.status === 'critical').length;
  document.querySelector('.status.active').textContent = `${active} Active`;
  document.querySelector('.status.abnormal').textContent = `${abnormal} Abnormal`;
  document.querySelector('.status.critical').textContent = `${critical} Critical`;
}

// Render tourists
function renderTourists() {
  const list = document.getElementById('touristList');
  if (!list) return;

  list.innerHTML = '';
  tourists.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tourist-card';
    card.innerHTML = `
      <h4>${t.displayId} <span class="status ${t.status}">${t.status}</span></h4>
      <p><strong>${t.name}</strong> • ${t.country}</p>
      <p>Safety: ${t.safetyScore}%</p>
      <p><i class="fa-solid fa-location-dot"></i> Last updated location</p>
      ${t.complaint > 0 ? `<p style="color: #e67e22;">⚠️ ${t.complaint} active complaint(s)</p>` : ''}
    `;
    card.addEventListener('click', () => openTouristModal(t.docId));
    list.appendChild(card);
  });

  document.getElementById('touristCount').textContent = tourists.length;
}

// Render activities
function renderActivities() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  feed.innerHTML = '';
  activities.forEach(a => {
    const card = document.createElement('div');
    card.className = `activity-card ${a.type}`;
    card.textContent = `${a.text} (${a.time})`;
    feed.appendChild(card);
  });
}

// Render map
function renderMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  if (mapInstance) mapInstance.remove();
  mapInstance = L.map('map').setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(mapInstance);

  const statusColors = {
    normal: 'green',
    abnormal: 'orange',
    critical: 'red',
  };

  touristMarkers = {};
  tourists.forEach(t => {
    const marker = L.circleMarker(t.location, {
      radius: 10,
      fillColor: statusColors[t.status],
      color: '#333',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(mapInstance);

    marker.bindPopup(`<b>${t.name}</b><br>${t.country}<br>Status: ${t.status}<br>Safety: ${t.safetyScore}%`);
    touristMarkers[t.docId] = marker;
  });
}

// Manual refresh fallback
function refreshDashboard() {
  fetch('http://localhost:3000/tourists')
    .then(res => res.json())
    .then(data => {
      tourists = data.map(u => ({
        docId: u.docId, // strictly use docId
        displayId: u.userId || u.id || u.docId,
        name: u.name || 'Unknown',
        country: u.nationality || 'N/A',
        safetyScore: u.safetyScore ?? 85,
        status: (u.safetyScore ?? 85) > 80 ? 'normal' : (u.safetyScore ?? 85) > 60 ? 'abnormal' : 'critical',
        location: [u.location?.latitude ?? 0, u.location?.longitude ?? 0],
        complaint: u.complaints || 0,
        phone: u.phone || 'N/A',
      })).filter(t => !!t.docId);
      renderTourists();
      renderMap();
      updateHeaderStats();
    })
    .catch(error => console.error('Error fetching tourists:', error));
  fetch('http://localhost:3000/activities')
    .then(res => res.json())
    .then(data => {
      activities = data;
      renderActivities();
      updateHeaderStats();
    })
    .catch(error => console.error('Error fetching activities:', error));
}

// Modal logic
function getTouristByDocId(docId) {
  return tourists.find(t => t.docId === docId);
}
function openTouristModal(docId) {
  currentTouristDocId = docId;
  const t = getTouristByDocId(docId);
  if (!t) return;

  document.getElementById('modalTitle').textContent = `Tourist: ${t.name}`;
  document.getElementById('modalId').value = t.displayId; // friendly display
  document.getElementById('modalName').value = t.name || '';
  document.getElementById('modalCountry').value = t.country || '';
  document.getElementById('modalPhone').value = t.phone || '';
  document.getElementById('modalSafety').value = t.safetyScore ?? 0;
  document.getElementById('modalLat').value = t.location?.[0] ?? 0;
  document.getElementById('modalLng').value = t.location?.[1] ?? 0;
  document.getElementById('modalError').textContent = '';

  document.getElementById('touristModal').style.display = 'flex';
}
function closeTouristModal() {
  currentTouristDocId = null;
  document.getElementById('touristModal').style.display = 'none';
}
async function saveTouristChanges() {
  if (!currentTouristDocId) {
    const errorEl = document.getElementById('modalError');
    errorEl.textContent = 'Cannot save: missing document reference.';
    return;
  }
  const name = document.getElementById('modalName').value.trim();
  const country = document.getElementById('modalCountry').value.trim();
  const phone = document.getElementById('modalPhone').value.trim();
  const safetyScore = Number(document.getElementById('modalSafety').value);
  const lat = Number(document.getElementById('modalLat').value);
  const lng = Number(document.getElementById('modalLng').value);

  const errorEl = document.getElementById('modalError');
  errorEl.textContent = '';

  if (Number.isNaN(safetyScore) || safetyScore < 0 || safetyScore > 100) {
    errorEl.textContent = 'Safety score must be between 0 and 100.';
    return;
  }
  try {
    const res = await fetch(`/tourists/${encodeURIComponent(currentTouristDocId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        nationality: country,
        phone,
        safetyScore,
        location: { latitude: lat, longitude: lng }
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save changes');
    }
    closeTouristModal(); // SSE will refresh UI
  } catch (e) {
    errorEl.textContent = `❌ ${e.message}`;
  }
}
function contactTourist() {
  const t = currentTouristDocId ? getTouristByDocId(currentTouristDocId) : null;
  if (t?.phone && t.phone !== 'N/A') {
    window.location.href = `tel:${t.phone}`;
  } else {
    const errorEl = document.getElementById('modalError');
    errorEl.textContent = 'No phone number available.';
  }
}
function trackTourist() {
  const t = currentTouristDocId ? getTouristByDocId(currentTouristDocId) : null;
  if (!t || !mapInstance) return;
  const marker = touristMarkers[t.docId];
  if (marker) {
    mapInstance.setView(t.location, 13);
    marker.openPopup();
  }
}

// Initial load and wire up buttons
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = 'login.html';
    return;
  }
  refreshDashboard();

  document.querySelector('.btn.small')?.addEventListener('click', refreshDashboard);
  document.querySelector('.btn.logout')?.addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'login.html';
  });

  document.getElementById('closeModalBtn')?.addEventListener('click', closeTouristModal);
  document.getElementById('saveBtn')?.addEventListener('click', saveTouristChanges);
  document.getElementById('contactBtn')?.addEventListener('click', contactTourist);
  document.getElementById('trackBtn')?.addEventListener('click', trackTourist);
  document.getElementById('touristModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'touristModal') closeTouristModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('touristModal').style.display === 'flex') {
      closeTouristModal();
    }
  });
});
