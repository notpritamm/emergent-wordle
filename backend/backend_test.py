import unittest
import requests
import os
from datetime import datetime

class WordleRoomsTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.test_user = f"test_user_{datetime.now().strftime('%H%M%S')}"
        self.test_room_name = f"test_room_{datetime.now().strftime('%H%M%S')}"
        self.test_word = "HELLO"

    def test_login(self):
        """Test user login"""
        print("\n🔍 Testing login...")
        try:
            response = requests.post(
                f"{self.base_url}/api/users/login",
                json={"username": self.test_user}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            assert data["username"] == self.test_user
            print("✅ Login successful")
            return True
        except Exception as e:
            print(f"❌ Login failed: {str(e)}")
            return False

    def test_create_room(self):
        """Test room creation"""
        print("\n🔍 Testing room creation...")
        try:
            response = requests.post(
                f"{self.base_url}/api/rooms",
                json={
                    "room_data": {
                        "name": self.test_room_name,
                        "isPrivate": False,
                        "description": "Test room for automated testing"
                    },
                    "user": {"username": self.test_user}
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            assert data["name"] == self.test_room_name
            print("✅ Room creation successful")
            return data["roomId"]
        except Exception as e:
            print(f"❌ Room creation failed: {str(e)}")
            return None

    def test_add_word(self, room_id):
        """Test adding a word to the room"""
        print("\n🔍 Testing word addition...")
        try:
            response = requests.post(
                f"{self.base_url}/api/rooms/words",
                json={
                    "add_data": {
                        "roomId": room_id,
                        "word": self.test_word
                    },
                    "user": {"username": self.test_user}
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            assert data["word"] == self.test_word
            print("✅ Word addition successful")
            return True
        except Exception as e:
            print(f"❌ Word addition failed: {str(e)}")
            return False

    def test_start_game(self, room_id):
        """Test starting a game"""
        print("\n🔍 Testing game start...")
        try:
            response = requests.post(
                f"{self.base_url}/api/rooms/start-game",
                json={
                    "game_data": {
                        "roomId": room_id,
                        "autoSelectWordCount": 0,
                        "ownerPlaying": True
                    },
                    "user": {"username": self.test_user}
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            print("✅ Game start successful")
            return True
        except Exception as e:
            print(f"❌ Game start failed: {str(e)}")
            return False

    def test_room_sorting(self):
        """Test room sorting functionality"""
        print("\n🔍 Testing room sorting...")
        try:
            # Test different sort options
            sort_options = ["createdAt", "name", "memberCount", "wordCount"]
            for sort_by in sort_options:
                response = requests.get(
                    f"{self.base_url}/api/rooms",
                    params={"sort_by": sort_by, "sort_order": "desc"}
                )
                assert response.status_code == 200
                print(f"✅ Room sorting by {sort_by} successful")
            return True
        except Exception as e:
            print(f"❌ Room sorting failed: {str(e)}")
            return False

    def test_cleanup_test_rooms(self):
        """Test cleanup of test rooms"""
        print("\n🔍 Testing test room cleanup...")
        try:
            response = requests.delete(f"{self.base_url}/api/rooms/test")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            print(f"✅ Cleanup successful - Deleted {data['deletedCount']} test rooms")
            return True
        except Exception as e:
            print(f"❌ Cleanup failed: {str(e)}")
            return False

def main():
    # Get backend URL from frontend .env file
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if 'REACT_APP_BACKEND_URL' in line:
                backend_url = line.split('=')[1].strip()
                break

    print(f"Testing against backend URL: {backend_url}")
    tester = WordleRoomsTester(backend_url)
    
    # Run tests
    if not tester.test_login():
        print("❌ Login failed, stopping tests")
        return 1

    room_id = tester.test_create_room()
    if not room_id:
        print("❌ Room creation failed, stopping tests")
        return 1

    if not tester.test_add_word(room_id):
        print("❌ Word addition failed, stopping tests")
        return 1

    if not tester.test_start_game(room_id):
        print("❌ Game start failed, stopping tests")
        return 1

    if not tester.test_room_sorting():
        print("❌ Room sorting failed")

    if not tester.test_cleanup_test_rooms():
        print("❌ Test room cleanup failed")

    print("\n✅ All backend tests completed!")
    return 0

if __name__ == "__main__":
    exit(main())