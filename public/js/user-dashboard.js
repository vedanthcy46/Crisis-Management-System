// Check authentication
checkAuth();

// Initialize map
let map;
let marker;

function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 13);
                setMarker(latitude, longitude);
            },
            (error) => console.error('Geolocation error:', error)
        );
    }

    // Handle map clicks
    map.on('click', (e) => {
        setMarker(e.latlng.lat, e.latlng.lng);
    });
}

function setMarker(latitude, longitude) {
    if (marker) {
        map.removeLayer(marker);
    }
    marker = L.marker([latitude, longitude]).addTo(map);
    document.getElementById('latitude').value = latitude;
    document.getElementById('longitude').value = longitude;

    // Reverse geocode to get address
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('location').value = data.display_name;
        })
        .catch(error => console.error('Geocoding error:', error));
}

// Initialize map
initMap();

// Handle incident form submission
document.getElementById('incident-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    errorMessage.classList.add('d-none');
    successMessage.classList.add('d-none');

    const formData = new FormData();
    formData.append('title', document.getElementById('title').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('location', document.getElementById('location').value);
    formData.append('latitude', document.getElementById('latitude').value);
    formData.append('longitude', document.getElementById('longitude').value);

    const imageFile = document.getElementById('image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch('/api/incidents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit report');
        }

        // Show success message and start timer
        successMessage.textContent = 'Report submitted successfully';
        successMessage.classList.remove('d-none');
        document.getElementById('incident-form').reset();
        startTimer();
        loadReports();
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.remove('d-none');
    }
});

// Timer functionality
function startTimer() {
    const timerModal = new bootstrap.Modal(document.getElementById('timerModal'));
    timerModal.show();

    let timeLeft = 120; // 2 minutes in seconds
    const timerElement = document.getElementById('timer');

    const timerInterval = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerModal.hide();
        }

        timeLeft--;
    }, 1000);
}

// Load user's reports
async function loadReports() {
    try {
        const response = await authenticatedFetch('/api/incidents/my-reports');
        if (!response) return;

        const reports = await response.json();
        const reportsList = document.getElementById('reports-list');
        reportsList.innerHTML = '';

        reports.forEach(report => {
            const statusClass = {
                'pending': 'bg-warning',
                'accepted': 'bg-info',
                'in_progress': 'bg-primary',
                'resolved': 'bg-success',
                'rejected': 'bg-danger'
            }[report.status] || 'bg-secondary';

            reportsList.innerHTML += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-1">${report.title}</h6>
                        <span class="badge ${statusClass}">${report.status}</span>
                    </div>
                    <small class="text-muted">
                        ${new Date(report.created_at).toLocaleString()}
                    </small>
                </div>
            `;
        });
    } catch (error) {
        console.error('Failed to load reports:', error);
    }
}

// Load initial reports
loadReports(); 