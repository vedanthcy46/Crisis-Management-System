document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    console.log('Stored user data:', user);  // Debug log
    console.log('User role:', user.role);    // Debug log

    if (!token || user.role !== 'rescue_team') {
        window.location.href = '/index.html';
        return;
    }

    // Store the team ID (which is the same as the user ID for rescue teams)
    let teamId = user.id;
    console.log('Team ID from user:', teamId);  // Debug log

    // Verify the token payload
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('Token payload:', payload);  // Debug log

        // Use the ID from the token if available
        if (payload.id) {
            teamId = payload.id;
            console.log('Team ID from token:', teamId);  // Debug log
        }
    } catch (error) {
        console.error('Error parsing token:', error);
    }

    // Sync team ID with user ID
    async function syncTeamId() {
        try {
            const response = await fetch('/api/auth/sync-rescue-team', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ email: user.email })
            });

            if (!response.ok) {
                throw new Error('Failed to sync team ID');
            }

            const result = await response.json();
            console.log('Team ID sync result:', result);

            // If IDs were synced, reload the page to get fresh data
            if (result.old_id !== result.new_id) {
                window.location.reload();
                return;
            }
        } catch (error) {
            console.error('Team ID sync error:', error);
            showAlert('Error syncing team ID. Please try logging in again.', 'danger');
        }
    }

    // Initialize map
    let map;
    let markers = [];

    function initMap() {
        try {
            map = L.map('map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            // Get team's location and update it
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        map.setView([latitude, longitude], 13);

                        // Update team's location in database
                        try {
                            await fetch(`/api/rescue-teams/${teamId}/location`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ latitude, longitude })
                            });
                        } catch (error) {
                            console.error('Failed to update team location:', error);
                        }
                    },
                    (error) => {
                        console.error('Geolocation error:', error);
                        showAlert('Could not get your location', 'warning');
                    }
                );
            }
        } catch (error) {
            console.error('Map initialization error:', error);
            showAlert('Failed to initialize map', 'warning');
        }
    }

    // Call syncTeamId before initializing everything else
    syncTeamId().then(() => {
        initMap();
        loadTeamStatus();
        showSection('active');
    });

    // Navigation handlers
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.getAttribute('href').slice(1);
            showSection(section);
        });
    });

    // Show section
    function showSection(section) {
        document.querySelectorAll('section').forEach(s => s.classList.add('d-none'));
        document.getElementById(`${section}-section`).classList.remove('d-none');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${section}`) {
                link.classList.add('active');
            }
        });

        switch (section) {
            case 'active':
                loadActiveCases();
                break;
            case 'history':
                loadCaseHistory();
                break;
            case 'profile':
                loadTeamProfile();
                break;
        }
    }

    // Load active cases
    async function loadActiveCases() {
        try {
            const response = await fetch('/api/rescue-teams/incidents', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch active cases');
            }

            const incidents = await response.json();
            console.log('Active cases:', incidents);

            // Clear existing markers
            markers.forEach(marker => marker.remove());
            markers = [];

            const container = document.getElementById('active-cases');
            container.innerHTML = '';

            if (Array.isArray(incidents) && incidents.length > 0) {
                incidents.forEach(case_ => {
                    // Add marker to map
                    if (case_.latitude && case_.longitude) {
                        const marker = L.marker([case_.latitude, case_.longitude])
                            .addTo(map)
                            .bindPopup(`
                                <strong>${case_.type}</strong><br>
                                Status: ${case_.status}<br>
                                <button class="btn btn-sm btn-primary mt-2" onclick="viewCase(${case_.id})">
                                    View Details
                                </button>
                            `);
                        markers.push(marker);
                    }

                    // Add case card
                    container.innerHTML += `
                        <div class="col-md-6 mb-4">
                            <div class="card h-100">
                                ${case_.images && case_.images.length > 0 ? `
                                    <img src="${case_.images[0]}" class="card-img-top" alt="Case image">
                                ` : ''}
                                <div class="card-body">
                                    <h5 class="card-title">${case_.type}</h5>
                                    <p class="card-text">${case_.description}</p>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <span class="badge bg-${getStatusColor(case_.status)}">
                                            ${case_.status}
                                        </span>
                                        <small class="text-muted">
                                            ${new Date(case_.created_at).toLocaleString()}
                                        </small>
                                    </div>
                                    <div class="mt-3">
                                        <button class="btn btn-primary" onclick="updateStatus(${case_.id}, 'in_progress')">
                                            Start Response
                                        </button>
                                        <button class="btn btn-success" onclick="updateStatus(${case_.id}, 'resolved')">
                                            Mark Resolved
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            } else {
                container.innerHTML = '<div class="col-12"><p class="text-center">No active cases</p></div>';
            }

            // Update statistics
            updateStatistics();
        } catch (error) {
            console.error('Load active cases error:', error);
            showAlert(error.message || 'Failed to load active cases', 'danger');
        }
    }

    // Load case history
    async function loadCaseHistory() {
        try {
            const status = document.getElementById('history-status').value || 'resolved';
            const response = await fetch(`/api/rescue-teams/${teamId}/history?status=${status}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch case history');
            }

            const data = await response.json();
            console.log('Case history data:', data);

            const tbody = document.getElementById('history-list');
            tbody.innerHTML = '';

            if (data.incidents && data.incidents.length > 0) {
                data.incidents.forEach(incident => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${incident.id}</td>
                            <td>${incident.type}</td>
                            <td>${incident.description || 'N/A'}</td>
                            <td>
                                <span class="badge bg-${getStatusColor(incident.status)}">
                                    ${incident.status}
                                </span>
                            </td>
                            <td>${new Date(incident.created_at).toLocaleString()}</td>
                            <td>
                                <button class="btn btn-sm btn-info" onclick="viewIncidentDetails(${incident.id})">
                                    View
                                </button>
                            </td>
                        </tr>
                    `;
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No history found</td></tr>';
            }

            // Update pagination if available
            if (data.pagination) {
                updatePagination(data.pagination);
            }

            // Update team info if available
            if (data.team) {
                updateTeamInfo(data.team);
            }
        } catch (error) {
            console.error('Load case history error:', error);
            showAlert(error.message || 'Failed to load case history', 'danger');
        }
    }

    // Update pagination
    function updatePagination(pagination) {
        const paginationEl = document.getElementById('history-pagination');
        if (!paginationEl) return;

        const { limit, offset, total } = pagination;
        const currentPage = Math.floor(offset / limit) + 1;
        const totalPages = Math.ceil(total / limit);

        let html = '';
        if (totalPages > 1) {
            html += `
                <nav>
                    <ul class="pagination justify-content-center">
                        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a>
                        </li>
            `;

            for (let i = 1; i <= totalPages; i++) {
                html += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
                    </li>
                `;
            }

            html += `
                        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a>
                        </li>
                    </ul>
                </nav>
            `;
        }

        paginationEl.innerHTML = html;
    }

    // Update team info
    function updateTeamInfo(team) {
        const nameEl = document.getElementById('team-name');
        const emailEl = document.getElementById('team-email');
        const statusEl = document.getElementById('team-status');

        if (nameEl) nameEl.textContent = team.name;
        if (emailEl) emailEl.textContent = team.email;
        if (statusEl) {
            statusEl.textContent = team.status;
            statusEl.className = `badge bg-${team.status === 'active' ? 'success' : 'warning'}`;
        }
    }

    // Change page
    async function changePage(page) {
        const limit = 10;
        const offset = (page - 1) * limit;
        const status = document.getElementById('history-status').value || 'resolved';

        try {
            const response = await fetch(`/api/rescue-teams/${teamId}/history?status=${status}&limit=${limit}&offset=${offset}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch case history');
            }

            const data = await response.json();
            console.log('Page data:', data);

            // Update the table and pagination
            loadCaseHistory();
        } catch (error) {
            console.error('Change page error:', error);
            showAlert(error.message || 'Failed to change page', 'danger');
        }
    }

    // Load team profile
    async function loadTeamProfile() {
        try {
            const response = await fetch('/api/rescue-teams/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch team profile');
            }

            const profile = await response.json();
            console.log('Team profile:', profile);

            if (profile) {
                document.getElementById('team-name').value = profile.name || '';
                document.getElementById('team-email').value = profile.email || '';
                document.getElementById('team-area').value = profile.service_area || '';

                // Initialize availability toggle and status badge
                const isActive = profile.status === 'active';
                availabilityToggle.checked = isActive;
                statusBadge.textContent = isActive ? 'Active' : 'Inactive';
                statusBadge.className = `badge ${isActive ? 'bg-success' : 'bg-danger'} me-3`;

                // Update statistics
                document.getElementById('total-cases').textContent = profile.total_cases || 0;
                document.getElementById('resolved-cases').textContent = profile.resolved_cases || 0;
                document.getElementById('current-cases').textContent = profile.active_cases || 0;
            } else {
                showAlert('No profile data found', 'warning');
            }
        } catch (error) {
            console.error('Load profile error:', error);
            showAlert(error.message || 'Failed to load team profile', 'danger');
        }
    }

    // Update team profile
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`/api/rescue-teams/${teamId}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    service_area: document.getElementById('team-area').value
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update profile');
            }

            showAlert('Profile updated successfully', 'success');
        } catch (error) {
            console.error('Update profile error:', error);
            showAlert(error.message || 'Failed to update profile', 'danger');
        }
    });

    // Update case status
    window.updateStatus = async (caseId, status) => {
        try {
            const response = await fetch(`/api/incidents/${caseId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });

            if (!response.ok) throw new Error('Failed to update case status');

            showAlert('Case status updated successfully', 'success');
            loadActiveCases();
        } catch (error) {
            console.error('Update status error:', error);
            showAlert('Failed to update case status', 'danger');
        }
    };

    // Initialize availability toggle
    const availabilityToggle = document.getElementById('availabilityToggle');
    const statusBadge = document.getElementById('status-badge');

    // Load initial team status
    async function loadTeamStatus() {
        try {
            const response = await fetch('/api/rescue-teams/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch team status');

            const profile = await response.json();
            const isActive = profile.status === 'active';

            availabilityToggle.checked = isActive;
            statusBadge.textContent = isActive ? 'Active' : 'Inactive';
            statusBadge.className = `badge ${isActive ? 'bg-success' : 'bg-danger'} me-3`;
        } catch (error) {
            console.error('Load team status error:', error);
        }
    }

    // Handle availability toggle
    availabilityToggle.addEventListener('change', async (e) => {
        try {
            const response = await fetch('/api/rescue-teams/availability', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    status: e.target.checked ? 'active' : 'inactive'
                })
            });

            if (!response.ok) throw new Error('Failed to update availability');

            statusBadge.textContent = e.target.checked ? 'Active' : 'Inactive';
            statusBadge.className = `badge ${e.target.checked ? 'bg-success' : 'bg-danger'} me-3`;
            showAlert('Availability updated successfully', 'success');
        } catch (error) {
            console.error('Update availability error:', error);
            showAlert('Failed to update availability', 'danger');
            // Revert toggle state on error
            e.target.checked = !e.target.checked;
        }
    });

    // Update statistics
    async function updateStatistics() {
        try {
            const response = await fetch('/api/rescue-teams/statistics', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch statistics');

            const stats = await response.json();
            document.getElementById('total-cases').textContent = stats.total || 0;
            document.getElementById('resolved-cases').textContent = stats.resolved || 0;
            document.getElementById('current-cases').textContent = stats.active || 0;
            document.getElementById('avg-response').textContent = stats.avg_response || 'N/A';
        } catch (error) {
            console.error('Update statistics error:', error);
        }
    }

    // Helper function to get status color
    function getStatusColor(status) {
        switch (status.toLowerCase()) {
            case 'pending':
                return 'warning';
            case 'assigned':
                return 'info';
            case 'in_progress':
                return 'primary';
            case 'resolved':
                return 'success';
            case 'cancelled':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    // Show alert message
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

    // Filter history
    window.filterHistory = async () => {
        const status = document.getElementById('history-status').value;
        const date = document.getElementById('history-date').value;

        try {
            const queryParams = new URLSearchParams();
            if (status) queryParams.append('status', status);
            if (date) queryParams.append('date', date);

            const response = await fetch(`/api/rescue-teams/history?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch case history');

            const { incidents } = await response.json();
            const tbody = document.getElementById('history-list');
            tbody.innerHTML = '';

            incidents.forEach(incident => {
                tbody.innerHTML += `
                    <tr>
                        <td>${incident.id}</td>
                        <td>${incident.type}</td>
                        <td>${incident.location || 'N/A'}</td>
                        <td>
                            <span class="badge bg-${getStatusColor(incident.status)}">
                                ${incident.status}
                            </span>
                        </td>
                        <td>${incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : 'N/A'}</td>
                        <td>
                            <button class="btn btn-sm btn-info" onclick="viewCase(${incident.id})">
                                View
                            </button>
                        </td>
                    </tr>
                `;
            });

            if (incidents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No cases found</td></tr>';
            }
        } catch (error) {
            console.error('Filter history error:', error);
            showAlert('Failed to filter case history', 'danger');
        }
    };

    // View case details
    window.viewCase = async (caseId) => {
        try {
            const response = await fetch(`/api/incidents/${caseId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch case details');

            const incident = await response.json();

            // Create modal dynamically
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = `case-${caseId}-modal`;
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Case #${incident.id} Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <p><strong>Type:</strong> ${incident.type}</p>
                                    <p><strong>Status:</strong> 
                                        <span class="badge bg-${getStatusColor(incident.status)}">
                                            ${incident.status}
                                        </span>
                                    </p>
                                    <p><strong>Reporter:</strong> ${incident.reporter_name || 'Anonymous'}</p>
                                    <p><strong>Created:</strong> ${new Date(incident.created_at).toLocaleString()}</p>
                                    <p><strong>Description:</strong></p>
                                    <p class="text-muted">${incident.description}</p>
                                </div>
                                <div class="col-md-6">
                                    <div id="case-map-${incident.id}" style="height: 200px;"></div>
                                </div>
                            </div>
                            ${incident.images && incident.images.length > 0 ? `
                                <div class="mt-4">
                                    <h6>Images</h6>
                                    <div class="row">
                                        ${incident.images.map(img => `
                                            <div class="col-md-4 mb-3">
                                                <img src="${img}" class="img-fluid rounded" alt="Case image">
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            ${incident.status !== 'resolved' ? `
                                <button class="btn btn-success" onclick="updateStatus(${incident.id}, 'resolved')">
                                    Mark as Resolved
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Initialize Bootstrap modal
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            // Initialize map after modal is shown
            modal.addEventListener('shown.bs.modal', () => {
                const caseMap = L.map(`case-map-${incident.id}`).setView([incident.latitude, incident.longitude], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(caseMap);
                L.marker([incident.latitude, incident.longitude]).addTo(caseMap);
            });

            // Clean up when modal is hidden
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        } catch (error) {
            console.error('View case error:', error);
            showAlert('Failed to load case details', 'danger');
        }
    };
});

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
} 