document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    const publicPages = ['/login', '/signup', '/', '/index.html', '/checkout'];
    const isPublicPage = publicPages.some(page => currentPath === page || currentPath.startsWith('/checkout'));

    // 1. LOGIN FORM HANDLER
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (res.ok) {
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('isLoggedIn', 'true');
                    window.location.href = '/dashboard';
                } else {
                    alert(data.message || 'Login failed. Invalid credentials.');
                }
            } catch (err) {
                console.error('Login error:', err);
            }
        });
        return;
    }

    // 2. PROTECTED PAGE SESSION CHECK (RELOAD FORCES RE-AUTHENTICATION)
    const token = sessionStorage.getItem('token');
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');

    if ((!token || !isLoggedIn) && !isPublicPage) {
        window.location.href = '/login';
        return;
    }

    // 3. SIGN OUT BUTTON
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            sessionStorage.clear();
            window.location.href = '/login';
        });
    }

    // 4. FETCH FX RATES WIDGET
    fetchFxRates();

    // 5. DASHBOARD HOME PAGE LOGIC
    if (document.getElementById('paymentLinksTableBody')) {
        fetchDashboardData(token);
    }

    // 6. SETTINGS PAGE LOGIC (EDIT & SAVE)
    if (document.getElementById('viewMode')) {
        loadUserProfile(token);

        const toggleEditBtn = document.getElementById('toggleEditBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const viewMode = document.getElementById('viewMode');
        const settingsForm = document.getElementById('settingsForm');

        if (toggleEditBtn && settingsForm) {
            toggleEditBtn.addEventListener('click', () => {
                viewMode.classList.toggle('d-none');
                settingsForm.classList.toggle('d-none');
            });
        }

        if (cancelEditBtn && settingsForm) {
            cancelEditBtn.addEventListener('click', () => {
                viewMode.classList.remove('d-none');
                settingsForm.classList.add('d-none');
            });
        }

        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('settingsName').value;
            const address = document.getElementById('settingsAddress').value;
            const phoneNumber = document.getElementById('settingsPhone').value;
            const occupation = document.getElementById('settingsOccupation').value;

            try {
                const res = await fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ fullName, address, phoneNumber, occupation })
                });

                if (res.ok) {
                    alert('Settings updated successfully!');
                    window.location.reload();
                } else {
                    alert('Failed to update settings.');
                }
            } catch (err) {
                console.error('Error saving settings:', err);
            }
        });
    }

    // 7. KYC VERIFICATION FORM HANDLER (STRICT 11 DIGITS)
    const kycForm = document.getElementById('kycForm');
    if (kycForm) {
        kycForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const bvn = document.getElementById('kycBvn').value.trim();
            const nin = document.getElementById('kycNin').value.trim();
            const errorDiv = document.getElementById('kycErrorMsg');
            const successDiv = document.getElementById('kycSuccessMsg');

            if (bvn.length !== 11 || isNaN(bvn)) {
                errorDiv.innerText = "Error: BVN must be exactly 11 numeric digits.";
                errorDiv.classList.remove('d-none');
                return;
            }
            if (nin.length !== 11 || isNaN(nin)) {
                errorDiv.innerText = "Error: NIN must be exactly 11 numeric digits.";
                errorDiv.classList.remove('d-none');
                return;
            }

            errorDiv.classList.add('d-none');

            try {
                const res = await fetch('/api/kyc/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ bvn, nin })
                });

                const data = await res.json();
                if (res.ok) {
                    successDiv.innerText = "KYC Verified successfully! Full platform access granted.";
                    successDiv.classList.remove('d-none');
                    setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
                } else {
                    errorDiv.innerText = data.message || 'Verification failed. Details do not match profile.';
                    errorDiv.classList.remove('d-none');
                }
            } catch (err) {
                console.error('KYC submission error:', err);
            }
        });
    }

    // 8. GENERATE PAYMENT LINK FORM
    const createLinkForm = document.getElementById('createLinkForm');
    if (createLinkForm) {
        createLinkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('linkTitle').value;
            const amount = document.getElementById('linkAmount').value;
            const currency = document.getElementById('linkCurrency').value;
            const chargeBearer = document.getElementById('chargeBearer').value;
            const expiresAt = document.getElementById('expiresAt').value;

            try {
                const res = await fetch('/api/payment/initialize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ title, amount, currency, chargeBearer, expiresAt })
                });

                const data = await res.json();
                if (res.ok) {
                    const resultDiv = document.getElementById('linkResult');
                    const urlInput = document.getElementById('generatedUrlInput');
                    urlInput.value = data.checkoutUrl;
                    resultDiv.classList.remove('d-none');
                    createLinkForm.reset();
                } else {
                    alert(data.message || 'Failed to generate payment link.');
                }
            } catch (err) {
                console.error('Link creation error:', err);
            }
        });
    }
});

// FETCH LIVE FX RATES
async function fetchFxRates() {
    const rateWidget = document.getElementById('fxRateTicker');
    if (!rateWidget) return;

    try {
        const res = await fetch('/api/payment/rates');
        const data = await res.json();
        if (data.success) {
            rateWidget.innerText = `${data.displayRates.USD_NGN} | ${data.displayRates.GBP_NGN} | ${data.displayRates.EUR_NGN}`;
        }
    } catch (err) {
        console.error('Fx rates fetch error:', err);
    }
}

// LOAD DASHBOARD DATA & BALANCES
async function fetchDashboardData(token) {
    const tableBody = document.getElementById('paymentLinksTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/payment/my-links', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
            // Render Balances
            if (document.getElementById('ngnBalance')) document.getElementById('ngnBalance').innerText = `₦${(data.balances.NGN || 0).toLocaleString()}`;
            if (document.getElementById('usdBalance')) document.getElementById('usdBalance').innerText = `$${(data.balances.USD || 0).toFixed(2)}`;
            if (document.getElementById('gbpBalance')) document.getElementById('gbpBalance').innerText = `£${(data.balances.GBP || 0).toFixed(2)}`;
            if (document.getElementById('kycBadge')) {
                document.getElementById('kycBadge').innerText = data.kycStatus || 'Pending Verification';
                if (data.kycStatus === 'Verified') {
                    document.getElementById('kycBadge').className = 'fw-bold mt-1 text-success';
                }
            }

            // Render Links Table
            if (data.links && data.links.length > 0) {
                tableBody.innerHTML = '';
                data.links.forEach(link => {
                    const dateStr = new Date(link.createdAt).toLocaleDateString();
                    const statusBadge = link.status === 'Active' ? 'bg-success' : link.status === 'Closed' ? 'bg-primary' : 'bg-danger';
                    const row = `
                        <tr>
                            <td class="fw-bold">${link.title}</td>
                            <td>${link.amount.toLocaleString()}</td>
                            <td><span class="badge bg-secondary">${link.currency}</span></td>
                            <td>
                                <a href="${link.url}" target="_blank" class="btn btn-sm btn-outline-primary">Open Link</a>
                                <button class="btn btn-sm btn-light ms-1" onclick="navigator.clipboard.writeText('${link.url}')">Copy</button>
                            </td>
                            <td><span class="badge ${statusBadge}">${link.status}</span></td>
                            <td class="text-muted">${dateStr}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                });
            } else {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No payment links created yet.</td></tr>`;
            }
        }
    } catch (err) {
        console.error('Dashboard data error:', err);
    }
}

// LOAD USER PROFILE FOR SETTINGS
async function loadUserProfile(token) {
    try {
        const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        if (res.ok) {
            if (document.getElementById('displayFullName')) {
                document.getElementById('displayFullName').innerText = user.fullName || 'Merchant Name';
                document.getElementById('settingsName').value = user.fullName || '';
            }
            if (document.getElementById('displayAddress')) {
                document.getElementById('displayAddress').innerText = user.address || 'Not provided yet';
                document.getElementById('settingsAddress').value = user.address || '';
            }
            if (document.getElementById('displayPhone')) {
                document.getElementById('displayPhone').innerText = user.phoneNumber || 'Not provided yet';
                document.getElementById('settingsPhone').value = user.phoneNumber || '';
            }
            if (document.getElementById('displayOccupation')) {
                document.getElementById('displayOccupation').innerText = user.occupation || 'Not provided yet';
                document.getElementById('settingsOccupation').value = user.occupation || '';
            }
        }
    } catch (err) {
        console.error('Profile fetch error:', err);
    }
}