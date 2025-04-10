import unittest
import requests
import json
from datetime import datetime

BACKEND_URL = "https://wordle-backend-402418.ue.r.appspot.com/api"  # Using public endpoint

class WordleRoomTest(unittest.TestCase):
    def setUp(self):
        self.user1 = f"test_user1_{datetime.now().strftime('%H%M%S')}"
        self.user2 = f"test_user2_{datetime.now().strftime('%H%M%S')}"
        self.room_name = f"Test_Room_{datetime.now().strftime('%H%M%S')}"
        self.test_word = "TESTING"

    def test_full_game_flow(self):
        print("\nTesting full game flow...")
        
        # 1. Login both users
        print("1. Testing user login...")
        user1_response = requests.post(f"{BACKEND_URL}/auth/login", json={"username": self.user1})
        user2_response = requests.post(f"{BACKEND_URL}/auth/login", json={"username": self.user2})
        
        self.assertEqual(user1_response.status_code, 200)
        self.assertEqual(user2_response.status_code, 200)
        print("✓ Both users logged in successfully")

        # 2. Create room as User1
        print("\n2. Testing room creation...")
        create_room_response = requests.post(
            f"{BACKEND_URL}/rooms",
            json={
                "room_data": {
                    "name": self.room_name,
                    "isPrivate": False,
                    "description": "Test room for automated testing"
                },
                "user": {"username": self.user1}
            }
        )
        
        self.assertEqual(create_room_response.status_code, 200)
        room_data = create_room_response.json()
        room_id = room_data["roomId"]
        print(f"✓ Room created with ID: {room_id}")

        # 3. Add word to room
        print("\n3. Testing adding word to room...")
        add_word_response = requests.post(
            f"{BACKEND_URL}/rooms/words",
            json={
                "add_data": {
                    "roomId": room_id,
                    "word": self.test_word
                },
                "user": {"username": self.user1}
            }
        )
        
        self.assertEqual(add_word_response.status_code, 200)
        print("✓ Word added successfully")

        # 4. User2 joins room
        print("\n4. Testing room joining...")
        join_room_response = requests.post(
            f"{BACKEND_URL}/rooms/join",
            json={
                "join_data": {"roomId": room_id},
                "user": {"username": self.user2}
            }
        )
        
        self.assertEqual(join_room_response.status_code, 200)
        print("✓ User2 joined room successfully")

        # 5. Start game as User1
        print("\n5. Testing game start...")
        start_game_response = requests.post(
            f"{BACKEND_URL}/rooms/start-game",
            json={
                "game_data": {
                    "roomId": room_id,
                    "autoSelectWordCount": 0,
                    "ownerPlaying": True
                },
                "user": {"username": self.user1}
            }
        )
        
        self.assertEqual(start_game_response.status_code, 200)
        game_data = start_game_response.json()
        self.assertEqual(game_data["word"], self.test_word)
        print("✓ Game started successfully")

        # 6. Get game state for both users
        print("\n6. Testing game state retrieval...")
        user1_game_state = requests.get(f"{BACKEND_URL}/game/state/{room_id}?username={self.user1}")
        user2_game_state = requests.get(f"{BACKEND_URL}/game/state/{room_id}?username={self.user2}")
        
        self.assertEqual(user1_game_state.status_code, 200)
        self.assertEqual(user2_game_state.status_code, 200)
        print("✓ Game state retrieved for both users")

        # 7. Test room sorting
        print("\n7. Testing room sorting...")
        rooms_by_name = requests.get(f"{BACKEND_URL}/rooms?sort_by=name&sort_order=asc")
        rooms_by_members = requests.get(f"{BACKEND_URL}/rooms?sort_by=memberCount&sort_order=desc")
        
        self.assertEqual(rooms_by_name.status_code, 200)
        self.assertEqual(rooms_by_members.status_code, 200)
        print("✓ Room sorting working")

        # 8. Test room cleanup
        print("\n8. Testing room cleanup...")
        cleanup_response = requests.post(f"{BACKEND_URL}/cleanup")
        self.assertEqual(cleanup_response.status_code, 200)
        print("✓ Room cleanup successful")

        print("\nAll backend tests completed successfully!")

if __name__ == '__main__':
    unittest.main(argv=[''], verbosity=2)
