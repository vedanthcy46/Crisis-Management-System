document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token || user.role !== 'admin') {
        window.location.href = '/index.html';
        return;
    }

    // Navigation handlers
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.getAttribute('href').replace('#', '');
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
            case 'dashboard':
                loadDashboard();
                break;
            case 'incidents':
                loadIncidents();
                break;
            case 'rescue-teams':
                loadRescueTeams();
                break;
        }
    }

    // Load dashboard data
    async function loadDashboard() {
        try {
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch dashboard data');

            const data = await response.json();
            console.log('Dashboard data:', data);

            // Update statistics
            document.getElementById('total-incidents').textContent = data.statistics.incidents.total;
            document.getElementById('active-incidents').textContent =
                data.statistics.incidents.pending + data.statistics.incidents.in_progress;
            document.getElementById('total-teams').textContent = data.statistics.teams.active;

            // Update recent incidents
            const tbody = document.getElementById('recent-incidents');
            tbody.innerHTML = '';

            data.recentIncidents.forEach(incident => {
                tbody.innerHTML += `
                    <tr>
                        <td>${incident.id}</td>
                        <td>${incident.type}</td>
                        <td>${incident.location || 'N/A'}</td>
                        <td><span class="badge bg-${getStatusColor(incident.status)}">${incident.status}</span></td>
                        <td>${incident.user_name || 'Anonymous'}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="viewIncidentDetails(${incident.id})">
                                View
                            </button>
                        </td>
                    </tr>
                `;
            });
        } catch (error) {
            console.error('Dashboard error:', error);
            showAlert('Failed to load dashboard data', 'danger');
        }
    }

    // Load all incidents
    async function loadIncidents() {
        try {
            const status = document.getElementById('status-filter').value;
            const response = await fetch(`/api/admin/incidents?status=${status}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch incidents');
            }

            const data = await response.json();
            console.log('Incidents data:', data);

            const container = document.getElementById('incidents-list');
            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-info">
                            No incidents found${status ? ` with status "${status}"` : ''}.
                        </div>
                    </div>
                `;
                return;
            }

            data.forEach(incident => {
                container.innerHTML += `
                    <div class="col-md-6 col-lg-4 mb-4">
                        <div class="card h-100">
                            ${incident.images && incident.images.length > 0 ? `
                                <img src="${incident.images[0]}" class="card-img-top" alt="Incident image" style="height: 200px; object-fit: cover;">
                            ` : ''}
                            <div class="card-body">
                                <h5 class="card-title">${incident.type || 'Unknown Type'}</h5>
                                <p class="card-text">${incident.description || 'No description available'}</p>
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="badge bg-${getStatusColor(incident.status)}">
                                        ${incident.status || 'Unknown'}
                                    </span>
                                    <small class="text-muted">
                                        ${incident.created_at ? new Date(incident.created_at).toLocaleString() : 'Date unknown'}
                                    </small>
                                </div>
                                <div class="mt-3">
                                    <button class="btn btn-sm btn-primary" onclick="assignTeam(${incident.id})">
                                        Assign Team
                                    </button>
                                    <button class="btn btn-sm btn-info" onclick="viewIncidentDetails(${incident.id})">
                                        Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        } catch (error) {
            console.error('Load incidents error:', error);
            showAlert(error.message || 'Failed to load incidents', 'danger');
        }
    }

    // Apply incident filters
    window.applyFilters = async () => {
        try {
            await loadIncidents();
        } catch (error) {
            console.error('Apply filters error:', error);
            showAlert('Failed to apply filters', 'danger');
        }
    };

    // Add event listener for status filter changes
    document.getElementById('status-filter')?.addEventListener('change', applyFilters);

    // Load rescue teams
    async function loadRescueTeams() {
        try {
            const response = await fetch('/api/admin/rescue-teams', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch rescue teams');

            const data = await response.json();
            console.log('Rescue teams data:', data);

            const tbody = document.getElementById('rescue-teams-list');
            tbody.innerHTML = '';

            data.forEach(team => {
                tbody.innerHTML += `
                    <tr>
                        <td>${team.id}</td>
                        <td>${team.name}</td>
                        <td>${team.type}</td>
                        <td>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" 
                                    ${team.status === 'active' ? 'checked' : ''}
                                    onchange="updateTeamStatus(${team.id}, this.checked)">
                            </div>
                        </td>
                        <td>${team.active_incidents || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-info" onclick="viewTeamDetails(${team.id})">
                                View
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteTeam(${team.id})">
                                Delete
                            </button>
                        </td>
                    </tr>
                `;
            });
        } catch (error) {
            console.error('Load teams error:', error);
            showAlert('Failed to load rescue teams', 'danger');
        }
    }

    // Add rescue team
    window.addRescueTeam = async () => {
        try {
            const form = document.getElementById('add-team-form');
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const response = await fetch('/api/admin/rescue-teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.code === 'EMAIL_EXISTS') {
                    showAlert('A rescue team with this email already exists. Please use a different email.', 'warning');
                } else {
                    throw new Error(result.message || 'Failed to create rescue team');
                }
                return;
            }

            showAlert('Rescue team created successfully', 'success');
            const modal = bootstrap.Modal.getInstance(document.getElementById('addTeamModal'));
            modal.hide();
            form.reset();
            loadRescueTeams();
        } catch (error) {
            console.error('Add team error:', error);
            showAlert(error.message || 'Failed to create rescue team', 'danger');
        }
    };

    // Update team status
    window.updateTeamStatus = async (teamId, isActive) => {
        try {
            const response = await fetch(`/api/admin/rescue-teams/${teamId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: isActive ? 'active' : 'inactive' })
            });

            if (!response.ok) throw new Error('Failed to update team status');

            showAlert('Team status updated successfully', 'success');
        } catch (error) {
            console.error('Update status error:', error);
            showAlert('Failed to update team status', 'danger');
        }
    };

    // Helper function to get status color
    function getStatusColor(status) {
        if (!status) return 'secondary';

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

    // View incident details
    window.viewIncidentDetails = async (incidentId) => {
        try {
            const response = await fetch(`/api/admin/incidents/${incidentId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch incident details');
            }

            const incident = await response.json();
            console.log('Received incident:', incident); // Debug log

            if (!incident || !incident.id) {
                throw new Error('Invalid incident data received');
            }

            // Format date
            const createdDate = incident.created_at ? new Date(incident.created_at) : null;
            const formattedDate = createdDate && !isNaN(createdDate)
                ? createdDate.toLocaleString()
                : 'Date not available';

            // Create and show modal
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = `incident-${incidentId}-modal`;
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Incident #${incident.id}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <p><strong>Type:</strong> ${incident.type || 'N/A'}</p>
                                    <p><strong>Status:</strong> 
                                        <span class="badge bg-${getStatusColor(incident.status)}">
                                            ${incident.status || 'Unknown'}
                                        </span>
                                    </p>
                                    <p><strong>Reporter:</strong> ${incident.user_name || 'Anonymous'}</p>
                                    <p><strong>Created:</strong> ${formattedDate}</p>
                                    <p><strong>Description:</strong></p>
                                    <p class="text-muted">${incident.description || 'No description provided'}</p>
                                    ${incident.rescue_team_name ? `
                                        <p><strong>Assigned Team:</strong> ${incident.rescue_team_name}</p>
                                    ` : ''}
                                </div>
                                <div class="col-md-6">
                                    <div id="incident-map-${incident.id}" style="height: 200px;"></div>
                                </div>
                            </div>
                            ${incident.images && incident.images.length > 0 ? `
                                <div class="mt-4">
                                    <h6>Images</h6>
                                    <div class="row">
                                        ${incident.images.map(img => `
                                            <div class="col-md-4 mb-3">
                                                <img src="${img}" class="img-fluid rounded" alt="Incident image">
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            ${incident.status !== 'resolved' ? `
                                <button type="button" class="btn btn-primary" onclick="assignTeam(${incident.id})">
                                    Assign Team
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            // Initialize map after modal is shown
            modal.addEventListener('shown.bs.modal', () => {
                if (typeof L !== 'undefined' && incident.latitude && incident.longitude) {
                    const map = L.map(`incident-map-${incident.id}`).setView([incident.latitude, incident.longitude], 13);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors'
                    }).addTo(map);
                    L.marker([incident.latitude, incident.longitude]).addTo(map);
                } else {
                    const mapContainer = document.getElementById(`incident-map-${incident.id}`);
                    mapContainer.innerHTML = `
                        <div class="alert alert-warning">
                            ${!incident.latitude || !incident.longitude ?
                            'Location coordinates not available' :
                            'Map cannot be displayed'}
                        </div>`;
                }
            });

            // Clean up when modal is hidden
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        } catch (error) {
            console.error('View incident details error:', error);
            showAlert(error.message || 'Failed to load incident details', 'danger');
        }
    };

    // Assign team to incident
    window.assignTeam = async (incidentId) => {
        try {
            const response = await fetch('/api/admin/rescue-teams', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch rescue teams');

            const teams = await response.json();

            // Create and show modal
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'assign-team-modal';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Assign Rescue Team</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="assign-team-form">
                                <div class="mb-3">
                                    <label class="form-label">Select Team</label>
                                    <select class="form-select" required>
                                        <option value="">Choose a team...</option>
                                        ${teams.map(team => `
                                            <option value="${team.id}">${team.name} (${team.type})</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="confirmAssignment(${incidentId})">
                                Assign
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            // Clean up when modal is hidden
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        } catch (error) {
            console.error('Assign team error:', error);
            showAlert('Failed to load rescue teams', 'danger');
        }
    };

    // Confirm team assignment
    window.confirmAssignment = async (incidentId) => {
        const teamId = document.querySelector('#assign-team-form select').value;
        if (!teamId) {
            showAlert('Please select a team', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/admin/incidents/${incidentId}/assign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ team_id: teamId })
            });

            if (!response.ok) throw new Error('Failed to assign team');

            showAlert('Team assigned successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('assign-team-modal')).hide();
            loadIncidents();
        } catch (error) {
            console.error('Confirm assignment error:', error);
            showAlert('Failed to assign team', 'danger');
        }
    };

    // View team details
    window.viewTeamDetails = async (teamId) => {
        try {
            const response = await fetch(`/api/admin/rescue-teams/${teamId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch team details');
            }

            const team = await response.json();
            console.log('Received team:', team); // Debug log

            if (!team || !team.id) {
                throw new Error('Invalid team data received');
            }

            // Create and show modal
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = `team-${teamId}-modal`;
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Team Details: ${team.name || 'Unknown Team'}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card mb-3">
                                        <div class="card-body">
                                            <h6 class="card-subtitle mb-2 text-muted">Basic Information</h6>
                                            <p><strong>ID:</strong> ${team.id}</p>
                                            <p><strong>Type:</strong> ${team.type || 'N/A'}</p>
                                            <p><strong>Status:</strong> 
                                                <span class="badge bg-${team.status === 'active' ? 'success' : 'danger'}">
                                                    ${team.status || 'Unknown'}
                                                </span>
                                            </p>
                                            <p><strong>Email:</strong> ${team.email || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-subtitle mb-2 text-muted">Statistics</h6>
                                            <p><strong>Active Cases:</strong> ${team.active_incidents || 0}</p>
                                            <p><strong>Total Cases:</strong> ${team.total_incidents || 0}</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-subtitle mb-2 text-muted">Location</h6>
                                            <div id="team-map-${team.id}" style="height: 200px;"></div>
                                        </div>
                                    </div>
                                    ${team.active_cases && team.active_cases.length > 0 ? `
                                        <div class="card mt-3">
                                            <div class="card-body">
                                                <h6 class="card-subtitle mb-2 text-muted">Active Cases</h6>
                                                <div class="list-group">
                                                    ${team.active_cases.map(incident => `
                                                        <div class="list-group-item">
                                                            <div class="d-flex w-100 justify-content-between">
                                                                <h6 class="mb-1">Case #${incident.id}</h6>
                                                                <span class="badge bg-${getStatusColor(incident.status)}">
                                                                    ${incident.status}
                                                                </span>
                                                            </div>
                                                            <p class="mb-1">${incident.type}</p>
                                                            <button class="btn btn-sm btn-info" 
                                                                onclick="viewIncidentDetails(${incident.id})">
                                                                View Details
                                                            </button>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            ${team.status === 'active' ? `
                                <button type="button" class="btn btn-warning" 
                                    onclick="updateTeamStatus(${team.id}, false)">
                                    Deactivate Team
                                </button>
                            ` : `
                                <button type="button" class="btn btn-success" 
                                    onclick="updateTeamStatus(${team.id}, true)">
                                    Activate Team
                                </button>
                            `}
                            <button type="button" class="btn btn-danger" 
                                onclick="deleteTeam(${team.id})">
                                Delete Team
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            // Initialize map after modal is shown
            modal.addEventListener('shown.bs.modal', () => {
                if (typeof L !== 'undefined' && team.latitude && team.longitude) {
                    const map = L.map(`team-map-${team.id}`).setView([team.latitude, team.longitude], 13);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors'
                    }).addTo(map);
                    L.marker([team.latitude, team.longitude]).addTo(map);
                } else {
                    const mapContainer = document.getElementById(`team-map-${team.id}`);
                    mapContainer.innerHTML = `
                        <div class="alert alert-warning">
                            ${!team.latitude || !team.longitude ?
                            'Location coordinates not available' :
                            'Map cannot be displayed'}
                        </div>`;
                }
            });

            // Clean up when modal is hidden
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        } catch (error) {
            console.error('View team details error:', error);
            showAlert(error.message || 'Failed to load team details', 'danger');
        }
    };

    // Delete rescue team
    window.deleteTeam = async (teamId) => {
        if (!confirm('Are you sure you want to delete this rescue team? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/rescue-teams/${teamId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to delete team');

            showAlert('Team deleted successfully', 'success');
            loadRescueTeams();
        } catch (error) {
            console.error('Delete team error:', error);
            showAlert('Failed to delete team', 'danger');
        }
    };

    // Refresh incidents list
    window.refreshIncidents = async () => {
        await loadIncidents();
        showAlert('Incidents list refreshed', 'success');
    };

    // Initial load
    showSection('dashboard');

    // Logout function
    window.logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/index.html';
    };
}); 