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
function openKycModal() { 
  document.getElementById('kycModal').classList.remove('hidden'); 
}
function closeKycModal() { 
  document.getElementById('kycModal').classList.add('hidden'); 
}

function openWithdrawModal() { 
  document.getElementById('withdrawModal').classList.remove('hidden'); 
}
function closeWithdrawModal() { 
  document.getElementById('withdrawModal').classList.add('hidden'); 
}

function toggleLinksView() {
  const section = document.getElementById('linksListSection');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

// Mobile Sidebar Toggle
function toggleMobileMenu() {
  const sidebar = document.querySelector('aside');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('fixed');
    sidebar.classList.toggle('inset-0');
    sidebar.classList.toggle('z-50');
    sidebar.classList.toggle('w-full');
  }
}

// Load Dashboard Data & Balances
async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/wallet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.innerText = `Hello, ${data.user.name}`;
    
    const balance = data.balance || 0;
    
    // Update Balances
    const walletBalanceEl = document.getElementById('walletBalance');
    if (walletBalanceEl) walletBalanceEl.innerText = `$${balance.toFixed(2)}`;

    const usdEl = document.getElementById('usdBalance');
    if (usdEl) usdEl.innerText = `$${balance.toFixed(2)}`;

    const eurEl = document.getElementById('eurBalance');
    if (eurEl) eurEl.innerText = `€${(balance * 0.92).toFixed(2)}`;

    const gbpEl = document.getElementById('gbpBalance');
    if (gbpEl) gbpEl.innerText = `£${(balance * 0.79).toFixed(2)}`;

    const ngnEl = document.getElementById('ngnBalance');
    if (ngnEl) ngnEl.innerText = `₦${(balance * 1450).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    // Handle KYC Status Banner
    const kycBanner = document.getElementById('kycBanner');
    if (kycBanner && data.user.isKycVerified) {
      kycBanner.innerHTML = `
        <div>
          <p class="font-bold text-green-400 flex items-center gap-2">✅ Verification Center: Verified (${data.user.tier || 'Tier 2'})</p>
          <p class="text-xs text-green-200/70 mt-0.5">Your identity is confirmed. Full withdrawal privileges are unlocked.</p>
        </div>
      `;
      kycBanner.className = "bg-green-950/40 border border-green-700/50 p-4 rounded-2xl flex items-center justify-between";
    }

    loadTransactions();
    loadMyPaymentLinks();
  } catch (err) {
    console.error('Dashboard load error:', err);
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

    const totalReceivedEl = document.getElementById('totalReceived');
    if (totalReceivedEl) totalReceivedEl.innerText = `$${totalReceivedVol.toFixed(2)}`;
  } catch (err) {
    console.error('Error loading transactions:', err);
  }
}

// Fetch and render merchant payment links with expiration & paid counts
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
      const linkCountEl = document.getElementById('linkCount');
      if (linkCountEl) linkCountEl.innerText = '0';
      return;
    }

    const activeLinks = data.links.filter(l => l.status === 'Active');
    const linkCountEl = document.getElementById('linkCount');
    if (linkCountEl) linkCountEl.innerText = activeLinks.length;

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
    const expiresInDays = document.getElementById('linkExpiry') ? document.getElementById('linkExpiry').value : 0;

    if (!title || !amount) {
      alert('Please fill in both the title and the amount.');
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

      if (!res.ok) {
        const errorMsg = data.message || (data.errors && data.errors.join(', ')) || 'Failed to generate link.';
        throw new Error(errorMsg);
      }

      const linkIdentifier = data.id || data.linkId || data._id || 
                             (data.linkDetails && (data.linkDetails.slug || data.linkDetails._id)) ||
                             (data.paymentLink && (data.paymentLink.slug || data.paymentLink._id));

      if (!linkIdentifier) {
        throw new Error('Server created link, but did not return a valid link ID.');
      }

      const checkoutUrl = `${API_URL}/checkout.html?id=${linkIdentifier}`;
      document.getElementById('generatedUrl').innerText = checkoutUrl;
      document.getElementById('generatedLinkBox').classList.remove('hidden');

      // Refresh links table immediately
      loadMyPaymentLinks();
    } catch (err) {
      alert(err.message);
    }
  });
}

const copyBtn = document.getElementById('copyBtn');
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    const url = document.getElementById('generatedUrl').innerText;
    navigator.clipboard.writeText(url);
    alert('Payment link copied to clipboard!');
  });
}

// KYC Verification Submission
const kycForm = document.getElementById('kycForm');
if (kycForm) {
  kycForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bvn = document.getElementById('bvnInput').value;
    const nin = document.getElementById('ninInput').value;

    try {
      const res = await fetch(`${API_URL}/api/kyc/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
}

// Withdraw Form Submission
const withdrawForm = document.getElementById('withdrawForm');
if (withdrawForm) {
  withdrawForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('withdrawAmount').value;
    const bankName = document.getElementById('bankName').value;
    const accountNumber = document.getElementById('accountNumber').value;

    try {
      const res = await fetch(`${API_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
}

// Initialize on load
loadDashboard();