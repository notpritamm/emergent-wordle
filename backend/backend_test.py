import requests
import pytest
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WordleAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.test_users = {}
        self.test_rooms = {}

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = headers or {'Content-Type': 'application/json'}
        
        logger.info(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                logger.info(f"✅ {name} - Passed")
                return True, response.json() if response.content else {}
            else:
                logger.error(f"❌ {name} - Failed. Expected {expected_status}, got {response.status_code}")
                logger.error(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            logger.error(f"❌ {name} - Error: {str(e)}")
            return False, {}

    def test_user_login(self, username):
        """Test user login functionality"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "users/login",
            200,
            data={"username": username}
        )
        if success:
            self.test_users[username] = response
        return success

    def test_create_room(self, room_name, username, is_private=False, password=None):
        """Test room creation"""
        data = {
            "user": {"username": username},
            "name": room_name,
            "isPrivate": is_private,
            "password": password,
            "description": f"Test room created by {username}"
        }
        
        success, response = self.run_test(
            f"Create Room ({room_name})",
            "POST",
            "rooms",
            200,
            data=data
        )
        
        if success:
            self.test_rooms[room_name] = response
        return success

    def test_join_room(self, room_id, username, password=None):
        """Test joining a room"""
        data = {
            "user": {"username": username},
            "roomId": room_id,
            "password": password
        }
        
        return self.run_test(
            f"Join Room ({room_id})",
            "POST",
            "rooms/join",
            200,
            data=data
        )[0]

    def test_add_word(self, room_id, word, username):
        """Test adding a word to a room"""
        data = {
            "user": {"username": username},
            "roomId": room_id,
            "word": word
        }
        
        return self.run_test(
            f"Add Word ({word})",
            "POST",
            "rooms/words",
            200,
            data=data
        )[0]

    def test_remove_word(self, room_id, word, username):
        """Test removing a word from a room"""
        data = {
            "user": {"username": username}
        }
        
        return self.run_test(
            f"Remove Word ({word})",
            "DELETE",
            f"rooms/{room_id}/words/{word}",
            200,
            data=data
        )[0]

    def test_get_rooms(self, is_public=True):
        """Test getting room list"""
        success, response = self.run_test(
            "Get Rooms",
            "GET",
            f"rooms?is_public={str(is_public).lower()}",
            200
        )
        return success, response

def main():
    # Initialize tester with backend URL
    base_url = "https://wordle-backend-3kgv.onrender.com"  # Using the public endpoint
    tester = WordleAPITester(base_url)
    
    # Test variables
    timestamp = datetime.now().strftime('%H%M%S')
    test_user1 = f"test_user1_{timestamp}"
    test_user2 = f"test_user2_{timestamp}"
    test_room_public = f"test_room_public_{timestamp}"
    test_room_private = f"test_room_private_{timestamp}"
    
    tests_passed = 0
    total_tests = 0

    try:
        # 1. Test user login
        total_tests += 2
        if tester.test_user_login(test_user1):
            tests_passed += 1
            logger.info("✅ User 1 login successful")
        if tester.test_user_login(test_user2):
            tests_passed += 1
            logger.info("✅ User 2 login successful")

        # 2. Test room creation
        total_tests += 2
        if tester.test_create_room(test_room_public, test_user1):
            tests_passed += 1
            logger.info("✅ Public room creation successful")
        if tester.test_create_room(test_room_private, test_user1, True, "test123"):
            tests_passed += 1
            logger.info("✅ Private room creation successful")

        # Get room IDs
        success, rooms = tester.test_get_rooms()
        if success:
            public_room = next((r for r in rooms if r['name'] == test_room_public), None)
            if public_room:
                # 3. Test joining rooms
                total_tests += 2
                if tester.test_join_room(public_room['id'], test_user2):
                    tests_passed += 1
                    logger.info("✅ Joining public room successful")
                
                # 4. Test word management
                total_tests += 2
                if tester.test_add_word(public_room['id'], "TEST", test_user1):
                    tests_passed += 1
                    logger.info("✅ Adding word successful")
                if tester.test_remove_word(public_room['id'], "TEST", test_user1):
                    tests_passed += 1
                    logger.info("✅ Removing word successful")

        # Print summary
        logger.info(f"\n📊 Test Summary:")
        logger.info(f"Tests Passed: {tests_passed}/{total_tests}")
        
        return tests_passed == total_tests

    except Exception as e:
        logger.error(f"❌ Test suite error: {str(e)}")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
