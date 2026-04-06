
const chisinauLat = 46.9864;
const chisinauLng = 28.8696;

// Initialize map with Chișinău as center
const map = L.map('map').setView([chisinauLat, chisinauLng], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Add camera markers around Chișinău
const cameras = [
    {name: 'Camera 1', lat: 46.7611, lng: 28.5822, status: 'online'},
    {name: 'Camera 2', lat: 46.9650, lng: 28.8400, status: 'online'},
    {name: 'Camera 3', lat: 46.9950, lng: 28.8600, status: 'offline'}
];

cameras.forEach(cam => {
    const color = cam.status === 'online' ? 'green' : 'red';
    L.circleMarker([cam.lat, cam.lng], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map).bindPopup(`<strong>${cam.name}</strong><br>Status: ${cam.status}`);
});

// Add center marker
L.marker([chisinauLat, chisinauLng]).addTo(map)
    .bindPopup('<strong>Chișinău City Center</strong>');