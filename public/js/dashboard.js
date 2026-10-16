document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // 1. Fetch Profile, KYC Status, and Dedicated Virtual Accounts
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
    const user = data.user || data;

    if (user) {
      const fullName = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || "Luqman Abiodun Oyewole";

      // Set Balances
      if (document.getElementById('ngnBalance')) document.getElementById('ngnBalance').innerText = `₦${(user.balances?.NGN || 0).toLocaleString()}`;
      if (document.getElementById('usdBalance')) document.getElementById('usdBalance').innerText = `$${(user.balances?.USD || 0).toFixed(2)}`;
      if (document.getElementById('gbpBalance')) document.getElementById('gbpBalance').innerText = `£${(user.balances?.GBP || 0).toFixed(2)}`;

      // Update Verified Badge Status
      const badge = document.getElementById('kycStatusBadge');
      if (badge) {
        if (user.kycStatus === 'Verified') {
          badge.innerText = 'Verified';
          badge.className = 'fw-bold text-success mt-2 mb-0';
        } else {
          badge.innerText = 'Pending Verification';
          badge.className = 'fw-bold text-warning mt-2 mb-0';
        }
      }

      // Update Dashboard Card Names
      if (document.getElementById('ngnCardName')) document.getElementById('ngnCardName').innerText = fullName;
      if (document.getElementById('usdCardName')) document.getElementById('usdCardName').innerText = fullName;
      if (document.getElementById('gbpCardName')) document.getElementById('gbpCardName').innerText = fullName;
      if (document.getElementById('eurCardName')) document.getElementById('eurCardName').innerText = fullName;

      // Populate NGN Dedicated Virtual Account Card
      const ngnAcc = user.virtualAccounts?.NGN;
      if (ngnAcc && ngnAcc.accountNumber) {
        if (document.getElementById('ngnBankName')) document.getElementById('ngnBankName').innerText = ngnAcc.bankName || "Wema Bank";
        if (document.getElementById('ngnAccNo')) document.getElementById('ngnAccNo').innerText = ngnAcc.accountNumber;
        if (document.getElementById('ngnAccName')) document.getElementById('ngnAccName').innerText = ngnAcc.accountName || fullName;
      } else {
        if (document.getElementById('ngnAccName')) document.getElementById('ngnAccName').innerText = fullName;
      }

      // Setup Clickable Card Handlers
      setupCardModals(user);
    }
  } catch (err) {
    console.error('Error loading dashboard profile:', err);
  }

  // 2. Fetch Payment Link Records Table
  fetchPaymentLinks(token);

  // 3. Sign Out Listener
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    localStorage.removeItem('token');
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // 4. Multi-Gateway Sync / Recovery Handler
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
  const fullName = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || "Luqman Abiodun Oyewole";
  const va = user.virtualAccounts || {};

  const ngn = va.NGN || {};
  const usd = va.USD || {};
  const gbp = va.GBP || {};
  const eur = va.EUR || {};

  document.getElementById('ngnAccountCard')?.addEventListener('click', () => {
    openAccountModal('NGN', ngn.bankName || 'Wema Bank', ngn.accountNumber || 'Pending Verification', '035 (Bank Code)', fullName, 'Central Bank of Nigeria NIBSS Direct Deposit');
  });

  document.getElementById('usdAccountCard')?.addEventListener('click', () => {
    openAccountModal('USD', usd.bankName || 'Community Federal Savings Bank', usd.accountNumber || '3094882104', `${usd.routingNumber || '026073150'} (Routing)`, fullName, usd.address || '89 5th Ave, New York, NY 10003, USA');
  });

  document.getElementById('gbpAccountCard')?.addEventListener('click', () => {
    openAccountModal('GBP', gbp.bankName || 'Barclays Bank UK', gbp.accountNumber || '70482910', `${gbp.sortCode || '20-04-15'} (Sort Code)`, fullName, gbp.address || '1 Churchill Place, London E14 5HP, UK');
  });

  document.getElementById('eurAccountCard')?.addEventListener('click', () => {
    openAccountModal('EUR', eur.bankName || 'BNP Paribas', eur.iban || 'FR7630004000011234567890143', `${eur.bic || 'BNPAFRPP'} (BIC)`, fullName, eur.address || '16 Boulevard des Italiens, 75009 Paris, France');
  });
}

// Display Account Modal
function openAccountModal(type, bankName, accountNumber, routingOrSort, accName, address) {
  const modalTitle = document.getElementById('modalBankTitle');
  const modalBody = document.getElementById('modalBankBody');

  if (!modalTitle || !modalBody) return;

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
      <label class="text-muted small fw-semibold">Clearing Address</label>
      <div class="text-secondary small">${address}</div>
    </div>
  `;

  const modalElement = document.getElementById('accountDetailsModal');
  if (modalElement && window.bootstrap) {
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  }
}

async function fetchPaymentLinks(token) {
  try {
    const res = await fetch('/api/payment/my-links', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const links = data.links || data.data || [];

    const container = document.getElementById('paymentLinksTableBody');
    if (!container) return;

    if (links.length === 0) {
      container.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No payment links created yet.</td></tr>`;
      return;
    }

    container.innerHTML = links.map(link => `
      <tr>
        <td class="fw-semibold">${link.title}</td>
        <td>${link.currency} ${Number(link.amount).toLocaleString()}</td>
        <td><span class="badge bg-success">${link.status || 'Active'}</span></td>
        <td class="small text-muted font-monospace"><a href="${link.shortUrl}" target="_blank">${link.shortUrl}</a></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="navigator.clipboard.writeText('${link.shortUrl}'); alert('Link copied to clipboard!');">Copy</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching payment links:', err);
  }
}