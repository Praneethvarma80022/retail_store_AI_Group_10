# Quick Start Guide - Demo Credentials & Setup

This guide provides demo login credentials and setup instructions to get you started quickly.

## Demo Credentials

You can use one of these test accounts to login:

### Test Account 1 (Email/Password)
- **Email**: demo@example.com
- **Password**: DemoPassword123

### Test Account 2 (Email/Password with 2FA)
- **Email**: demo-2fa@example.com
- **Password**: DemoPassword456
- **2FA Code**: Check authenticator app or use backup code

## Quick Start Steps

### Step 1: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
npm install

# Verify .env configuration
# Required: MONGO_URI, GOOGLE_CLIENT_ID, AUTH_SESSION_SECRET, FRONTEND_ORIGIN

# Start the backend server
npm run dev
```

Backend should respond with:
```
MongoDB connected.
Server running on port 5000
```

### Step 2: Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd chat-app

# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

Frontend should be available at: `http://localhost:5173`

### Step 3: Create Demo Account

**Option A: Use Email/Password Login**
1. Go to `http://localhost:5173`
2. Click "Register"
3. Fill in the form:
   - **Full Name**: Your Name
   - **Email**: your-email@example.com
   - **Password**: MinimumEightChars123
4. Click "Create Account"
5. You're now logged in!

**Option B: Use Google OAuth**
1. Go to `http://localhost:5173`
2. Click "Sign In with Google"
3. Select your Google account
4. You're now logged in!

**Option C: Use Pre-created Demo Account**
1. Go to `http://localhost:5173`
2. Click "Sign In"
3. Enter email: `demo@example.com`
4. Enter password: `DemoPassword123`
5. Click "Sign In"

## Create Pre-populated Demo Database

To create demo accounts in your database, run this script in the backend:

### Method 1: MongoDB Compass (Recommended for Visual Users)

1. Download [MongoDB Compass](https://www.mongodb.com/try/download/compass)
2. Connect to your MongoDB Atlas cluster
3. Create collection: `userprofiles`
4. Insert these documents:

```json
{
  "email": "demo@example.com",
  "name": "Demo User",
  "passwordHash": "$2b$10$YIvxI5k0pYPXmqyWUTnZiuK8Vx7K8mQ4K8Vx7K8mQ4K8Vx7K8mQ4K8",
  "authMethod": "email",
  "totpVerified": false,
  "role": "admin",
  "picture": "",
  "workspaceName": "Demo Workspace",
  "createdAt": new Date(),
  "updatedAt": new Date()
}
```

### Method 2: Create via Application

1. Start both backend and frontend servers
2. Navigate to login page
3. Register new accounts as needed
4. Accounts will be automatically created in MongoDB

## Testing the Application

### Login Flows

**Test 1: Email/Password Login**
- [ ] Go to login page
- [ ] Click on email field
- [ ] Enter email: `demo@example.com`
- [ ] Enter password: `DemoPassword123`
- [ ] Click "Sign In"
- [ ] Should redirect to dashboard

**Test 2: New Account Registration**
- [ ] Go to login page
- [ ] Click "Register"
- [ ] Fill all fields
- [ ] Click "Create Account"
- [ ] Should auto-login and redirect to dashboard

**Test 3: Google OAuth**
- [ ] Go to login page
- [ ] Click "Sign In with Google"
- [ ] Follow Google authentication
- [ ] Should redirect to dashboard

**Test 4: TOTP 2FA Setup**
- [ ] Log in with email/password
- [ ] Navigate to Settings (after implementation)
- [ ] Enable "Two-Factor Authentication"
- [ ] Scan QR code with Google Authenticator, Authy, or similar
- [ ] Enter 6-digit code to verify
- [ ] Save backup codes

**Test 5: TOTP Login**
- [ ] Logout
- [ ] Login with email/password (of account with 2FA)
- [ ] When prompted, enter 6-digit code from authenticator
- [ ] Should redirect to dashboard

## Troubleshooting

### Error: "Provided button width is invalid"

**Cause**: Google button width must be in pixels

**Solution**: Already fixed in LoginPage.jsx. Clear browser cache:
```bash
# In browser DevTools: Ctrl+Shift+Delete
# Select "All time" and click "Clear data"
```

### Error: "The given origin is not allowed"

**Cause**: Frontend origin not configured in Google OAuth

**Solution**: 
1. Check `.env` has `FRONTEND_ORIGIN=http://localhost:5173`
2. In Google Cloud Console, add authorized redirect URI:
   - Go to: https://console.cloud.google.com/
   - Project: Find your project
   - APIs & Services → Credentials
   - Edit OAuth 2.0 Client
   - Add Authorized redirect URIs:
     - `http://localhost:5173`
     - `http://localhost:5173/`

### Error: "Failed to load resource: 404"

**Cause**: Backend API not running or CORS misconfigured

**Solution**:
1. Verify backend is running: `http://localhost:5000`
2. Check CORS config in `backend/server.js`
3. Verify `FRONTEND_ORIGIN` in backend `.env`
4. Restart both servers

### Error: "MongoDB connection refused"

**Cause**: MongoDB Atlas unavailable or connection string invalid

**Solution**:
1. Check internet connection
2. Verify `MONGO_URI` in `.env` is correct
3. Check IP whitelist in MongoDB Atlas
4. Test connection: `http://localhost:5000/`
   - Should show `"storageMode": "mongo"`

### Can't Copy Backup Codes

**Cause**: Browser permission issue

**Solution**:
1. Check browser popup permissions
2. Try different browser
3. Copy manually by clicking each code
4. Use Chrome DevTools to test:
   ```javascript
   navigator.clipboard.writeText("test");
   ```

## Environment Variables Explained

### Backend `.env`

```env
# Port to run backend server
PORT=5000

# Frontend URL for CORS
FRONTEND_ORIGIN=http://localhost:5173

# MongoDB connection string
MONGO_URI=mongodb+srv://user:pwd@cluster...

# Google OAuth Client ID
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Session secret (generate random 32+ char string)
AUTH_SESSION_SECRET=random-secret-key

# Gemini API configuration
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=900
```

## Browser DevTools Tips

### Test API Endpoints

In browser console:
```javascript
// Test backend connection
fetch('http://localhost:5000/').then(r => r.json()).then(console.log)

// Test auth config
fetch('http://localhost:5000/api/auth/config').then(r => r.json()).then(console.log)

// Test login
fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'demo@example.com',
    password: 'DemoPassword123'
  })
}).then(r => r.json()).then(console.log)
```

### Clear All Storage

```javascript
// Clear localStorage
localStorage.clear()

// Clear sessionStorage
sessionStorage.clear()

// Clear cookies
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "")
    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
})
```

## Performance Tips

### Speed Up Development

1. **Keep terminal open**: Avoid restarting servers repeatedly
2. **Use hot module replacement**: Changes auto-reload in browser
3. **Check network tab**: Ensure no 404 errors
4. **Monitor bundle size**: `npm run build` to check production size

### Production Preparation

1. **Build frontend**: `npm run build` in chat-app
2. **Test build**: `npm run preview`
3. **Verify .env**: Ensure all secrets are set
4. **Check logs**: Monitor backend logs for errors
5. **Test with production DB**: Use separate MongoDB cluster

## Next Steps

After successful setup:

1. **Explore Dashboard**: See available features
2. **Create Test Data**: Add sample stores, sales, analytics
3. **Test Features**: Try different sections of the app
4. **Customize Branding**: Update app title, colors, logo
5. **Deploy**: Follow production deployment guide

## Support Resources

- **Backend Logs**: Check terminal where backend server runs
- **Frontend Logs**: Check browser console (F12)
- **Database Logs**: MongoDB Atlas → Activity
- **API Documentation**: See `AUTHENTICATION_GUIDE.md`
- **Database Setup**: See `DATABASE_SETUP.md`

---

**Last Updated**: April 2026

**Need Help?**
1. Check terminal for error messages
2. Review browser DevTools console
3. Verify `.env` configuration
4. Restart servers: Backend first, then Frontend
5. Clear browser cache and cookies
