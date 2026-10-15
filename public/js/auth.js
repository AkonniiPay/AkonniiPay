document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const alertBox = document.getElementById('alertBox');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok && (data.token || data.success)) {
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        window.location.href = '/dashboard';
      } else {
        if (alertBox) {
          alertBox.className = 'alert alert-danger mt-3';
          alertBox.innerText = data.message || 'Invalid email or password.';
          alertBox.classList.remove('d-none');
        } else {
          alert(data.message || 'Invalid email or password.');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Server error during login. Please try again.');
    }
  });
});