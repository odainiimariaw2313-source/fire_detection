const socket = io();

function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('current-time').textContent = hours + ':' + minutes;
}

function getWeather() {
    let lat = 47.1611;
    let lon = 27.5822;
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
                fetchWeather(lat, lon);
            },
            () => fetchWeather(lat, lon)
        );
    } else {
        fetchWeather(lat, lon);
    }
}

function fetchWeather(lat, lon) {
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
        .then(res => res.json())
        .then(data => {
            const w = data.weather;
            const fr = data.fire_risk;
            
            document.getElementById('temp-value').textContent = w.temperature + '°C';
            document.getElementById('humidity-value').textContent = w.humidity + '%';
            document.getElementById('wind-value').textContent = w.wind_speed + ' km/h';
            document.getElementById('risk-percentage').textContent = fr.percentage + '%';
            document.getElementById('risk-label').textContent = fr.label;
            document.getElementById('risk-description').textContent = fr.description;
            document.getElementById('risk-card').style.background = fr.color;
        });
}

socket.on('connect', () => console.log('Connected'));
socket.on('fire_alert', (data) => {
    alert('🔥 FIRE ALERT: ' + data.message);
});

window.addEventListener('load', () => {
    updateTime();
    getWeather();
});

setInterval(updateTime, 60000);
setInterval(getWeather, 300000);