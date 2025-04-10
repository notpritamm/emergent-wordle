from fastapi import FastAPI, HTTPException, Body, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.encoders import jsonable_encoder
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import os
import logging
from pathlib import Path
import random
import uuid
from datetime import datetime, timedelta
import json
from bson import ObjectId

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

# /backend 
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client.get_database(os.environ.get('DB_NAME', 'wordledb'))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

class UserInDB(User):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wordsSolved: int = 0
    gamesPlayed: int = 0
    createdAt: datetime = Field(default_factory=datetime.now)

class Score(BaseModel):
    username: str
    won: bool
    word: str
    attempts: int
    roomId: Optional[str] = None

class Message(BaseModel):
    content: str
    sender: str
    timestamp: datetime = Field(default_factory=datetime.now)

class Word(BaseModel):
    word: str
    addedBy: str
    timestamp: datetime = Field(default_factory=datetime.now)

class RoomCreate(BaseModel):
    name: str
    isPrivate: bool = False
    password: Optional[str] = None
    description: Optional[str] = None

class RoomJoin(BaseModel):
    roomId: str
    password: Optional[str] = None

class RoomAddWord(BaseModel):
    roomId: str
    word: str

class RoomUpdateMembers(BaseModel):
    roomId: str
    username: str
    action: str  # "add" or "remove"
    
class RoomStartGame(BaseModel):
    roomId: str
    autoSelectWordCount: Optional[int] = 0
    ownerPlaying: bool = True

class GameState(BaseModel):
    roomId: str
    active: bool = False
    currentWord: Optional[str] = None
    startedAt: Optional[datetime] = None
    endedAt: Optional[datetime] = None
    playerStates: Dict[str, Dict] = {}
    autoSelectWordCount: int = 0
    ownerPlaying: bool = True
    
class GameUpdate(BaseModel):
    roomId: str
    username: str
    boardData: List[List[Dict]] = []
    currentAttempt: int = 0
    gameOver: bool = False
    won: bool = False

class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    host: str
    members: List[str] = []
    words: List[Word] = []
    messages: List[Dict] = []
    isPrivate: bool = False
    password: Optional[str] = None
    description: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.now)
    gameState: Optional[Dict] = None
    isTest: bool = False  # Flag for test rooms

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            if len(self.active_connections[room_id]) == 0:
                del self.active_connections[room_id]

    async def broadcast(self, message: str, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_text(message)

manager = ConnectionManager()

@app.get("/api")
async def root():
    return {"message": "Wordle Game API"}

@app.post("/api/users/login")
async def login_user(user: User = Body(...)):
    try:
        # Check if user already exists
        existing_user = await db.users.find_one({"username": user.username})
        
        if not existing_user:
            # Create new user with initial stats
            new_user = UserInDB(username=user.username)
            await db.users.insert_one(new_user.dict())
            logger.info(f"New user created: {user.username}")
            return {"success": True, "username": user.username, "id": new_user.id}
        
        return {"success": True, "username": user.username, "id": existing_user.get("id", str(existing_user.get("_id")))}
    
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
        game_result = {
            "username": score.username,
            "word": score.word,
            "won": score.won,
            "attempts": score.attempts,
            "timestamp": datetime.now(),
            "roomId": score.roomId
        }
        
        await db.games.insert_one(game_result)
        
        # If the game was in a room, update room stats
        if score.roomId:
            # Add score to room leaderboard
            await db.rooms.update_one(
                {"id": score.roomId},
                {"$push": {"scores": game_result}}
            )
            
            # Update the player state in the game
            await db.rooms.update_one(
                {"id": score.roomId, "gameState.active": True},
                {"$set": {
                    f"gameState.playerStates.{score.username}.completed": True,
                    f"gameState.playerStates.{score.username}.won": score.won,
                    f"gameState.playerStates.{score.username}.attempts": score.attempts
                }}
            )
            
            # Check if all players have completed the game
            room = await db.rooms.find_one({"id": score.roomId})
            if room and room.get("gameState", {}).get("active", False):
                all_completed = True
                player_states = room["gameState"]["playerStates"]
                for player, state in player_states.items():
                    if not state.get("completed", False):
                        all_completed = False
                        break
                
                if all_completed:
                    # End the game
                    await db.rooms.update_one(
                        {"id": score.roomId},
                        {"$set": {
                            "gameState.active": False,
                            "gameState.endedAt": datetime.now()
                        }}
                    )
                    
                    # Determine winner
                    winner = None
                    best_score = 999
                    for player, state in player_states.items():
                        if state.get("won", False) and state.get("attempts", 999) < best_score:
                            best_score = state["attempts"]
                            winner = player
                    
                    if winner:
                        # Notify the room about the winner
                        win_message = {
                            "type": "system",
                            "content": f"Game over! {winner} won with {best_score} attempts!",
                            "sender": "system",
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.broadcast(json.dumps(win_message), score.roomId)
                        
                        # Store the win message
                        await db.rooms.update_one(
                            {"id": score.roomId},
                            {"$push": {"messages": win_message}}
                        )
        
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

# Room endpoints
@app.post("/api/rooms")
async def create_room(room_data: RoomCreate, user: User = Body(...)):
    try:
        new_room = Room(
            name=room_data.name,
            host=user.username,
            members=[user.username],
            isPrivate=room_data.isPrivate,
            password=room_data.password,
            description=room_data.description,
            isTest=room_data.name.lower().startswith("test_") # Mark test rooms automatically
        )
        
        await db.rooms.insert_one(new_room.dict())
        logger.info(f"New room created: {room_data.name} by {user.username}")
        
        return {
            "success": True,
            "roomId": new_room.id,
            "name": new_room.name,
            "host": new_room.host
        }
    
    except Exception as e:
        logger.error(f"Error creating room: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms")
async def get_rooms(is_public: bool = Query(None), sort_by: str = Query("createdAt"), sort_order: str = Query("desc")):
    try:
        # Filter for public rooms or all rooms
        filter_query = {}
        if is_public is not None:
            filter_query["isPrivate"] = not is_public
        
        # Determine sort direction
        sort_direction = -1 if sort_order.lower() == "desc" else 1
        
        # Set sort field
        valid_sort_fields = ["createdAt", "name", "memberCount", "wordCount"]
        sort_field = sort_by if sort_by in valid_sort_fields else "createdAt"
        
        # Handle special sort cases
        if sort_field == "memberCount":
            # Get rooms and sort in memory (MongoDB can't sort by array length directly)
            cursor = db.rooms.find(filter_query)
            rooms = await cursor.to_list(length=100)
            rooms.sort(key=lambda r: len(r.get("members", [])), reverse=(sort_direction == -1))
        elif sort_field == "wordCount":
            # Same approach for wordCount
            cursor = db.rooms.find(filter_query)
            rooms = await cursor.to_list(length=100)
            rooms.sort(key=lambda r: len(r.get("words", [])), reverse=(sort_direction == -1))
        else:
            # Standard MongoDB sort
            cursor = db.rooms.find(filter_query).sort(sort_field, sort_direction)
            rooms = await cursor.to_list(length=100)
        
        # Format the response
        result = []
        for room in rooms:
            if room:  # Skip None values
                result.append({
                    "id": room.get("id"),
                    "name": room.get("name", "Unnamed Room"),
                    "host": room.get("host", "Unknown"),
                    "memberCount": len(room.get("members", [])),
                    "isPrivate": room.get("isPrivate", False),
                    "description": room.get("description", ""),
                    "wordCount": len(room.get("words", [])),
                    "createdAt": room.get("createdAt", datetime.now()),
                    "gameActive": room.get("gameState", {}).get("active", False) if room.get("gameState") else False,
                    "isTest": room.get("isTest", False)
                })
        return result
    
    except Exception as e:
        logger.error(f"Error fetching rooms: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Don't expose password in response
        if "password" in room:
            del room["password"]
        
        # Convert MongoDB document to JSON-serializable dictionary
        room_dict = {}
        for key, value in room.items():
            if key == "_id":
                room_dict["_id"] = str(value)
            else:
                room_dict[key] = value
        
        return room_dict
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error fetching room: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rooms/join")
async def join_room(join_data: RoomJoin, user: User = Body(...)):
    try:
        room = await db.rooms.find_one({"id": join_data.roomId})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if room is private and requires password
        if room.get("isPrivate", False):
            if not join_data.password or join_data.password != room.get("password"):
                raise HTTPException(status_code=403, detail="Invalid password")
        
        # Check if user is already a member
        if user.username in room.get("members", []):
            return {"success": True, "message": "Already a member"}
        
        # Add user to members
        await db.rooms.update_one(
            {"id": join_data.roomId},
            {"$push": {"members": user.username}}
        )
        
        logger.info(f"User {user.username} joined room {join_data.roomId}")
        
        return {"success": True}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error joining room: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rooms/{room_id}/leave")
async def leave_room(room_id: str, username: str = Body(...)):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Remove user from members
        await db.rooms.update_one(
            {"id": room_id},
            {"$pull": {"members": username}}
        )
        
        # If user is in active game, mark them as left
        if room.get("gameState", {}).get("active", False):
            player_states = room.get("gameState", {}).get("playerStates", {})
            if username in player_states:
                await db.rooms.update_one(
                    {"id": room_id},
                    {"$set": {f"gameState.playerStates.{username}.left": True}}
                )
        
        # If the user was the host, assign a new host or delete the room
        if room.get("host") == username:
            if len(room.get("members", [])) <= 1:
                # Delete the room if no other members
                await db.rooms.delete_one({"id": room_id})
                return {"success": True, "message": "Room deleted"}
            else:
                # Assign a new host
                new_host = next((m for m in room.get("members", []) if m != username), None)
                if new_host:
                    await db.rooms.update_one(
                        {"id": room_id},
                        {"$set": {"host": new_host}}
                    )
        
        logger.info(f"User {username} left room {room_id}")
        
        return {"success": True}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error leaving room: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rooms/words")
async def add_word(add_data: RoomAddWord, user: User = Body(...)):
    try:
        room = await db.rooms.find_one({"id": add_data.roomId})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Only allow the host to add words
        if room.get("host") != user.username:
            raise HTTPException(status_code=403, detail="Only the host can add words")
        
        # Validate word (no spaces, not too short)
        word = add_data.word.strip().upper()
        if " " in word or len(word) < 3:
            raise HTTPException(status_code=400, detail="Invalid word format")
        
        # Check if word already exists
        existing_words = [w.get("word", "").upper() for w in room.get("words", [])]
        if word in existing_words:
            raise HTTPException(status_code=400, detail="Word already exists in this room")
        
        # Add the word
        new_word = Word(word=word, addedBy=user.username)
        await db.rooms.update_one(
            {"id": add_data.roomId},
            {"$push": {"words": new_word.dict()}}
        )
        
        logger.info(f"Word '{word}' added to room {add_data.roomId} by {user.username}")
        
        return {"success": True, "word": word}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error adding word: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/rooms/{room_id}/words/{word}")
async def remove_word(room_id: str, word: str, user: User = Body(...)):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Only allow the host to remove words
        if room.get("host") != user.username:
            raise HTTPException(status_code=403, detail="Only the host can remove words")
        
        # Remove the word
        await db.rooms.update_one(
            {"id": room_id},
            {"$pull": {"words": {"word": word.upper()}}}
        )
        
        logger.info(f"Word '{word}' removed from room {room_id} by {user.username}")
        
        return {"success": True}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error removing word: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rooms/members")
async def update_member(update_data: RoomUpdateMembers, user: User = Body(...)):
    try:
        room = await db.rooms.find_one({"id": update_data.roomId})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Only allow the host to manage members
        if room.get("host") != user.username:
            raise HTTPException(status_code=403, detail="Only the host can manage members")
        
        if update_data.action == "remove":
            # Prevent removing self (host)
            if update_data.username == user.username:
                raise HTTPException(status_code=400, detail="Host cannot remove themselves")
            
            # Remove the member
            await db.rooms.update_one(
                {"id": update_data.roomId},
                {"$pull": {"members": update_data.username}}
            )
            
            logger.info(f"User {update_data.username} removed from room {update_data.roomId}")
            
        elif update_data.action == "add":
            # Check if user exists
            target_user = await db.users.find_one({"username": update_data.username})
            if not target_user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Add the member
            await db.rooms.update_one(
                {"id": update_data.roomId},
                {"$addToSet": {"members": update_data.username}}
            )
            
            logger.info(f"User {update_data.username} added to room {update_data.roomId}")
            
        else:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        return {"success": True}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error managing members: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms/{room_id}/words")
async def get_random_word(room_id: str):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        words = room.get("words", [])
        if not words:
            raise HTTPException(status_code=404, detail="No words in this room")
        
        # Get a random word
        random_word = random.choice(words)
        
        return {"word": random_word.get("word", "").upper()}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error getting random word: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms/{room_id}/leaderboard")
async def get_room_leaderboard(room_id: str):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        scores = room.get("scores", [])
        
        # Group scores by user and calculate stats
        user_stats = {}
        for score in scores:
            username = score.get("username")
            if username not in user_stats:
                user_stats[username] = {
                    "username": username,
                    "gamesPlayed": 0,
                    "wordsSolved": 0,
                    "avgAttempts": 0
                }
            
            user_stats[username]["gamesPlayed"] += 1
            if score.get("won", False):
                user_stats[username]["wordsSolved"] += 1
                user_stats[username]["avgAttempts"] += score.get("attempts", 6)
        
        # Calculate average attempts
        for username in user_stats:
            if user_stats[username]["wordsSolved"] > 0:
                user_stats[username]["avgAttempts"] /= user_stats[username]["wordsSolved"]
            user_stats[username]["avgAttempts"] = round(user_stats[username]["avgAttempts"], 1)
        
        # Sort by words solved (desc) and avg attempts (asc)
        leaderboard = sorted(
            user_stats.values(),
            key=lambda x: (-x["wordsSolved"], x["avgAttempts"])
        )
        
        return leaderboard
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error getting room leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket for room chat
@app.websocket("/api/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    await manager.connect(websocket, room_id)
    try:
        # Add join message to the room
        join_message = {
            "type": "system",
            "content": f"{username} has joined the room",
            "sender": "system",
            "timestamp": datetime.now().isoformat()
        }
        await manager.broadcast(json.dumps(join_message), room_id)
        
        # Store the join message
        await db.rooms.update_one(
            {"id": room_id},
            {"$push": {"messages": join_message}}
        )
        
        # Send the current game state if a game is in progress
        room = await db.rooms.find_one({"id": room_id})
        if room and room.get("gameState", {}).get("active", False):
            game_state = room.get("gameState", {})
            
            # Check if the user is part of the game
            if username in game_state.get("playerStates", {}):
                # Send game state
                game_data_message = {
                    "type": "game_state",
                    "active": True,
                    "word": game_state.get("currentWord"),
                    "timestamp": datetime.now().isoformat()
                }
                await websocket.send_text(json.dumps(game_data_message))
        
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Validate message
            if not message_data.get("content"):
                continue
            
            # Create message object
            message = {
                "type": "chat",
                "content": message_data.get("content"),
                "sender": username,
                "timestamp": datetime.now().isoformat()
            }
            
            # Broadcast to all connected clients in the room
            await manager.broadcast(json.dumps(message), room_id)
            
            # Store the message
            await db.rooms.update_one(
                {"id": room_id},
                {"$push": {"messages": message}}
            )
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        
        # Add leave message to the room
        leave_message = {
            "type": "system",
            "content": f"{username} has left the room",
            "sender": "system",
            "timestamp": datetime.now().isoformat()
        }
        await manager.broadcast(json.dumps(leave_message), room_id)
        
        # Store the leave message
        await db.rooms.update_one(
            {"id": room_id},
            {"$push": {"messages": leave_message}}
        )
    
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        manager.disconnect(websocket, room_id)

# New endpoints for game management
@app.post("/api/rooms/start-game")
async def start_game(game_data: RoomStartGame = Body(...), user: User = Body(...)):
    try:
        room = await db.rooms.find_one({"id": game_data.roomId})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Only allow the host to start a game
        if room.get("host") != user.username:
            raise HTTPException(status_code=403, detail="Only the host can start a game")
        
        # Check if game is already in progress
        if room.get("gameState", {}).get("active", False):
            raise HTTPException(status_code=400, detail="Game already in progress")
        
        # Check if room has enough words
        words = room.get("words", [])
        if len(words) == 0:
            raise HTTPException(status_code=400, detail="No words available in this room")
        
        # Auto-select words if specified
        target_word = None
        if game_data.autoSelectWordCount > 0:
            # Randomly select a word from the room's word list
            if game_data.autoSelectWordCount > len(words):
                game_data.autoSelectWordCount = len(words)
            selected_word = random.choice(words)
            # Handle the case where the word might be a string or a dict
            if isinstance(selected_word, dict):
                target_word = selected_word.get("word", "").upper()
            else:
                target_word = str(selected_word).upper()
        else:
            # Use the first word in the list
            first_word = words[0]
            if isinstance(first_word, dict):
                target_word = first_word.get("word", "").upper()
            else:
                target_word = str(first_word).upper()
        
        # Initialize player states
        player_states = {}
        for member in room.get("members", []):
            # Skip the host if they aren't playing
            if member == user.username and not game_data.ownerPlaying:
                continue
                
            player_states[member] = {
                "completed": False,
                "won": False,
                "attempts": 0,
                "boardData": []
            }
        
        # Create game state
        game_state = {
            "active": True,
            "currentWord": target_word,
            "startedAt": datetime.now(),
            "endedAt": None,
            "playerStates": player_states,
            "autoSelectWordCount": game_data.autoSelectWordCount,
            "ownerPlaying": game_data.ownerPlaying
        }
        
        # Save game state to room
        await db.rooms.update_one(
            {"id": game_data.roomId},
            {"$set": {"gameState": game_state}}
        )
        
        # Notify all members about game start
        game_start_message = {
            "type": "system",
            "content": f"Game started by {user.username}! The word has {len(target_word)} letters.",
            "sender": "system",
            "timestamp": datetime.now().isoformat()
        }
        await manager.broadcast(json.dumps(game_start_message), game_data.roomId)
        
        # Store the game start message
        await db.rooms.update_one(
            {"id": game_data.roomId},
            {"$push": {"messages": game_start_message}}
        )
        
        # Send game state to all connected clients
        game_data_message = {
            "type": "game_start",
            "word": target_word,
            "timestamp": datetime.now().isoformat()
        }
        await manager.broadcast(json.dumps(game_data_message), game_data.roomId)
        
        logger.info(f"Game started in room {game_data.roomId} by {user.username}")
        
        return {
            "success": True,
            "word": target_word,
            "playerCount": len(player_states)
        }
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error starting game: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/game/update")
async def update_game_state(update: GameUpdate = Body(...)):
    try:
        room = await db.rooms.find_one({"id": update.roomId})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if game is active
        if not room.get("gameState", {}).get("active", False):
            raise HTTPException(status_code=400, detail="No active game in this room")
        
        # Check if player is part of the game
        player_states = room.get("gameState", {}).get("playerStates", {})
        if update.username not in player_states:
            raise HTTPException(status_code=403, detail="Player not in this game")
        
        # Update player state
        await db.rooms.update_one(
            {"id": update.roomId},
            {"$set": {
                f"gameState.playerStates.{update.username}.boardData": update.boardData,
                f"gameState.playerStates.{update.username}.currentAttempt": update.currentAttempt,
                f"gameState.playerStates.{update.username}.completed": update.gameOver,
                f"gameState.playerStates.{update.username}.won": update.won,
                f"gameState.playerStates.{update.username}.attempts": update.currentAttempt + 1 if update.gameOver else update.currentAttempt
            }}
        )
        
        # Broadcast update to other players
        update_message = {
            "type": "game_update",
            "player": update.username,
            "boardData": update.boardData,
            "currentAttempt": update.currentAttempt,
            "gameOver": update.gameOver,
            "won": update.won,
            "timestamp": datetime.now().isoformat()
        }
        await manager.broadcast(json.dumps(update_message), update.roomId)
        
        return {"success": True}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error updating game state: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/game/state/{room_id}")
async def get_game_state(room_id: str, username: str):
    try:
        room = await db.rooms.find_one({"id": room_id})
        
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if game exists
        game_state = room.get("gameState", {})
        if not game_state:
            return {"active": False}
        
        # Filter player states to exclude current word for other players
        player_states = {}
        for player, state in game_state.get("playerStates", {}).items():
            player_states[player] = {
                "completed": state.get("completed", False),
                "won": state.get("won", False),
                "attempts": state.get("attempts", 0),
                "boardData": state.get("boardData", [])
            }
        
        # Return game state
        return {
            "active": game_state.get("active", False),
            "startedAt": game_state.get("startedAt"),
            "endedAt": game_state.get("endedAt"),
            "currentWord": game_state.get("currentWord") if username in game_state.get("playerStates", {}) else None,
            "playerStates": player_states,
            "autoSelectWordCount": game_state.get("autoSelectWordCount", 0),
            "ownerPlaying": game_state.get("ownerPlaying", True)
        }
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error getting game state: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/rooms/test")
async def delete_test_rooms():
    try:
        # Find and delete all test rooms
        result = await db.rooms.delete_many({"isTest": True})
        
        return {"success": True, "deletedCount": result.deleted_count}
    
    except Exception as e:
        logger.error(f"Error deleting test rooms: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Cleanup endpoint for test rooms
@app.post("/api/cleanup")
async def cleanup_old_test_rooms():
    try:
        # Find and delete test rooms older than 24 hours
        cutoff_time = datetime.now() - timedelta(hours=24)
        result = await db.rooms.delete_many({
            "isTest": True,
            "createdAt": {"$lt": cutoff_time}
        })
        
        return {"success": True, "deletedCount": result.deleted_count}
    
    except Exception as e:
        logger.error(f"Error cleaning up test rooms: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
