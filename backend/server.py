from fastapi import FastAPI, HTTPException, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import uvicorn
import os
import logging
from pathlib import Path
import random

# /backend 
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class User(BaseModel):
    username: str

class Score(BaseModel):
    username: str
    won: bool
    word: str
    attempts: int

@app.get("/")
async def root():
    return {"message": "Wordle Game API"}

@app.post("/api/users/login")
async def login_user(user: User = Body(...)):
    try:
        # Check if user already exists
        existing_user = await db.users.find_one({"username": user.username})
        
        if not existing_user:
            # Create new user with initial stats
            await db.users.insert_one({
                "username": user.username,
                "wordsSolved": 0,
                "gamesPlayed": 0
            })
            logger.info(f"New user created: {user.username}")
        
        return {"success": True, "username": user.username}
    
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scores")
async def update_score(score: Score = Body(...)):
    try:
        # Update user stats
        result = await db.users.update_one(
            {"username": score.username},
            {"$inc": {
                "gamesPlayed": 1,
                "wordsSolved": 1 if score.won else 0
            }}
        )
        
        # Save the game result
        await db.games.insert_one({
            "username": score.username,
            "word": score.word,
            "won": score.won,
            "attempts": score.attempts,
            "timestamp": datetime.now()
        })
        
        if result.modified_count == 0:
            logger.warning(f"User not found for score update: {score.username}")
            raise HTTPException(status_code=404, detail="User not found")
        
        return {"success": True}
    
    except Exception as e:
        logger.error(f"Error updating score: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/leaderboard")
async def get_leaderboard():
    try:
        # Get top players by words solved
        cursor = db.users.find().sort("wordsSolved", -1).limit(10)
        leaderboard = await cursor.to_list(length=10)
        
        # Format the response
        return [
            {
                "username": user["username"],
                "wordsSolved": user["wordsSolved"],
                "gamesPlayed": user["gamesPlayed"]
            } for user in leaderboard
        ]
    
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Add datetime import at the top
from datetime import datetime

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
