// Hours Tracker - Client-side Logic

const TARGET_HOURS = 640;
const STORAGE_KEY = 'hoursTrackerData';
const FILES_STORAGE_KEY = 'bestandenBIMFiles';
const FOLDERS_STORAGE_KEY = 'bestandenBIMFolders';

// IndexedDB constants
const DB_NAME = 'HourTrackerDB';
const DB_VERSION = 1;
const FILES_STORE = 'files';

let db = null; // IndexedDB database
let currentUser = null; // Current logged-in user

// Data state
let sessions = [];
let currentDate = new Date();
let selectedDate = null;
let editingSessionId = null;
let uploadedFiles = [];
let folders = [];
let currentFolder = null;
let selectedFiles = new Set();

// Get auth token from localStorage
function getAuthToken() {
    return localStorage.getItem('token');
}

// Get authorization headers with token
function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
}

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status');
        const result = await response.json();
        
        if (!result.authenticated) {
            // Not authenticated, redirect to auth page
            window.location.href = '/auth.html';
            return false;
        }
        
        currentUser = {
            userId: result.userId,
            username: result.username
        };
        
        console.log('✓ User authenticated:', result.username);
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/auth.html';
        return false;
    }
}

// Initialize IndexedDB
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        console.log('Initializing IndexedDB...');
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('✓ IndexedDB initialized successfully:', DB_NAME);
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            console.log('IndexedDB upgrade needed, creating object stores...');
            const database = event.target.result;
            if (!database.objectStoreNames.contains(FILES_STORE)) {
                database.createObjectStore(FILES_STORE, { keyPath: 'id' });
                console.log('✓ Created object store:', FILES_STORE);
            }
        };
        
        request.onblocked = () => {
            console.warn('IndexedDB open blocked - other tabs may have database open');
        };
    });
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    
    // Initialize IndexedDB
    try {
        await initIndexedDB();
        console.log('✓ App initialization: IndexedDB ready');
    } catch (error) {
        console.error('✗ Failed to initialize IndexedDB:', error);
        alert('⚠️ Warning: File storage initialization failed. File uploads may not work. Please refresh the page.\n\nError: ' + error.message);
    }
    
    loadData();
    await loadFiles();
    setupEventListeners();
    setupLogout();
    renderCalendar();
    updateProgress();
    updateDateTime();
    fetchWeather();
    
    // Initialize pages - show hours page by default
    showPage('hours');
    
    // Setup PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    
    // Close preview modal on background click
    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') {
            closePreview();
        }
    });
    
    // Update time every minute
    setInterval(updateDateTime, 60000);
    // Update weather every 30 minutes
    setInterval(fetchWeather, 30 * 60 * 1000);
});

// Setup logout button and display username
function setupLogout() {
    // Display username
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay && currentUser) {
        usernameDisplay.textContent = currentUser.username;
    }
    
    // Setup logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Handle logout
async function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Clear local data
    localStorage.removeItem('token');
    localStorage.removeItem(STORAGE_KEY);
    
    // Redirect to auth page
    window.location.href = '/auth.html';
}

// Load data from server (with localStorage fallback)
async function loadData() {
    try {
        // Try to load from server first
        const response = await fetch('/api/data', {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.data && result.data.sessions) {
            sessions = result.data.sessions;
            // Also save to localStorage as cache
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
            console.log('✓ Data loaded from server');
        }
    } catch (error) {
        console.warn('Server load failed, trying localStorage fallback:', error);
        // Fallback to localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                sessions = JSON.parse(stored);
                console.log('✓ Data loaded from localStorage cache');
            } catch (e) {
                console.error('Failed to load data:', e);
                sessions = [];
            }
        }
    }
}

// Save data to server (and localStorage as backup)
async function saveData() {
    // Save to localStorage immediately (backup)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    
    // Save to server
    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                sessions: sessions,
                totalHours: sessions.reduce((sum, s) => sum + (s.netHours || 0), 0)
            })
        });
        
        if (!response.ok) {
            console.warn('Failed to save to server:', response.statusText);
        } else {
            console.log('✓ Data saved to server');
        }
    } catch (error) {
        console.warn('Could not save to server (offline?):', error);
    }
    
    updateProgress();
    renderCalendar();
}

// Event listeners
function setupEventListeners() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Live preview for form inputs
    ['sessionForm', 'editForm'].forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('input', updateNetHoursPreview);
        }
    });

    // Handle background click on modal
    document.getElementById('dayPanel').addEventListener('click', (e) => {
        if (e.target.id === 'dayPanel') closeDayPanel();
    });
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') closeEditModal();
    });
}

// Render Calendar
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('monthYear').textContent = new Date(year, month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const firstDayWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    const daysContainer = document.getElementById('calendarDays');
    daysContainer.innerHTML = '';

    // Previous month days
    for (let i = firstDayWeek - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = createDayElement(day, month - 1 === -1, null);
        dayEl.classList.add('other-month');
        daysContainer.appendChild(dayEl);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const dayHours = getDateHours(dateStr);
        
        const dayEl = createDayElement(day, true, dayHours, dateStr);
        
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayEl.classList.add('today');
        }
        
        dayEl.addEventListener('click', () => openDayPanel(dateStr, dayEl));
        daysContainer.appendChild(dayEl);
    }

    // Next month days
    const totalCells = daysContainer.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayEl = createDayElement(day, month + 1 === 12, null);
        dayEl.classList.add('other-month');
        daysContainer.appendChild(dayEl);
    }
}

function createDayElement(day, isCurrentMonth, hours, dateStr) {
    const div = document.createElement('div');
    div.className = 'day';
    if (hours !== null && hours > 0) {
        div.classList.add('has-hours');
        const hasNotes = dateStr && sessions.some(s => s.date === dateStr && s.note);
        const noteIndicator = hasNotes ? '<span class="note-dot">●</span>' : '';
        div.innerHTML = `
            <div class="day-number">${day}</div>
            <div class="day-hours-container">${hours.toFixed(1)}h${noteIndicator}</div>
        `;
    } else {
        div.textContent = day;
    }
    return div;
}

function getDateHours(dateStr) {
    return sessions
        .filter(s => s.date === dateStr)
        .reduce((sum, s) => sum + (s.netMinutes / 60), 0);
}

// Date formatting
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTime(hours, minutes) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Calculate net minutes
function calculateNetMinutes(startStr, endStr, breakMinutes) {
    if (!startStr || !endStr) return 0;
    
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;
    
    if (endTotalMin <= startTotalMin) return 0;
    
    const durationMin = endTotalMin - startTotalMin;
    const netMin = Math.max(0, durationMin - breakMinutes);
    
    return netMin;
}

// Day Panel
function openDayPanel(dateStr, dayEl) {
    selectedDate = dateStr;
    document.getElementById('dayPanelTitle').textContent = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Populate sessions list
    const daySessionsList = document.getElementById('daySessionsList');
    const daySessions = sessions.filter(s => s.date === dateStr);
    const dayTotal = daySessions.reduce((sum, s) => sum + (s.netMinutes / 60), 0);

    daySessionsList.innerHTML = '';
    if (daySessions.length === 0) {
        daySessionsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No sessions for this day</p>';
    } else {
        daySessions.forEach(session => {
            const hours = (session.netMinutes / 60).toFixed(1);
            const el = document.createElement('div');
            el.className = 'session-item';
            el.innerHTML = `
                <div>
                    <div class="session-time">${session.startTime} − ${session.endTime}</div>
                    ${session.note ? `<div class="session-note">${session.note}</div>` : ''}
                    <div class="session-note">${session.category || 'Other'}</div>
                </div>
                <div class="session-hours">${hours}h</div>
            `;
            el.addEventListener('click', () => openEditModal(session.id));
            daySessionsList.appendChild(el);
        });
    }

    document.getElementById('dayTotal').textContent = dayTotal.toFixed(1) + ' hrs';

    // Prefill form with first session if available, otherwise clear for new session
    if (daySessions.length > 0) {
        // Prefill with first session's data for quick editing
        const firstSession = daySessions[0];
        document.getElementById('sessionDate').value = firstSession.date;
        document.getElementById('startTime').value = firstSession.startTime;
        document.getElementById('endTime').value = firstSession.endTime;
        document.getElementById('breakMinutes').value = firstSession.breakMinutes;
        document.getElementById('note').value = firstSession.note || '';
        document.getElementById('category').value = firstSession.category || 'Internship';
    } else {
        // Clear form for new session
        document.getElementById('sessionDate').value = dateStr;
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        document.getElementById('breakMinutes').value = 30;
        document.getElementById('note').value = '';
        document.getElementById('category').value = 'Internship';
    }
    updateNetHoursPreview({ currentTarget: document.getElementById('sessionForm') });

    document.getElementById('dayPanel').style.display = 'flex';
}

function closeDayPanel() {
    document.getElementById('dayPanel').style.display = 'none';
    selectedDate = null;
    document.getElementById('sessionForm').reset();
}

// Session form submission
function saveSession(event) {
    event.preventDefault();
    
    const date = document.getElementById('sessionDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const breakMinutes = parseInt(document.getElementById('breakMinutes').value) || 0;
    const note = document.getElementById('note').value;
    const category = document.getElementById('category').value;
    
    if (!date || !startTime || !endTime) {
        alert('Please fill in all required fields');
        return;
    }
    
    const netMinutes = calculateNetMinutes(startTime, endTime, breakMinutes);
    if (netMinutes <= 0) {
        alert('Invalid time range or break duration is too long');
        return;
    }
    
    const session = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        date,
        startTime,
        endTime,
        breakMinutes,
        note,
        category,
        netMinutes
    };
    
    sessions.push(session);
    saveData();
    closeDayPanel();
}

// Edit modal
function openEditModal(sessionId) {
    editingSessionId = sessionId;
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) return;
    
    document.getElementById('editDate').value = session.date;
    document.getElementById('editStartTime').value = session.startTime;
    document.getElementById('editEndTime').value = session.endTime;
    document.getElementById('editBreakMinutes').value = session.breakMinutes;
    document.getElementById('editNote').value = session.note || '';
    document.getElementById('editCategory').value = session.category || 'Internship';
    
    updateNetHoursPreview({ currentTarget: document.getElementById('editForm') });
    
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingSessionId = null;
}

function updateSession(event) {
    event.preventDefault();
    
    const sessionId = editingSessionId;
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) return;
    
    session.date = document.getElementById('editDate').value;
    session.startTime = document.getElementById('editStartTime').value;
    session.endTime = document.getElementById('editEndTime').value;
    session.breakMinutes = parseInt(document.getElementById('editBreakMinutes').value) || 0;
    session.note = document.getElementById('editNote').value;
    session.category = document.getElementById('editCategory').value;
    session.netMinutes = calculateNetMinutes(session.startTime, session.endTime, session.breakMinutes);
    
    if (session.netMinutes <= 0) {
        alert('Invalid time range');
        return;
    }
    
    saveData();
    
    // Close modal and re-open day panel with updated date
    closeEditModal();
    const dateStr = session.date;
    const dayEl = document.querySelector('.day');
    openDayPanel(dateStr, dayEl);
}

function deleteCurrentSession() {
    if (!editingSessionId) return;
    
    if (confirm('Delete this session?')) {
        sessions = sessions.filter(s => s.id !== editingSessionId);
        saveData();
        closeEditModal();
        
        if (selectedDate) {
            const dayEl = document.querySelector('.day');
            openDayPanel(selectedDate, dayEl);
        }
    }
}

// Quick add templates
function addQuickSession(netHours, label) {
    // Use today's date if no date selected
    const dateToUse = selectedDate || formatDate(new Date());
    
    // Open day panel first
    openDayPanel(dateToUse, null);
    
    // Calculate times: 08:30 start, break 30 min
    const startHour = 8, startMin = 30;
    const totalDurationMin = netHours * 60 + 30; // +30 min break
    const endMin = (startMin + totalDurationMin) % 60;
    const endHour = startHour + Math.floor((startMin + totalDurationMin) / 60);
    
    // Prefill the form
    document.getElementById('sessionDate').value = dateToUse;
    document.getElementById('startTime').value = formatTime(startHour, startMin);
    document.getElementById('endTime').value = formatTime(endHour, endMin);
    document.getElementById('breakMinutes').value = 30;
    document.getElementById('note').value = label;
    document.getElementById('category').value = 'Internship';
    
    updateNetHoursPreview({ currentTarget: document.getElementById('sessionForm') });
}

// Update net hours preview
function updateNetHoursPreview(event) {
    const form = event.currentTarget;
    const formId = form.id;
    
    let startInput, endInput, breakInput, previewId;
    
    if (formId === 'sessionForm') {
        startInput = document.getElementById('startTime');
        endInput = document.getElementById('endTime');
        breakInput = document.getElementById('breakMinutes');
        previewId = 'netHoursPreview';
    } else if (formId === 'editForm') {
        startInput = document.getElementById('editStartTime');
        endInput = document.getElementById('editEndTime');
        breakInput = document.getElementById('editBreakMinutes');
        previewId = 'editNetHours';
    }
    
    if (!startInput || !endInput) return;
    
    const netMin = calculateNetMinutes(startInput.value, endInput.value, parseInt(breakInput.value) || 0);
    const netHours = (netMin / 60).toFixed(1);
    
    document.getElementById(previewId).textContent = netHours;
}

// Update date and time
function updateDateTime() {
    const now = new Date();
    
    // Update day name
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    document.getElementById('currentDay').textContent = dayName;
    
    // Update time
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('currentTime').textContent = `${hours}:${minutes}`;
}

// Fetch weather from Open-Meteo API
function fetchWeather() {
    // Rotterdam coordinates: 51.9225°N, 4.4792°E
    const latitude = 51.9225;
    const longitude = 4.4792;
    
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`)
        .then(response => response.json())
        .then(data => {
            const current = data.current;
            const temp = Math.round(current.temperature_2m);
            const weatherCode = current.weather_code;
            
            // Update temperature
            document.getElementById('weatherTemp').textContent = `${temp}°C`;
            
            // Get weather description and icon based on WMO weather code
            const { description, icon } = getWeatherInfo(weatherCode, current.is_day);
            document.getElementById('weatherDesc').textContent = description;
            document.getElementById('weatherIcon').textContent = icon;
        })
        .catch(error => {
            console.error('Error fetching weather:', error);
            document.getElementById('weatherDesc').textContent = 'Unable to load';
        });
}

// Convert WMO weather codes to descriptions and emoji
function getWeatherInfo(code, isDay) {
    const weatherMap = {
        // Clear sky
        0: { description: 'Clear sky', icon: isDay ? '☀️' : '🌙' },
        1: { description: 'Mainly clear', icon: isDay ? '🌤️' : '🌤️' },
        2: { description: 'Partly cloudy', icon: '⛅' },
        3: { description: 'Overcast', icon: '☁️' },
        
        // Precipitation
        45: { description: 'Foggy', icon: '🌫️' },
        48: { description: 'Foggy', icon: '🌫️' },
        51: { description: 'Light drizzle', icon: '🌧️' },
        53: { description: 'Moderate drizzle', icon: '🌧️' },
        55: { description: 'Dense drizzle', icon: '🌧️' },
        61: { description: 'Slight rain', icon: '🌧️' },
        63: { description: 'Moderate rain', icon: '🌧️' },
        65: { description: 'Heavy rain', icon: '⛈️' },
        71: { description: 'Slight snow', icon: '❄️' },
        73: { description: 'Moderate snow', icon: '❄️' },
        75: { description: 'Heavy snow', icon: '❄️' },
        77: { description: 'Snow grains', icon: '❄️' },
        80: { description: 'Slight showers', icon: '🌧️' },
        81: { description: 'Moderate showers', icon: '🌧️' },
        82: { description: 'Violent showers', icon: '⛈️' },
        85: { description: 'Slight snow showers', icon: '🌨️' },
        86: { description: 'Heavy snow showers', icon: '🌨️' },
        95: { description: 'Thunderstorm', icon: '⚡' },
        96: { description: 'Thunderstorm with hail', icon: '⚡' },
        99: { description: 'Thunderstorm with hail', icon: '⚡' },
    };
    
    return weatherMap[code] || { description: 'Unknown', icon: '🌐' };
}

// Update progress
function updateProgress() {
    const totalMinutes = sessions.reduce((sum, s) => sum + s.netMinutes, 0);
    const totalHours = totalMinutes / 60;
    const remaining = TARGET_HOURS - totalHours;
    const percent = (totalHours / TARGET_HOURS) * 100;

    // Update display
    document.getElementById('totalHours').textContent = totalHours.toFixed(1);
    document.getElementById('remainingHours').textContent = remaining.toFixed(1);
    document.getElementById('progressPercent').textContent = Math.min(100, Math.round(percent)) + '%';
    
    // Update timestamp
    const now = new Date();
    document.getElementById('lastUpdated').textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Update progress ring
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (percent / 100) * circumference;
    document.getElementById('progressRing').style.strokeDashoffset = offset;
}

// Data Management
function exportJSON() {
    const data = {
        exportDate: new Date().toISOString(),
        target: TARGET_HOURS,
        sessions: sessions
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadFile(blob, 'hours-tracker.json');
}

function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (Array.isArray(data.sessions)) {
                    sessions = data.sessions;
                    saveData();
                    alert('Data imported successfully');
                } else if (Array.isArray(data)) {
                    sessions = data;
                    saveData();
                    alert('Data imported successfully');
                } else {
                    alert('Invalid JSON format');
                }
            } catch (error) {
                alert('Failed to parse JSON: ' + error.message);
            }
        };
        reader.readAsText(file);
    });
    
    input.click();
}

function exportCSV() {
    let csv = 'Date,Start Time,End Time,Break (min),Net Hours,Category,Note\n';
    
    sessions.forEach(s => {
        const netHours = (s.netMinutes / 60).toFixed(2);
        csv += `${s.date},${s.startTime},${s.endTime},${s.breakMinutes},${netHours},${s.category},${s.note || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadFile(blob, 'hours-tracker.csv');
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearAllData() {
    if (confirm('This will permanently delete all data. Are you sure?')) {
        if (confirm('This action cannot be undone. Delete everything?')) {
            sessions = [];
            localStorage.removeItem(STORAGE_KEY);
            renderCalendar();
            updateProgress();
            closeDayPanel();
            alert('All data cleared');
        }
    }
}

// Page Navigation
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });
    
    // Show selected page
    const pageId = pageName === 'hours' ? 'hoursPage' : 'bestandenPage';
    const page = document.getElementById(pageId);
    if (page) {
        page.style.display = 'block';
    }
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn-primary').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(pageName === 'hours' ? 'navHours' : 'navBestanden');
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

// File Management for Bestanden BIM
async function loadFiles() {
    try {
        // Load file metadata from localStorage
        const stored = localStorage.getItem(FILES_STORAGE_KEY);
        if (stored) {
            try {
                uploadedFiles = JSON.parse(stored);
                console.log('Loaded', uploadedFiles.length, 'files from localStorage');
                
                // Log which files have legacy data vs new IndexedDB data
                const withLegacyData = uploadedFiles.filter(f => f.data && typeof f.data === 'string').length;
                const withoutData = uploadedFiles.filter(f => !f.data).length;
                console.log('File breakdown: ' + withLegacyData + ' with legacy base64 data, ' + withoutData + ' new files (data in IndexedDB)');
            } catch (e) {
                console.error('Failed to load files from localStorage:', e);
                uploadedFiles = [];
            }
        }
        
        // Load folders from localStorage
        const folderStored = localStorage.getItem(FOLDERS_STORAGE_KEY);
        if (folderStored) {
            try {
                folders = JSON.parse(folderStored);
                console.log('Loaded', folders.length, 'folders from localStorage');
            } catch (e) {
                console.error('Failed to load folders:', e);
                folders = [];
            }
        }
        
        currentFolder = null;
        renderBreadcrumb();
        renderFilesList();
    } catch (e) {
        console.error('Error loading files:', e);
    }
}

async function saveFiles() {
    try {
        // Save folders to localStorage (small size)
        const foldersData = JSON.stringify(folders);
        localStorage.setItem(FOLDERS_STORAGE_KEY, foldersData);
        
        // Save file metadata to localStorage (metadata only, no blob data)
        const filesMetadata = uploadedFiles.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            uploadedAt: f.uploadedAt,
            type: f.type,
            parentId: f.parentId
        }));
        localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(filesMetadata));
        
        // Blobs are already saved to IndexedDB during upload (saveFileToIndexedDB)
        // No need to re-save them here
        
        renderFilesList();
    } catch (e) {
        console.error('Error saving files:', e);
        alert('Error saving files: ' + e.message);
    }
}

// Helper function to save file blob to IndexedDB
async function saveFileToIndexedDB(fileId, fileData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            const error = new Error('IndexedDB not initialized');
            console.error(error);
            reject(error);
            return;
        }
        
        try {
            const tx = db.transaction(FILES_STORE, 'readwrite');
            const store = tx.objectStore(FILES_STORE);
            
            const request = store.put({
                id: fileId,
                data: fileData,
                savedAt: new Date().toISOString()
            });
            
            request.onsuccess = () => {
                console.log('File saved to IndexedDB:', fileId);
                resolve();
            };
            request.onerror = () => {
                console.error('Error saving to IndexedDB:', request.error);
                reject(request.error);
            };
            
            tx.onerror = () => {
                console.error('Transaction error:', tx.error);
                reject(tx.error);
            };
        } catch (error) {
            console.error('Exception in saveFileToIndexedDB:', error);
            reject(error);
        }
    });
}

// Helper function to retrieve file blob from IndexedDB
async function getFileFromIndexedDB(fileId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            const error = new Error('IndexedDB not initialized');
            console.error(error);
            reject(error);
            return;
        }
        
        try {
            const tx = db.transaction(FILES_STORE, 'readonly');
            const store = tx.objectStore(FILES_STORE);
            const request = store.get(fileId);
            
            request.onsuccess = () => {
                if (request.result && request.result.data) {
                    console.log('File retrieved from IndexedDB:', fileId);
                    resolve(request.result.data);
                } else {
                    const error = new Error('File not found in IndexedDB: ' + fileId);
                    console.error(error);
                    reject(error);
                }
            };
            request.onerror = () => {
                console.error('Error reading from IndexedDB:', request.error);
                reject(request.error);
            };
            
            tx.onerror = () => {
                console.error('Transaction error:', tx.error);
                reject(tx.error);
            };
        } catch (error) {
            console.error('Exception in getFileFromIndexedDB:', error);
            reject(error);
        }
    });
}

// Helper function to delete file from IndexedDB
async function deleteFileFromIndexedDB(fileId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('IndexedDB not initialized'));
            return;
        }
        
        const tx = db.transaction(FILES_STORE, 'readwrite');
        const store = tx.objectStore(FILES_STORE);
        const request = store.delete(fileId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Migrate legacy base64 data from localStorage to IndexedDB
async function migrateLegacyFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return false;
    
    // Check if file has legacy base64 data
    if (!file.data || typeof file.data !== 'string' || file.data.length === 0) {
        console.log('No legacy data to migrate for:', fileId);
        return false;
    }
    
    console.log('Migrating legacy file to IndexedDB:', fileId);
    
    try {
        if (!db) {
            console.warn('IndexedDB not available for migration');
            return false;
        }
        
        // Convert base64 to blob
        const mimeType = file.type || getMimeType(file.name);
        const blob = base64toBlob(file.data, mimeType);
        
        // Save to IndexedDB
        await saveFileToIndexedDB(fileId, blob);
        
        // Remove base64 data from metadata (save space in localStorage)
        file.data = undefined;
        await saveFiles();
        
        console.log('✓ Migration successful:', fileId);
        return true;
    } catch (error) {
        console.error('Migration failed:', error);
        return false;
    }
}

function getStorageInfo() {
    try {
        const filesData = localStorage.getItem(FILES_STORAGE_KEY) || '[]';
        const sessionsData = localStorage.getItem(STORAGE_KEY) || '[]';
        const foldersData = localStorage.getItem(FOLDERS_STORAGE_KEY) || '[]';
        
        const totalSize = filesData.length + sessionsData.length + foldersData.length;
        const usagePercent = (totalSize / (50 * 1024 * 1024)) * 100; // Assuming 50MB quota
        
        return {
            filesSize: filesData.length,
            totalSize: totalSize,
            usagePercent: usagePercent,
            fileCount: uploadedFiles.length
        };
    } catch (e) {
        console.error('Error getting storage info:', e);
        return null;
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector('.upload-area').classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector('.upload-area').classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector('.upload-area').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

async function handleFiles(files) {
    let filesProcessed = 0;
    let successCount = 0;
    const totalFiles = files.length;
    
    for (let file of files) {
        console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
        
        // Check file size - max 200MB (IndexedDB can handle it)
        if (file.size > 200 * 1024 * 1024) {
            alert(`File "${file.name}" is too large (max 200MB). Skipping.`);
            filesProcessed++;
            if (filesProcessed === totalFiles) {
                if (successCount > 0) await saveFiles();
            }
            continue;
        }
        
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const fileData = e.target.result; // ArrayBuffer
                const blob = new Blob([fileData], { type: file.type });
                
                const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                
                // Create file metadata (WITHOUT blob data - store separately in IndexedDB)
                const fileObj = {
                    id: fileId,
                    name: file.name,
                    size: formatFileSize(file.size),
                    uploadedAt: new Date().toISOString(),
                    type: file.type || getMimeType(file.name),
                    parentId: currentFolder
                    // NOTE: blob data NOT stored in metadata
                };
                
                // Check if IndexedDB is initialized
                if (!db) {
                    throw new Error('File storage (IndexedDB) is not initialized. Please refresh the page and try again.');
                }
                
                // Save blob to IndexedDB
                console.log('Saving file to IndexedDB:', fileId);
                await saveFileToIndexedDB(fileId, blob);
                console.log('File saved successfully:', fileId);
                
                // Add metadata to in-memory array
                uploadedFiles.push(fileObj);
                successCount++;
                console.log('File added to metadata:', fileObj.name, 'ID:', fileObj.id);
                filesProcessed++;
                
                if (filesProcessed === totalFiles) {
                    if (successCount > 0) {
                        await saveFiles();
                        alert(`Successfully uploaded ${successCount} file(s)`);
                    }
                }
            } catch (error) {
                console.error('Error processing file:', error);
                alert(`Error uploading ${file.name}: ${error.message}`);
                filesProcessed++;
                if (filesProcessed === totalFiles && successCount > 0) {
                    await saveFiles();
                }
            }
        };
        
        reader.onerror = () => {
            console.error('FileReader error for:', file.name);
            alert(`Failed to read file: ${file.name}`);
            filesProcessed++;
            if (filesProcessed === totalFiles && successCount > 0) {
                saveFiles();
            }
        };
        
        // Read file as ArrayBuffer
        reader.readAsArrayBuffer(file);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function renderFilesList() {
    const filesList = document.getElementById('filesList');
    
    // Filter folders and files for current location
    const currentFolderFolders = folders.filter(f => f.parentId === currentFolder);
    const currentFolderFiles = uploadedFiles.filter(f => f.parentId === currentFolder);
    
    if (currentFolderFolders.length === 0 && currentFolderFiles.length === 0) {
        filesList.innerHTML = '<div class="no-files"><span class="empty-icon">📂</span><p>No files or folders yet</p></div>';
        return;
    }
    
    // Render folders first
    const folderItems = currentFolderFolders.map(folder => {
        return `
            <div class="file-item folder-item" data-id="${folder.id}" data-type="folder" style="cursor: pointer;" draggable="true" ondragstart="handleDragStart(event, '${folder.id}', 'folder')" onclick="navigateToFolder('${folder.id}')">
                <div class="col-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" onchange="toggleFileSelection('${folder.id}')" onclick="event.stopPropagation()">
                </div>
                <div class="file-name-cell">
                    <span class="file-icon">📁</span>
                    <span class="file-name">${folder.name}</span>
                </div>
                <div class="file-size">-</div>
                <div class="file-date">-</div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    <button class="file-btn delete" onclick="deleteFolder('${folder.id}'); event.stopPropagation();">Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Render files
    const fileItems = currentFolderFiles.map(file => {
        const date = new Date(file.uploadedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const icon = getFileIcon(file.name);
        
        return `
            <div class="file-item" data-id="${file.id}" data-type="file" draggable="true" ondragstart="handleDragStart(event, '${file.id}', 'file')" oncontextmenu="showFileContextMenu(event, '${file.id}'); return false;">
                <div class="col-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" onchange="toggleFileSelection('${file.id}')" onclick="event.stopPropagation()">
                </div>
                <div class="file-name-cell">
                    <span class="file-icon">${icon}</span>
                    <span class="file-name">${file.name}</span>
                </div>
                <div class="file-size">${file.size}</div>
                <div class="file-date">${date}</div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    <button class="file-btn preview" onclick="previewFile('${file.id}'); event.stopPropagation();" title="View file">View</button>
                    <button class="file-btn download" onclick="downloadFile('${file.id}'); event.stopPropagation();" title="Download file">📥</button>
                    <button class="file-btn delete" onclick="deleteFile('${file.id}'); event.stopPropagation();">Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    filesList.innerHTML = folderItems + fileItems;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'pptx': '🎯',
        'txt': '📃',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'zip': '📦',
        'rar': '📦'
    };
    return icons[ext] || '📄';
}

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

async function previewFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) {
        console.error('File not found:', fileId);
        console.log('Available files:', uploadedFiles.map(f => ({id: f.id, name: f.name})));
        alert('File not found. Please try again.');
        return;
    }
    
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (['pdf', 'docx', 'doc', 'xlsx', 'xls', 'txt', 'jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        try {
            console.log('Attempting to preview file:', {id: file.id, name: file.name, ext: ext});
            
            let blob = null;
            
            // Approach 1: Check if file has legacy base64 data in metadata
            if (file.data && typeof file.data === 'string' && file.data.length > 0) {
                console.log('Found legacy base64 data in metadata, converting...');
                const mimeType = file.type || getMimeType(file.name);
                blob = base64toBlob(file.data, mimeType);
                console.log('Legacy data converted to blob, size:', blob.size);
                
                // Attempt to migrate to IndexedDB in background
                migrateLegacyFile(fileId).then(success => {
                    if (success) {
                        console.log('Background migration completed for:', fileId);
                    }
                }).catch(err => {
                    console.warn('Background migration failed:', err);
                });
            }
            
            // Approach 2: Try to fetch from IndexedDB
            if (!blob && db) {
                console.log('Attempting to fetch from IndexedDB...');
                try {
                    blob = await getFileFromIndexedDB(file.id);
                    console.log('Successfully retrieved from IndexedDB, size:', blob.size);
                } catch (idbError) {
                    console.warn('IndexedDB fetch failed:', idbError.message);
                    // Don't fail yet, blob might be available from approach 1
                }
            }
            
            // If still no blob, file is genuinely missing
            if (!blob) {
                console.error('File data not found in any storage location');
                alert('File data is missing. This file may not have been uploaded correctly.\n\nPlease delete it and re-upload: ' + file.name);
                return;
            }
            
            console.log('Blob ready for preview, opening preview window...');
            openPreview(file.name, blob, ext);
        } catch (error) {
            console.error('Error fetching file for preview:', error);
            alert('Could not load file: ' + error.message + '\n\nTry re-uploading the file.');
        }
    } else {
        alert('Preview not available for this file type');
    }
}

function openPreview(filename, blob, type) {
    const modal = document.getElementById('previewModal');
    const container = document.getElementById('previewContainer');
    const title = document.getElementById('previewTitle');
    
    title.textContent = filename;
    container.innerHTML = '<p>Loading preview...</p>';
    modal.style.display = 'flex';
    
    if (type === 'pdf') {
        previewPDF(blob, container);
    } else if (type === 'docx' || type === 'doc') {
        previewWord(blob, container);
    } else if (['xlsx', 'xls'].includes(type)) {
        previewExcel(blob, container);
    } else if (type === 'txt') {
        previewText(blob, container);
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(type)) {
        previewImage(blob, container);
    }
}

function previewPDF(blob, container) {
    try {
        const url = URL.createObjectURL(blob);
        
        if (!window.pdfjsLib) {
            container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">PDF viewer not loaded. Try refreshing the page.</p>';
            return;
        }
        
        pdfjsLib.getDocument(url).promise.then(pdf => {
            let html = '<div class="pdf-container">';
            const pages = Math.min(pdf.numPages, 5); // Show first 5 pages
            
            for (let i = 1; i <= pages; i++) {
                html += `<div id="pdf-page-${i}" class="pdf-page"></div>`;
            }
            html += '</div>';
            container.innerHTML = html;
            
            for (let i = 1; i <= pages; i++) {
                pdf.getPage(i).then(page => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const viewport = page.getViewport({scale: 1.5});
                    
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    page.render({
                        canvasContext: ctx,
                        viewport: viewport
                    }).promise.then(() => {
                        document.getElementById('pdf-page-' + i).appendChild(canvas);
                    });
                });
            }
        }).catch(err => {
            console.error('PDF preview error:', err);
            container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Error loading PDF: ' + err.message + '</p>';
        });
    } catch (err) {
        console.error('PDF preview error:', err);
        container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Error processing PDF file.</p>';
    }
}

function previewWord(blob, container) {
    try {
        // Try Mammoth.js first (most reliable)
        if (window.mammoth && window.mammoth.convertToHtml) {
            console.log('Using Mammoth.js for Word preview');
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    mammoth.convertToHtml({arrayBuffer: e.target.result})
                        .then(result => {
                            console.log('✓ Word document converted with Mammoth');
                            container.innerHTML = `
                                <div class="word-container" style="padding: 20px; overflow-y: auto; max-height: 600px;">
                                    ${result.value}
                                </div>
                            `;
                        })
                        .catch(err => {
                            console.error('Mammoth conversion error:', err);
                            container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Could not render Word document: ' + err.message + '</p>';
                        });
                } catch (err) {
                    console.error('Mammoth reader error:', err);
                    container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Error: ' + err.message + '</p>';
                }
            };
            reader.readAsArrayBuffer(blob);
            return;
        }
        
        // Fallback: Try docx-preview
        const findRenderFunction = () => {
            const candidates = [
                window.docx?.renderAsync,
                window.renderAsync,
                window.docxPreview?.renderAsync,
                window.docxpreview?.renderAsync,
                typeof window.docx === 'function' ? window.docx : null,
            ].filter(f => typeof f === 'function');
            
            return candidates.length > 0 ? candidates[0] : null;
        };
        
        const renderFunc = findRenderFunction();
        
        if (renderFunc) {
            console.log('Using docx-preview library for Word preview');
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const result = renderFunc(e.target.result, container);
                    
                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            container.classList.add('word-container');
                            console.log('✓ Word document rendered with docx-preview');
                        }).catch(err => {
                            console.error('Word render error:', err);
                            showWordFallback(blob, container, err);
                        });
                    } else {
                        container.classList.add('word-container');
                        console.log('✓ Word document rendered with docx-preview (sync)');
                    }
                } catch (err) {
                    console.error('Word render error:', err);
                    showWordFallback(blob, container, err);
                }
            };
            reader.readAsArrayBuffer(blob);
            return;
        }
        
        // No preview library available
        console.warn('No Word preview library available');
        showWordFallback(blob, container, new Error('Preview library not loaded'));
        
    } catch (err) {
        console.error('Word preview error:', err);
        showWordFallback(blob, container, err);
    }
}

function showWordFallback(blob, container, error) {
    const sizeInMB = (blob.size / 1024 / 1024).toFixed(2);
    const sizeInKB = (blob.size / 1024).toFixed(0);
    
    container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 20px;">
            <div>
                <p style="font-size: 14px; margin: 0;">
                    <strong>Word Document Preview Not Available</strong>
                </p>
                <p style="font-size: 12px; margin: 10px 0 0 0; color: var(--text-secondary);">
                    File size: ${sizeInKB > 1024 ? sizeInMB + ' MB' : sizeInKB + ' KB'}
                </p>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); max-width: 300px;">
                The preview library is unavailable. You can download the file and open it with Microsoft Word or another compatible application.
            </p>
            <button onclick="alert('Download functionality coming soon.'); console.log('Download:', blob);" 
                    style="padding: 12px 24px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
                📥 Download File
            </button>
            <p style="font-size: 11px; color: var(--text-secondary); margin-top: 10px;">
                💡 Tip: Try using the View button after refreshing the page.<br/>
                The preview library may load after a page refresh.
            </p>
        </div>
    `;
}

function previewExcel(blob, container) {
    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!window.XLSX) {
                    container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Excel viewer not loaded. Try refreshing the page.</p>';
                    return;
                }
                
                const workbook = XLSX.read(e.target.result, {type: 'array'});
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const html = XLSX.utils.sheet_to_html(sheet);
                container.innerHTML = '<div class="excel-container">' + html + '</div>';
            } catch (err) {
                console.error('Excel preview error:', err);
                container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Could not preview Excel file: ' + err.message + '</p>';
            }
        };
        reader.readAsArrayBuffer(blob);
    } catch (err) {
        console.error('Excel preview error:', err);
        container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Error loading Excel file preview.</p>';
    }
}

function previewText(blob, container) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        container.innerHTML = '<div class="text-container">' + escapeHtml(text.substring(0, 10000)) + (text.length > 10000 ? '\n... (truncated)' : '') + '</div>';
    };
    reader.readAsText(blob);
}

function previewImage(blob, container) {
    const url = URL.createObjectURL(blob);
    container.innerHTML = '<div class="image-container"><img src="' + url + '" alt="Preview"></div>';
}

function closePreview() {
    document.getElementById('previewModal').style.display = 'none';
    document.getElementById('previewContainer').innerHTML = '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function base64toBlob(base64, mimeType) {
    const bstr = atob(base64);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], {type: mimeType});
}

function downloadFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file && file.data) {
        const blob = base64toBlob(file.data, file.type);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Download file functionality
async function downloadFile(fileId) {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) {
        alert('File not found.');
        return;
    }
    
    try {
        console.log('Downloading file:', file.name);
        
        let blob = null;
        
        // Approach 1: Check if file has legacy base64 data in metadata
        if (file.data && typeof file.data === 'string' && file.data.length > 0) {
            console.log('Converting legacy base64 data for download...');
            const mimeType = file.type || getMimeType(file.name);
            blob = base64toBlob(file.data, mimeType);
        }
        
        // Approach 2: Try to fetch from IndexedDB
        if (!blob && db) {
            try {
                console.log('Fetching from IndexedDB for download...');
                blob = await getFileFromIndexedDB(fileId);
            } catch (idbError) {
                console.warn('IndexedDB fetch failed:', idbError.message);
            }
        }
        
        if (!blob) {
            alert('Could not retrieve file data. Please try again or re-upload the file.');
            return;
        }
        
        // Trigger download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✓ Download started:', file.name);
        
    } catch (error) {
        console.error('Download error:', error);
        alert('Error downloading file: ' + error.message);
    }
}

// Right-click context menu for files
function showFileContextMenu(event, fileId) {
    event.preventDefault();
    
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;
    
    // Remove existing context menu if any
    const existing = document.getElementById('fileContextMenu');
    if (existing) existing.remove();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.id = 'fileContextMenu';
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.top = event.pageY + 'px';
    menu.style.left = event.pageX + 'px';
    menu.style.zIndex = '10000';
    
    menu.innerHTML = `
        <div class="context-menu-item" onclick="previewFile('${fileId}'); document.getElementById('fileContextMenu').remove();">
            📖 View
        </div>
        <div class="context-menu-item" onclick="downloadFile('${fileId}'); document.getElementById('fileContextMenu').remove();">
            📥 Download
        </div>
        <div class="context-menu-item" onclick="deleteFile('${fileId}'); document.getElementById('fileContextMenu').remove();">
            🗑️ Delete
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            const menu = document.getElementById('fileContextMenu');
            if (menu) menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}



// Folder Management Functions

function renderBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '<div class="breadcrumb-container"><span class="breadcrumb-item active"><a href="#" onclick="navigateToFolder(null); return false;"><span class="breadcrumb-icon">📂</span> Home</a></span>';
    
    let currentId = currentFolder;
    const path = [];
    
    while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (!folder) break;
        path.unshift({ id: folder.id, name: folder.name });
        currentId = folder.parentId;
    }
    
    path.forEach((folder, index) => {
        const isLast = index === path.length - 1;
        html += `<span class="breadcrumb-separator">›</span><span class="breadcrumb-item ${isLast ? 'active' : ''}"><a href="#" onclick="navigateToFolder('${folder.id}'); return false;"><span class="breadcrumb-icon">📁</span> ${folder.name}</a></span>`;
    });
    
    html += '</div>';
    breadcrumb.innerHTML = html;
}

function navigateToFolder(folderId) {
    currentFolder = folderId;
    selectedFiles.clear();
    document.getElementById('selectAll').checked = false;
    renderBreadcrumb();
    renderFilesList();
}

function createFolderPrompt() {
    document.getElementById('folderNameInput').value = '';
    document.getElementById('createFolderModal').style.display = 'flex';
    document.getElementById('folderNameInput').focus();
}

function createFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    if (!name) {
        alert('Please enter a folder name');
        return;
    }
    
    const folder = {
        id: 'folder_' + Date.now(),
        name: name,
        parentId: currentFolder,
        createdAt: new Date().toISOString()
    };
    
    folders.push(folder);
    saveFiles();
    document.getElementById('createFolderModal').style.display = 'none';
}

function deleteFolder(folderId) {
    if (confirm('Delete this folder and all its contents? This cannot be undone.')) {
        // Recursively delete all items in folder
        const deleteContents = (parentId) => {
            // Delete subfolders
            folders = folders.filter(f => {
                if (f.parentId === parentId) {
                    deleteContents(f.id); // Delete contents of subfolder
                    return false;
                }
                return true;
            });
            
            // Delete files and clean up from IndexedDB
            const filesToDelete = uploadedFiles.filter(f => f.parentId === parentId);
            for (const file of filesToDelete) {
                deleteFileFromIndexedDB(file.id).catch(e => console.error('Error deleting from IndexedDB:', e));
            }
            uploadedFiles = uploadedFiles.filter(f => f.parentId !== parentId);
        };
        
        deleteContents(folderId);
        saveFiles();
    }
}

function toggleSelectAll() {
    const allCheckboxes = document.querySelectorAll('.col-checkbox input[type="checkbox"]:not(#selectAll)');
    const selectAll = document.getElementById('selectAll');
    
    if (selectAll.checked) {
        allCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
            selectedFiles.add(checkbox.closest('.file-item').getAttribute('data-id'));
        });
    } else {
        allCheckboxes.forEach(checkbox => checkbox.checked = false);
        selectedFiles.clear();
    }
    
    // Show/hide move button based on selection
    const moveBtn = document.getElementById('moveBtn');
    if (selectedFiles.size > 0) {
        moveBtn.style.display = 'block';
    } else {
        moveBtn.style.display = 'none';
    }
}

function toggleFileSelection(itemId) {
    if (selectedFiles.has(itemId)) {
        selectedFiles.delete(itemId);
    } else {
        selectedFiles.add(itemId);
    }
    
    // Update select all checkbox state
    const allCheckboxes = document.querySelectorAll('.col-checkbox input[type="checkbox"]:not(#selectAll)');
    const selectAll = document.getElementById('selectAll');
    selectAll.checked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
    
    // Show/hide move button based on selection
    const moveBtn = document.getElementById('moveBtn');
    if (selectedFiles.size > 0) {
        moveBtn.style.display = 'block';
    } else {
        moveBtn.style.display = 'none';
    }
}

function handleDragStart(e, itemId, itemType) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('itemId', itemId);
    e.dataTransfer.setData('itemType', itemType);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelector('.file-manager').classList.add('drag-over');
}

function handleDragLeave(e) {
    if (e.target === document.querySelector('.file-manager')) {
        document.querySelector('.file-manager').classList.remove('drag-over');
    }
}

function handleDropOnManager(e) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector('.file-manager').classList.remove('drag-over');
    
    const itemId = e.dataTransfer.getData('itemId');
    const itemType = e.dataTransfer.getData('itemType');
    
    if (!itemId || !itemType) {
        // Handle file drop from outside
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files);
        }
        return;
    }
    
    // Check if dropped on a folder
    const dropTarget = e.target.closest('.file-item');
    if (dropTarget && dropTarget.getAttribute('data-type') === 'folder') {
        const targetFolderId = dropTarget.getAttribute('data-id');
        moveItem(itemId, itemType, targetFolderId);
    }
}

function moveItem(itemId, itemType, targetFolderId) {
    if (itemType === 'file') {
        const file = uploadedFiles.find(f => f.id === itemId);
        if (file) {
            file.parentId = targetFolderId;
            saveFiles();
        }
    } else if (itemType === 'folder') {
        const folder = folders.find(f => f.id === itemId);
        if (folder && targetFolderId !== itemId) { // Prevent moving to self
            folder.parentId = targetFolderId;
            saveFiles();
        }
    }
}

function moveToSelected() {
    if (selectedFiles.size === 0) {
        alert('Please select items to move');
        return;
    }
    
    // Show move dialog - get target folder
    const modal = document.getElementById('moveFolderModal');
    const folderOptions = document.getElementById('folderOptions');
    
    // Build folder list for selection
    folderOptions.innerHTML = folders.map(folder => 
        `<label><input type="radio" name="targetFolder" value="${folder.id}"> ${folder.name}</label>`
    ).join('') + '<label><input type="radio" name="targetFolder" value="home"> Home</label>';
    
    modal.style.display = 'flex';
}

function confirmMove() {
    const targetRadio = document.querySelector('input[name="targetFolder"]:checked');
    if (!targetRadio) {
        alert('Please select a destination folder');
        return;
    }
    
    const targetId = targetRadio.value === 'home' ? null : targetRadio.value;
    
    selectedFiles.forEach(itemId => {
        // Check if it's a file or folder
        if (uploadedFiles.find(f => f.id === itemId)) {
            moveItem(itemId, 'file', targetId);
        } else if (folders.find(f => f.id === itemId)) {
            moveItem(itemId, 'folder', targetId);
        }
    });
    
    selectedFiles.clear();
    document.getElementById('moveFolderModal').style.display = 'none';
    renderFilesList();
}




