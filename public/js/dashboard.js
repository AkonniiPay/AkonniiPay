document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');

    // Fetch user dashboard data & payment links if on dashboard home
    if (document.getElementById('paymentLinksTableBody')) {
        fetchPaymentLinks(token);
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
                alert('An error occurred while creating the payment link.');
            }
        });
    }
});

// Function to fetch and render payment link records
async function fetchPaymentLinks(token) {
    const tableBody = document.getElementById('paymentLinksTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/payment/my-links', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
                    <td colspan="6" class="text-center py-4 text-muted">No payment links created yet. Click "+ Create Payment Link" to get started!</td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('Error fetching links:', err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-danger">Failed to load payment link records. Please refresh.</td>
            </tr>
        `;
    }
}