import cv2
import numpy as np
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class FireDetector:
    def __init__(self, model_path=None):
        """
        Simple fire detector (no PyTorch required for testing)
        """
        self.device = 'cpu'
        self.confidence_threshold = 0.7
        logger.info("FireDetector initialized (simple mode - no model)")
    
    def preprocess_frame(self, frame):
        """Preprocess frame"""
        frame = cv2.resize(frame, (128, 128))
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return frame
    
    def detect(self, frame):
        """
        Simple fire detection based on color thresholding
        (Replace with your .pth model later)
        """
        try:
            frame = self.preprocess_frame(frame)
            
            # Simple RED channel detection
            # Fire typically has high red values
            red_channel = frame[:, :, 0]
            fire_probability = float(np.mean(red_channel)) / 255.0
            
            fire_detected = fire_probability >= self.confidence_threshold
            
            return fire_detected, fire_probability
        
        except Exception as e:
            logger.error(f"Error during detection: {e}")
            return False, 0.0