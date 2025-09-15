// tourist-management-dashboard/public/auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCTxXjJvcnH0MCKmPUEq8O2CoC_FCjWVgM",
  authDomain: "tourist-safety-4761a.firebaseapp.com",
  projectId: "tourist-safety-4761a",
  storageBucket: "tourist-safety-4761a.firebasestorage.app",
  messagingSenderId: "72405142462",
  appId: "1:72405142462:web:2c9c9318a97a2a24c3c7ef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Redirect if already logged in
if (localStorage.getItem('isLoggedIn') === 'true') {
  window.location.href = '/index.html'; // Use absolute path
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('errorMsg');

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Login successful:', userCredential.user.email); // Debug
    localStorage.setItem('isLoggedIn', 'true');
    window.location.href = '/index.html'; // Use absolute path
  } catch (error) {
    console.error('Login error:', error.code, error.message);
    errorMsg.textContent = `❌ ${error.message || 'Invalid email or password'}`;
  }
});