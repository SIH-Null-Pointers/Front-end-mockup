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
  document.getElementById('modalId').value = t.displayId;
  document.getElementById('modalName').value = t.name || '';
  document.getElementById('modalCountry').value = t.country || '';
  document.getElementById('modalPhone').value = t.phone || '';
  document.getElementById('modalSafety').value = t.safetyScore ?? 0;

  // Lat/Lng are read-only and driven by RTDB; fill current values
  document.getElementById('modalLat').setAttribute('disabled', 'true');
  document.getElementById('modalLng').setAttribute('disabled', 'true');
  document.getElementById('modalLat').value = t.location?.[0] ?? 0;
  document.getElementById('modalLng').value = t.location?.[1] ?? 0;
  document.getElementById('modalError').textContent = '';

  // Show delete button
  document.getElementById('deleteBtn').style.display = 'block';

  document.getElementById('touristModal').style.display = 'flex';
}

function closeTouristModal() {
  currentTouristDocId = null;
  document.getElementById('touristModal').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';
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

  const errorEl = document.getElementById('modalError');
  errorEl.textContent = '';

  if (!Number.isFinite(safetyScore) || safetyScore < 0 || safetyScore > 100) {
    errorEl.textContent = 'Safety score must be between 0 and 100.';
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
    errorEl.textContent = `❌ ${e.message}`;
  }
}

async function deleteTourist() {
  if (!currentTouristDocId) {
    const errorEl = document.getElementById('modalError');
    errorEl.textContent = 'Cannot delete: missing document reference.';
    return;
  }

  const t = getTouristByDocId(currentTouristDocId);
  if (!t) {
    const errorEl = document.getElementById('modalError');
    errorEl.textContent = 'Tourist not found.';
    return;
  }

  // Confirm deletion
  if (!confirm(`Are you sure you want to delete tourist "${t.name}" (${t.displayId})? This action cannot be undone.`)) {
    return;
  }

  const errorEl = document.getElementById('modalError');
  errorEl.textContent = 'Deleting tourist...';

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

// Add New Tourist Modal HTML
const addTouristModalHTML = `
<div id="addTouristModal" class="modal-overlay" style="display: none;">
  <div class="modal">
    <div class="modal-header">
      <h3>Add New Tourist</h3>
      <button id="closeAddModalBtn" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
    </div>
    <div class="modal-body">
      <p>Enter the email address to create a new tourist account. A password reset email will be sent automatically.</p>
      <div class="modal-row">
        <label for="newEmail">Email Address</label>
        <input type="email" id="newEmail" placeholder="user@example.com" required>
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancelAddBtn">Cancel</button>
        <button class="btn small" id="createTouristBtn">Create</button>
      </div>
      <p id="addErrorMsg" style="color: red; font-size: 0.9rem; margin-top: 0.5rem;"></p>
    </div>
  </div>
</div>
`;

// Modal functions for adding tourist
function openAddTouristModal() {
  document.getElementById('newEmail').value = '';
  document.getElementById('addErrorMsg').textContent = '';
  document.getElementById('addTouristModal').style.display = 'flex';
}

function closeAddTouristModal() {
  document.getElementById('addTouristModal').style.display = 'none';
}

async function createNewTourist() {
  const email = document.getElementById('newEmail').value.trim();
  const errorEl = document.getElementById('addErrorMsg');

  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address.';
    return;
  }

  try {
    const res = await fetch('/add-tourist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create tourist');
    }

    alert('Tourist created successfully! Password reset email sent.');
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

  // Append add tourist modal
  document.body.insertAdjacentHTML('beforeend', addTouristModalHTML);

  refreshDashboard();

  // Header buttons
  document.querySelector('.btn.small')?.addEventListener('click', refreshDashboard);
  document.querySelector('.btn.logout')?.addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'login.html';
  });

  // Add New Tourist button
  document.getElementById('addTouristBtn')?.addEventListener('click', openAddTouristModal);

  // Close add modal
  document.getElementById('closeAddModalBtn')?.addEventListener('click', closeAddTouristModal);
  document.getElementById('cancelAddBtn')?.addEventListener('click', closeAddTouristModal);
  document.getElementById('addTouristModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'addTouristModal') closeAddTouristModal();
  });

  // Create tourist
  document.getElementById('createTouristBtn')?.addEventListener('click', createNewTourist);

  // Tourist modal buttons
  document.getElementById('closeModalBtn')?.addEventListener('click', closeTouristModal);
  document.getElementById('saveBtn')?.addEventListener('click', saveTouristChanges);
  document.getElementById('contactBtn')?.addEventListener('click', contactTourist);
  document.getElementById('trackBtn')?.addEventListener('click', trackTourist);
  document.getElementById('deleteBtn')?.addEventListener('click', deleteTourist);
  document.getElementById('touristModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'touristModal') closeTouristModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('touristModal').style.display === 'flex') {
      closeTouristModal();
    }
  });
});