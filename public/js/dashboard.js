document.addEventListener('DOMContentLoaded', async () => {
    const currentPath = window.location.pathname;

    // Public pages that don't need authentication
    const publicPages = ['/login', '/signup', '/', '/index.html', '/checkout'];
    const isPublicPage = publicPages.some(page => currentPath === page || currentPath.startsWith('/checkout'));

    // Handle Login Page Submission
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
                    // Save token to sessionStorage (wipes on page reload/close)
                    sessionStorage.setItem('token', data.token);
                    window.location.href = '/dashboard';
                } else {
                    alert(data.message || 'Login failed. Invalid credentials.');
                }
            } catch (err) {
                console.error('Login error:', err);
                alert('An error occurred during login. Please try again.');
            }
        });
        return;
    }

    // Protected Route Check: Force redirect to /login on page reload (when token is empty in sessionStorage)
    const token = sessionStorage.getItem('token');
    if (!token && !isPublicPage) {
        window.location.href = '/login';
        return;
    }

    // Sign Out Button Logic
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            sessionStorage.clear();
            window.location.href = '/login';
        });
    }

    // Load Dashboard Content
    if (document.getElementById('paymentLinksTableBody')) {
        fetchPaymentLinks(token);
    }

    // Load Profile Settings
    if (document.getElementById('viewMode')) {
        loadUserProfile(token);
    }

    // Handle Payment Link Form
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

// Fetch User Profile
async function loadUserProfile(token) {
    try {
        const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        if (res.ok) {
            if (document.getElementById('displayFullName')) {
                document.getElementById('displayFullName').innerText = user.fullName || 'Merchant';
                document.getElementById('settingsName').value = user.fullName || '';
            }
            if (document.getElementById('displayAddress')) {
                document.getElementById('displayAddress').innerText = user.address || 'Not provided yet';
                document.getElementById('settingsAddress').value = user.address || '';
            }
        }
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

// Fetch Payment Links
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
        }
    } catch (err) {
        console.error('Error loading links:', err);
    }
}