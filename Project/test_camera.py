import cv2
import time

urls_to_test = [
    'rtsp://192.168.0.101:554/stream',
    'rtsp://192.168.0.101:554/stream0',
    'rtsp://192.168.0.101:554/live',
    'rtsp://192.168.0.101:8554/stream',
    'http://192.168.0.101:80/stream',
    'http://192.168.0.101:8080/stream',
    'http://192.168.0.101:8000/stream',
]

for url in urls_to_test:
    print(f"\nTrying: {url}")
    cap = cv2.VideoCapture(url)
    
    # Try to read one frame
    ret, frame = cap.read()
    
    if ret:
        print(f"✓ SUCCESS! Stream works at: {url}")
        print(f"  Frame shape: {frame.shape}")
        cap.release()
        break
    else:
        print(f"✗ Failed to connect")
        cap.release()
    
    time.sleep(1)