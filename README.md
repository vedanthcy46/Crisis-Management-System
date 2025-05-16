# Crisis360 - Emergency Response System

Crisis360 is a comprehensive emergency response system that connects users with nearby rescue teams during emergencies. The system facilitates quick incident reporting, real-time status tracking, and efficient emergency response coordination.

## Features

- **User Authentication**
  - Secure registration and login
  - Role-based access control (User, Admin, Rescue Team)
  - Profile management

- **Incident Reporting**
  - Quick incident submission with location
  - Multiple image upload support
  - 2-minute countdown timer for urgent response
  - Real-time status tracking
  - Interactive map integration using Leaflet.js

- **Rescue Team Management**
  - Automatic assignment based on proximity
  - Real-time location tracking
  - Status updates and availability management
  - Team specialization (Medical, Fire, Police, Disaster)

- **Communication**
  - Email notifications for new incidents
  - Status update notifications
  - In-app notifications system

- **Admin Dashboard**
  - User management
  - Rescue team oversight
  - Incident monitoring and analytics
  - System configuration

## Technology Stack

- **Backend**
  - Node.js with Express
  - MySQL for structured data
  - MongoDB for image storage
  - JWT for authentication
  - Nodemailer for email notifications

- **Frontend**
  - HTML5, CSS3, JavaScript
  - Bootstrap 5 for responsive design
  - Leaflet.js for maps
  - Real-time updates

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/crisis360.git
   cd crisis360
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory with the following:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # MySQL Configuration
   MYSQL_HOST=localhost
   MYSQL_USER=your_username
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=crisis360_db

   # MongoDB Configuration
   MONGODB_URI=mongodb://localhost:27017/crisis360

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRES_IN=24h

   # Email Configuration
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_specific_password
   ```

4. **Set up the database**
   ```bash
   # Create MySQL database
   mysql -u root -p
   CREATE DATABASE crisis360_db;
   exit

   # Import schema
   mysql -u root -p crisis360_db < database/schema.sql
   ```

5. **Create upload directory**
   ```bash
   mkdir -p public/uploads/incidents
   ```

6. **Start the server**
   ```bash
   npm start
   ```

## API Documentation

### Authentication Routes
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### User Routes
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/change-password` - Change password

### Incident Routes
- `POST /api/incidents` - Report new incident
- `GET /api/incidents/user` - Get user's incidents
- `PUT /api/incidents/:id/status` - Update incident status

### Rescue Team Routes
- `GET /api/rescue-teams/nearby` - Get nearby rescue teams
- `PUT /api/rescue-teams/status` - Update team status
- `POST /api/rescue-teams/respond` - Respond to incident

### Admin Routes
- `GET /api/admin/users` - Get all users
- `GET /api/admin/incidents` - Get all incidents
- `GET /api/admin/teams` - Get all rescue teams
- `GET /api/admin/analytics` - Get system analytics

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@crisis360.com or create an issue in the repository. 