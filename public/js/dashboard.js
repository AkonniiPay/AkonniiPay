const API_URL = window.location.origin;
const token = localStorage.getItem('token');

if (!token) window.location.href = '/login.html';

let userAccountsData = null;
let currentUserName = '';

function handleLogout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
document.getElementById('sidebarLogout')?.addEventListener('click', handleLogout);

function openKycModal() { document.getElementById('kycModal').classList.remove('hidden'); }
function closeKycModal() { document.getElementById('kycModal').classList.add('hidden'); }
function openWithdrawModal() { document.getElementById('withdrawModal').classList.remove('hidden'); }
function closeWithdrawModal() { document.getElementById('withdrawModal').classList.add('hidden'); }
function closeAccountDetailsModal() { document.getElementById('accountDetailsModal').classList.add('hidden'); }

function openAccountDetailsModal(currency) {
  if (!userAccountsData || !userAccountsData[currency] || !userAccountsData[currency].accountNumber) {
    alert('Please submit your BVN/NIN in the Verification Center first. Accounts will be available after review.');
    openKycModal();
    return;
  }

  const acc = userAccountsData[currency];
  document.getElementById('modalCurrencyTitle').innerText = `${currency.toUpperCase()} Receiving Account`;
  document.getElementById('modalAccountContent').innerHTML = `
    <div class="p-3 bg-gray-800 rounded-xl space-y-1">
      <span class="text-xs text-gray-400 block uppercase">Account Name (Strict Legal Match)</span>
      <span class="font-bold text-white text-base">${acc.accountName}</span>
    </div>
    <div class="p-3 bg-gray-800 rounded-xl space-y-1">
      <span class="text-xs text-gray-400 block uppercase">Bank Name</span>
      <span class="font-bold text-white text-base">${acc.bankName}</span>
    </div>
    <div class="p-3 bg-gray-800 rounded-xl flex justify-between items-center">
      <div>
        <span class="text-xs text-gray-400 block uppercase">Account / IBAN</span>
        <span class="font-mono font-bold text-green-400 text-base">${acc.accountNumber}</span>
      </div>
      <button onclick="navigator.clipboard.writeText('${acc.accountNumber}'); alert('Copied!');" class="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1.5 rounded-lg">Copy</button>
    </div>
    <div class="p-3 bg-gray-800 rounded-xl space-y-1">
      <span class="text-xs text-gray-400 block uppercase">Routing / Sort Code</span>
      <span class="font-mono font-bold text-blue-300 text-base">${acc.routingNumber}</span>
    </div>
    <div class="p-3 bg-gray-800 rounded-xl space-y-1">
      <span class="text-xs text-gray-400 block uppercase">Bank Address</span>
      <span class="text-xs text-gray-300">${acc.bankAddress}</span>
    </div>
  `;
  document.getElementById('accountDetailsModal').classList.remove('hidden');
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/wallet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();

    currentUserName = data.user.name;
    document.getElementById('userInfo').innerText = `Hello, ${currentUserName}`;
    
    const wallets = data.wallets || { usd: 0, eur: 0, gbp: 0, ngn: 0 };
    document.getElementById('usdBalance').innerText = `$${wallets.usd.toFixed(2)}`;
    document.getElementById('eurBalance').innerText = `€${wallets.eur.toFixed(2)}`;
    document.getElementById('gbpBalance').innerText = `£${wallets.gbp.toFixed(2)}`;
    document.getElementById('ngnBalance').innerText = `₦${wallets.ngn.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('walletBalance').innerText = `$${wallets.usd.toFixed(2)}`;

    userAccountsData = data.user.accounts;

    if (data.user.kycStatus === 'pending') {
      document.getElementById('kycBanner').innerHTML = `
        <div>
          <p class="font-bold text-amber-400 flex items-center gap-2">⏳ Verification Center: Under Review (Estimated ~1 hour)</p>
          <p class="text-xs text-amber-200/70 mt-0.5">Your BVN/NIN is being processed against official records for Luqman Abiodun Oyewole.</p>
        </div>
      `;
      document.getElementById('kycBanner').className = "bg-amber-950/40 border border-amber-700/50 p-4 rounded-2xl flex items-center justify-between";
    }

    loadTransactions();
  } catch (err) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
}

document.getElementById('kycForm')?.addEventListener('submit', async (e) => {
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
    if (!res.ok) throw new Error(data.message);
    alert(data.message);
    closeKycModal();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('withdrawForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = document.getElementById('withdrawAmount').value;
  const bankName = document.getElementById('bankName').value;
  const accountNumber = document.getElementById('accountNumber').value;
  const accountName = document.getElementById('resolvedAccountName').innerText;

  try {
    const res = await fetch(`${API_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ amount, bankName, accountNumber, accountName, currency: 'usd' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    alert(data.message);
    closeWithdrawModal();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
});

async function loadTransactions() {
  const res = await fetch(`${API_URL}/api/wallet/transactions`, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;

  if (!data.transactions || data.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-500">No transactions recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.transactions.map(tx => `
    <tr class="hover:bg-gray-850 transition">
      <td class="py-3 px-4 text-xs text-gray-400">${new Date(tx.createdAt).toLocaleDateString()}</td>
      <td class="py-3 px-4 font-medium text-white">${tx.description}</td>
      <td class="py-3 px-4 capitalize"><span class="px-2 py-1 text-xs rounded-lg bg-green-900/50 text-green-300">${tx.type}</span></td>
      <td class="py-3 px-4 font-bold text-green-400">$${tx.amount.toFixed(2)}</td>
      <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-blue-900/40 text-blue-300">Completed</span></td>
    </tr>
  `).join('');
}

loadDashboard();