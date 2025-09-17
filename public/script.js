// tourist-management-dashboard/public/script.js
let tourists = [];
let activities = [];
let mapInstance;

// Initialize EventSource for real-time updates
const eventSource = new EventSource('http://localhost:3000/stream');

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'users') {
    tourists = update.data.map(u => ({
      id: u.id,
      name: u.name || 'Unknown',
      country: u.nationality || 'N/A',
      status: u.safetyScore > 80 ? 'normal' : u.safetyScore > 60 ? 'abnormal' : 'critical',
      location: [u.location?.latitude || 0, u.location?.longitude || 0],
      complaint: u.complaints || 0,
      safetyScore: u.safetyScore || 85,
      phone: u.phone || 'N/A',
    }));
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
      <h4>${t.id} <span class="status ${t.status}">${t.status}</span></h4>
      <p><strong>${t.name}</strong> • ${t.country}</p>
      <p>Safety: ${t.safetyScore}%</p>
      <p><i class="fa-solid fa-location-dot"></i> Last updated location</p>
      ${t.complaint > 0 ? `<p style="color: #e67e22;">⚠️ ${t.complaint} active complaint(s)</p>` : ''}
    `;
    card.addEventListener('click', () => {
      const actions = prompt(`Actions for ${t.name}:\n1. Call: ${t.phone}\n2. Contact\nEnter action (call/contact):`);
      if (actions?.toLowerCase() === 'call' && t.phone !== 'N/A') {
        window.location.href = `tel:${t.phone}`;
      } else if (actions?.toLowerCase() === 'contact') {
        alert('Contact feature not implemented yet.');
      }
    });
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
  });
}

// Refresh dashboard
function refreshDashboard() {
  fetch('http://localhost:3000/tourists')
    .then(res => res.json())
    .then(data => {
      tourists = data.map(u => ({
        id: u.id,
        name: u.name || 'Unknown',
        country: u.nationality || 'N/A',
        status: u.safetyScore > 80 ? 'normal' : u.safetyScore > 60 ? 'abnormal' : 'critical',
        location: [u.location?.latitude || 0, u.location?.longitude || 0],
        complaint: u.complaints || 0,
        safetyScore: u.safetyScore || 85,
        phone: u.phone || 'N/A',
      }));
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

// Initial load
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
});