import unittest
import requests
import uuid
from datetime import datetime

class WordleRoomsTester:
    def __init__(self, base_url="https://d2b98e10-afee-4781-b31b-b2067c50fcc9.preview.emergentagent.com"):
        self.base_url = base_url
        self.username = None
        self.room_id = None
        
    def login(self, username=None):
        if not username:
            username = f"test_user_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{self.base_url}/api/users/login",
            json={"username": username}
        )
        
        if response.status_code == 200:
            self.username = username
            print(f"✅ Login successful for {username}")
            return True
        else:
            print(f"❌ Login failed: {response.text}")
            return False

    def create_room(self, room_name=None):
        if not room_name:
            room_name = f"test_room_{uuid.uuid4().hex[:8]}"
            
        response = requests.post(
            f"{self.base_url}/api/rooms",
            json={
                "room_data": {
                    "name": room_name,
                    "isPrivate": False,
                    "description": "Test room for automated testing"
                },
                "user": {"username": self.username}
            }
        )
        
        if response.status_code == 200:
            self.room_id = response.json().get("roomId")
            print(f"✅ Room created: {room_name}")
            return self.room_id
        else:
            print(f"❌ Room creation failed: {response.text}")
            return None

    def add_word(self, word="TESTS"):
        if not self.room_id:
            print("❌ No room ID available")
            return False
            
        response = requests.post(
            f"{self.base_url}/api/rooms/words",
            json={
                "add_data": {
                    "roomId": self.room_id,
                    "word": word
                },
                "user": {"username": self.username}
            }
        )
        
        if response.status_code == 200:
            print(f"✅ Word added: {word}")
            return True
        else:
            print(f"❌ Word addition failed: {response.text}")
            return False

    def start_game(self):
        if not self.room_id:
            print("❌ No room ID available")
            return False
            
        response = requests.post(
            f"{self.base_url}/api/rooms/start-game",
            json={
                "game_data": {
                    "roomId": self.room_id,
                    "autoSelectWordCount": 0,
                    "ownerPlaying": True
                },
                "user": {"username": self.username}
            }
        )
        
        if response.status_code == 200:
            print("✅ Game started successfully")
            return response.json()
        else:
            print(f"❌ Game start failed: {response.text}")
            return None

def main():
    tester = WordleRoomsTester()
    
    # Step 1: Login
    if not tester.login():
        return
    
    # Step 2: Create room
    if not tester.create_room():
        return
    
    # Step 3: Add word
    if not tester.add_word("TESTS"):
        return
    
    # Step 4: Start game
    game_result = tester.start_game()
    if game_result:
        print(f"Game started with word: {game_result.get('word')}")
        print(f"Number of players: {game_result.get('playerCount')}")
    
if __name__ == "__main__":
    main()