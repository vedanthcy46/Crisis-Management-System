-- Create users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR
(100) NOT NULL,
    email VARCHAR
(100) UNIQUE NOT NULL,
    password VARCHAR
(255) NOT NULL,
    phone VARCHAR
(20),
    role ENUM
('user', 'admin', 'rescue_team') DEFAULT 'user',
    status ENUM
('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rescue_teams table
CREATE TABLE rescue_teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR
(100) NOT NULL,
    email VARCHAR
(100) UNIQUE NOT NULL,
    phone VARCHAR
(20) NOT NULL,
    type ENUM
('medical', 'fire', 'police', 'disaster') NOT NULL,
    latitude DECIMAL
(10, 8) NOT NULL,
    longitude DECIMAL
(11, 8) NOT NULL,
    status ENUM
('active', 'inactive', 'busy') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create incidents table
CREATE TABLE incidents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type ENUM
('medical', 'fire', 'crime', 'accident', 'natural') NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL
(10, 8) NOT NULL,
    longitude DECIMAL
(11, 8) NOT NULL,
    status ENUM
('pending', 'assigned', 'in_progress', 'resolved', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON
UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY
(user_id) REFERENCES users
(id)
);

-- Create incident_images table
CREATE TABLE incident_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    incident_id INT NOT NULL,
    filename VARCHAR
(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY
(incident_id) REFERENCES incidents
(id) ON
DELETE CASCADE
);

-- Create incident_assignments table
CREATE TABLE incident_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    incident_id INT NOT NULL,
    team_id INT NOT NULL,
    status ENUM
('assigned', 'accepted', 'rejected', 'completed') DEFAULT 'assigned',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON
UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY
(incident_id) REFERENCES incidents
(id),
    FOREIGN KEY
(team_id) REFERENCES rescue_teams
(id)
);

-- Create notifications table
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR
(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM
('incident', 'assignment', 'status', 'system') NOT NULL,
    read_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY
(user_id) REFERENCES users
(id)
);

-- Create indexes for better query performance
CREATE INDEX idx_incidents_user ON incidents(user_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_created ON incidents(created_at);
CREATE INDEX idx_assignments_incident ON incident_assignments(incident_id);
CREATE INDEX idx_assignments_team ON incident_assignments(team_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_rescue_teams_location ON rescue_teams(latitude, longitude); 