document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const submitBtn = document.getElementById('submitBtn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const alertBox = document.getElementById('alertBox');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) return;

    // Show loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Signing in...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        window.location.href = '/dashboard';
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Sign In';
        }
        if (alertBox) {
          alertBox.className = 'alert alert-danger mt-2 py-2 px-3 small';
          alertBox.innerText = data.message || 'Invalid email or password.';
          alertBox.classList.remove('d-none');
        } else {
          alert(data.message || 'Invalid email or password.');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In';
      }
      alert('Server error during login. Please try again.');
    }
  });
});