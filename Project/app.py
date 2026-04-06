from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import base64
import requests
import json
from datetime import datetime
from modules.fire_detection import FireDetector
from modules.notifications import NotificationManager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fire_detection_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

fire_detector = FireDetector(model_path='model/fire_model.pth')
notification_manager = NotificationManager()

class Camera:
    def __init__(self):
        self.connection_status = False
    
    def get_status(self):
        return {
            'connected': self.connection_status,
            'resolution': '1920x1080',
            'fps': 30
        }

camera = Camera()

active_clients = {}
fire_alert_active = False
last_fire_detection_time = None
consecutive_detections = 0
DETECTION_THRESHOLD = 3

class VideoStreamProcessor:
    def __init__(self):
        self.is_processing = False
        self.current_frame = None
        self.detection_results = {
            'fire_detected': False,
            'confidence': 0.0,
            'timestamp': None,
            'frame_count': 0
        }
    
    def process_frame(self, frame_data):
        try:
            if isinstance(frame_data, str):
                frame_bytes = base64.b64decode(frame_data)
                frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
                frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
            else:
                frame = frame_data
            
            if frame is None:
                return None
            
            self.current_frame = frame
            return frame
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            return None
    
    def analyze_frame(self, frame):
        global fire_alert_active, consecutive_detections, last_fire_detection_time
        
        try:
            resized_frame = cv2.resize(frame, (128, 128))
            fire_detected, confidence = fire_detector.detect(resized_frame)
            
            self.detection_results['fire_detected'] = fire_detected
            self.detection_results['confidence'] = float(confidence)
            self.detection_results['timestamp'] = datetime.now().isoformat()
            self.detection_results['frame_count'] += 1
            
            if fire_detected:
                consecutive_detections += 1
                last_fire_detection_time = datetime.now()
                
                if consecutive_detections >= DETECTION_THRESHOLD and not fire_alert_active:
                    fire_alert_active = True
                    logger.warning(f"🔥 FIRE DETECTED! Confidence: {confidence:.2%}")
                    return True
            else:
                consecutive_detections = max(0, consecutive_detections - 1)
            
            return False
        except Exception as e:
            logger.error(f"Error analyzing frame: {e}")
            return False

processor = VideoStreamProcessor()

# ============ WEATHER & FIRE RISK LOGIC ============

def get_weather_data(latitude=47.1611, longitude=27.5822):
    """Fetch weather data from OpenWeatherMap"""
    try:
        API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'  # REPLACE THIS
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={latitude}&lon={longitude}&appid={API_KEY}&units=metric"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            return {
                'temperature': int(data['main']['temp']),
                'humidity': int(data['main']['humidity']),
                'wind_speed': int(data['wind']['speed'] * 3.6),
                'weather': data['weather'][0]['main'],
                'location': data['name']
            }
    except Exception as e:
        logger.error(f"Error fetching weather: {e}")
    
    return {
        'temperature': 28,
        'humidity': 45,
        'wind_speed': 38,
        'weather': 'Clear',
        'location': 'Chisinau'
    }

def calculate_fire_risk(temperature, humidity, wind_speed):
    """Calculate fire risk based on weather"""
    temp_score = 0
    humidity_score = 0
    wind_score = 0
    
    if temperature >= 35:
        temp_score = 40
    elif temperature >= 30:
        temp_score = 30
    elif temperature >= 25:
        temp_score = 20
    elif temperature >= 20:
        temp_score = 10
    
    if humidity <= 20:
        humidity_score = 40
    elif humidity <= 35:
        humidity_score = 30
    elif humidity <= 50:
        humidity_score = 20
    elif humidity <= 70:
        humidity_score = 10
    
    if wind_speed >= 40:
        wind_score = 20
    elif wind_speed >= 30:
        wind_score = 15
    elif wind_speed >= 20:
        wind_score = 10
    elif wind_speed >= 10:
        wind_score = 5
    
    total_risk = (temp_score + humidity_score + wind_score) / 100 * 100
    
    if total_risk >= 70:
        return {
            'level': 3,
            'percentage': int(total_risk),
            'description': 'High fire risk detected. Avoid all fire-related activities and report any suspicious activity immediately.',
            'color': '#C1345D',
            'label': 'High chances'
        }
    elif total_risk >= 40:
        return {
            'level': 2,
            'percentage': int(total_risk),
            'description': 'Conditions may support fire ignition. Be vigilant and minimize fire-related risks. Your attention to fire safety is crucial.',
            'color': '#E67E22',
            'label': 'Low chances'
        }
    else:
        return {
            'level': 1,
            'percentage': int(total_risk),
            'description': 'Fire risk is currently low. Please continue normal activities while staying aware of your surroundings. Stay safe.',
            'color': '#27AE60',
            'label': 'Low chances'
        }

# ============ ROUTES ============

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/mobile')
def mobile_dashboard():
    latitude = request.args.get('lat', 47.1611)
    longitude = request.args.get('lon', 27.5822)
    
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except:
        latitude, longitude = 47.1611, 27.5822
    
    weather = get_weather_data(latitude, longitude)
    fire_risk = calculate_fire_risk(
        weather['temperature'],
        weather['humidity'],
        weather['wind_speed']
    )
    
    return render_template('mobile.html',
                         weather=weather,
                         fire_risk=fire_risk)

@app.route('/cameras')
def cameras_page():
    return render_template('cameras.html')

@app.route('/info')
def info_page():
    return render_template('info.html')

@app.route('/stats')
def stats_page():
    return render_template('stat.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    latitude = request.args.get('lat', 47.1611)
    longitude = request.args.get('lon', 27.5822)
    
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except:
        latitude, longitude = 47.1611, 27.5822
    
    weather = get_weather_data(latitude, longitude)
    fire_risk = calculate_fire_risk(
        weather['temperature'],
        weather['humidity'],
        weather['wind_speed']
    )
    
    return jsonify({
        'system_running': True,
        'camera_connected': camera.connection_status,
        'camera_status': camera.get_status(),
        'fire_detected': processor.detection_results['fire_detected'],
        'last_detection': processor.detection_results['timestamp'],
        'active_clients': len(active_clients),
        'frames_processed': processor.detection_results['frame_count'],
        'weather': weather,
        'fire_risk': fire_risk
    })

@app.route('/api/weather', methods=['GET'])
def get_weather():
    latitude = request.args.get('lat', 47.1611)
    longitude = request.args.get('lon', 27.5822)
    
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except:
        latitude, longitude = 47.1611, 27.5822
    
    weather = get_weather_data(latitude, longitude)
    fire_risk = calculate_fire_risk(
        weather['temperature'],
        weather['humidity'],
        weather['wind_speed']
    )
    
    return jsonify({
        'weather': weather,
        'fire_risk': fire_risk
    })

@app.route('/api/reset-alert', methods=['POST'])
def reset_alert():
    global fire_alert_active, consecutive_detections
    fire_alert_active = False
    consecutive_detections = 0
    logger.info("Fire alert reset")
    socketio.emit('alert_reset', broadcast=True)
    return jsonify({'status': 'success'})

# ============== WEBSOCKET EVENTS ==============

@socketio.on('connect')
def handle_connect():
    client_id = request.sid
    active_clients[client_id] = {
        'connected_at': datetime.now().isoformat(),
        'type': 'web'
    }
    logger.info(f"Client connected: {client_id}")
    emit('connection_response', {'data': 'Connected to Fire Detection System'})

@socketio.on('disconnect')
def handle_disconnect():
    client_id = request.sid
    if client_id in active_clients:
        del active_clients[client_id]
    logger.info(f"Client disconnected: {client_id}")

@socketio.on('register_app')
def handle_app_register(data):
    client_id = request.sid
    active_clients[client_id]['type'] = 'android_app'
    active_clients[client_id]['app_version'] = data.get('app_version')
    logger.info(f"Android app registered: {client_id}")
    emit('registration_success', {'device_id': client_id})

@socketio.on('video_frame')
def handle_video_frame(data):
    try:
        frame_data = data.get('frame')
        camera_id = data.get('camera_id', 'camera_1')
        timestamp = data.get('timestamp')
        
        frame = processor.process_frame(frame_data)
        if frame is None:
            return
        
        fire_detected = processor.analyze_frame(frame)
        
        detection_event = {
            'fire_detected': processor.detection_results['fire_detected'],
            'confidence': processor.detection_results['confidence'],
            'timestamp': processor.detection_results['timestamp'],
            'camera_id': camera_id,
            'frame_number': processor.detection_results['frame_count']
        }
        
        socketio.emit('detection_update', detection_event, broadcast=True)
        
        if fire_detected:
            alert_event = {
                'alert_type': 'FIRE_DETECTED',
                'severity': 'CRITICAL',
                'message': f'🔥 Fire detected with {processor.detection_results["confidence"]:.2%} confidence',
                'timestamp': processor.detection_results['timestamp'],
                'camera_id': camera_id
            }
            
            socketio.emit('fire_alert', alert_event, broadcast=True)
            notification_manager.send_push_notification(
                title='🔥 FIRE DETECTED!',
                message=f'Fire detected with {processor.detection_results["confidence"]:.2%} confidence at {camera_id}',
                alert_type='critical'
            )
            
            logger.warning(f"FIRE ALERT SENT: {alert_event}")
    
    except Exception as e:
        logger.error(f"Error handling video frame: {e}")
        emit('frame_error', {'error': str(e)})

@socketio.on('keep_alive')
def handle_keep_alive():
    emit('pong', {'timestamp': datetime.now().isoformat()})

# ============== ERROR HANDLERS ==============

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

# ============== MAIN ==============

if __name__ == '__main__':
    logger.info("Starting Fire Detection System Backend...")
    logger.info("Visit http://localhost:5000/mobile in your browser")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)