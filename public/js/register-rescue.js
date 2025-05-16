// Rescue Team Registration Script
document.addEventListener('DOMContentLoaded', async () => {
    // First check if email already exists
    const rescueUserData = {
        name: "Emergency Response Team 1",
        email: "rescue1@crisis360.com",
        password: "rescue123456",
        phone: "9876543210",
        role: "rescue_team"
    };

    try {
        // Check if email exists
        const checkResponse = await fetch('/api/auth/check-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: rescueUserData.email })
        });

        const checkResult = await checkResponse.json();

        if (checkResult.exists) {
            throw new Error('A user with this email already exists');
        }

        // Create the user account
        const userResponse = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rescueUserData)
        });

        if (!userResponse.ok) {
            const error = await userResponse.json();
            throw new Error(error.message || 'Failed to create user account');
        }

        const userData = await userResponse.json();
        console.log('Rescue team user account created:', userData);

        // Now create the rescue team entry
        const rescueTeamData = {
            name: "Emergency Response Team 1",
            email: "rescue1@crisis360.com",
            phone: "9876543210",
            type: "medical", // Can be: medical, fire, police, or disaster
            latitude: 0, // Replace with actual location
            longitude: 0, // Replace with actual location
            status: "active"
        };

        const teamResponse = await fetch('/api/rescue-teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userData.token}`
            },
            body: JSON.stringify(rescueTeamData)
        });

        if (!teamResponse.ok) {
            const error = await teamResponse.json();
            throw new Error(error.message || 'Failed to create rescue team');
        }

        const teamData = await teamResponse.json();
        console.log('Rescue team registration successful:', teamData);
        alert('Rescue team account created successfully!');

        // Redirect to rescue dashboard
        window.location.href = '/rescue/dashboard.html';
    } catch (error) {
        console.error('Rescue team registration error:', error);
        alert(error.message || 'Error creating rescue team account');
    }
}); 