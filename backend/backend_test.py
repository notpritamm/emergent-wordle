import requests
import unittest
from datetime import datetime

class WordleRoomsAPITest(unittest.TestCase):
    def setUp(self):
        self.base_url = "https://d2b98e10-afee-4781-b31b-b2067c50fcc9.preview.emergentagent.com/api"
        self.test_user = f"TestUser_{datetime.now().strftime('%H%M%S')}"
        self.test_room_name = f"test_room_{datetime.now().strftime('%H%M%S')}"

    def test_1_login(self):
        """Test user login"""
        response = requests.post(f"{self.base_url}/users/login", json={
            "username": self.test_user
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["username"], self.test_user)

    def test_2_create_room(self):
        """Test room creation"""
        response = requests.post(f"{self.base_url}/rooms", json={
            "room_data": {
                "name": self.test_room_name,
                "isPrivate": False,
                "description": "Test room for API testing"
            },
            "user": {"username": self.test_user}
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.room_id = data["roomId"]
        return data["roomId"]

    def test_3_add_word(self):
        """Test adding a word to room"""
        room_id = self.test_2_create_room()
        response = requests.post(f"{self.base_url}/rooms/words", json={
            "add_data": {
                "roomId": room_id,
                "word": "TEST"
            },
            "user": {"username": self.test_user}
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_4_start_game(self):
        """Test starting a game"""
        room_id = self.test_2_create_room()
        # First add a word
        requests.post(f"{self.base_url}/rooms/words", json={
            "add_data": {
                "roomId": room_id,
                "word": "TEST"
            },
            "user": {"username": self.test_user}
        })
        
        # Then start the game
        response = requests.post(f"{self.base_url}/rooms/start-game", json={
            "game_data": {
                "roomId": room_id,
                "autoSelectWordCount": 0,
                "ownerPlaying": True
            },
            "user": {"username": self.test_user}
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_5_cleanup_test_rooms(self):
        """Test cleanup of test rooms"""
        response = requests.post(f"{self.base_url}/cleanup")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

if __name__ == '__main__':
    unittest.main()