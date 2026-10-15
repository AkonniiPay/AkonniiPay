document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch User Profile and Platform Balances
  try {
    const res = await fetch('/api/user/profile');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    
    if (data.user) {
      document.getElementById('ngnBalance').innerText = `₦${(data.user.balances?.NGN || 0).toLocaleString()}`;
      document.getElementById('usdBalance').innerText = `$${(data.user.balances?.USD || 0).toFixed(2)}`;
      document.getElementById('gbpBalance').innerText = `£${(data.user.balances?.GBP || 0).toFixed(2)}`;
      
      const badge = document.getElementById('kycStatusBadge');
      if (badge) {
        badge.innerText = data.user.kycStatus || 'Pending Verification';
        badge.className = data.user.kycStatus === 'Verified' ? 'fw-bold text-success mt-2 mb-0' : 'fw-bold text-warning mt-2 mb-0';
      }
    }
  } catch (err) {
    console.error('Error loading dashboard profile:', err);
  }

  // 2. Fetch Payment Link Records
  fetchPaymentLinks();

  // 3. Sign Out Button Listener
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // 4. Sync / Recover Payment Listener
  document.getElementById('syncPaymentBtn')?.addEventListener('click', async () => {
    const reference = prompt("Enter your Paystack Transaction Reference Code (e.g., AKP_NGN_...):");
    if (!reference || !reference.trim()) return;

    try {
      const res = await fetch(`/api/payment/sync-payment?reference=${encodeURIComponent(reference.trim())}`);
      const data = await res.json();
      if (data.success) {
        alert(`Success! Payment of ${data.amount} NGN synchronized. Your platform balance has been updated.`);
        window.location.reload();
      } else {
        alert(`Sync Failed: ${data.message || 'Transaction reference not found or already processed.'}`);
      }
    } catch (err) {
      alert('Error communicating with the payment sync service.');
    }
  });
});

// Helper: Open Interactive Account Detail Modal
function openAccountModal(type, bankName, accountNumber, routingOrSort, address) {
  const modalTitle = document.getElementById('modalBankTitle');
  const modalBody = document.getElementById('modalBankBody');

  modalTitle.innerText = `${type} Dedicated Virtual Account`;
  modalBody.innerHTML = `
    <div class="mb-3">
      <label class="text-muted small fw-semibold">Bank Name</label>
      <div class="fw-bold fs-6">${bankName}</div>
    </div>
    <div class="mb-3">
      <label class="text-muted small fw-semibold">Account Number / IBAN</label>
      <div class="fw-bold fs-6 font-monospace bg-light p-2 rounded border">${accountNumber}</div>
    </div>
    <div class="mb-3">
      <label class="text-muted small fw-semibold">Routing / Sort Code / BIC</label>
      <div class="fw-bold fs-6 font-monospace bg-light p-2 rounded border">${routingOrSort}</div>
    </div>
    <div class="mb-3">
      <label class="text-muted small fw-semibold">Bank Address</label>
      <div class="fw-semibold text-secondary">${address}</div>
    </div>
    <div class="alert alert-info py-2 px-3 small mt-3 mb-0">
      <i class="bi bi-info-circle me-1"></i> Direct deposits to these account details automatically route through processing fee filters (4%) and update your live ${type} Platform Balance.
    </div>
  `;

  const modal = new bootstrap.Modal(document.getElementById('bankDetailModal'));
  modal.show();
}

// Helper: Load Payment Links Table
async function fetchPaymentLinks() {
  const tableBody = document.getElementById('paymentLinksTableBody');
  try {
    const res = await fetch('/api/payment/my-links');
    const data = await res.json();

    if (data.links && data.links.length > 0) {
      tableBody.innerHTML = data.links.map(link => `
        <tr>
          <td class="fw-semibold">${link.title}</td>
          <td>${link.amount ? link.amount.toLocaleString() : 'Open'}</td>
          <td><span class="badge bg-secondary">${link.currency || 'NGN'}</span></td>
          <td>
            <span class="badge ${link.status === 'Closed' ? 'bg-danger' : 'bg-success'}">
              ${link.status || 'Active'}
            </span>
          </td>
          <td>
            <a href="${link.shortUrl || `/checkout.html?id=${link._id}`}" target="_blank" class="text-decoration-none">
              <i class="bi bi-box-arrow-up-right me-1"></i> Pay Link
            </a>
          </td>
          <td class="text-muted small">${new Date(link.createdAt).toLocaleDateString()}</td>
        </tr>
      `).join('');
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-3">No payment links generated yet. Click "Create Link" to make one.</td>
        </tr>
      `;
    }
  } catch (err) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-3">Error loading payment link records.</td>
      </tr>
    `;
  }
}