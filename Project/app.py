from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import cv2
import numpy as np
import threading
import base64
from datetime import datetime
from modules.fire_detection import FireDetector
from modules.notifications import NotificationManager
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fire_detection_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize fire detector and notification manager
fire_detector = FireDetector(model_path='model/fire_model.pth')
notification_manager = NotificationManager()

# Global variables
active_clients = {}
fire_alert_active = False
last_fire_detection_time = None
consecutive_detections = 0
DETECTION_THRESHOLD = 3  # Number of consecutive detections to trigger alert

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
        """Process incoming frame from Android app"""
        try:
            # Decode base64 frame if needed
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
        """Analyze frame for fire detection"""
        global fire_alert_active, consecutive_detections, last_fire_detection_time
        
        try:
            # Resize frame to model input size (128x128)
            resized_frame = cv2.resize(frame, (128, 128))
            
            # Run fire detection
            fire_detected, confidence = fire_detector.detect(resized_frame)
            
            self.detection_results['fire_detected'] = fire_detected
            self.detection_results['confidence'] = float(confidence)
            self.detection_results['timestamp'] = datetime.now().isoformat()
            self.detection_results['frame_count'] += 1
            
            # Fire detection logic with threshold
            if fire_detected:
                consecutive_detections += 1
                last_fire_detection_time = datetime.now()
                
                # Trigger alert if threshold is reached
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

# ============ ROUTES ==============

@app.route('/')
def index():
    """Serve the main dashboard"""
    return render_template('index.html')

@app.route('/mobile')
def mobile_dashboard():
    """Serve the mobile dashboard"""
    return render_template('mobile.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current system status"""
    return jsonify({
        'system_running': True,
        'camera_connected': camera.connection_status,
        'camera_status': camera.get_status(),
        'fire_detected': processor.detection_results['fire_detected'],
        'last_detection': processor.detection_results['timestamp'],
        'active_clients': len(active_clients),
        'frames_processed': processor.detection_results['frame_count']
    })

@app.route('/api/temperature', methods=['POST'])
def get_temperature():
    """Get temperature data for a location"""
    data = request.json
    latitude = 46.5916
    longitude = 28.5211
    
    try:
        import requests
        API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'  # Replace with your key
        
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={latitude}&lon={longitude}&appid={API_KEY}&units=metric"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            weather_data = response.json()
            return jsonify({
                'current': int(weather_data['main']['temp']),
                'humidity': int(weather_data['main']['humidity']),
                'wind': int(weather_data['wind']['speed'] * 3.6)
            })
        else:
            return jsonify({
                'current': 28,
                'humidity': 45,
                'wind': 38
            })
    except Exception as e:
        logger.error(f"Error fetching temperature: {e}")
        return jsonify({
            'current': 28,
            'humidity': 45,
            'wind': 38
        })

@app.route('/api/reset-alert', methods=['POST'])
def reset_alert():
    """Reset fire alert"""
    global fire_alert_active, consecutive_detections
    fire_alert_active = False
    consecutive_detections = 0
    logger.info("Fire alert reset")
    socketio.emit('alert_reset', broadcast=True)
    return jsonify({'status': 'success'})

# ============== WEBSOCKET EVENTS ==============

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    client_id = request.sid
    active_clients[client_id] = {
        'connected_at': datetime.now().isoformat(),
        'type': 'web'
    }
    logger.info(f"Client connected: {client_id}")
    emit('connection_response', {'data': 'Connected to Fire Detection System'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    client_id = request.sid
    if client_id in active_clients:
        del active_clients[client_id]
    logger.info(f"Client disconnected: {client_id}")

@socketio.on('register_app')
def handle_app_register(data):
    """Register Android app as camera source"""
    client_id = request.sid
    active_clients[client_id]['type'] = 'android_app'
    active_clients[client_id]['app_version'] = data.get('app_version')
    logger.info(f"Android app registered: {client_id}")
    emit('registration_success', {'device_id': client_id})

@socketio.on('video_frame')
def handle_video_frame(data):
    """Receive and process video frame from Android app"""
    try:
        # Extract frame data
        frame_data = data.get('frame')
        camera_id = data.get('camera_id', 'camera_1')
        timestamp = data.get('timestamp')
        
        # Process frame
        frame = processor.process_frame(frame_data)
        if frame is None:
            return
        
        # Analyze frame for fire
        fire_detected = processor.analyze_frame(frame)
        
        # Broadcast detection results to all web clients
        detection_event = {
            'fire_detected': processor.detection_results['fire_detected'],
            'confidence': processor.detection_results['confidence'],
            'timestamp': processor.detection_results['timestamp'],
            'camera_id': camera_id,
            'frame_number': processor.detection_results['frame_count']
        }
        
        # Emit to all connected clients
        socketio.emit('detection_update', detection_event, broadcast=True)
        
        # If fire detected, send alert
        if fire_detected:
            alert_event = {
                'alert_type': 'FIRE_DETECTED',
                'severity': 'CRITICAL',
                'message': f'🔥 Fire detected with {processor.detection_results["confidence"]:.2%} confidence',
                'timestamp': processor.detection_results['timestamp'],
                'camera_id': camera_id
            }
            
            # Emit alert to web clients
            socketio.emit('fire_alert', alert_event, broadcast=True)
            
            # Send push notification
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
    """Handle keep-alive ping from clients"""
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
    logger.info("Visit http://localhost:5000 in your browser")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)