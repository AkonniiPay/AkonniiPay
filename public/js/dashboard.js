document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');

  // 1. Fetch Profile and Virtual Accounts
  try {
    const res = await fetch('/api/user/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
      return;
    }

    const data = await res.json();
    const user = data.user;

    if (user) {
      document.getElementById('ngnBalance').innerText = `₦${(user.balances?.NGN || 0).toLocaleString()}`;
      document.getElementById('usdBalance').innerText = `$${(user.balances?.USD || 0).toFixed(2)}`;
      document.getElementById('gbpBalance').innerText = `£${(user.balances?.GBP || 0).toFixed(2)}`;

      const badge = document.getElementById('kycStatusBadge');
      if (badge) {
        badge.innerText = user.kycStatus || 'Pending Verification';
        badge.className = user.kycStatus === 'Verified' ? 'fw-bold text-success mt-2 mb-0' : 'fw-bold text-warning mt-2 mb-0';
      }

      // Populate NGN Dedicated Virtual Account Card
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || "AkonniiPay Merchant";
      const ngnAcc = user.virtualAccounts?.NGN;

      if (ngnAcc && ngnAcc.accountNumber) {
        document.getElementById('ngnBankName').innerText = ngnAcc.bankName || "Wema Bank";
        document.getElementById('ngnAccNo').innerText = ngnAcc.accountNumber;
        document.getElementById('ngnAccName').innerText = ngnAcc.accountName || fullName;
      } else {
        document.getElementById('ngnAccName').innerText = fullName;
      }

      // Setup Clickable Card Handlers
      setupCardModals(user);
    }
  } catch (err) {
    console.error('Error loading dashboard profile:', err);
  }

  // 2. Fetch Payment Link Records
  fetchPaymentLinks(token);

  // 3. Sign Out Listener
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    localStorage.removeItem('token');
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // 4. Multi-Gateway Sync / Recovery Handler (Paystack + Flutterwave)
  document.getElementById('syncPaymentBtn')?.addEventListener('click', async () => {
    const reference = prompt("Enter your Transaction Reference Code (Paystack AKP_... or Flutterwave FLW_...):");
    if (!reference || !reference.trim()) return;

    try {
      const res = await fetch(`/api/payment/sync-payment?reference=${encodeURIComponent(reference.trim())}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(`Success! Payment of ${data.amount} NGN synchronized. Balance updated.`);
        window.location.reload();
      } else {
        alert(`Sync Failed: ${data.message || 'Transaction reference not found or already processed.'}`);
      }
    } catch (err) {
      alert('Error communicating with payment recovery service.');
    }
  });
});

// Setup Click Handlers for Account Cards
function setupCardModals(user) {
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || "AkonniiPay Merchant";
  const ngn = user.virtualAccounts?.NGN || {};

  document.getElementById('ngnAccountCard')?.addEventListener('click', () => {
    openAccountModal(
      'NGN',
      ngn.bankName || 'Wema Bank',
      ngn.accountNumber || 'Pending Verification',
      '035 (Bank Code)',
      ngn.accountName || fullName,
      'Central Bank of Nigeria NIBSS Direct Deposit'
    );
  });

  document.getElementById('usdAccountCard')?.addEventListener('click', () => {
    openAccountModal('USD', 'Community Federal Savings Bank', '3094882104', '026073150 (Routing)', fullName, '89 5th Ave, New York, NY 10003, USA');
  });

  document.getElementById('gbpAccountCard')?.addEventListener('click', () => {
    openAccountModal('GBP', 'Barclays Bank UK', '70482910', '20-04-15 (Sort Code)', fullName, '1 Churchill Place, London E14 5HP, UK');
  });

  document.getElementById('eurAccountCard')?.addEventListener('click', () => {
    openAccountModal('EUR', 'BNP Paribas', 'FR7630004000011234567890143', 'BNPAFRPP (BIC)', fullName, '16 Boulevard des Italiens, 75009 Paris, France');
  });
}

// Display Account Modal
function openAccountModal(type, bankName, accountNumber, routingOrSort, accName, address) {
  const modalTitle = document.getElementById('modalBankTitle');
  const modalBody = document.getElementById('modalBankBody');

  modalTitle.innerText = `${type} Dedicated Virtual Account`;
  modalBody.innerHTML = `
    <div class="mb-3">
      <label class="text-muted small fw-semibold">Account Holder Name</label>
      <div class="fw-bold fs-6 text-primary">${accName}</div>
    </div>
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
      <label class="text-muted small fw-semibold">Bank Address / Clearing</label>
      <div class="fw-semibold text-secondary">${address}</div>
    </div>
    <div class="alert alert-info py-2 px-3 small mt-3 mb-0">
      <i class="bi bi-info-circle me-1"></i> Direct wire deposits automatically route through processing fee filters (4%) and credit your live ${type} Platform Balance instantly.
    </div>
  `;

  const modal = new bootstrap.Modal(document.getElementById('bankDetailModal'));
  modal.show();
}

// Fetch Payment Link Records Table
async function fetchPaymentLinks(token) {
  const tableBody = document.getElementById('paymentLinksTableBody');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/payment/my-links', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.links && data.links.length > 0) {
      tableBody.innerHTML = data.links.map(link => `
        <tr>
          <td class="fw-semibold">${link.title}</td>
          <td>${link.amount ? '₦' + link.amount.toLocaleString() : 'Open'}</td>
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
        <td colspan="6" class="text-center text-danger py-3">Error loading payment links.</td>
      </tr>
    `;
  }
}