// Admin Registration Script
document.addEventListener('DOMContentLoaded', () => {
    const adminData = {
        name: "Admin User",
        email: "admin@crisis360.com",
        password: "admin123456",
        phone: "1234567890",
        role: "admin"
    };

    fetch('/api/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(adminData)
    })
        .then(response => response.json())
        .then(data => {
            console.log('Admin registration successful:', data);
            alert('Admin account created successfully!');
        })
        .catch(error => {
            console.error('Admin registration error:', error);
            alert('Error creating admin account');
        });
}); 