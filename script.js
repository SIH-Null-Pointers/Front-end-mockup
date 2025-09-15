// ====================== Tourist Data ======================
const tourists = [
  { id: "T001", name: "John Smith", country: "USA", status: "normal", location: [40.758, -73.9855], complaint: 1 },
  { id: "T002", name: "Maria Garcia", country: "Spain", status: "abnormal", location: [34.101, -118.326], complaint: 0 },
  { id: "T003", name: "Akira Tanaka", country: "Japan", status: "normal", location: [25.7907, -80.1300], complaint: 2 },
  { id: "T004", name: "Emma Johnson", country: "Canada", status: "critical", location: [37.7749, -122.4194], complaint: 0 }
];

// ====================== Activity Data ======================
const activities = [
  { type: "info", text: "John Smith location updated - Times Square, NYC", time: "20:44:00" },
  { type: "critical", text: "Critical vitals detected for Emma Johnson - High fever and elevated heart rate", time: "20:42:00" },
  { type: "warning", text: "Abnormal vitals for Maria Garcia - Mild fever", time: "20:40:00" },
  { type: "warning", text: "Akira Tanaka reported 2 active complaints", time: "20:35:00" }
];

// ====================== Render Tourist List ======================
function renderTourists() {
  const list = document.getElementById("touristList");
  if (!list) return;

  list.innerHTML = "";
  tourists.forEach(t => {
    const card = document.createElement("div");
    card.className = "tourist-card";
    card.innerHTML = `
      <h4>${t.id} <span class="status ${t.status}">${t.status}</span></h4>
      <p><strong>${t.name}</strong> • ${t.country}</p>
      <p><i class="fa-solid fa-location-dot"></i> Last updated location</p>
      ${t.complaint > 0 ? `<p style="color: #e67e22;">⚠️ ${t.complaint} active complaint(s)</p>` : ""}
    `;
    list.appendChild(card);
  });

  document.getElementById("touristCount").textContent = tourists.length;
}

// ====================== Render Activity Feed ======================
function renderActivities() {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  feed.innerHTML = "";
  activities.forEach(a => {
    const card = document.createElement("div");
    card.className = `activity-card ${a.type}`;
    card.textContent = `${a.text} (${a.time})`;
    feed.appendChild(card);
  });
}

// ====================== Render Map ======================
let mapInstance; // prevent duplicate maps

function renderMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  // Prevent multiple map renders
  if (mapInstance) {
    mapInstance.remove();
  }

  mapInstance = L.map("map").setView([20, 0], 2);

  // Add OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(mapInstance);

  // Custom marker colors
  const statusColors = {
    normal: "green",
    abnormal: "orange",
    critical: "red"
  };

  tourists.forEach(t => {
    const marker = L.circleMarker(t.location, {
      radius: 10,
      fillColor: statusColors[t.status],
      color: "#333",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(mapInstance);

    marker.bindPopup(`<b>${t.name}</b><br>${t.country}<br>Status: ${t.status}`);
  });
}

// ====================== Refresh Dashboard ======================
function refreshDashboard() {
  renderTourists();
  renderActivities();
  renderMap();
}

// ====================== Initial Load ======================
document.addEventListener("DOMContentLoaded", () => {
  // Protect Dashboard
  if (localStorage.getItem("isLoggedIn") !== "true") {
    window.location.href = "login.html";
    return;
  }

  renderTourists();
  renderActivities();
  renderMap();

  // Refresh button
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshDashboard);
  }

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("isLoggedIn");
      window.location.href = "login.html";
    });
  }
});
