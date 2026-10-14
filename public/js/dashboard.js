const API_URL = window.location.origin;
const token = localStorage.getItem('token');

if (!token) {
  window.location.href = '/login.html';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
});

async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/wallet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();

    document.getElementById('userInfo').innerText = `Hello, ${data.user.name}`;
    document.getElementById('walletBalance').innerText = `$${(data.balance || 0).toFixed(2)}`;
  } catch (err) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
}

const createLinkForm = document.getElementById('createLinkForm');
if (createLinkForm) {
  createLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('linkTitle').value;
    const amount = document.getElementById('linkAmount').value;

    try {
      const res = await fetch(`${API_URL}/api/payment/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create link');

      const checkoutUrl = `${API_URL}/checkout.html?id=${data.linkId || data._id}`;
      document.getElementById('generatedUrl').innerText = checkoutUrl;
      document.getElementById('generatedLinkBox').classList.remove('hidden');
    } catch (err) {
      alert(err.message);
    }
  });
}

document.getElementById('copyBtn').addEventListener('click', () => {
  const url = document.getElementById('generatedUrl').innerText;
  navigator.clipboard.writeText(url);
  alert('Payment link copied to clipboard!');
});

loadDashboard();