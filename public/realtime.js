// Firebase RTDB listener for panic alerts
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, onValue, update, get } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyCTxXjJvcnH0MCKmPUEq8O2CoC_FCjWVgM",
  authDomain: "tourist-safety-4761a.firebaseapp.com",
  databaseURL: "https://tourist-safety-4761a-default-rtdb.firebaseio.com",
  projectId: "tourist-safety-4761a",
  storageBucket: "tourist-safety-4761a.firebasestorage.app",
  messagingSenderId: "72405142462",
  appId: "1:72405142462:web:2c9c9318a97a2a24c3c7ef"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const overlay = document.getElementById('panicAlertOverlay');
const alertIdEl = document.getElementById('panicAlertId');
const latEl = document.getElementById('panicLat');
const lngEl = document.getElementById('panicLng');
const errorEl = document.getElementById('panicError');

let currentAlertPath = null; // e.g., panic_alerts/<pushId>

function showPanicModal(id, lat, lng, path) {
  currentAlertPath = path;
  alertIdEl.value = id || 'unknown';
  latEl.value = Number(lat ?? 0);
  lngEl.value = Number(lng ?? 0);
  errorEl.textContent = '';
  overlay.style.display = 'flex';
}

function hidePanicModal() {
  overlay.style.display = 'none';
  currentAlertPath = null;
}

// Listen to panic_alerts collection
const panicRef = ref(db, 'panic_alerts');
onValue(panicRef, async (snapshot) => {
  const value = snapshot.val() || {};
  // Find any alert where alertActive === true
  const entries = Object.entries(value);
  for (const [key, val] of entries) {
    if (val && val.alertActive === true) {
      let lat = val.latitude ?? val.lat ?? val.location?.lat;
      let lng = val.longitude ?? val.lng ?? val.location?.lng;

      // If coords missing on alert, try reading from users/<userId>
      if ((lat === undefined || lng === undefined) && val.userId) {
        try {
          const userSnap = await get(ref(db, `users/${val.userId}`));
          const user = userSnap.val() || {};
          lat = user.latitude ?? user.lat ?? user.location?.latitude ?? user.location?.lat;
          lng = user.longitude ?? user.lng ?? user.location?.longitude ?? user.location?.lng;
        } catch (_) {}
      }

      showPanicModal(key, lat, lng, `panic_alerts/${key}`);
      return;
    }
  }
  // No active alerts
  hidePanicModal();
});

// Wire buttons
document.getElementById('panicCloseBtn')?.addEventListener('click', hidePanicModal);
document.getElementById('panicAlertOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'panicAlertOverlay') hidePanicModal();
});

document.getElementById('centerMapBtn')?.addEventListener('click', () => {
  try {
    if (window.mapInstance && latEl.value && lngEl.value) {
      const lat = Number(latEl.value);
      const lng = Number(lngEl.value);
      window.mapInstance.setView([lat, lng], 15);
    }
  } catch (_) {}
});

document.getElementById('cancelAlertBtn')?.addEventListener('click', async () => {
  if (!currentAlertPath) return;
  errorEl.textContent = 'Updating alert...';
  try {
    await update(ref(db, currentAlertPath), { alertActive: false, status: 'cancelled' });
    errorEl.textContent = 'Alert cancelled.';
    setTimeout(hidePanicModal, 400);
  } catch (e) {
    errorEl.textContent = `❌ ${e.message || 'Failed to cancel alert'}`;
  }
});

// Expose map instance from script.js if available
// script.js creates a local variable. Mirror it onto window when map renders.
// We will monkey-patch setView usage if available.
try {
  const originalRenderMap = window.renderMap;
  if (typeof originalRenderMap === 'function') {
    window.renderMap = function patchedRenderMap() {
      const result = originalRenderMap.apply(this, arguments);
      if (typeof window.mapInstance === 'undefined' && typeof mapInstance !== 'undefined') {
        window.mapInstance = mapInstance;
      } else if (typeof mapInstance !== 'undefined') {
        window.mapInstance = mapInstance;
      }
      return result;
    };
  }
} catch (_) {}


