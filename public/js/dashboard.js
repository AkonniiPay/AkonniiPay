const API_URL = window.location.origin;
const token = localStorage.getItem('token');

if (!token) {
  window.location.href = '/login.html';
}

// Logout Handlers
function handleLogout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

const sidebarLogout = document.getElementById('sidebarLogout');
if (sidebarLogout) sidebarLogout.addEventListener('click', handleLogout);

// Modal Controls
function openKycModal() { document.getElementById('kycModal').classList.remove('hidden'); }
function closeKycModal() { document.getElementById('kycModal').classList.add('hidden'); }

function openWithdrawModal() { document.getElementById('withdrawModal').classList.remove('hidden'); }
function closeWithdrawModal() { document.getElementById('withdrawModal').classList.add('hidden'); }

function toggleLinksView() {
  const section = document.getElementById('linksListSection');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

// Load Dashboard Data, Balances, & Dedicated Accounts
async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/wallet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();

    document.getElementById('userInfo').innerText = `Hello, ${data.user.name}`;
    const balance = data.balance || 0;
    
    document.getElementById('walletBalance').innerText = `$${balance.toFixed(2)}`;
    document.getElementById('usdBalance').innerText = `$${balance.toFixed(2)}`;
    document.getElementById('eurBalance').innerText = `€${(balance * 0.92).toFixed(2)}`;
    document.getElementById('gbpBalance').innerText = `£${(balance * 0.79).toFixed(2)}`;
    document.getElementById('ngnBalance').innerText = `₦${(balance * 1450).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    // Handle Virtual Accounts Display
    if (data.user.accounts && data.user.accounts.usd?.accountNumber) {
      const acc = data.user.accounts;
      document.getElementById('usdAccountInfo').innerHTML = `
        <p class="text-gray-300 font-semibold">${acc.usd.bankName}</p>
        <p class="font-mono text-green-300">Acc: ${acc.usd.accountNumber}</p>
        <p class="text-gray-400">Routing: ${acc.usd.routingNumber}</p>
      `;
      document.getElementById('eurAccountInfo').innerHTML = `
        <p class="text-gray-300 font-semibold">${acc.eur.bankName}</p>
        <p class="font-mono text-blue-300">IBAN: ${acc.eur.iban}</p>
      `;
      document.getElementById('gbpAccountInfo').innerHTML = `
        <p class="text-gray-300 font-semibold">${acc.gbp.bankName}</p>
        <p class="font-mono text-purple-300">Acc: ${acc.gbp.accountNumber}</p>
        <p class="text-gray-400">Sort Code: ${acc.gbp.sortCode}</p>
      `;
      document.getElementById('ngnAccountInfo').innerHTML = `
        <p class="text-gray-300 font-semibold">${acc.ngn.bankName}</p>
        <p class="font-mono text-amber-300">Acc: ${acc.ngn.accountNumber}</p>
      `;
    }

    if (data.user.isKycVerified) {
      document.getElementById('kycBanner').innerHTML = `
        <div>
          <p class="font-bold text-green-400 flex items-center gap-2">✅ Verification Center: Verified (${data.user.tier || 'Tier 2'})</p>
          <p class="text-xs text-green-200/70 mt-0.5">Your identity is confirmed. Dedicated virtual bank accounts generated.</p>
        </div>
      `;
      document.getElementById('kycBanner').className = "bg-green-950/40 border border-green-700/50 p-4 rounded-2xl flex items-center justify-between";
    }

    loadTransactions();
    loadMyPaymentLinks();
  } catch (err) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
}

// Load Transactions
async function loadTransactions() {
  try {
    const res = await fetch(`${API_URL}/api/wallet/transactions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    if (!data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-500">No transactions recorded yet.</td></tr>`;
      return;
    }

    let totalReceivedVol = 0;
    tbody.innerHTML = data.transactions.map(tx => {
      if (tx.type === 'deposit' || tx.type === 'payment') totalReceivedVol += tx.amount;
      const isPositive = tx.type === 'deposit' || tx.type === 'payment';
      return `
        <tr class="hover:bg-gray-850 transition">
          <td class="py-3 px-4 text-xs text-gray-400">${new Date(tx.createdAt).toLocaleDateString()}</td>
          <td class="py-3 px-4 font-medium text-white">${tx.description || 'Direct Payment'}</td>
          <td class="py-3 px-4 capitalize"><span class="px-2 py-1 text-xs rounded-lg ${isPositive ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'}">${tx.type}</span></td>
          <td class="py-3 px-4 font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}">${isPositive ? '+' : '-'}$${tx.amount.toFixed(2)}</td>
          <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-blue-900/40 text-blue-300 border border-blue-700/50">${tx.status || 'Completed'}</span></td>
        </tr>
      `;
    }).join('');

    document.getElementById('totalReceived').innerText = `$${totalReceivedVol.toFixed(2)}`;
  } catch (err) {
    console.error('Error loading transactions:', err);
  }
}

// Fetch and Render Merchant Payment Links
async function loadMyPaymentLinks() {
  try {
    const res = await fetch(`${API_URL}/api/payment/my-links`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('paymentLinksTableBody');
    if (!tbody) return;

    if (!data.links || data.links.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-500">No payment links created yet.</td></tr>`;
      document.getElementById('linkCount').innerText = '0';
      return;
    }

    const activeLinks = data.links.filter(l => l.status === 'Active');
    document.getElementById('linkCount').innerText = activeLinks.length;

    tbody.innerHTML = data.links.map(link => {
      const checkoutUrl = `${API_URL}/checkout.html?id=${link._id}`;
      return `
        <tr class="hover:bg-gray-850 transition">
          <td class="py-3 px-4 font-medium text-white">${link.title}</td>
          <td class="py-3 px-4 font-bold text-green-400">$${Number(link.amount).toFixed(2)}</td>
          <td class="py-3 px-4 text-gray-300">${link.paidCount || 0} Paid</td>
          <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full ${link.status === 'Active' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}">${link.status}</span></td>
          <td class="py-3 px-4">
            <button onclick="navigator.clipboard.writeText('${checkoutUrl}'); alert('Payment link copied to clipboard!');" class="bg-gray-800 hover:bg-gray-700 text-xs text-blue-400 px-3 py-1.5 rounded-lg border border-gray-700">Copy Link</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading payment links:', err);
  }
}

// Create Payment Link Form Handler
const createLinkForm = document.getElementById('createLinkForm');
if (createLinkForm) {
  createLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('linkTitle').value.trim();
    const amount = document.getElementById('linkAmount').value;
    const expiresInDays = document.getElementById('linkExpiry').value;

    if (!title || !amount) {
      alert('Please fill in both title and amount.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/payment/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          title, 
          amount: Number(amount),
          currency: 'USD',
          expiresInDays: Number(expiresInDays)
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create link');

      const linkId = data.id || data.linkId || data._id || (data.paymentLink && data.paymentLink._id);
      if (!linkId) throw new Error('Payment link ID was not returned by server.');

      const checkoutUrl = `${API_URL}/checkout.html?id=${linkId}`;
      document.getElementById('generatedUrl').innerText = checkoutUrl;
      document.getElementById('generatedLinkBox').classList.remove('hidden');

      loadMyPaymentLinks();
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

// KYC Verification Submission
document.getElementById('kycForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bvn = document.getElementById('bvnInput').value;
  const nin = document.getElementById('ninInput').value;

  try {
    const res = await fetch(`${API_URL}/api/kyc/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ bvn, nin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Verification failed');
    alert(data.message);
    closeKycModal();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
});

// Withdraw Form
document.getElementById('withdrawForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = document.getElementById('withdrawAmount').value;
  const bankName = document.getElementById('bankName').value;
  const accountNumber = document.getElementById('accountNumber').value;

  try {
    const res = await fetch(`${API_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ amount, bankName, accountNumber })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Withdrawal failed');
    alert(data.message);
    closeWithdrawModal();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
});

loadDashboard();