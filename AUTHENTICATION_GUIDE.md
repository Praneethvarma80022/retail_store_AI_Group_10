# Authentication System Guide

This guide explains the new TOTP-enabled authentication system with email/password login and registration.

## Overview

The Retail Intelligence application now supports multiple authentication methods:

1. **Google OAuth** - Quick login with Google account
2. **Email/Password** - Traditional account creation and login
3. **TOTP (Two-Factor Authentication)** - Optional 2FA using authenticator apps

## Features

### Registration

Users can create new accounts with:
- Full name
- Email address
- Password (minimum 8 characters)

**URL**: `/login` → Click "Register"

### Login Methods

#### Method 1: Email/Password
1. Enter registered email
2. Enter password
3. If TOTP is enabled, verify with 6-digit code or backup code
4. Gain access to dashboard

#### Method 2: Google OAuth
1. Click "Sign In with Google"
2. Select Google account
3. Automatically logged in (no 2FA option)

### Two-Factor Authentication (TOTP)

Optional security layer for email/password accounts.

**Setup Process**:
1. After registration, navigate to Settings
2. Click "Enable Two-Factor Authentication"
3. Scan QR code with authenticator app
4. Save 10 backup codes in secure location
5. Enter 6-digit code to verify setup

**Authenticator Apps**:
- Google Authenticator
- Authy
- Microsoft Authenticator
- 1Password
- FreeOTP

**During Login with TOTP**:
- Enter 6-digit code from authenticator app, OR
- Use one of 10 one-time backup codes if device is lost

## UI/UX Features

### Modern Design

The login page features:
- Dark theme (optimized for eye comfort)
- Smooth animations and transitions
- Responsive design (mobile-friendly)
- Loading spinners for better UX
- Clear error messages
- Helpful hints and guidance

### Color Scheme

```
Primary: #3b82f6 (Blue)
Success: #10b981 (Green)
Danger: #ef4444 (Red)
Warning: #f59e0b (Amber)
Background: #111827 (Dark Gray)
```

### CSS Classes

#### Containers
- `.login-page` - Main page container with gradient background
- `.login-container` - Wrapper for card with animation
- `.login-card` - Main card with blur effect

#### Forms
- `.login-form` - Form container with flex layout
- `.form-group` - Group label and input
- `.form-label` - Label styling
- `.form-input` - Input field with focus states
- `.form-hint` - Helper text below inputs

#### Buttons
- `.btn` - Base button styling
- `.btn-primary` - Blue action buttons
- `.btn-success` - Green "Create Account" button
- `.btn-secondary` - Secondary actions
- `.btn-text` - Text-only buttons

#### Messages
- `.alert` - Alert container
- `.alert-error` - Red error message
- `.alert-success` - Green success message
- `.alert-warning` - Amber warning message

#### TOTP
- `.qr-container` - QR code display area
- `.backup-codes-container` - Backup codes section
- `.totp-input` - Large centered TOTP code input
- `.backup-code-item` - Individual backup code row

### Animations

```css
slideUp      - Card entrance animation
alertSlide   - Alert message appearance
spin         - Loading spinner rotation
```

## Backend API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`
Create new account.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe"
}
```

**Response**:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "",
    "role": "admin",
    "workspaceName": ""
  }
}
```

#### POST `/api/auth/login`
Login with email and password.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response** (without TOTP):
```json
{
  "token": "eyJhbGc...",
  "user": { ... }
}
```

**Response** (with TOTP enabled):
```json
{
  "requiresTOTP": true,
  "tempToken": "eyJhbGc...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### POST `/api/auth/totp/setup`
Generate TOTP secret and QR code.

**Headers**:
```
Authorization: Bearer <tempToken>
```

**Response**:
```json
{
  "secret": "JBSWY3DPEBLW64TMMQ6W2234IJGE4TDZJWJU2DSMN2W64TEEA6SKQ",
  "qrCode": "data:image/png;base64,...",
  "backupCodes": [
    "ABC12345",
    "DEF67890",
    ...
  ]
}
```

#### POST `/api/auth/totp/verify`
Verify TOTP code and enable 2FA.

**Headers**:
```
Authorization: Bearer <tempToken>
```

**Request**:
```json
{
  "token": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "TOTP verified successfully."
}
```

#### POST `/api/auth/totp/verify-login`
Verify TOTP during login.

**Request**:
```json
{
  "email": "user@example.com",
  "token": "123456"
}
```

or with backup code:

```json
{
  "email": "user@example.com",
  "token": "ABC12345"
}
```

**Response**:
```json
{
  "token": "eyJhbGc...",
  "user": { ... }
}
```

#### POST `/api/auth/totp/disable`
Disable 2FA.

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "TOTP disabled successfully."
}
```

#### POST `/api/auth/google`
Login with Google OAuth.

**Request**:
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE..."
}
```

**Response**:
```json
{
  "token": "eyJhbGc...",
  "user": { ... }
}
```

#### GET `/api/auth/me`
Get current user info (requires authentication).

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://...",
    "role": "admin",
    "workspaceName": ""
  }
}
```

#### GET `/api/auth/config`
Get client configuration.

**Response**:
```json
{
  "googleClientId": "584246162756-...",
  "googleConfigured": true
}
```

## Database Collections

### UserProfile

```javascript
{
  _id: ObjectId,
  
  // Basic Info
  email: String,           // Unique, lowercase
  name: String,
  picture: String,
  role: "admin" | "member",
  workspaceName: String,
  
  // Authentication
  googleId: String,        // For OAuth users
  passwordHash: String,    // For email/password users
  authMethod: "google" | "email" | "email-totp",
  
  // TOTP 2FA
  totpSecret: String,      // Base32 encoded secret
  totpVerified: Boolean,   // Is 2FA enabled?
  totpBackupCodes: [String], // Hashed backup codes
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

## Security Implementation

### Password Security

- **Hashing**: bcrypt with 10 salt rounds
- **Minimum Length**: 8 characters
- **Never Stored**: Passwords are hashed, never stored in plain text

### Session Security

- **JWT-based**: Custom JWT implementation
- **Secret**: Stored in `AUTH_SESSION_SECRET` environment variable
- **TTL**: 7 days (604,800 seconds)
- **HMAC-SHA256**: Used for signing

### TOTP Security

- **Algorithm**: HMAC-based (RFC 6238)
- **Time Window**: 30-second windows with ±2 step tolerance
- **Backup Codes**: 10 one-time recovery codes
- **Hashing**: Backup codes hashed with bcrypt

### Google OAuth

- **Verification**: JWT signature verification against Google's public keys
- **Caching**: JWKS cached with proper expiration
- **Validation**: Issuer, audience, and expiration checked

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid email or password | Wrong credentials | Check email/password spelling |
| Email already registered | Duplicate account | Use "Sign In" instead |
| Password must be at least 8 characters | Weak password | Use stronger password |
| Invalid TOTP token | Wrong code | Check authenticator sync |
| Google sign-in failed | Network/OAuth issue | Try again or check internet |

## Frontend Integration

### Login Page Flow

```
START
  ↓
User selects authentication method
  ├─→ Email/Password Login
  │    ├─→ Enter credentials
  │    ├─→ Call POST /auth/login
  │    ├─→ If requiresTOTP, show TOTP screen
  │    ├─→ Enter 6-digit code
  │    ├─→ Call POST /auth/totp/verify-login
  │    └─→ Store session token
  │
  ├─→ Registration
  │    ├─→ Enter name, email, password
  │    ├─→ Call POST /auth/register
  │    └─→ Auto-login (session token received)
  │
  └─→ Google OAuth
       ├─→ Click Google button
       ├─→ Google sign-in popup
       ├─→ Call POST /auth/google
       └─→ Store session token
         
  ↓
Cookie stored with token
  ↓
Redirect to dashboard
  ↓
END
```

### Session Management

```javascript
// Stored in localStorage
{
  token: "eyJhbGc...",
  user: {
    id: "...",
    email: "...",
    name: "...",
    picture: "...",
    role: "...",
    workspaceName: "..."
  }
}
```

### Authorization Header

```
Authorization: Bearer eyJhbGc...
```

## Configuration

### Environment Variables

See `DATABASE_SETUP.md` and `backend/.env.example` for complete list.

### CSS Customization

Edit `chat-app/src/pages/LoginPage.css` to customize colors and styles:

```css
:root {
  --primary: #3b82f6;
  --success: #10b981;
  /* ... */
}
```

## Testing

### Manual Testing Checklist

- [ ] Register with email/password
- [ ] Login with email/password
- [ ] Login with Google
- [ ] Enable TOTP 2FA
- [ ] Scan QR code with authenticator
- [ ] Verify with 6-digit code
- [ ] Test backup codes
- [ ] Disable TOTP
- [ ] Test error messages
- [ ] Test on mobile device
- [ ] Test copy-to-clipboard for backup codes

### Test Accounts

Create test accounts for various scenarios:
- Email/password without 2FA
- Email/password with 2FA
- Google OAuth account
- Different role levels

## Best Practices for Users

1. **Use Strong Passwords**: Mix uppercase, lowercase, numbers, symbols
2. **Save Backup Codes**: Store in secure location (password manager, safe)
3. **Sync Device Clock**: TOTP codes depend on accurate device time
4. **Test Authenticator**: Verify setup works before relying on it
5. **Multiple Methods**: Use both email and Google account for redundancy

## Support

For issues or questions:
1. Check the troubleshooting section in `DATABASE_SETUP.md`
2. Review backend logs in `backend/server.js`
3. Check browser console for frontend errors
4. Verify environment variables are set correctly

---

**Last Updated**: April 2026
