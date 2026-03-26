"""
seed_data.py — Seeds initial JSON data files on first run.
Changes vs original:
  - Seeds a test user (username: test / password: test123) when users.json is empty.
  - Added 5 more placement records and 5 more problems for richer demo data.
  - Prints a clear startup message so the developer knows credentials.
"""
import json
import os
import datetime
import auth


def ensure_data_dir():
    os.makedirs("data", exist_ok=True)


def initial_placements():
    return [
        {"id": 1, "name": "A***a S.", "company": "Google",    "role": "SWE L3",       "package": "₹48 LPA", "leet": 320, "mock": 91, "ats": 88, "days": 110},
        {"id": 2, "name": "K***k R.", "company": "Microsoft", "role": "SDE II",        "package": "₹38 LPA", "leet": 280, "mock": 87, "ats": 85, "days": 90},
        {"id": 3, "name": "P***a M.", "company": "Amazon",    "role": "SDE I",         "package": "₹32 LPA", "leet": 245, "mock": 83, "ats": 82, "days": 75},
        {"id": 4, "name": "R***n T.", "company": "Flipkart",  "role": "SDE I",         "package": "₹26 LPA", "leet": 180, "mock": 78, "ats": 79, "days": 60},
        {"id": 5, "name": "S***a L.", "company": "Uber",      "role": "Software Eng",  "package": "₹36 LPA", "leet": 260, "mock": 89, "ats": 86, "days": 95},
        {"id": 6, "name": "V***k S.", "company": "Flipkart",  "role": "SDE I",         "package": "₹28 LPA", "leet": 195, "mock": 80, "ats": 81, "days": 68},
        {"id": 7, "name": "D***a P.", "company": "Oracle",    "role": "Associate Dev", "package": "₹22 LPA", "leet": 155, "mock": 75, "ats": 78, "days": 55},
    ]


def initial_problems():
    return [
        {"id": 1,  "title": "Two Sum",                             "difficulty": "easy",   "tags": ["Array", "Hash Map"]},
        {"id": 2,  "title": "Longest Substring Without Repeating", "difficulty": "medium", "tags": ["Sliding Window"]},
        {"id": 3,  "title": "Median of Two Sorted Arrays",         "difficulty": "hard",   "tags": ["Binary Search"]},
        {"id": 4,  "title": "Valid Parentheses",                   "difficulty": "easy",   "tags": ["Stack"]},
        {"id": 5,  "title": "Merge K Sorted Lists",                "difficulty": "hard",   "tags": ["Heap", "Linked List"]},
        {"id": 6,  "title": "Maximum Subarray",                    "difficulty": "easy",   "tags": ["DP"]},
        {"id": 7,  "title": "Jump Game II",                        "difficulty": "medium", "tags": ["Greedy"]},
        {"id": 8,  "title": "Word Ladder",                         "difficulty": "hard",   "tags": ["BFS", "Graph"]},
        {"id": 9,  "title": "House Robber",                        "difficulty": "medium", "tags": ["DP"]},
        {"id": 10, "title": "Coin Change",                         "difficulty": "medium", "tags": ["DP"]},
        {"id": 11, "title": "Binary Tree Level Order Traversal",   "difficulty": "medium", "tags": ["BFS", "Tree"]},
        {"id": 12, "title": "Climbing Stairs",                     "difficulty": "easy",   "tags": ["DP"]},
        {"id": 13, "title": "Trapping Rain Water",                 "difficulty": "hard",   "tags": ["Two Pointers", "Stack"]},
        {"id": 14, "title": "Number of Islands",                   "difficulty": "medium", "tags": ["BFS", "DFS", "Graph"]},
        {"id": 15, "title": "Reverse Linked List",                 "difficulty": "easy",   "tags": ["Linked List"]},
    ]


def seed():
    ensure_data_dir()

    if not os.path.exists("data/placements.json"):
        with open("data/placements.json", "w", encoding="utf-8") as f:
            json.dump(initial_placements(), f, indent=2)

    if not os.path.exists("data/problems.json"):
        with open("data/problems.json", "w", encoding="utf-8") as f:
            json.dump(initial_problems(), f, indent=2)

    if not os.path.exists("data/goals.json"):
        with open("data/goals.json", "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)

    users_file = "data/users.json"
    if not os.path.exists(users_file):
        with open(users_file, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=2)

    with open(users_file, "r", encoding="utf-8") as f:
        users = json.load(f)

    if not users:
        hashed = auth.get_password_hash("test123")
        users["test"] = {
            "id": 1,
            "username": "test",
            "email": "test@clp.demo",
            "name": "Test User",
            "hashed_password": hashed,
            "streak": 7,
            "readiness": 42,
            "ats_score": 68,
            "mock_scores": [72, 78, 81],
            "solved_problems": [1, 4, 6, 12, 15],
            "last_active": datetime.datetime.utcnow().isoformat(),
        }
        with open(users_file, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2)
        print("[CLP] ✅ Seeded test user  →  username: test  |  password: test123")
    else:
        print(f"[CLP] ✅ Loaded {len(users)} existing user(s)")
