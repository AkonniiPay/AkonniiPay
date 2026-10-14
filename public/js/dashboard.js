document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    const publicPages = ['/login', '/signup', '/', '/index.html', '/checkout'];
    const isPublicPage = publicPages.some(page => currentPath === page || currentPath.startsWith('/checkout'));

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
                    alert(data.message || 'Login failed.');
                }
            } catch (err) {
                console.error('Login error:', err);
            }
        });
        return;
    }

    const token = sessionStorage.getItem('token');
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if ((!token || !isLoggedIn) && !isPublicPage) {
        window.location.href = '/login';
        return;
    }

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            sessionStorage.clear();
            window.location.href = '/login';
        });
    }

    if (document.getElementById('paymentLinksTableBody')) {
        fetchPaymentLinks(token);
    }
});

async function fetchPaymentLinks(token) {
    const tableBody = document.getElementById('paymentLinksTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/payment/my-links', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
            // Update Balance Cards
            if (document.getElementById('ngnBalance')) {
                document.getElementById('ngnBalance').innerText = `₦${(data.ngnBalance || 0).toLocaleString()}`;
            }
            if (document.getElementById('usdBalance')) {
                document.getElementById('usdBalance').innerText = `$${(data.usdBalance || 0).toFixed(2)}`;
            }

            // Render Links Table
            if (data.links && data.links.length > 0) {
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
        }
    } catch (err) {
        console.error('Error fetching data:', err);
    }
}