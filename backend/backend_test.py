import requests
import pytest
import uuid
from datetime import datetime

BACKEND_URL = "https://85c2b0cf-e501-4233-882d-4d6c39675089.preview.emergentagent.com/api"

class TestWordleAPI:
    def setup_method(self):
        self.test_username = f"test_user_{uuid.uuid4().hex[:8]}"
        self.test_room_name = f"test_room_{uuid.uuid4().hex[:8]}"
        self.test_word = "PYTHON"

    def test_login_flow(self):
        """Test user login functionality"""
        response = requests.post(
            f"{BACKEND_URL}/users/login",
            json={"username": self.test_username}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == self.test_username
        assert "id" in data

    def test_room_creation_and_management(self):
        """Test room creation and management flows"""
        # Create public room
        response = requests.post(
            f"{BACKEND_URL}/rooms",
            json={
                "room_data": {
                    "name": self.test_room_name,
                    "isPrivate": False,
                    "description": "Test room"
                },
                "user": {"username": self.test_username}
            }
        )
        assert response.status_code == 200
        room_data = response.json()
        room_id = room_data["roomId"]
        
        # Verify room creation
        response = requests.get(f"{BACKEND_URL}/rooms/{room_id}")
        assert response.status_code == 200
        room = response.json()
        assert room["name"] == self.test_room_name
        assert room["host"] == self.test_username
        
        # Add word to room
        response = requests.post(
            f"{BACKEND_URL}/rooms/words",
            json={
                "add_data": {
                    "roomId": room_id,
                    "word": self.test_word
                },
                "user": {"username": self.test_username}
            }
        )
        assert response.status_code == 200
        
        # Get random word
        response = requests.get(f"{BACKEND_URL}/rooms/{room_id}/words")
        assert response.status_code == 200
        assert "word" in response.json()
        
        # Leave room
        response = requests.post(
            f"{BACKEND_URL}/rooms/{room_id}/leave",
            json={"username": self.test_username}
        )
        assert response.status_code == 200

    def test_private_room_flow(self):
        """Test private room creation and access"""
        room_password = "testpass123"
        
        # Create private room
        response = requests.post(
            f"{BACKEND_URL}/rooms",
            json={
                "room_data": {
                    "name": f"private_{self.test_room_name}",
                    "isPrivate": True,
                    "password": room_password,
                    "description": "Private test room"
                },
                "user": {"username": self.test_username}
            }
        )
        assert response.status_code == 200
        room_id = response.json()["roomId"]
        
        # Try joining without password (should fail)
        response = requests.post(
            f"{BACKEND_URL}/rooms/join",
            json={
                "join_data": {
                    "roomId": room_id,
                    "password": ""
                },
                "user": {"username": f"other_user_{uuid.uuid4().hex[:8]}"}
            }
        )
        assert response.status_code in [401, 403]
        
        # Join with correct password
        response = requests.post(
            f"{BACKEND_URL}/rooms/join",
            json={
                "join_data": {
                    "roomId": room_id,
                    "password": room_password
                },
                "user": {"username": f"other_user_{uuid.uuid4().hex[:8]}"}
            }
        )
        assert response.status_code == 200

    def test_game_flow(self):
        """Test game play and scoring"""
        # Create room and add word
        response = requests.post(
            f"{BACKEND_URL}/rooms",
            json={
                "room_data": {
                    "name": self.test_room_name,
                    "isPrivate": False
                },
                "user": {"username": self.test_username}
            }
        )
        room_id = response.json()["roomId"]
        
        # Add test word
        requests.post(
            f"{BACKEND_URL}/rooms/words",
            json={
                "add_data": {
                    "roomId": room_id,
                    "word": self.test_word
                },
                "user": {"username": self.test_username}
            }
        )
        
        # Submit game score
        response = requests.post(
            f"{BACKEND_URL}/scores",
            json={
                "username": self.test_username,
                "won": True,
                "word": self.test_word,
                "attempts": 3,
                "roomId": room_id
            }
        )
        assert response.status_code == 200
        
        # Check room leaderboard
        response = requests.get(f"{BACKEND_URL}/rooms/{room_id}/leaderboard")
        assert response.status_code == 200
        leaderboard = response.json()
        assert len(leaderboard) > 0
        assert any(entry["username"] == self.test_username for entry in leaderboard)

if __name__ == "__main__":
    pytest.main([__file__])