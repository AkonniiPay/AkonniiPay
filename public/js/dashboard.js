document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const currentPath = window.location.pathname;

    // List of public routes that don't require authentication
    const publicRoutes = ['/login', '/signup', '/', '/index.html', '/checkout'];
    const isPublicRoute = publicRoutes.some(route => currentPath === route || currentPath.startsWith('/checkout'));

    // Handle Login Page Logic
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
                    // Save auth token & session flag
                    localStorage.setItem('token', data.token);
                    sessionStorage.setItem('activeSession', 'true');
                    window.location.href = '/dashboard';
                } else {
                    alert(data.message || 'Login failed. Please check your credentials.');
                }
            } catch (err) {
                console.error('Login error:', err);
                alert('An error occurred during login. Please try again.');
            }
        });
        return;
    }

    // Protected Route Verification: If user has no valid token on a private page, send to /login
    if (!token && !isPublicRoute) {
        window.location.href = '/login';
        return;
    }

    // If on Dashboard Home Page
    if (document.getElementById('paymentLinksTableBody')) {
        fetchPaymentLinks(token);
    }

    // If on Settings Page
    if (document.getElementById('viewMode')) {
        loadUserProfile(token);
    }

    // Handle Settings Edit Mode Toggle
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

    // Save Settings Submission
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('settingsName').value;
            const address = document.getElementById('settingsAddress').value;
            const occupation = document.getElementById('settingsOccupation').value;

            try {
                const res = await fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ fullName, address, occupation })
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

    // Handle Payment Link Creation Form
    const createLinkForm = document.getElementById('createLinkForm');
    if (createLinkForm) {
        createLinkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('linkTitle').value;
            const amount = document.getElementById('linkAmount').value;
            const currency = document.getElementById('linkCurrency').value;

            try {
                const res = await fetch('/api/payment/initialize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ title, amount, currency })
                });

                const data = await res.json();

                if (res.ok) {
                    const resultDiv = document.getElementById('linkResult');
                    const urlInput = document.getElementById('generatedUrlInput');
                    urlInput.value = data.checkoutUrl;
                    resultDiv.classList.remove('d-none');
                    createLinkForm.reset();
                } else {
                    alert(data.message || 'Failed to create payment link.');
                }
            } catch (err) {
                console.error('Error creating link:', err);
            }
        });
    }
});

// Load Profile Data
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
            if (document.getElementById('displayOccupation')) {
                document.getElementById('displayOccupation').innerText = user.occupation || 'Not provided yet';
                document.getElementById('settingsOccupation').value = user.occupation || '';
            }
        }
    } catch (err) {
        console.error('Error loading user profile:', err);
    }
}

// Fetch Payment Links Table
async function fetchPaymentLinks(token) {
    const tableBody = document.getElementById('paymentLinksTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/payment/my-links', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && data.links && data.links.length > 0) {
            tableBody.innerHTML = '';
            data.links.forEach(link => {
                const dateStr = new Date(link.createdAt).toLocaleDateString();
                const row = `
                    <tr>
                        <td class="fw-bold">${link.title}</td>
                        <td>${link.amount.toLocaleString()}</td>
                        <td><span class="badge bg-secondary">${link.currency}</span></td>
                        <td>
                            <a href="${link.url}" target="_blank" class="btn btn-sm btn-outline-primary">Open Link</a>
                            <button class="btn btn-sm btn-light ms-1" onclick="navigator.clipboard.writeText('${link.url}')">Copy</button>
                        </td>
                        <td><span class="badge bg-success">${link.status}</span></td>
                        <td class="text-muted">${dateStr}</td>
                    </tr>
                `;
                tableBody.innerHTML += row;
            });
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">No payment links created yet.</td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('Error fetching links:', err);
    }
}