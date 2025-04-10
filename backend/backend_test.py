import requests
import unittest
from datetime import datetime

class WordleRoomsAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.current_room_id = None
        self.username = f"test_user_{datetime.now().strftime('%H%M%S')}"

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                return True, response.json() if response.text else {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "users/login",
            200,
            {"username": self.username}
        )
        return success

    def test_create_room(self):
        """Test room creation"""
        room_data = {
            "room_data": {
                "name": f"Test Room {datetime.now().strftime('%H%M%S')}",
                "description": "Test room description",
                "isPrivate": False,
                "password": None
            },
            "user": {"username": self.username}
        }
        
        success, response = self.run_test(
            "Create Room",
            "POST",
            "rooms",
            200,
            room_data
        )
        
        if success and response.get('roomId'):
            self.current_room_id = response['roomId']
            return True
        return False

    def test_join_room(self):
        """Test joining a room"""
        if not self.current_room_id:
            print("❌ No room ID available for joining")
            return False
            
        join_data = {
            "join_data": {
                "roomId": self.current_room_id,
                "password": None
            },
            "user": {"username": self.username}
        }
        
        success, _ = self.run_test(
            "Join Room",
            "POST",
            "rooms/join",
            200,
            join_data
        )
        return success

    def test_add_word(self):
        """Test adding a word to room"""
        if not self.current_room_id:
            print("❌ No room ID available for adding word")
            return False
            
        word_data = {
            "add_data": {
                "roomId": self.current_room_id,
                "word": "TESTING"
            },
            "user": {"username": self.username}
        }
        
        success, _ = self.run_test(
            "Add Word",
            "POST",
            "rooms/words",
            200,
            word_data
        )
        return success

    def test_get_random_word(self):
        """Test getting a random word from room"""
        if not self.current_room_id:
            print("❌ No room ID available for getting word")
            return False
            
        success, response = self.run_test(
            "Get Random Word",
            "GET",
            f"rooms/{self.current_room_id}/words",
            200
        )
        return success and 'word' in response

    def test_leave_room(self):
        """Test leaving a room"""
        if not self.current_room_id:
            print("❌ No room ID available for leaving")
            return False
            
        success, _ = self.run_test(
            "Leave Room",
            "POST",
            f"rooms/{self.current_room_id}/leave",
            200,
            {"user": {"username": self.username}}
        )
        return success

def main():
    # Get backend URL from frontend .env file
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    backend_url = line.strip().split('=')[1].strip('"').strip("'")
                    break
    except Exception as e:
        print(f"Error reading backend URL: {e}")
        return 1

    print(f"\n🚀 Starting Wordle Rooms API Tests using {backend_url}")
    tester = WordleRoomsAPITester(backend_url)

    # Run tests in sequence
    if not tester.test_login():
        print("❌ Login failed, stopping tests")
        return 1

    if not tester.test_create_room():
        print("❌ Room creation failed, stopping tests")
        return 1

    if not tester.test_join_room():
        print("❌ Room joining failed, stopping tests")
        return 1

    if not tester.test_add_word():
        print("❌ Adding word failed, stopping tests")
        return 1

    if not tester.test_get_random_word():
        print("❌ Getting random word failed, stopping tests")
        return 1

    if not tester.test_leave_room():
        print("❌ Leaving room failed")

    # Print results
    print(f"\n📊 Tests Summary:")
    print(f"Total tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    exit(main())