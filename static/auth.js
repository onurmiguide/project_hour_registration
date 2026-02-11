// Authentication Handler

// Check if user is already logged in
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const result = await response.json();
    
    if (result.authenticated) {
      // User is logged in, redirect to main app
      window.location.href = '/';
      return true;
    }
  } catch (error) {
    console.log('Auth check failed:', error);
  }
  return false;
}

// Initialize auth page
document.addEventListener('DOMContentLoaded', async () => {
  // Check if logged in
  const isLoggedIn = await checkAuthStatus();
  if (isLoggedIn) return;
  
  // Setup toggle buttons
  document.getElementById('toggle-register').addEventListener('click', () => {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
  });
  
  document.getElementById('toggle-login').addEventListener('click', () => {
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
  });
  
  // Setup login form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  
  // Setup register form
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
});

// Handle login
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  const submitBtn = document.getElementById('login-submit');
  const spinner = submitBtn.querySelector('.spinner');
  const submitText = submitBtn.querySelector('span:first-child');
  const errorDiv = document.getElementById('login-error');
  
  // Clear messages
  errorDiv.innerHTML = '';
  document.getElementById('login-success').innerHTML = '';
  
  // Validate inputs
  if (!email || !password) {
    errorDiv.innerHTML = 'Email and password required';
    return;
  }
  
  // Show loading state
  submitBtn.disabled = true;
  submitText.style.display = 'none';
  spinner.style.display = 'inline-block';
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      errorDiv.innerHTML = result.message || 'Login failed';
      return;
    }
    
    // Login successful
    localStorage.setItem('token', result.token);
    console.log('✓ Login successful');
    
    // Redirect to main app
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
    
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.innerHTML = 'Connection error. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}

// Handle register
async function handleRegister(e) {
  e.preventDefault();
  
  const email = document.getElementById('register-email').value.trim();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;
  
  const submitBtn = document.getElementById('register-submit');
  const spinner = submitBtn.querySelector('.spinner');
  const submitText = submitBtn.querySelector('span:first-child');
  const errorDiv = document.getElementById('register-error');
  const successDiv = document.getElementById('register-success');
  
  // Clear messages
  errorDiv.innerHTML = '';
  successDiv.innerHTML = '';
  
  // Client-side validation
  if (!email || !username || !password || !passwordConfirm) {
    errorDiv.innerHTML = 'All fields required';
    return;
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errorDiv.innerHTML = 'Invalid email address';
    return;
  }
  
  // Username validation
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  if (!usernameRegex.test(username)) {
    errorDiv.innerHTML = 'Username: 3-20 chars, alphanumeric/dash/underscore only';
    return;
  }
  
  // Password validation
  if (password.length < 8) {
    errorDiv.innerHTML = 'Password must be at least 8 characters';
    return;
  }
  
  if (!/[A-Z]/.test(password)) {
    errorDiv.innerHTML = 'Password must contain uppercase letter';
    return;
  }
  
  if (!/[a-z]/.test(password)) {
    errorDiv.innerHTML = 'Password must contain lowercase letter';
    return;
  }
  
  if (!/[0-9]/.test(password)) {
    errorDiv.innerHTML = 'Password must contain number';
    return;
  }
  
  if (password !== passwordConfirm) {
    errorDiv.innerHTML = 'Passwords do not match';
    return;
  }
  
  // Show loading state
  submitBtn.disabled = true;
  submitText.style.display = 'none';
  spinner.style.display = 'inline-block';
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, username, password, passwordConfirm })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      errorDiv.innerHTML = result.message || 'Registration failed';
      return;
    }
    
    // Registration successful
    successDiv.innerHTML = '✓ Account created! Switching to login...';
    console.log('✓ Registration successful');
    
    // Clear form
    document.getElementById('registerForm').reset();
    
    // Switch to login after 2 seconds
    setTimeout(() => {
      document.getElementById('register-form').classList.remove('active');
      document.getElementById('login-form').classList.add('active');
      document.getElementById('login-email').value = email;
      document.getElementById('login-email').focus();
    }, 1500);
    
  } catch (error) {
    console.error('Registration error:', error);
    errorDiv.innerHTML = 'Connection error. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}
