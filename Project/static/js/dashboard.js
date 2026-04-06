// WebSocket connection
const socket = io();

// Dashboard state
const state = {
    isConnected: false,
    frameCount: 0,
    detectionHistory: [],
    startTime: Date.now(),
    confidences: []
};

// ============== SOCKET EVENTS ==============

socket.on('connect', () => {
    console.log('Connected to server');
    state.isConnected = true;
    updateSystemStatus();
    registerWebClient();
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    state.isConnected = false;
    updateSystemStatus();
});

socket.on('connection_response', (data) => {
    console.log('Server response:', data);
    showNotification('Connected to Fire Detection System', 'success');
});

socket.on('detection_update', (data) => {
    handleDetectionUpdate(data);
});

socket.on('fire_alert', (data) => {
    handleFireAlert(data);
});

socket.on('alert_reset', () => {
    dismissAlert();
});

socket.on('frame_error', (data) => {
    console.error('Frame error:', data);
});

// ============== FUNCTIONS ==============

function registerWebClient() {
    socket.emit('register_app', {
        type: 'web_dashboard',
        app_version: '1.0.0'
    });
}

function handleDetectionUpdate(data) {
    // Update frame count
    state.frameCount++;
    updateFrameCount();

    // Update fire status
    updateFireStatus(data);

    // Update confidence
    updateConfidence(data.confidence);

    // Add to history
    addToDetectionHistory(data);
}

function handleFireAlert(data) {
    console.warn('FIRE ALERT:', data);
    
    // Show alert
    showAlert(data);
    
    // Request notification permission and send
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(data.message, {
            icon: '🔥',
            tag: 'fire-alert',
            requireInteraction: true
        });
    }
    
    // Play sound
    playAlertSound();
}

function updateSystemStatus() {
    const statusDot = document.getElementById('systemStatus');
    const statusText = document.getElementById('statusText');
    
    if (state.isConnected) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = 'System Online';
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'System Offline';
    }
}

function updateFrameCount() {
    document.getElementById('frameCount').textContent = state.frameCount;
}

function updateConfidence(confidence) {
    const percent = Math.round(confidence * 100);
    
    // Store for average calculation
    state.confidences.push(confidence);
    if (state.confidences.length > 100) {
        state.confidences.shift();
    }

    // Update current confidence
    document.getElementById('confidenceValue').textContent = percent + '%';
    document.getElementById('confidenceFill').style.width = percent + '%';

    // Update average confidence
    const avgConfidence = Math.round(
        (state.confidences.reduce((a, b) => a + b, 0) / state.confidences.length) * 100
    );
    document.getElementById('avgConfidence').textContent = avgConfidence + '%';
}

function updateFireStatus(data) {
    const fireStatus = document.getElementById('fireStatus');
    const cameraId = document.getElementById('cameraId');
    
    if (data.fire_detected) {
        fireStatus.textContent = '🔥 FIRE DETECTED';
        fireStatus.classList.remove('status-normal');
        fireStatus.classList.add('status-alert');
    } else {
        fireStatus.textContent = 'No Fire';
        fireStatus.classList.remove('status-alert');
        fireStatus.classList.add('status-normal');
    }
    
    // Update last detection time
    const time = new Date(data.timestamp).toLocaleTimeString();
    document.getElementById('lastDetection').textContent = time;
    document.getElementById('cameraId').textContent = data.camera_id;
}

function addToDetectionHistory(data) {
    const historyDiv = document.getElementById('detectionHistory');
    
    // Remove empty state message
    if (historyDiv.querySelector('.empty-state')) {
        historyDiv.innerHTML = '';
    }
    
    const confidence = Math.round(data.confidence * 100);
    const time = new Date(data.timestamp).toLocaleTimeString();
    
    const item = document.createElement('div');
    item.className = 'detection-item';
    item.innerHTML = `
        <div><strong>${time}</strong> - Camera: ${data.camera_id}</div>
        <div>Confidence: <span class="confidence">${confidence}%</span></div>
    `;
    
    historyDiv.insertBefore(item, historyDiv.firstChild);
    
    // Keep only last 20 items
    while (historyDiv.children.length > 20) {
        historyDiv.removeChild(historyDiv.lastChild);
    }
}

function showAlert(data) {
    const alertDiv = document.getElementById('fireAlert');
    const message = document.getElementById('alertMessage');
    const time = document.getElementById('alertTime');
    
    message.textContent = data.message;
    time.textContent = `Detected at: ${new Date(data.timestamp).toLocaleTimeString()}`;
    
    alertDiv.classList.remove('alert-hidden');
    alertDiv.classList.add('alert-active');
}

function dismissAlert() {
    const alertDiv = document.getElementById('fireAlert');
    alertDiv.classList.remove('alert-active');
    alertDiv.classList.add('alert-hidden');
}

function playAlertSound() {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============== EVENT LISTENERS ==============

document.getElementById('acknowledgeBtn').addEventListener('click', () => {
    dismissAlert();
});

document.getElementById('resetAlertBtn').addEventListener('click', () => {
    fetch('/api/reset-alert', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            dismissAlert();
            showNotification('Alert reset successfully', 'success');
        })
        .catch(error => console.error('Error:', error));
});

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    document.getElementById('detectionHistory').innerHTML = 
        '<p class="empty-state">No detections yet...</p>';
    state.detectionHistory = [];
    showNotification('History cleared', 'info');
});

document.getElementById('exportDataBtn').addEventListener('click', () => {
    const data = {
        timestamp: new Date().toISOString(),
        frameCount: state.frameCount,
        uptime: Math.floor((Date.now() - state.startTime) / 1000),
        history: state.detectionHistory
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fire_detection_data_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully', 'success');
});

// ============== INITIALIZATION ==============

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Update uptime every second
setInterval(() => {
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    document.getElementById('uptime').textContent = 
        `${hours}h ${minutes}m ${seconds}s`;
}, 1000);

// Keep alive ping every 30 seconds
setInterval(() => {
    if (state.isConnected) {
        socket.emit('keep_alive');
    }
}, 30000);

console.log('Dashboard initialized');