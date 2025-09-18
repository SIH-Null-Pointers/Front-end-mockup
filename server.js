// tourist-management-dashboard/server.js
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard and login pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Get active tourists
app.get('/tourists', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users').get();
    // Always send the Firestore document ID as docId, keep other fields as-is
    const tourists = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
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

// Update tourist - only update existing docs; return 404 if doc doesn't exist
app.put('/tourists/:docId', async (req, res) => {
  const { docId } = req.params;
  const { name, nationality, phone, safetyScore, location } = req.body || {};
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
    if (safetyScore !== undefined) update.safetyScore = Number(safetyScore);
    if (location && typeof location === 'object') {
      update.location = {
        latitude: Number(location.latitude) || 0,
        longitude: Number(location.longitude) || 0
      };
    }

    await ref.set(update, { merge: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tourist' });
  }
});

// SSE for real-time updates
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const usersUnsub = admin.firestore().collection('users').onSnapshot(snapshot => {
    const users = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    res.write(`data: ${JSON.stringify({ type: 'users', data: users })}\n\n`);
  });

  const panicUnsub = admin.firestore().collection('panic_logs').onSnapshot(snapshot => {
    const panics = snapshot.docs.map(doc => ({
      userId: doc.id,
      type: 'critical',
      text: `Panic alert from ${doc.data().userId}`,
      time: doc.data().timestamp?.toDate().toLocaleTimeString() || 'N/A',
    }));
    res.write(`data: ${JSON.stringify({ type: 'panics', data: panics })}\n\n`);
  });

  req.on('close', () => {
    usersUnsub();
    panicUnsub();
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
