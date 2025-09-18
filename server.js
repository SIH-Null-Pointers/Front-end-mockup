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

// Get safe zones
app.get('/safe-zones', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('safe_zones').get();
    const zones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch safe zones' });
  }
});

// Add safe zone
app.post('/safe-zones', async (req, res) => {
  const { lat, lng, radius } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
    return res.status(400).json({ error: 'Invalid lat, lng, or radius' });
  }
  try {
    const docRef = await admin.firestore().collection('safe_zones').add({
      lat,
      lng,
      radius,
      type: 'safe',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    const doc = await docRef.get();
    res.json({ ok: true, id: docRef.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add safe zone' });
  }
});

// Delete safe zone
app.delete('/safe-zones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await admin.firestore().collection('safe_zones').doc(id).delete();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete safe zone' });
  }
});

// Get unsafe zones
app.get('/unsafe-zones', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('unsafe_zones').get();
    const zones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unsafe zones' });
  }
});

// Add unsafe zone
app.post('/unsafe-zones', async (req, res) => {
  const { lat, lng, radius } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
    return res.status(400).json({ error: 'Invalid lat, lng, or radius' });
  }
  try {
    const docRef = await admin.firestore().collection('unsafe_zones').add({
      lat,
      lng,
      radius,
      type: 'unsafe',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    const doc = await docRef.get();
    res.json({ ok: true, id: docRef.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add unsafe zone' });
  }
});

// Delete unsafe zone
app.delete('/unsafe-zones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await admin.firestore().collection('unsafe_zones').doc(id).delete();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete unsafe zone' });
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

// Delete tourist - removes from Firestore and Firebase Auth
app.delete('/tourists/:docId', async (req, res) => {
  const { docId } = req.params;
  
  if (!docId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    // First, get the user document to extract UID for Auth deletion
    const userDoc = await admin.firestore().collection('users').doc(docId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: `Tourist document ${docId} not found` });
    }

    const userData = userDoc.data();
    const uid = userData.userId || docId; // Use userId from document or fallback to docId
    const userName = userData.name || 'Unknown';

    // Get panic logs BEFORE starting transaction (all reads first)
    const panicLogsQuery = admin.firestore().collection('panic_logs')
      .where('userId', '==', uid);
    const panicLogsSnapshot = await panicLogsQuery.get();
    const panicLogRefs = panicLogsSnapshot.docs.map(doc => doc.ref);

    // Now start transaction with all reads completed
    await admin.firestore().runTransaction(async (transaction) => {
      // Delete Firestore user document
      transaction.delete(admin.firestore().collection('users').doc(docId));
      
      // Delete all associated panic logs
      panicLogRefs.forEach(ref => {
        transaction.delete(ref);
      });
    });

    // Delete from Firebase Authentication (this is async and may take time)
    try {
      await admin.auth().deleteUser(uid);
      console.log(`Successfully deleted Auth user: ${uid}`);
    } catch (authError) {
      console.warn(`Failed to delete Auth user ${uid}:`, authError.message);
      // Don't fail the entire operation if Auth deletion fails
    }

    // Remove from RTDB if present
    try {
      await admin.database().ref(`users/${docId}`).remove();
      console.log(`Successfully removed from RTDB: ${docId}`);
    } catch (rtdbError) {
      console.warn(`Failed to remove from RTDB ${docId}:`, rtdbError.message);
    }

    res.json({ 
      ok: true, 
      message: `Tourist ${userName} deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting tourist:', error);
    res.status(500).json({ error: 'Failed to delete tourist: ' + error.message });
  }
});

// Add new tourist: create Auth user with temporary password and send reset email
app.post('/add-tourist', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Create user with temporary password
    const userRecord = await admin.auth().createUser({
      email: email,
      password: 'TempPass123!', // Temporary password
      emailVerified: false
    });

    // Generate password reset link and send email manually
    const resetLink = await admin.auth().generatePasswordResetLink(email);
    
    // Send the password reset email
    const actionCodeSettings = {
      url: resetLink, // This will be the deep link
      handleCodeInApp: true
    };

    await admin.auth().sendPasswordResetEmail(email, actionCodeSettings);

    // Create initial Firestore user doc
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      userId: userRecord.uid,
      email: email,
      name: 'New Tourist',
      nationality: 'N/A',
      phone: 'N/A',
      safetyScore: 85,
      location: { latitude: 0, longitude: 0 },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ 
      ok: true, 
      uid: userRecord.uid,
      message: 'Tourist created successfully. Password reset email sent.'
    });
  } catch (error) {
    console.error('Error creating tourist:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'Email already registered' });
    } else if (error.code === 'auth/invalid-email') {
      res.status(400).json({ error: 'Invalid email address' });
    } else {
      res.status(500).json({ error: 'Failed to create tourist: ' + error.message });
    }
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

  // Safe zones listener
  const safeZonesUnsub = admin.firestore().collection('safe_zones').onSnapshot(snapshot => {
    const zones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.write(`data: ${JSON.stringify({ type: 'safeZones', data: zones })}\n\n`);
  }, () => {});

  // Unsafe zones listener
  const unsafeZonesUnsub = admin.firestore().collection('unsafe_zones').onSnapshot(snapshot => {
    const zones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.write(`data: ${JSON.stringify({ type: 'unsafeZones', data: zones })}\n\n`);
  }, () => {});

  req.on('close', () => {
    fsUnsub();
    panicUnsub();
    safeZonesUnsub();
    unsafeZonesUnsub();
    rtdbRef.off('value', rtdbListener);
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));