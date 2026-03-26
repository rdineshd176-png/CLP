import cv2
import mediapipe as mp
import numpy as np
import base64
import math
from typing import Dict, Any

mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection

# Landmark indices for eyes (MediaPipe Face Mesh)
LEFT_EYE_TOP    = 159
LEFT_EYE_BOTTOM = 145
LEFT_EYE_LEFT   = 33
LEFT_EYE_RIGHT  = 133
RIGHT_EYE_TOP   = 386
RIGHT_EYE_BOTTOM= 374
RIGHT_EYE_LEFT  = 362
RIGHT_EYE_RIGHT = 263

# Iris landmarks (available in refine_landmarks mode)
LEFT_IRIS_CENTER  = 468
RIGHT_IRIS_CENTER = 473


def decode_base64_image(b64_string: str) -> np.ndarray:
    """Convert a base64 image string to an OpenCV BGR image array."""
    # Remove data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_string)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def eye_aspect_ratio(landmarks, top_idx, bottom_idx, left_idx, right_idx) -> float:
    """
    Calculate Eye Aspect Ratio (EAR).
    EAR = vertical distance / horizontal distance
    Low EAR means eye is closed (drowsy).
    """
    top    = landmarks[top_idx]
    bottom = landmarks[bottom_idx]
    left   = landmarks[left_idx]
    right  = landmarks[right_idx]

    vertical   = math.dist((top.x, top.y),    (bottom.x, bottom.y))
    horizontal = math.dist((left.x, left.y),  (right.x, right.y))

    if horizontal == 0:
        return 0.3  # fallback: assume open
    return vertical / horizontal


def get_head_pose(landmarks, img_width, img_height) -> Dict[str, float]:
    """
    Estimate rough head pose using nose tip and face boundary landmarks.
    Returns yaw (left/right) and pitch (up/down) as normalized values.
    """
    nose_tip    = landmarks[1]
    chin        = landmarks[152]
    left_cheek  = landmarks[234]
    right_cheek = landmarks[454]

    # Horizontal center ratio (0 = far left, 1 = far right, 0.5 = center)
    face_width  = abs(right_cheek.x - left_cheek.x)
    if face_width == 0:
        return {"yaw": 0.0, "pitch": 0.0}

    nose_center_x = (nose_tip.x - left_cheek.x) / face_width
    yaw = (nose_center_x - 0.5) * 2  # -1 to +1

    # Vertical: nose relative to chin
    face_height = abs(chin.y - landmarks[10].y)
    if face_height == 0:
        return {"yaw": yaw, "pitch": 0.0}
    nose_rel_y = (nose_tip.y - landmarks[10].y) / face_height
    pitch = (nose_rel_y - 0.5) * 2  # -1 to +1

    return {"yaw": yaw, "pitch": pitch}


def analyze_frame(b64_image: str) -> Dict[str, Any]:
    """
    Main function. Takes a base64 image, runs face mesh detection,
    returns a dict with detection results.

    Returns:
      {
        "face_detected": bool,
        "state": "focused" | "distracted" | "drowsy" | "no_face",
        "attention_score_delta": int,   # how much to adjust score (-5, -2, 0, +1)
        "ear_left": float,
        "ear_right": float,
        "yaw": float,
        "pitch": float,
        "reason": str                   # human-readable explanation
      }
    """
    img = decode_base64_image(b64_image)
    if img is None:
        return _no_face_result("Could not decode image")

    img_h, img_w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as face_mesh:

        results = face_mesh.process(img_rgb)

        if not results.multi_face_landmarks:
            return _no_face_result("No face detected in frame")

        landmarks = results.multi_face_landmarks[0].landmark

        # Calculate Eye Aspect Ratios
        ear_left = eye_aspect_ratio(
            landmarks,
            LEFT_EYE_TOP, LEFT_EYE_BOTTOM, LEFT_EYE_LEFT, LEFT_EYE_RIGHT
        )
        ear_right = eye_aspect_ratio(
            landmarks,
            RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
            RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT
        )
        avg_ear = (ear_left + ear_right) / 2

        # Get head pose
        pose = get_head_pose(landmarks, img_w, img_h)
        yaw   = pose["yaw"]
        pitch = pose["pitch"]

        # --- CLASSIFICATION LOGIC ---
        #
        # EAR thresholds (tuned for webcam distance):
        #   < 0.18  -> eyes closed / very drowsy
        #   < 0.22  -> slightly drowsy
        #   >= 0.22 -> eyes open (normal)
        #
        # Yaw (left/right head turn):
        #   abs(yaw) > 0.45 -> looking away (distracted)
        #
        # Pitch (head tilt up/down):
        #   pitch < -0.35   -> looking down (distracted, e.g. reading phone)
        #   pitch > 0.35    -> looking up (not ideal)

        DROWSY_EAR_THRESHOLD     = 0.20
        VERY_DROWSY_EAR          = 0.16
        DISTRACTED_YAW_THRESHOLD = 0.45
        DISTRACTED_PITCH_DOWN    = -0.35
        DISTRACTED_PITCH_UP      =  0.35

        if avg_ear < VERY_DROWSY_EAR:
            return {
                "face_detected": True,
                "state": "drowsy",
                "attention_score_delta": -5,
                "ear_left": round(ear_left, 3),
                "ear_right": round(ear_right, 3),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "reason": f"Eyes nearly closed (EAR={avg_ear:.3f})"
            }

        if avg_ear < DROWSY_EAR_THRESHOLD:
            return {
                "face_detected": True,
                "state": "drowsy",
                "attention_score_delta": -2,
                "ear_left": round(ear_left, 3),
                "ear_right": round(ear_right, 3),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "reason": f"Drowsy detected (EAR={avg_ear:.3f})"
            }

        if abs(yaw) > DISTRACTED_YAW_THRESHOLD:
            direction = "left" if yaw < 0 else "right"
            return {
                "face_detected": True,
                "state": "distracted",
                "attention_score_delta": -5,
                "ear_left": round(ear_left, 3),
                "ear_right": round(ear_right, 3),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "reason": f"Head turned {direction} (yaw={yaw:.3f})"
            }

        if pitch < DISTRACTED_PITCH_DOWN:
            return {
                "face_detected": True,
                "state": "distracted",
                "attention_score_delta": -5,
                "ear_left": round(ear_left, 3),
                "ear_right": round(ear_right, 3),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "reason": f"Head looking down (pitch={pitch:.3f})"
            }

        if pitch > DISTRACTED_PITCH_UP:
            return {
                "face_detected": True,
                "state": "distracted",
                "attention_score_delta": -3,
                "ear_left": round(ear_left, 3),
                "ear_right": round(ear_right, 3),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "reason": f"Head looking up (pitch={pitch:.3f})"
            }

        # All good — focused
        return {
            "face_detected": True,
            "state": "focused",
            "attention_score_delta": +1,
            "ear_left": round(ear_left, 3),
            "ear_right": round(ear_right, 3),
            "yaw": round(yaw, 3),
            "pitch": round(pitch, 3),
            "reason": "Face detected and looking forward"
        }


def _no_face_result(reason: str) -> Dict[str, Any]:
    return {
        "face_detected": False,
        "state": "no_face",
        "attention_score_delta": -5,
        "ear_left": 0.0,
        "ear_right": 0.0,
        "yaw": 0.0,
        "pitch": 0.0,
        "reason": reason
    }