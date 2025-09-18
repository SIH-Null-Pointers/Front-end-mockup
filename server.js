// tourist-management-dashboard/server.js
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://tourist-safety-4761a-default-rtdb.firebaseio.com'
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: merge Firestore user doc with RTDB live coordinates
function mergeUserWithRTDB(doc, rtdbUsers) {
  const base = { docId: doc.id, ...doc.data() };
  const live = rtdbUsers?.[doc.id] || {};
  const latitude = live.latitude ?? base.location?.latitude ?? 0;
  const longitude = live.longitude ?? base.location?.longitude ?? 0;
  const safetyScore = base.safetyScore ?? 85;
  return {
    ...base,
    location: { latitude, longitude },
    safetyScore
  };
}

// Serve dashboard and login pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Get active tourists (profiles from Firestore + live coords from RTDB)
app.get('/tourists', async (req, res) => {
  try {
    const [fsSnap, rtdbSnap] = await Promise.all([
      admin.firestore().collection('users').get(),
      admin.database().ref('users').get()
    ]);
    const rtdbUsers = rtdbSnap.val() || {};
    const tourists = fsSnap.docs.map(doc => mergeUserWithRTDB(doc, rtdbUsers));
    res.json(tourists);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tourists' });
  }
});

// Get activities (panic logs)
app.get('/activities', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('panic_logs')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    const activities = snapshot.docs.map(doc => ({
      userId: doc.data().userId,
      type: 'critical',
      text: `Panic alert from ${doc.data().userId}`,
      time: doc.data().timestamp?.toDate().toLocaleTimeString() || 'N/A',
    }));
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Update tourist - ignores location; location is device-driven via RTDB
app.put('/tourists/:docId', async (req, res) => {
  const { docId } = req.params;
  const { name, nationality, phone, safetyScore } = req.body || {};
  try {
    const ref = admin.firestore().collection('users').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: `Tourist document ${docId} not found` });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (nationality !== undefined) update.nationality = nationality;
    if (phone !== undefined) update.phone = phone;
    if (SafetyScoreIsValid(safetyScore)) update.safetyScore = Number(safetyScore);
    // NOTE: location is NOT updated here; it comes from RTDB in real-time

    await ref.set(update, { merge: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tourist' });
  }
});

function SafetyScoreIsValid(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

// SSE for real-time updates (pushes merged Firestore + RTDB users)
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let latestFsDocs = [];
  let latestRtdbUsers = {};

  const sendUsers = () => {
    if (!latestFsDocs.length) return;
    const users = latestFsDocs.map(doc => mergeUserWithRTDB(doc, latestRtdbUsers));
    res.write(`data: ${JSON.stringify({ type: 'users', data: users })}\n\n`);
  };

  const fsUnsub = admin.firestore().collection('users').onSnapshot(snapshot => {
    latestFsDocs = snapshot.docs;
    sendUsers();
  }, () => {});

  const rtdbRef = admin.database().ref('users');
  const rtdbListener = rtdbRef.on('value', snap => {
    latestRtdbUsers = snap.val() || {};
    sendUsers();
  });

  const panicUnsub = admin.firestore().collection('panic_logs').onSnapshot(snapshot => {
    const panics = snapshot.docs.map(doc => ({
      userId: doc.id,
      type: 'critical',
      text: `Panic alert from ${doc.data().userId}`,
      time: doc.data().timestamp?.toDate().toLocaleTimeString() || 'N/A',
    }));
    res.write(`data: ${JSON.stringify({ type: 'panics', data: panics })}\n\n`);
  }, () => {});

  req.on('close', () => {
    fsUnsub();
    panicUnsub();
    rtdbRef.off('value', rtdbListener);
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));