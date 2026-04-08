# Database Setup Guide

This guide explains how to set up and connect the Retail Intelligence application to MongoDB.

## Prerequisites

- MongoDB Atlas account (free tier available at https://www.mongodb.com/cloud/atlas)
- Node.js and npm installed
- Git and a code editor

## MongoDB Atlas Setup

### Step 1: Create a MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click "Sign Up" and create a free account
3. Verify your email address

### Step 2: Create a Cluster

1. After logging in, click "Create a Deployment"
2. Choose **FREE** tier (M0 - 512MB storage)
3. Select your preferred cloud provider (AWS, Google Cloud, or Azure)
4. Choose a region closest to your location
5. Click "Create Cluster"
6. Wait 5-10 minutes for the cluster to be created

### Step 3: Create a Database User

1. In the left sidebar, go to **Database Access**
2. Click "Add New Database User"
3. Choose "Password" authentication method
4. Enter a username (e.g., `retail_ai_user`)
5. Generate a secure password or create your own
6. **Save the username and password** - you'll need these for the connection string
7. Set Database User Privileges to "Read and write to any database"
8. Click "Add User"

### Step 4: Configure Network Access

1. In the left sidebar, go to **Network Access**
2. Click "Add IP Address"
3. For development, you can:
   - Click "Allow Access from Anywhere" (0.0.0.0/0) - NOT recommended for production
   - Or add your specific IP address for security
4. Click "Confirm"

### Step 5: Get Your Connection String

1. Go to **Databases** in the sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Select "Node.js" as the driver
5. Copy the connection string (it will look like the example below)
6. Replace `<username>` and `<password>` with your database user credentials
7. Replace `<dbname>` with `retail-ai` (or your preferred database name)

**Example Connection String:**
```
mongodb+srv://retail_ai_user:mySecurePassword123@cluster0.abc1def2.mongodb.net/retail-ai?retryWrites=true&w=majority
```

## Backend Configuration

### Step 1: Install Dependencies

From the backend directory, run:

```bash
cd backend
npm install
```

### Step 2: Configure Environment Variables

1. Open `backend/.env` file
2. Update the `MONGO_URI` with your connection string:

```env
MONGO_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/retail-ai?retryWrites=true&w=majority
```

3. Also configure other required variables:

```env
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
AUTH_SESSION_SECRET=your-long-random-secret-key-minimum-32-characters
GOOGLE_CLIENT_ID=your-google-client-id
GEMINI_API_KEY=your-gemini-api-key
```

### Step 3: Start the Backend Server

```bash
npm run dev
```

You should see:
```
MongoDB connected.
Server running on port 5000
```

## Frontend Configuration

### Step 1: Install Dependencies

From the frontend directory, run:

```bash
cd chat-app
npm install
```

### Step 2: Start the Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Testing the Connection

### 1. Test Backend Connection

```bash
curl http://localhost:5000/
```

You should get a response like:
```json
{
  "message": "Retail intelligence API is running.",
  "storageMode": "mongo"
}
```

### 2. Test Database User Creation

1. Go to the frontend: `http://localhost:5173`
2. Click "Register"
3. Create a new account
4. In MongoDB Atlas, go to **Browse Collections**
5. You should see your new user in the `retail-ai` → `userprofiles` collection

## Database Collections

The application uses the following MongoDB collections:

### UserProfile Collection

Stores user account information with authentication data:

```javascript
{
  _id: ObjectId,
  email: String,
  name: String,
  googleId: String (optional),
  passwordHash: String,
  totpSecret: String (optional),
  totpVerified: Boolean,
  totpBackupCodes: [String],
  authMethod: String, // "google", "email", or "email-totp"
  picture: String,
  role: String, // "admin" or "member"
  workspaceName: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Other Collections

- **Sales**: Sales transaction records
- **Store**: Store information and configuration
- **ChatMessage**: Chat history messages
- **Analytics**: Analytics data

## Connection Modes

The application supports two storage modes:

### 1. MongoDB Mode (Preferred)

When `MONGO_URI` is configured and MongoDB is accessible:
- Data persists in MongoDB Atlas
- Multiple application instances can share data
- Production-ready

### 2. File Storage Mode (Fallback)

If MongoDB is unavailable:
- Data is stored in `backend/data/` directory
- Single instance only
- Development/testing only

Check current mode:
```bash
curl http://localhost:5000/
# Returns: "storageMode": "mongo" or "file"
```

## Troubleshooting

### Connection Refused

**Problem**: `Error: connection refused`

**Solutions**:
1. Verify MONGO_URI is correct in `.env`
2. Check network access is configured in MongoDB Atlas
3. Ensure your computer's IP is whitelisted
4. Verify username and password are correct

### Authentication Failed

**Problem**: `Authentication failed`

**Solutions**:
1. Check username and password in connection string
2. Ensure special characters in password are URL-encoded
   - Example: `P@ssw0rd!` becomes `P%40ssw0rd%21`
3. Verify the database user was created successfully

### Slow Connection

**Problem**: Application is slow to start

**Solutions**:
1. Check internet connection
2. Montreal cluster might be far from your location - consider changing region
3. Free tier (M0) has limited performance - upgrade for production

### Connection Timeout

**Problem**: `MongoNetworkTimeoutError`

**Solutions**:
1. Check firewall settings
2. Verify IP whitelist in MongoDB Atlas Network Access
3. Try allowing all IPs temporarily (0.0.0.0/0) for testing only

## Security Best Practices

1. **Never commit `.env` files**: Add to `.gitignore`
2. **Use strong passwords**: Minimum 12 characters with mixed case, numbers, and symbols
3. **Restrict IP access**: Don't use 0.0.0.0/0 in production
4. **Rotate credentials**: Change database passwords regularly
5. **Use environment variables**: Never hardcode sensitive data
6. **Monitor access**: Check MongoDB Activity in Atlas dashboard
7. **Enable audit logs**: For production deployments

## Production Deployment

### For Production:

1. **Upgrade MongoDB Tier**:
   - Use M1 or higher cluster
   - Enable automated backups
   - Enable cross-region replication

2. **Configure IP Whitelist**:
   - Add only your application server IPs
   - Enable IP address filtering

3. **Enable Authentication**:
   - Use strong, randomly generated passwords
   - Use separate database users for different environments
   - Enable database-level authentication

4. **Monitor & Logging**:
   - Enable database profiling
   - Set up alerts for connection errors
   - Monitor query performance

5. **Backup Strategy**:
   - Enable automatic backups
   - Test restoration procedures
   - Store backups in secure location

## Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Connection String Documentation](https://docs.mongodb.com/manual/reference/connection-string/)
- [MongoDB Security Best Practices](https://docs.mongodb.com/manual/security/)
- [MongoDB Tutorials](https://university.mongodb.com/)

## Getting Help

If you encounter issues:

1. Check the MongoDB Atlas [Status Page](https://status.mongodb.com/)
2. Review backend logs in `backend/server.js`
3. Check MongoDB Atlas Activity in the dashboard
4. Enable verbose logging by setting `NODE_DEBUG=mongodb`

---

**Last Updated**: April 2026
