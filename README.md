# Hours Tracker - Node.js Edition

A clean, iOS-themed calendar + hour registration web app for tracking internship/work hours toward a **640-hour target** with **persistent cloud storage**.

## Features
✅ **Secure Authentication** - Account creation, login/logout with bcrypt password hashing  
✅ **Calendar View** - Monthly calendar grid with logged hours badges  
✅ **Progress Ring** - Visual progress toward 640-hour goal  
✅ **Add Sessions** - Log work sessions with date, time, break duration  
✅ **Quick Templates** - Add full day (8h) or half day (4h) with one click  
✅ **Live Calculations** - Net hours calculated automatically  
✅ **Data Persistence** - All data saved to Vercel KV (Redis) cloud storage  
✅ **Offline Support** - Browser localStorage keeps working offline, syncs when back online
✅ **Data Privacy** - Each user's data is isolated and encrypted  
✅ **Export/Import** - JSON and CSV export, JSON import  
✅ **iOS Design** - Monochrome black/grey/white palette, smooth animations  
✅ **Responsive** - Works on desktop and mobile  

## Tech Stack
- **Backend**: Express.js (Node.js 18+)
- **Frontend**: Vanilla JavaScript + CSS3
- **Storage**: Vercel KV (Redis) for cloud persistence + localStorage for offline capability
- **Deployment**: Vercel (serverless, free tier available)
- **Design**: iOS-inspired with 640px target

## Local Development

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- npm or yarn
- Git

### Setup

```bash
# Navigate to project directory
cd hour-tracker

# Install dependencies
npm install

# Run locally
npm run dev
```

The app will start on **http://localhost:5000**. Open in your browser and start tracking hours!

## Deployment to Vercel

### Quick Start (3 Steps)

**Step 1: Install Vercel CLI**
```bash
npm install -g vercel
vercel login
```

**Step 2: Deploy**
```bash
# From your project directory
vercel
```

**Step 3: Setup Vercel KV Database**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your **hour-tracker** project
3. Go to **Storage** → **Create Database** → Select **KV**
4. Vercel automatically sets environment variables ✓

**Done!** Your app now has cloud storage and is live on the internet.

## How Data Storage Works

1. **Online**: Data syncs between browser (localStorage) and Vercel KV (cloud)
2. **Offline**: App continues working with localStorage 
3. **Back Online**: Changes automatically sync to cloud
4. **Persistence**: All data stored in Redis, survives server restarts

## Secure Authentication

### Create Account
1. On the login page, click **"Create one"**
2. Enter email, username, and password
3. Password must have: 8+ chars, uppercase, lowercase, number
4. Click **Create Account**
5. Auto-redirected to login

### Sign In
1. Enter your email and password
2. Click **Sign In**
3. You're now logged in (7-day session)
4. Your data is loaded from cloud

### Security Features
✅ **Passwords Hashed** - Using bcryptjs (irreversible)  
✅ **Secure Tokens** - JWT tokens with auto-expiry  
✅ **HTTPS** - All data encrypted in transit  
✅ **Data Isolation** - Only you can see your data  
✅ **Input Validation** - Prevents injection attacks  
✅ **Session Security** - httpOnly cookies, CSRF protection  

See [SECURITY.md](SECURITY.md) for detailed security documentation.

### Logout
- Click the logout button (🚪) in the top-right corner
- You'll be securely logged out
- Your data stays in the cloud

## How to Use

1. **Add a Session**
   - Click any day on the calendar
   - Click "Full Day (8h)" or "Half Day (4h)" for templates
   - Or manually enter start/end times + break
   - Click Save

2. **Edit or Delete**
   - Click a session to edit it
   - Use "Delete" button to remove

3. **Track Progress**
   - Progress ring shows hours toward 640
   - Updated in real-time

4. **Export Data**
   - Export to JSON for backup
   - Export to CSV for Excel/Sheets
   - Import JSON to restore

5. **Clear Data**
   - Use "Clear All Data" (requires 2 confirmations)

## Data Model
```
{
  "id": "unique-session-id",
  "date": "2026-02-06",
  "startTime": "08:30",
  "endTime": "17:00",
  "breakMinutes": 30,
  "netMinutes": 480,  // computed
  "category": "Internship",
  "note": "Regular work day"
}
```

## API Endpoints

- `GET /` - Main app page
- `GET /api/data` - Load user data from server
- `POST /api/data` - Save user data to server (auto-synced)
- `GET /api/export` - Export user data
- `DELETE /api/data` - Delete all user data

## Customization

### Change Target Hours
Edit [static/app.js](static/app.js) line 3:
```javascript
const TARGET_HOURS = 640;  // Change this value
```

### Customize Dashboard
Edit colors in [static/styles.css](static/styles.css) `:root` section (lines 4-26)

## File Structure
```
hour-tracker/
├── server.js              # Express server (Node.js)
├── package.json           # Node dependencies
├── vercel.json            # Vercel deployment config
├── .env.example           # Environment variables template
├── templates/
│   └── index.html        # Main HTML page
└── static/
    ├── styles.css        # iOS theme styling
    └── app.js            # Client-side logic + server syncing
```

## Troubleshooting

### Data not syncing?
1. Check browser console (F12) for errors
2. Verify Vercel KV is set up in your Vercel dashboard
3. Reload the page to sync from server

### Getting 500 errors?
1. Check Vercel logs: `vercel logs hour-tracker`
2. Verify KV environment variables are configured
3. Restart deployment: `vercel --prod`

### Local development issues?
1. Delete `node_modules`: `rm -r node_modules` (or `rmdir /s node_modules` on Windows)
2. Reinstall: `npm install`
3. Make sure Node.js 18+ is installed: `node --version`

### Port already in use?
```bash
# Use a different port
PORT=5001 npm run dev
```

## Environment Variables

For local development, create a `.env.local` file (optional for local):
```
KV_URL=your_redis_url
KV_REST_API_URL=your_rest_url
KV_REST_API_TOKEN=your_token
```

On Vercel, these are automatically set when you create a KV database.

## License
MIT - Free to use and modify
