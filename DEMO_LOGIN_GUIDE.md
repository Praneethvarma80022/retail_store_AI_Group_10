# Demo Login Credentials Guide

## Overview
The Retail Intelligence Chatbot now includes demo login credentials that allow you to access the application without requiring a backend authentication server. This is perfect for demonstrations, testing, and quick trials.

## Demo Credentials

### Email
```
demo@retail.ai
```

### Password
```
Demo@123
```

### Demo User Profile
- **ID**: demo-user-001
- **Name**: Demo User
- **Role**: admin
- **Access Level**: Full access to all features

## How to Use Demo Login

### Via UI (Recommended)
1. Navigate to the login page
2. Scroll down to the **Demo Login** section
3. You'll see the demo credentials displayed clearly
4. Click the **🚀 Quick Demo Login** button
5. You'll be instantly logged in without requiring any backend connection

### Viewing the Authentication Code
1. In the Demo Login section, click **Show Demo Authentication Code**
2. This will display the complete JavaScript code snippet used for demo authentication
3. You can copy the code using the **📋 Copy Code** button for reference or integration

## Technical Implementation

### Demo Session Structure
When you use demo login, the system creates a mock session with the following structure:

```javascript
{
  token: "demo-token-" + Date.now() + "-" + randomString,
  user: {
    id: "demo-user-001",
    email: "demo@retail.ai",
    name: "Demo User",
    role: "admin",
    createdAt: "ISO date string",
    isDemo: true
  }
}
```

### Code Snippet
The demo login handler is implemented as follows:

```javascript
// Demo Login Handler - No Backend Required
const handleDemoLogin = async (e) => {
  e.preventDefault();
  
  // Create a mock session without backend calls
  const demoSession = {
    token: "demo-token-" + Date.now(),
    user: {
      id: "demo-user-001",
      email: "demo@retail.ai",
      name: "Demo User",
      role: "admin",
      isDemo: true
    }
  };
  
  // Sign in with demo session
  signIn(demoSession);
  navigate("/", { replace: true });
};
```

## Key Features

✅ **No Backend Required** - Demo login works without any backend server
✅ **Instant Access** - Login happens immediately without API calls
✅ **Full Admin Access** - Demo user has full access to all features
✅ **Session Persistence** - Demo session is stored in localStorage
✅ **Clear Code Display** - See the authentication code directly on the login page
✅ **Code Copy Feature** - Easily copy the authentication code snippet

## Limitations

- **Session Duration**: Demo sessions persist in localStorage until cleared
- **No Persistence**: Data changes made during demo sessions are not saved
- **Demo Flag**: The session includes `isDemo: true` flag for identification
- **Mock User**: The user data is mock and not stored in any database

## Integration Guide

### For Developers
If you want to integrate this demo login feature into your own implementation:

1. **Copy the Demo Credentials Constant**:
```javascript
const DEMO_CREDENTIALS = {
  email: "demo@retail.ai",
  password: "Demo@123",
  name: "Demo User"
};
```

2. **Implement the Handler**:
   - Copy the `handleDemoLogin` function from LoginPage.jsx
   - Integrate it with your authentication context

3. **Add UI Elements**:
   - Add the demo credentials box
   - Add the code toggle button
   - Add the code snippet display section
   - Apply the CSS styles from LoginPage.css

### For Testing

Demo login is useful for:
- **Quick demonstrations** to stakeholders
- **Testing UI flows** without backend setup
- **Development environment** setup
- **Training and onboarding** purposes
- **Bug reproduction** in controlled demo environments

## Security Notes

⚠️ **Important**: The demo login feature should only be used for:
- Development environments
- Testing purposes
- Demonstration scenarios

Do NOT use demo credentials in production environments. Always implement proper authentication with backend validation for production deployments.

## Frontend Files Modified

- **LoginPage.jsx**: Added demo credentials, handler, and UI
- **LoginPage.css**: Added styling for demo login section
- **AuthContext.jsx**: No changes required (uses existing signIn functionality)
- **auth.js**: No changes required (uses existing session storage)

## Session Storage

Demo sessions are stored in localStorage under the key:
```
retail-ai-session-v1
```

To clear the demo session manually:
```javascript
localStorage.removeItem("retail-ai-session-v1");
```

## FAQ

**Q: Can I use demo credentials with the backend?**
A: No, demo login bypasses backend calls entirely. The backend won't validate these credentials.

**Q: Are demo sessions secure?**
A: Demo sessions are not secure and should never be used in production. They're designed for development and testing only.

**Q: Can I modify demo credentials?**
A: Yes, you can edit the `DEMO_CREDENTIALS` constant in LoginPage.jsx to use different credentials.

**Q: Will demo data persist?**
A: No, any data modified during a demo session will be lost when the session ends. Demo mode only affects the client-side session storage.

**Q: How do I switch from demo to real login?**
A: Sign out and select regular login. Your backend authentication should be properly configured.

## Support

For issues or questions about demo login:
1. Check the code comments in LoginPage.jsx
2. Review the styling in LoginPage.css
3. Verify the authentication context is properly set up
4. Check browser localStorage for session persistence

---

**Last Updated**: 2026-04-08
**Version**: 1.0
