const API_URL = window.location.origin;

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const alertBox = document.getElementById('alertBox');

function showAlert(message, isError = true) {
  alertBox.innerText = message;
  alertBox.className = `mb-4 p-3 text-sm rounded-lg ${isError ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-green-900/50 text-green-300 border border-green-700'}`;
  alertBox.classList.remove('hidden');
}

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      localStorage.setItem('token', data.token);
      window.location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message);
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');

      localStorage.setItem('token', data.token);
      window.location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message);
    }
  });
}