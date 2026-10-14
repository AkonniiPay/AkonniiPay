document.addEventListener('DOMContentLoaded', async () => {
    // Session token check - redirect to login if missing
    const token = localStorage.getItem('token');
    
    // Auto-redirect to login on fresh reload if session storage flag is set
    if (!sessionStorage.getItem('activeSession')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
    }

    if (!token && window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
        window.location.href = '/login';
        return;
    }

    // Load Profile Settings Data
    if (document.getElementById('viewMode')) {
        loadUserProfile(token);
    }

    // Load Dashboard Payment Link Records
    if (document.getElementById('paymentLinksTableBody')) {
        fetchPaymentLinks(token);
    }

    // Toggle Settings Edit Mode
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

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            viewMode.classList.remove('d-none');
            settingsForm.classList.add('d-none');
        });
    }

    // Handle Settings Form Submission
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
});

// Load User Profile Data from Backend
async function loadUserProfile(token) {
    try {
        const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        if (res.ok) {
            if (document.getElementById('displayFullName')) {
                document.getElementById('displayFullName').innerText = user.fullName || 'Luqman Abiodun Oyewole';
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