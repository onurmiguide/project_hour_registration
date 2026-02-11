# Deployment Checklist & Quick Start

## What Changed from Flask to Node.js

✅ **Backend**: Flask ➜ Express.js  
✅ **Environment**: Python ➜ Node.js 18+  
✅ **Storage**: localStorage only ➜ localStorage + Vercel KV (Redis)  
✅ **Auto-sync**: All changes instantly sync to cloud  
✅ **Offline**: Works offline, syncs when back online  
✅ **Database**: None needed ➜ Vercel KV (integrated)  

## Local Testing (Before Deploy)

```bash
# 1. Navigate to project
cd "c:\Users\OnurYilmaz\Desktop\stage miguide\hour registration\hour-tracker"

# 2. Install dependencies
npm install

# 3. Run locally
npm run dev

# 4. Test in browser
# Open http://localhost:5000
# Add a test session
# Check browser console (F12) for any errors
# (Should see "✓ Data saved to server" in logs)
```

## Deploy to Vercel (3 Simple Steps)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
vercel login
# Follow the login prompts (you'll need a Vercel account - free tier available)
```

### Step 2: Deploy
```bash
# From your project directory
vercel
```

**Answer the prompts:**
- "Set up and deploy?" → Yes
- "Which scope?" → Your personal account
- "Link to existing project?" → No (first time)
- "What's your project's name?" → hour-tracker
- "In which directory is your code?" → . (current directory)
- "Want to modify these settings?" → No

Vercel will deploy automatically. You'll see a URL like `https://hour-tracker-xxx.vercel.app`

### Step 3: Setup Database (Vercel KV)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your **hour-tracker** project
3. Go to **Storage** tab
4. Click **Create Database** → Choose **KV** (Redis)
5. Follow prompts - keep defaults
6. **Done!** Environment variables auto-magically connected

## Test After Deployment

1. Visit your Vercel URL (e.g., `https://hour-tracker-xxx.vercel.app`)
2. Add a test session
3. **Refresh the page** - data should still be there ✅
4. Open DevTools (F12) → Console → you should see "✓ Data loaded from server"

## Data Storage Explained

### How It Works
- **Browser localStorage**: Stores data for instant offline access
- **Vercel KV (Redis)**: Cloud backup, survives restarts & browser clears
- **Sync**: Automatic, bidirectional

### What Happens When...
- **Online**: Changes save to both localStorage AND cloud
- **Offline**: Changes save to localStorage, sync when back online
- **Browser restarted**: Loads from localStorage first, then syncs with server
- **Database cleared**: Uses cloud backup (KV) if localStorage is cleared
- **Server restarted**: Data persists in Redis, loads when you visit

## Common Issues & Fixes

### "npm: command not found"
- Install Node.js from https://nodejs.org/ (download recommended version)
- Restart terminal/PowerShell
- Run `node --version` to verify

### "Cannot find module '@vercel/kv'"
```bash
# Make sure you ran npm install
npm install
```

### Data shows as empty on Vercel
1. Check if KV database was created
2. Try adding data again (may need to wait 10-15 seconds for sync)
3. Check Vercel logs: `vercel logs hour-tracker`

### "Error: EADDRINUSE: address already in use :::5000"
```bash
# Use different port
PORT=5001 npm run dev
```

## File Changes Summary

### New Files Created
- `server.js` - Express server with data APIs
- `package.json` - Node.js dependencies
- `vercel.json` - Deployment configuration
- `.env.example` - Environment template
- `.gitignore` - Git ignore file

### Modified Files
- `static/app.js` - Updated to sync with server
- `README.md` - Updated documentation

### Removed
- `app.py` (old Flask server)  
- `requirements.txt` (old Python requirements)

## API Endpoints Reference

### GET /api/data
Load user data
```javascript
fetch('/api/data')
  .then(r => r.json())
  .then(data => console.log(data.data.sessions))
```

### POST /api/data
Save user data
```javascript
fetch('/api/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessions: [...],
    totalHours: 80
  })
})
```

### DELETE /api/data
Clear all data
```javascript
fetch('/api/data', { method: 'DELETE' })
```

## Monitoring After Deploy

### View Logs
```bash
# See real-time logs
vercel logs hour-tracker -f

# Or go to dashboard → Project → Deployments → Runtime Logs
```

### Check Database Size
1. Go to Vercel Dashboard
2. Click project → Storage → KV database
3. View "Database" stats

## Next Steps

1. ✅ Local testing works
2. ✅ Deploy to Vercel (these 3 steps above)
3. ✅ Create KV database
4. ✅ Test data persistence
5. ✅ Share URL with team/friends

That's it! Your app is now live with cloud storage. 🎉

## Questions?

- Vercel docs: https://vercel.com/docs
- KV documentation: https://vercel.com/docs/storage/vercel-kv
- Express.js: https://expressjs.com
