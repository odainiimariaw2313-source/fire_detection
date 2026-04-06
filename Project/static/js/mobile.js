// ============ MOBILE APP JAVASCRIPT ============

const socket = io();
let currentPage = 0;
let currentLocation = null;
let weatherData = {
    temperature: 28,
    humidity: 45,
    wind_speed: 38,
    location: 'Chisinau'
};

let fireRiskData = {
    level: 1,
    percentage: 0,
    description: '',
    color: '#27AE60'
};

// ============ GEOLOCATION & WEATHER ============

function getLocationAndWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                
                console.log('Location:', currentLocation);
                
                // Fetch weather and fire risk from backend
                const params = new URLSearchParams({
                    lat: currentLocation.latitude,
                    lon: currentLocation.longitude
                });
                
                fetch(`/api/weather?${params}`)
                    .then(response => response.json())
                    .then(data => {
                        weatherData = data.weather;
                        fireRiskData = data.fire_risk;
                        updateWeatherUI();
                        updateFireRiskPage();
                    })
                    .catch(error => console.error('Error fetching weather:', error));
            },
            (error) => {
                console.log('Geolocation error:', error);
                // Use Chisinau as default
                fetch('/api/weather?lat=47.1611&lon=27.5822')
                    .then(response => response.json())
                    .then(data => {
                        weatherData = data.weather;
                        fireRiskData = data.fire_risk;
                        updateWeatherUI();
                        updateFireRiskPage();
                    })
                    .catch(error => console.error('Error fetching weather:', error));
            }
        );
    } else {
        console.log('Geolocation not supported');
        // Use default Chisinau data
        fetch('/api/weather?lat=47.1611&lon=27.5822')
            .then(response => response.json())
            .then(data => {
                weatherData = data.weather;
                fireRiskData = data.fire_risk;
                updateWeatherUI();
                updateFireRiskPage();
            })
            .catch(error => console.error('Error fetching weather:', error));
    }
}

function updateWeatherUI() {
    // Update temperature
    document.querySelectorAll('[id*="temp"]').forEach(el => {
        el.textContent = weatherData.temperature + '°C';
    });
    
    // Update humidity
    document.querySelectorAll('[id*="humidity"]').forEach(el => {
        el.textContent = weatherData.humidity + '%';
    });
    
    // Update wind speed
    document.querySelectorAll('[id*="wind"]').forEach(el => {
        el.textContent = weatherData.wind_speed + ' km/h';
    });

    // Update location
    document.querySelectorAll('[id*="location"]').forEach(el => {
        el.textContent = weatherData.location + ', Moldova';
    });
}

function updateFireRiskPage() {
    const card = document.getElementById('risk-card');
    const percentage = document.getElementById('risk-percentage');
    const label = document.getElementById('risk-label');
    const description = document.getElementById('risk-description');
    
    if (card && percentage && label && description) {
        // Update card color
        card.style.background = fireRiskData.color;
        
        // Update percentage
        percentage.textContent = fireRiskData.percentage + '%';
        
        // Update label
        label.textContent = fireRiskData.label;
        
        // Update description
        description.textContent = fireRiskData.description;
        
        // Add animation
        card.classList.add('updated');
        setTimeout(() => {
            card.classList.remove('updated');
        }, 500);
    }
}

// Get location on page load
window.addEventListener('load', () => {
    getLocationAndWeather();
});

// Refresh location every 5 minutes
setInterval(getLocationAndWeather, 5 * 60 * 1000);

// ============ NAVIGATION TABS ============

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active from all
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(p => p.style.display = 'none');
        
        // Add active to clicked
        item.classList.add('active');
        
        // Get target section
        const target = item.getAttribute('href').substring(1);
        const section = document.getElementById(target);
        
        if (section) {
            section.style.display = 'flex';
            
            // Update stats if stats section
            if (target === 'stats') {
                updateStatistics();
            }
        }
        
        // Show/hide risk card
        const riskCardContainer = document.querySelector('.risk-card').parentElement;
        if (target === '') {
            riskCardContainer.style.display = 'flex';
        } else {
            riskCardContainer.style.display = 'none';
        }
    });
});

// Default: set home as active
document.getElementById('home-nav').classList.add('active');

// ============ WEBSOCKET EVENTS ============

socket.on('connect', () => {
    console.log('Connected to Fire Detection Backend');
});

socket.on('fire_alert', (data) => {
    console.log('🔥 FIRE ALERT:', data);
    showFireAlert(data);
    playAlertSound();
    sendNotification(data);
});

socket.on('frame_processed', (data) => {
    console.log('Frame processed:', data);
    updateFrameStats(data);
});

socket.on('alert_reset', () => {
    console.log('Alert reset');
});

// ============ FIRE ALERT HANDLING ============

function showFireAlert(alertData) {
    // Create alert modal if it doesn't exist
    let modal = document.getElementById('alertModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'alertModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                padding: 24px;
                border-radius: 16px;
                text-align: center;
                max-width: 90%;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            ">
                <h2 style="color: #dc2626; margin-bottom: 16px; font-size: 28px;">🔥 FIRE ALERT!</h2>
                <p id="alertMessage" style="color: #333; font-size: 16px; margin-bottom: 24px; line-height: 1.6;"></p>
                <button onclick="closeAlert()" style="
                    background: #dc2626;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s ease;
                ">Close Alert</button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    const message = document.getElementById('alertMessage');
    message.textContent = alertData.message || 'High fire risk detected in your area!';
    modal.style.display = 'flex';
    
    // Vibrate phone (if supported)
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

function closeAlert() {
    const modal = document.getElementById('alertModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close alert on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAlert();
    }
});

// ============ NOTIFICATIONS ============

function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            return;
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
}

function sendNotification(alertData) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🔥 Fire Alert!', {
            body: alertData.message || 'High fire risk detected in your area!',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23dc2626" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>',
            tag: 'fire-alert',
            requireInteraction: true
        });
    }
}

// Request notification permission on load
window.addEventListener('load', requestNotificationPermission);

// ============ SOUND ALERT ============

function playAlertSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 1000;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Audio context not available:', e);
    }
}

// ============ STATISTICS UPDATE ============

function updateStatistics() {
    const params = new URLSearchParams();
    if (currentLocation) {
        params.append('lat', currentLocation.latitude);
        params.append('lon', currentLocation.longitude);
    }
    
    fetch(`/api/status?${params}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('frames-stat').textContent = data.frames_processed || 0;
            document.getElementById('clients-stat').textContent = data.active_clients || 0;
            document.getElementById('system-stat').textContent = data.system_running ? 'Online' : 'Offline';
            document.getElementById('last-detection-stat').textContent = data.last_detection ? 'Yes' : 'Never';
        })
        .catch(error => console.error('Error fetching statistics:', error));
}

function updateFrameStats(data) {
    if (document.getElementById('frames-stat')) {
        document.getElementById('frames-stat').textContent = data.frame_count || 0;
    }
}

// ============ API CALLS ============

function getSystemStatus() {
    const params = new URLSearchParams();
    if (currentLocation) {
        params.append('lat', currentLocation.latitude);
        params.append('lon', currentLocation.longitude);
    }
    
    fetch(`/api/status?${params}`)
        .then(response => response.json())
        .then(data => {
            console.log('System Status:', data);
            
            // Update fire risk if detected
            if (data.fire_detected) {
                showFireAlert({
                    message: `Fire detected with ${Math.round(data.weather.fire_risk.percentage)}% confidence!`
                });
            }
        })
        .catch(error => console.error('Error fetching status:', error));
}

// Get status on load and every 10 seconds
window.addEventListener('load', getSystemStatus);
setInterval(getSystemStatus, 10000);

// ============ SCREEN ORIENTATION ============

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        // Adjust layout after orientation change
        updateWeatherUI();
        updateFireRiskPage();
    }, 100);
});

// ============ ANIMATION STYLES ============

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes cardUpdate {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.9; transform: scale(1.02); }
        100% { opacity: 1; transform: scale(1); }
    }
`;
document.head.appendChild(style);

console.log('Mobile app loaded successfully!');