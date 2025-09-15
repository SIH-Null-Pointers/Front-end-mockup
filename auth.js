// Fake credentials for demo
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "12345";

// Check if already logged in
if (localStorage.getItem("isLoggedIn") === "true") {
  window.location.href = "index.html";
}

// Handle login
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorMsg = document.getElementById("errorMsg");

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    localStorage.setItem("isLoggedIn", "true");
    window.location.href = "index.html";
  } else {
    errorMsg.textContent = "❌ Invalid email or password!";
  }
});
