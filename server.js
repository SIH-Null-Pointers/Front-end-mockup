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
    const tourists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// SSE for real-time updates
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const usersUnsub = admin.firestore().collection('users').onSnapshot(snapshot => {
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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