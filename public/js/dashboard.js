// Global variables and functions
let map, marker;
let coordinates = null;
let timer;

// Show report form function (global)
function showReportForm() {
    const reportsList = document.getElementById('reports-list');
    const mapContainer = document.getElementById('map-container');
    const incidentForm = document.getElementById('incident-form');

    if (!reportsList || !mapContainer || !incidentForm) {
        console.error('Required elements not found');
        return;
    }

    reportsList.classList.add('d-none');
    mapContainer.classList.remove('d-none');
    incidentForm.classList.remove('d-none');

    if (!map) {
        initMap();
    }
}

// Initialize map function (global)
function initMap() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error('Map container not found');
        return;
    }

    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                coordinates = { latitude, longitude };
                map.setView([latitude, longitude], 15);

                if (marker) {
                    marker.setLatLng([latitude, longitude]);
                } else {
                    marker = L.marker([latitude, longitude]).addTo(map);
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                showAlert('Could not get your location. Please try again.', 'warning');
            }
        );
    }

    // Map click handler
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        coordinates = { latitude: lat, longitude: lng };

        if (marker) {
            marker.setLatLng([lat, lng]);
        } else {
            marker = L.marker([lat, lng]).addTo(map);
        }
    });
}

// Show alert function (global)
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '1050';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/index.html';
        return;
    }

    // DOM elements
    const mapContainer = document.getElementById('map-container');
    const incidentForm = document.getElementById('incident-form');
    const reportsList = document.getElementById('reports-list');
    const timerElement = document.getElementById('timer');
    const reportForm = document.getElementById('reportForm');
    const reportsContainer = document.getElementById('reportsContainer');
    const loadingReports = document.getElementById('loadingReports');

    // Navigation handlers
    document.getElementById('reportIncident').addEventListener('click', (e) => {
        e.preventDefault();
        showReportForm();
    });

    document.getElementById('viewReports').addEventListener('click', (e) => {
        e.preventDefault();
        showReports();
    });

    // Show reports list
    async function showReports() {
        mapContainer.classList.add('d-none');
        incidentForm.classList.add('d-none');
        reportsList.classList.remove('d-none');
        loadingReports.classList.remove('d-none');

        try {
            await loadReports();
        } catch (error) {
            console.error('Load reports error:', error);
            showAlert('Failed to load reports: ' + error.message, 'danger');
        } finally {
            loadingReports.classList.add('d-none');
        }
    }

    // Retry helper function
    async function retryFetch(url, options, maxRetries = 3, delay = 1000) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                lastError = error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
                }
            }
        }
        throw lastError;
    }

    // Load and display reports
    async function loadReports() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('No token found');
                window.location.href = '/index.html';
                return;
            }

            console.log('Using token:', token);
            const decodedToken = JSON.parse(atob(token.split('.')[1]));
            console.log('Decoded token:', decodedToken);

            // First, check database state
            try {
                const dbCheckResponse = await retryFetch('/api/incidents/debug/check-db', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });

                const dbState = await dbCheckResponse.json();
                console.log('Database state:', dbState);
            } catch (error) {
                console.error('Failed to check database state:', error);
            }

            // Add timestamp to prevent caching
            const timestamp = new Date().getTime();
            console.log('Making request to /api/incidents/my-reports');
            const response = await retryFetch(`/api/incidents/my-reports?_=${timestamp}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            const data = await response.json();
            console.log('Raw response data:', data);

            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response format');
            }

            reportsContainer.innerHTML = '';

            // Handle both data.incidents and data.incident for backward compatibility
            const incidents = data.incidents || data.incident || [];
            console.log('Processed incidents array:', incidents);

            if (!Array.isArray(incidents)) {
                throw new Error('Incidents data is not an array');
            }

            if (incidents.length === 0) {
                console.log('No incidents found, showing empty state message');
                reportsContainer.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-info text-center">
                            <p>No reports found. Click on "Report Incident" to create your first report.</p>
                            <button type="button" class="btn btn-primary mt-2" onclick="showReportForm()">Create Report</button>
                        </div>
                    </div>`;
                return;
            }

            console.log('Rendering incidents:', incidents.length);
            incidents.forEach((report, index) => {
                console.log(`Processing report ${index + 1}/${incidents.length}:`, report);
                if (!report || typeof report !== 'object') {
                    console.error('Invalid report object:', report);
                    return;
                }

                const card = document.createElement('div');
                card.className = 'col-md-6 col-lg-4 mb-4';
                card.innerHTML = `
                    <div class="card h-100">
                        ${report.images && Array.isArray(report.images) && report.images.length > 0 ? `
                            <img src="/uploads/incidents/${report.images[0]}?_=${timestamp}" class="card-img-top" alt="Incident image" onerror="this.style.display='none'">
                        ` : ''}
                        <div class="card-body">
                            <h5 class="card-title">${report.type ? report.type.charAt(0).toUpperCase() + report.type.slice(1) : 'Unknown Type'}</h5>
                            <p class="card-text">${report.description || 'No description available'}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="badge bg-${getStatusColor(report.status)}">
                                    ${report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1) : 'Unknown Status'}
                                </span>
                                <small class="text-muted">
                                    ${report.created_at ? new Date(report.created_at).toLocaleString() : 'Unknown Date'}
                                </small>
                            </div>
                            ${report.assigned_team ? `
                                <div class="mt-2">
                                    <small class="text-muted">Assigned to: ${report.assigned_team}</small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                reportsContainer.appendChild(card);
            });
        } catch (error) {
            console.error('Load reports error:', error);
            console.error('Error stack:', error.stack);
            showAlert('Error loading reports: ' + error.message, 'danger');
        }
    }

    // Helper function to get status color
    function getStatusColor(status) {
        const colors = {
            'pending': 'warning',
            'assigned': 'info',
            'in_progress': 'primary',
            'resolved': 'success',
            'cancelled': 'danger'
        };
        return colors[status] || 'secondary';
    }

    // Handle form submission
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            const formData = new FormData();
            const type = document.getElementById('incidentType').value;
            const description = document.getElementById('description').value;

            if (!type || !description) {
                showAlert('Please fill in all required fields', 'warning');
                return;
            }

            formData.append('type', type);
            formData.append('description', description);

            // Get location
            if (!coordinates) {
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject);
                    });
                    coordinates = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                } catch (error) {
                    console.error('Geolocation error:', error);
                    showAlert('Could not get your location. Please try again.', 'warning');
                    return;
                }
            }

            formData.append('latitude', coordinates.latitude);
            formData.append('longitude', coordinates.longitude);

            // Handle images
            const imageFiles = document.getElementById('images').files;
            for (let i = 0; i < imageFiles.length; i++) {
                formData.append('images', imageFiles[i]);
            }

            const token = localStorage.getItem('token');
            if (!token) {
                console.error('No token found');
                window.location.href = '/index.html';
                return;
            }

            console.log('Submitting report with token:', token);
            console.log('Form data:', {
                type,
                description,
                coordinates,
                imageCount: imageFiles.length
            });

            const response = await fetch('/api/incidents', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to submit report');
            }

            const responseData = await response.json();
            console.log('Report submission response:', responseData);

            showAlert('Report submitted successfully', 'success');
            reportForm.reset();
            coordinates = null; // Reset coordinates

            // Wait a moment before switching to reports view
            setTimeout(async () => {
                await showReports();
            }, 1000);
        } catch (error) {
            console.error('Submit report error:', error);
            console.error('Error stack:', error.stack);
            showAlert(error.message, 'danger');
        }
    });

    // Initial load - show report form by default
    showReportForm();
});

// Logout function
function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/index.html';
} 