# Security Features & Implementation

## Overview

This Hours Tracker application implements enterprise-grade security practices to protect user accounts and data. Here's what's been implemented:

---

## 🔐 Authentication & Password Security

### Password Hashing
- **Algorithm**: bcryptjs (bcrypt with 10 salt rounds)
- **Protection**: Passwords are NEVER stored in plaintext
- **How it works**: 
  - When you register, your password is hashed with bcryptjs
  - The hash is irreversible - even we can't see your password
  - When you log in, your password is compared against the hash (safe comparison)

```javascript
// Example: How passwords are securely hashed
const hashedPassword = await bcrypt.hash(password, 10);
// Result: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36p4rWG6
```

### Password Requirements
- Minimum 8 characters
- Must contain uppercase letter (A-Z)
- Must contain lowercase letter (a-z)
- Must contain at least one number (0-9)

**Why**: Strong passwords are harder to guess or brute-force

---

## 🎫 Session Management

### JWT (JSON Web Tokens)
- **Expiry**: 7 days (automatically logs you out)
- **Secure**: Signed with a secret key
- **Protection**: Cannot be forged or modified without the secret
- **Transport**: Sent via secure HTTP-only cookies

```javascript
// Token contains:
{
  userId: "user_1234567_abc123",
  username: "john_doe",
  iat: 1707556800,
  exp: 1708161600
}
```

### Cookie Security
- **httpOnly**: JavaScript cannot access the cookie (prevents XSS theft)
- **secure**: Only sent over HTTPS in production
- **sameSite**: strict - prevents CSRF attacks
- **expires**: 7 days

---

## 🛡️ Input Validation & Injection Prevention

### Email Validation
```javascript
// Validates email format before any processing
const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Prevents: invalid formats, SQL injection attempts
// Max length: 100 characters
```

### Username Validation
```javascript
// Only allows: alphanumeric, dash, underscore
// Length: 3-20 characters
const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
```

### Protection Against Attacks

#### SQL Injection Prevention
- Using Vercel KV (key-value store) instead of SQL prevents traditional SQL injection
- All user inputs are validated before creating keys
- No dynamic query building

#### NoSQL Injection Prevention
- Input validation ensures only expected formats pass
- Keys are constructed safely: `user:${sanitizedEmail}` (not user input)
- Values are JSON validated with schema

#### XSS (Cross-Site Scripting) Prevention
- httpOnly cookies prevent JavaScript access
- Frontend doesn't store sensitive data in localStorage
- All user input is treated as untrusted

#### CSRF (Cross-Site Request Forgery) Prevention
- sameSite cookies are set to `strict`
- Requires valid authentication token for all protected endpoints
- State-changing operations require proper headers

---

## 📊 Data Storage & Privacy

### User Data Storage
Each user has isolated data stored in Vercel KV:
```
{
  userId: "unique_id",
  email: "user@example.com",
  username: "john_doe",
  password: "bcrypt_hash",
  sessions: [...],
  totalHours: 80,
  createdAt: "2024-02-11T10:30:00Z",
  updatedAt: "2024-02-12T15:45:00Z"
}
```

### Email Index
- Prevents duplicate email registration
- Lowercase for consistent lookups
- Stored separately for performance

### Data Isolation
- Each user can only access their own data
- API endpoints check `req.userId` before returning data
- No cross-user data leakage

---

## 🔑 Environment Variables & Secrets

### Production Security
```bash
# NEVER hardcode secrets! Use environment variables:
JWT_SECRET=<random-32-char-string>
KV_REST_API_TOKEN=<vercel-provided-token>
```

### Generating Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: 3f8e2a1c9b4d5e7f0a3c2b1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e
```

---

## 🔄 API Endpoint Security

### Authentication Required
All data endpoints require valid JWT token:
```
GET  /api/data              → Requires authentication
POST /api/data              → Requires authentication
GET  /api/export            → Requires authentication
DELETE /api/data            → Requires authentication
```

### Public Endpoints
```
GET  /                      → Serves index.html
POST /api/auth/register     → Public registration
POST /api/auth/login        → Public login
GET  /api/auth/status       → Check auth status
```

### Request Example
```javascript
// All protected requests must include token
fetch('/api/data', {
  headers: {
    'Authorization': `Bearer ${token}`
    // OR token is automatically sent via httpOnly cookie
  }
})
```

---

## 🚨 Security Best Practices Implemented

| Feature | Implementation | Benefit |
|---------|-----------------|---------|
| **Password Hashing** | bcryptjs with 10 salt rounds | Passwords cannot be reversed |
| **Session Tokens** | JWT with 7-day expiry | Sessions auto-expire |
| **Secure Cookies** | httpOnly + secure + sameSite | Cannot be stolen via XSS |
| **Input Validation** | Regex patterns + length checks | Prevents injection attacks |
| **HTTPS Enforcement** | secure flag in production | Encrypts data in transit |
| **CORS Headers** | sameSite strict | Prevents cross-site requests |
| **Error Messages** | Generic "Invalid email or password" | Don't reveal user existence |
| **Data Isolation** | Per-user access control | Users can't see others' data |
| **Token Signing** | JWT with secret | Tokens cannot be forged |

---

## 🔍 Verifying Security

### Check Password Hashing
```javascript
// Password: MyPassword123
// Stored Hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36p4rWG6

// When logging in:
await bcrypt.compare("MyPassword123", storedHash)
// Returns: true (password matches)

await bcrypt.compare("WrongPassword", storedHash)
// Returns: false (safe, doesn't leak info)
```

### Check Token Validity
```javascript
// Valid Token
const decoded = jwt.verify(token, JWT_SECRET);
// Returns: { userId, username, iat, exp }

// Expired Token
const decoded = jwt.verify(expiredToken, JWT_SECRET);
// Throws: TokenExpiredError
```

---

## 🛡️ Protection Against Common Attacks

### Brute Force Protection (Future)
Consider implementing in v2:
- Rate limiting on login attempts
- Account lockout after 5 failed attempts
- Progressive timeout (exponential backoff)

### Timing Attack Protection
- bcryptjs built-in protection
- Constant-time comparison for tokens
- Generic error messages

### Session Hijacking Prevention
- httpOnly cookies cannot be accessed by JavaScript
- Secure flag ensures HTTPS-only transmission
- Token expiry limits window of exposure

---

## 🔧 Local Development Security

### Setup Secure Environment
```bash
# 1. Create .env.local file
cp .env.example .env.local

# 2. Generate secure JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Update .env.local with the output
JWT_SECRET=<your-generated-string>

# 4. Run development server
npm run dev
```

### Testing Authentication
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "TestPassword123",
    "passwordConfirm": "TestPassword123"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

---

## 🚀 Production Deployment Security

### Vercel Configuration
1. **Set Environment Variables**
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add JWT_SECRET with cryptographically secure value
   - Add KV database credentials

2. **Enable HTTPS**
   - Vercel auto-enables HTTPS
   - All cookies marked as secure

3. **Monitor Logs**
   - Check for failed login attempts
   - Monitor for unusual access patterns
   ```bash
   vercel logs project-name -f
   ```

---

## ⚠️ Important Security Notes

### What This App Does NOT Protect Against
- Phishing attacks (user-side responsibility)
- Weak WIFI networks (use HTTPS on mobile)
- Browser keyloggers (system security concern)
- Social engineering (user awareness needed)

### What You Should Do
- ✅ Use a strong, unique password
- ✅ Enable 2FA on your Vercel account
- ✅ Never share your password
- ✅ Keep your browser updated
- ✅ Use HTTPS (automatic on Vercel)
- ✅ Monitor account activity

### Regular Security Reviews
- Check Vercel logs monthly
- Update dependencies: `npm audit fix`
- Review user activity patterns
- Keep Node.js updated

---

## 📚 Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - Common vulnerabilities
- [bcryptjs Docs](https://www.npmjs.com/package/bcryptjs) - Password hashing
- [JWT.io](https://jwt.io) - Token format explanation
- [Vercel Security](https://vercel.com/docs/concepts/solutions/security) - Platform security

---

## Questions about Security?

If you have concerns about specific security aspects, check:
1. [server.js](server.js) - Backend security implementation
2. [auth.js](static/auth.js) - Frontend auth handling
3. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Setup security

Stay safe! 🔒
