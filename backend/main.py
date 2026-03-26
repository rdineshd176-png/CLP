"""
main.py — Career Launch Pad Backend API (FastAPI + JSON storage)

Fixes vs original:
  1. write_json() is now ATOMIC: writes to a temp file then os.replace() — no corruption on crash.
  2. read_json() returns sensible empty defaults if the file doesn't exist yet.
  3. get_next_id() safe for empty list.
  4. Streak logic: only increments if last_active was today or yesterday; resets to 1 otherwise.
  5. Added DELETE /api/goals/{goal_id} — was missing entirely.
  6. /api/leaderboard now includes streak, readiness and mock_avg fields used by the frontend.
  7. /api/stats no longer crashes when last_active is malformed (try/except added).
  8. /api/ats and /api/mock-interview accept Dict[str, Any] so floats don't crash validation.
  9. startup() calls os.chdir() so relative data/ paths always resolve correctly.
  10. _user_out() helper strips hashed_password cleanly in one place.
"""
import json
import os
import tempfile
import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import face_detector
import seed_data


# ─────────────────────────────────────────────────────────────────────────────
#  Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(UserBase):
    id: int
    streak: int
    readiness: int
    ats_score: Optional[int] = 0
    mock_scores: List[int] = []
    solved_problems: List[int] = []
    last_active: str


class GoalCreate(BaseModel):
    description: str
    target_date: str
    progress: int = 0
    status: str = "not-started"


class GoalOut(GoalCreate):
    id: int
    user_id: int
    created_at: str


class ProgressUpdate(BaseModel):
    solved_problems: Optional[int] = None
    readiness: Optional[int] = None
    ats_score: Optional[int] = None
    mock_scores: Optional[List[int]] = None
    last_active: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str


class FaceFrame(BaseModel):
    image: str   # base64-encoded JPEG or PNG from the browser canvas


# ─────────────────────────────────────────────────────────────────────────────
#  JSON storage helpers — ATOMIC writes
# ─────────────────────────────────────────────────────────────────────────────

def read_json(filepath: str):
    """Read JSON file; return safe empty structure if file is missing."""
    if not os.path.exists(filepath):
        return [] if any(x in filepath for x in ("goals", "placements", "problems")) else {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(filepath: str, data):
    """Atomically write JSON: write to temp file → os.replace() → done."""
    dir_ = os.path.dirname(os.path.abspath(filepath))
    fd, tmp_path = tempfile.mkstemp(dir=dir_, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def get_next_id(items: list) -> int:
    if not items:
        return 1
    return max(item["id"] for item in items) + 1


# ─────────────────────────────────────────────────────────────────────────────
#  FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Career Launch Pad API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    seed_data.seed()


# ─────────────────────────────────────────────────────────────────────────────
#  Auth dependency
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(token: str = Depends(auth.oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = auth.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    users = read_json("data/users.json")
    user = users.get(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _user_out(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "hashed_password"}


# ─────────────────────────────────────────────────────────────────────────────
#  Auth routes
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=UserOut)
def register(user: UserCreate):
    users = read_json("data/users.json")
    if user.username in users:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = auth.get_password_hash(user.password)
    new_user = {
        "id": len(users) + 1,
        "username": user.username,
        "email": user.email or "",
        "name": user.name or user.username,
        "hashed_password": hashed,
        "streak": 0,
        "readiness": 25,
        "ats_score": 0,
        "mock_scores": [],
        "solved_problems": [],
        "last_active": datetime.datetime.utcnow().isoformat(),
    }
    users[user.username] = new_user
    write_json("data/users.json", users)
    return UserOut(**_user_out(new_user))


@app.post("/api/auth/login", response_model=Token)
def login(user: UserLogin):
    users = read_json("data/users.json")
    db_user = users.get(user.username)
    if not db_user or not auth.verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# ─────────────────────────────────────────────────────────────────────────────
#  User routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/user/me", response_model=UserOut)
def read_current_user(current_user=Depends(get_current_user)):
    return UserOut(**_user_out(current_user))


@app.put("/api/user/me", response_model=UserOut)
def update_user(update: ProgressUpdate, current_user=Depends(get_current_user)):
    users = read_json("data/users.json")
    user = users[current_user["username"]]
    if update.solved_problems is not None:
        solved = user.setdefault("solved_problems", [])
        if update.solved_problems not in solved:
            solved.append(update.solved_problems)
    if update.readiness is not None:
        user["readiness"] = max(0, min(100, update.readiness))
    if update.ats_score is not None:
        user["ats_score"] = update.ats_score
    if update.mock_scores is not None:
        user["mock_scores"] = update.mock_scores
    if update.last_active is not None:
        user["last_active"] = update.last_active
    users[current_user["username"]] = user
    write_json("data/users.json", users)
    return UserOut(**_user_out(user))


# ─────────────────────────────────────────────────────────────────────────────
#  Goals routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/goals", response_model=List[GoalOut])
def list_goals(current_user=Depends(get_current_user)):
    goals = read_json("data/goals.json")
    return [g for g in goals if g["user_id"] == current_user["id"]]


@app.post("/api/goals", response_model=GoalOut)
def create_goal(goal: GoalCreate, current_user=Depends(get_current_user)):
    goals = read_json("data/goals.json")
    new_goal = {
        "id": get_next_id(goals),
        "user_id": current_user["id"],
        "description": goal.description,
        "target_date": goal.target_date,
        "progress": goal.progress,
        "status": goal.status,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    goals.append(new_goal)
    write_json("data/goals.json", goals)
    return GoalOut(**new_goal)


@app.put("/api/goals/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, goal: GoalCreate, current_user=Depends(get_current_user)):
    goals = read_json("data/goals.json")
    for g in goals:
        if g["id"] == goal_id and g["user_id"] == current_user["id"]:
            g.update({
                "description": goal.description,
                "target_date": goal.target_date,
                "progress": goal.progress,
                "status": goal.status,
            })
            write_json("data/goals.json", goals)
            return GoalOut(**g)
    raise HTTPException(status_code=404, detail="Goal not found")


@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: int, current_user=Depends(get_current_user)):
    """FIX: this endpoint was completely missing in the original."""
    goals = read_json("data/goals.json")
    new_goals = [
        g for g in goals
        if not (g["id"] == goal_id and g["user_id"] == current_user["id"])
    ]
    if len(new_goals) == len(goals):
        raise HTTPException(status_code=404, detail="Goal not found")
    write_json("data/goals.json", new_goals)
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
#  Problems routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/problems")
def get_problems():
    return read_json("data/problems.json")


@app.post("/api/problems/{problem_id}/solve")
def solve_problem(problem_id: int, current_user=Depends(get_current_user)):
    """
    FIX: original always incremented streak unconditionally.
    Now: increment only if last_active was today or yesterday; reset to 1 if longer gap.
    """
    users = read_json("data/users.json")
    user = users[current_user["username"]]
    solved = user.setdefault("solved_problems", [])

    if problem_id not in solved:
        solved.append(problem_id)
        now = datetime.datetime.utcnow()
        try:
            last = datetime.datetime.fromisoformat(user.get("last_active", ""))
            delta = (now.date() - last.date()).days
            if delta <= 1:
                user["streak"] = user.get("streak", 0) + 1
            else:
                user["streak"] = 1
        except (ValueError, TypeError):
            user["streak"] = 1
        user["last_active"] = now.isoformat()
        write_json("data/users.json", users)

    return {
        "success": True,
        "solved_count": len(solved),
        "streak": user.get("streak", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  ATS & Mock Interview
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/ats")
def save_ats(score: Dict[str, Any], current_user=Depends(get_current_user)):
    """FIX: use Any (not int) so floats from JS don't cause 422 validation errors."""
    users = read_json("data/users.json")
    user = users[current_user["username"]]
    user["ats_score"] = int(score.get("score", 0))
    write_json("data/users.json", users)
    return {"success": True, "ats_score": user["ats_score"]}


@app.post("/api/mock-interview")
def save_mock_score(score: Dict[str, Any], current_user=Depends(get_current_user)):
    users = read_json("data/users.json")
    user = users[current_user["username"]]
    user.setdefault("mock_scores", []).append(int(score.get("score", 0)))
    write_json("data/users.json", users)
    return {"success": True, "mock_count": len(user["mock_scores"])}


# ─────────────────────────────────────────────────────────────────────────────
#  Progress (generic bulk update)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/progress")
def update_progress(update: ProgressUpdate, current_user=Depends(get_current_user)):
    users = read_json("data/users.json")
    user = users[current_user["username"]]
    if update.solved_problems is not None:
        solved = user.setdefault("solved_problems", [])
        if update.solved_problems not in solved:
            solved.append(update.solved_problems)
    if update.readiness is not None:
        user["readiness"] = max(0, min(100, update.readiness))
    if update.ats_score is not None:
        user["ats_score"] = update.ats_score
    if update.mock_scores is not None:
        user["mock_scores"] = update.mock_scores
    if update.last_active is not None:
        user["last_active"] = update.last_active
    write_json("data/users.json", users)
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
#  Placements, Leaderboard, Stats
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/placements")
def list_placements():
    return read_json("data/placements.json")


@app.get("/api/leaderboard")
def leaderboard():
    """FIX: added streak, readiness, mock_avg — the frontend rendering uses all of them."""
    users = read_json("data/users.json")
    board = []
    for username, user in users.items():
        solved_count = len(user.get("solved_problems", []))
        mock_scores = user.get("mock_scores", [])
        mock_avg = round(sum(mock_scores) / len(mock_scores)) if mock_scores else 0
        board.append({
            "name": user.get("name", username),
            "username": username,
            "score": solved_count,
            "streak": user.get("streak", 0),
            "readiness": user.get("readiness", 0),
            "mock_avg": mock_avg,
        })
    board.sort(key=lambda x: x["score"], reverse=True)
    return board


@app.get("/api/stats")
def stats():
    """FIX: wrapped fromisoformat() in try/except — malformed dates no longer crash the route."""
    placements = read_json("data/placements.json")
    users = read_json("data/users.json")
    now = datetime.datetime.utcnow()
    active_users = 0
    for u in users.values():
        try:
            last = datetime.datetime.fromisoformat(u.get("last_active", ""))
            if (now - last).days < 7:
                active_users += 1
        except (ValueError, TypeError):
            pass
    top_companies = list(dict.fromkeys(p["company"] for p in placements))[:3]
    return {
        "avg_package": "28 LPA",
        "top_companies": top_companies,
        "active_users": active_users,
        "total_users": len(users),
        "total_placements": len(placements),
    }


@app.post("/api/face-status")
def face_status(frame: FaceFrame, current_user=Depends(get_current_user)):
    """
    Receives a base64 webcam snapshot from the browser.
    Runs MediaPipe face mesh detection.
    Returns attention state, EAR values, head pose, and score delta.
    """
    try:
        result = face_detector.analyze_frame(frame.image)
        return result
    except Exception as e:
        # Never crash the interview session — return a safe fallback
        return {
            "face_detected": False,
            "state": "focused",
            "attention_score_delta": 0,
            "ear_left": 0.0,
            "ear_right": 0.0,
            "yaw": 0.0,
            "pitch": 0.0,
            "reason": f"Detection error: {str(e)}"
        }


# ─────────────────────────────────────────────────────────────────────────────
#  Health check
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}
