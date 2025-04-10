import { useState, useEffect, useRef } from "react";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 8;
const MAX_ATTEMPTS = 6;

// Sample word list (fallback if no custom words are available)
const wordList = {
  3: ["cat", "dog", "run", "sun", "big", "one", "two", "red", "joy", "box"],
  4: ["word", "play", "love", "time", "game", "book", "code", "blue", "home", "jump"],
  5: ["world", "pizza", "house", "music", "water", "dance", "space", "dream", "peace", "happy"],
  6: ["player", "garden", "studio", "wonder", "coffee", "sunset", "future", "memory", "coding", "planet"],
  7: ["amazing", "dancing", "journey", "playing", "freedom", "gravity", "magical", "rainbow", "society", "destiny"],
  8: ["computer", "learning", "business", "creative", "friendly", "movement", "sunshine", "thinking", "beautiful", "developer"]
};

function App() {
  // User and Auth State
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // App View State
  const [currentView, setCurrentView] = useState("login"); // login, rooms, room, game, leaderboard
  
  // Game State
  const [gameState, setGameState] = useState("waiting"); // waiting, playing, won, lost
  const [targetWord, setTargetWord] = useState("");
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [boardData, setBoardData] = useState([]);
  const [currentRowData, setCurrentRowData] = useState([]);
  const [letterStatus, setLetterStatus] = useState({});
  const [showKeyboard, setShowKeyboard] = useState(true);
  const gridRefs = useRef([]);
  const [otherPlayersBoards, setOtherPlayersBoards] = useState({});
  
  // Game Stats
  const [gameStats, setGameStats] = useState({
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
  });
  
  // Room State
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [showPrivateRooms, setShowPrivateRooms] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [newRoomData, setNewRoomData] = useState({
    name: "",
    description: "",
    isPrivate: false,
    password: ""
  });
  const [newWordInput, setNewWordInput] = useState("");
  const [socket, setSocket] = useState(null);
  
  // Refs
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Initialize on login
  useEffect(() => {
    const savedUsername = localStorage.getItem("wordleUsername");
    if (savedUsername) {
      setUsername(savedUsername);
      handleLogin(savedUsername, true);
    }
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [roomMessages]);

  // Initialize game board
  useEffect(() => {
    if (gameState === "playing" && targetWord) {
      // Initialize board data and current row
      const newBoardData = Array(MAX_ATTEMPTS).fill().map(() => 
        Array(targetWord.length).fill().map(() => ({ letter: "", status: "empty" }))
      );
      
      setBoardData(newBoardData);
      setCurrentRowData(Array(targetWord.length).fill().map(() => ({ letter: "", status: "empty" })));
      setCurrentAttempt(0);
      setLetterStatus({});
      gridRefs.current = Array(MAX_ATTEMPTS).fill().map(() => Array(targetWord.length).fill(null));
    }
  }, [gameState, targetWord]);

  // Save current attempt to board when currentRowData changes
  useEffect(() => {
    if (currentRowData.length > 0 && gameState === "playing") {
      let newBoardData = [...boardData];
      if (newBoardData[currentAttempt]) {
        newBoardData[currentAttempt] = currentRowData;
        setBoardData(newBoardData);
      }
    }
  }, [currentRowData]);

  // Connect to WebSocket for room chat
  const connectToRoom = (roomId) => {
    if (socket) {
      socket.close();
    }
    
    const newSocket = new WebSocket(`${BACKEND_URL.replace('http', 'ws')}/api/ws/${roomId}?username=${username}`);
    
    newSocket.onopen = () => {
      console.log("WebSocket connected");
    };
    
    newSocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setRoomMessages(prev => [...prev, message]);
    };
    
    newSocket.onclose = () => {
      console.log("WebSocket disconnected");
    };
    
    setSocket(newSocket);
  };

  // Send chat message
  const sendMessage = () => {
    if (!messageInput.trim() || !socket) return;
    
    const message = {
      content: messageInput.trim(),
      sender: username
    };
    
    socket.send(JSON.stringify(message));
    setMessageInput("");
    
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  // Handle login
  const handleLogin = async (name = username, autoLogin = false) => {
    if (!name.trim()) {
      alert("Please enter a username");
      return;
    }
    
    try {
      // Save username to local storage
      localStorage.setItem("wordleUsername", name);
      
      // Register user in backend (if not exists)
      const response = await fetch(`${BACKEND_URL}/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: name }),
      });
      
      if (response.ok) {
        setUsername(name);
        setIsLoggedIn(true);
        setCurrentView("rooms");
        loadUserStats(name);
        fetchRooms();
      } else {
        alert("Error logging in. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      if (autoLogin) {
        // Silent fail for auto-login
        return;
      }
      alert("Error connecting to server. Please try again.");
    }
  };

  // Load user stats
  const loadUserStats = (name) => {
    const savedStats = localStorage.getItem(`wordleStats_${name}`);
    if (savedStats) {
      setGameStats(JSON.parse(savedStats));
    }
  };

  // Save user stats
  const saveUserStats = (newStats) => {
    localStorage.setItem(`wordleStats_${username}`, JSON.stringify(newStats));
    setGameStats(newStats);
  };

  // Fetch room list
  const fetchRooms = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms?is_public=${!showPrivateRooms}`);
      if (response.ok) {
        const data = await response.json();
        setRooms(data);
      }
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  // Toggle public/private rooms
  const toggleRoomType = () => {
    setShowPrivateRooms(!showPrivateRooms);
  };

  useEffect(() => {
    if (isLoggedIn && currentView === "rooms") {
      fetchRooms();
    }
  }, [isLoggedIn, currentView, showPrivateRooms]);

  // Create a new room
  const createRoom = async () => {
    if (!newRoomData.name.trim()) {
      alert("Please enter a room name");
      return;
    }
    
    // Validate password for private rooms
    if (newRoomData.isPrivate && !newRoomData.password.trim()) {
      alert("Private rooms require a password");
      return;
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_data: newRoomData,
          user: { username }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        // Reset form
        setNewRoomData({
          name: "",
          description: "",
          isPrivate: false,
          password: ""
        });
        
        // Join the new room
        await joinRoom(data.roomId);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.detail || "Error creating room. Please try again.");
      }
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Error creating room. Please try again.");
    }
  };

  // Join a room
  const joinRoom = async (roomId, password = "") => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          join_data: {
            roomId,
            password
          },
          user: { username }
        }),
      });
      
      if (response.ok) {
        await fetchRoomDetails(roomId);
        setCurrentView("room");
        connectToRoom(roomId);
      } else {
        const error = await response.json();
        alert(error.detail || "Error joining room");
      }
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Error joining room. Please try again.");
    }
  };

  // Fetch room details
  const fetchRoomDetails = async (roomId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms/${roomId}`);
      if (response.ok) {
        const roomData = await response.json();
        setCurrentRoom(roomData);
        setRoomMessages(roomData.messages || []);
        return roomData;
      } else {
        throw new Error("Failed to fetch room details");
      }
    } catch (error) {
      console.error("Error fetching room details:", error);
      alert("Error loading room. Please try again.");
      setCurrentView("rooms");
      return null;
    }
  };

  // Leave room
  const leaveRoom = async () => {
    if (!currentRoom) return;
    
    try {
      await fetch(`${BACKEND_URL}/api/rooms/${currentRoom.id}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      
      // Close WebSocket
      if (socket) {
        socket.close();
        setSocket(null);
      }
      
      setCurrentRoom(null);
      setRoomMessages([]);
      setCurrentView("rooms");
      fetchRooms();
      
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  };

  // Add word to room
  const addWord = async () => {
    if (!newWordInput.trim() || !currentRoom) {
      alert("Please enter a valid word");
      return;
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms/words`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          add_data: {
            roomId: currentRoom.id,
            word: newWordInput.trim()
          },
          user: { username }
        }),
      });
      
      if (response.ok) {
        setNewWordInput("");
        await fetchRoomDetails(currentRoom.id);
      } else {
        const error = await response.json();
        alert(error.detail || "Error adding word");
      }
    } catch (error) {
      console.error("Error adding word:", error);
      alert("Error adding word. Please try again.");
    }
  };

  // Remove word from room
  const removeWord = async (word) => {
    if (!currentRoom) return;
    
    try {
      await fetch(`${BACKEND_URL}/api/rooms/${currentRoom.id}/words/${word}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: { username }
        }),
      });
      
      await fetchRoomDetails(currentRoom.id);
      
    } catch (error) {
      console.error("Error removing word:", error);
      alert("Error removing word. Please try again.");
    }
  };

  // Manage room members
  const manageMember = async (memberUsername, action) => {
    if (!currentRoom) return;
    
    try {
      await fetch(`${BACKEND_URL}/api/rooms/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_data: {
            roomId: currentRoom.id,
            username: memberUsername,
            action
          },
          user: { username }
        }),
      });
      
      await fetchRoomDetails(currentRoom.id);
      
    } catch (error) {
      console.error(`Error ${action}ing member:`, error);
      alert(`Error ${action}ing member. Please try again.`);
    }
  };

  // Start a game with a random word from the room
  const startGame = async () => {
    if (!currentRoom) return;
    
    try {
      // Check if room has words
      if (!currentRoom.words || currentRoom.words.length === 0) {
        alert("This room has no words yet. Add some words first!");
        return;
      }
      
      // Get a random word from the room
      const response = await fetch(`${BACKEND_URL}/api/rooms/${currentRoom.id}/words`);
      if (response.ok) {
        const data = await response.json();
        setTargetWord(data.word);
        setGameState("playing");
        setCurrentView("game");
      } else {
        throw new Error("Failed to get a word");
      }
    } catch (error) {
      console.error("Error starting game:", error);
      
      // Fallback to sample word list
      const wordLength = Math.floor(Math.random() * (MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1)) + MIN_WORD_LENGTH;
      const randomIndex = Math.floor(Math.random() * wordList[wordLength].length);
      const newTargetWord = wordList[wordLength][randomIndex].toUpperCase();
      setTargetWord(newTargetWord);
      setGameState("playing");
      setCurrentView("game");
    }
  };

  // Update leaderboard with new score
  const updateLeaderboard = async (won) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/scores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username, 
          won, 
          word: targetWord,
          attempts: currentAttempt + 1,
          roomId: currentRoom ? currentRoom.id : null
        }),
      });
      
      if (!response.ok) {
        console.error("Error updating score");
      }
    } catch (error) {
      console.error("Error updating score:", error);
    }
  };

  // Fetch room leaderboard
  const fetchRoomLeaderboard = async (roomId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/leaderboard`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Error fetching room leaderboard:", error);
      return [];
    }
  };

  // Handle keyboard input
  const handleKeyPress = (key) => {
    if (gameState !== "playing") return;
    
    if (key === "ENTER") {
      checkWord();
    } else if (key === "BACKSPACE" || key === "⌫") {
      deleteLetter();
    } else if (/^[A-Z]$/.test(key)) {
      addLetter(key);
    }
  };

  // Add letter to current position
  const addLetter = (letter) => {
    const emptyIndex = currentRowData.findIndex(cell => cell.letter === "");
    if (emptyIndex !== -1) {
      const newRow = [...currentRowData];
      newRow[emptyIndex] = { letter, status: "filled" };
      setCurrentRowData(newRow);
    }
  };

  // Delete letter from last occupied position
  const deleteLetter = () => {
    // Find the last filled position
    let lastFilledIndex = currentRowData.length - 1;
    while (lastFilledIndex >= 0 && currentRowData[lastFilledIndex].letter === "") {
      lastFilledIndex--;
    }
    
    if (lastFilledIndex >= 0) {
      const newRow = [...currentRowData];
      newRow[lastFilledIndex] = { letter: "", status: "empty" };
      setCurrentRowData(newRow);
    }
  };

  // Handle direct cell click to focus and enable input
  const handleCellClick = (rowIndex, cellIndex) => {
    if (rowIndex !== currentAttempt || gameState !== "playing") return;
    
    // Set focus to the clicked cell
    if (gridRefs.current[rowIndex] && gridRefs.current[rowIndex][cellIndex]) {
      gridRefs.current[rowIndex][cellIndex].focus();
    }
  };

  // Handle cell input directly
  const handleCellInput = (rowIndex, cellIndex, letter) => {
    if (rowIndex !== currentAttempt || gameState !== "playing") return;
    
    const newRow = [...currentRowData];
    
    // Only accept letter inputs
    if (/^[A-Za-z]$/.test(letter)) {
      newRow[cellIndex] = { letter: letter.toUpperCase(), status: "filled" };
      setCurrentRowData(newRow);
      
      // Auto-advance to next cell
      if (cellIndex < targetWord.length - 1 && gridRefs.current[rowIndex][cellIndex + 1]) {
        gridRefs.current[rowIndex][cellIndex + 1].focus();
      }
    }
  };

  // Check the current word
  const checkWord = () => {
    // Check if all cells in the current row are filled
    const isRowComplete = currentRowData.every(cell => cell.letter !== "");
    if (!isRowComplete) {
      alert("Please fill all the letters first");
      return;
    }

    // Check if the word matches the target
    const currentWord = currentRowData.map(cell => cell.letter).join("");
    
    // Evaluate each letter
    const newRowData = [...currentRowData];
    const letterCount = {};
    
    // Count letters in target word
    for (const letter of targetWord) {
      letterCount[letter] = (letterCount[letter] || 0) + 1;
    }
    
    // First, mark correct positions (green)
    for (let i = 0; i < targetWord.length; i++) {
      if (newRowData[i].letter === targetWord[i]) {
        newRowData[i].status = "correct";
        letterCount[newRowData[i].letter]--;
      }
    }
    
    // Then mark present letters in wrong positions (yellow)
    for (let i = 0; i < targetWord.length; i++) {
      if (newRowData[i].status !== "correct") {
        if (targetWord.includes(newRowData[i].letter) && letterCount[newRowData[i].letter] > 0) {
          newRowData[i].status = "present";
          letterCount[newRowData[i].letter]--;
        } else {
          newRowData[i].status = "absent";
        }
      }
    }
    
    // Update keyboard letter status
    const newLetterStatus = { ...letterStatus };
    newRowData.forEach(cell => {
      // Only upgrade status (absent -> present -> correct)
      if (!newLetterStatus[cell.letter] || 
          (newLetterStatus[cell.letter] === "absent" && cell.status !== "absent") ||
          (newLetterStatus[cell.letter] === "present" && cell.status === "correct")) {
        newLetterStatus[cell.letter] = cell.status;
      }
    });
    setLetterStatus(newLetterStatus);
    
    // Update board with the new statuses
    const newBoardData = [...boardData];
    newBoardData[currentAttempt] = newRowData;
    setBoardData(newBoardData);
    
    // Animate the reveal
    revealRow(currentAttempt);
  };

  // Animate row reveal
  const revealRow = async (rowIndex) => {
    const row = document.querySelectorAll(`.row-${rowIndex} .cell`);
    
    // Sequentially flip each cell
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      cell.classList.add("flipping");
      
      // Wait for animation to complete before flipping next cell
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // After all animations complete, check game state
    setTimeout(() => {
      checkGameState();
    }, 500);
  };

  // Check if game is won or lost
  const checkGameState = () => {
    const currentWord = boardData[currentAttempt].map(cell => cell.letter).join("");
    
    if (currentWord === targetWord) {
      // Game won
      setGameState("won");
      
      // Update stats
      const newStats = {
        ...gameStats,
        played: gameStats.played + 1,
        won: gameStats.won + 1,
        currentStreak: gameStats.currentStreak + 1,
        maxStreak: Math.max(gameStats.maxStreak, gameStats.currentStreak + 1)
      };
      saveUserStats(newStats);
      updateLeaderboard(true);
      
    } else if (currentAttempt >= MAX_ATTEMPTS - 1) {
      // Game lost (used all attempts)
      setGameState("lost");
      
      // Update stats
      const newStats = {
        ...gameStats,
        played: gameStats.played + 1,
        currentStreak: 0
      };
      saveUserStats(newStats);
      updateLeaderboard(false);
      
    } else {
      // Continue to next attempt
      setCurrentAttempt(currentAttempt + 1);
      setCurrentRowData(Array(targetWord.length).fill().map(() => ({ letter: "", status: "empty" })));
    }
  };

  // Share results
  const shareResults = () => {
    const roomName = currentRoom ? ` (${currentRoom.name})` : '';
    let result = `Wordle${roomName}: ${currentAttempt + 1}/${MAX_ATTEMPTS}\n\n`;
    
    // Create emoji grid
    for (let i = 0; i <= currentAttempt; i++) {
      for (let j = 0; j < targetWord.length; j++) {
        if (boardData[i][j].status === "correct") {
          result += "🟩";
        } else if (boardData[i][j].status === "present") {
          result += "🟨";
        } else {
          result += "⬛";
        }
      }
      result += "\n";
    }
    
    // Copy to clipboard
    navigator.clipboard.writeText(result).then(() => {
      alert("Results copied to clipboard!");
    }).catch(err => {
      console.error("Could not copy text: ", err);
    });
  };

  // Return to room from game
  const returnToRoom = () => {
    setGameState("waiting");
    setCurrentView("room");
  };

  // Logout user
  const handleLogout = () => {
    localStorage.removeItem("wordleUsername");
    setUsername("");
    setIsLoggedIn(false);
    setCurrentView("login");
    setCurrentRoom(null);
    setRoomMessages([]);
    
    // Close WebSocket
    if (socket) {
      socket.close();
      setSocket(null);
    }
  };

  // Render keyboard
  const renderKeyboard = () => {
    const keyboard = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
    ];
    
    return (
      <div className="keyboard">
        {keyboard.map((row, rowIndex) => (
          <div key={`keyboard-row-${rowIndex}`} className="keyboard-row">
            {row.map(key => (
              <button 
                key={`key-${key}`}
                className={`keyboard-key ${key.length > 1 ? "special-key" : ""} ${
                  letterStatus[key] ? `key-${letterStatus[key]}` : ""
                }`}
                onClick={() => handleKeyPress(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };

  // Render room details
  const renderRoomDetails = () => {
    if (!currentRoom) return null;
    
    const isHost = currentRoom.host === username;
    
    return (
      <div className="room-container">
        <div className="room-header">
          <h2>{currentRoom.name}</h2>
          <p className="room-description">{currentRoom.description}</p>
          <div className="room-meta">
            <span className="room-privacy">
              {currentRoom.isPrivate ? "Private Room 🔒" : "Public Room 🌐"}
            </span>
            <span className="room-host">
              Host: {currentRoom.host}
            </span>
          </div>
        </div>
        
        <div className="room-content">
          <div className="room-sidebar">
            <div className="section-header">
              <h3>Members ({currentRoom.members?.length || 0})</h3>
            </div>
            <div className="members-list">
              {currentRoom.members?.map(member => (
                <div key={member} className="member-item">
                  <span className={`member-name ${member === currentRoom.host ? 'host' : ''}`}>
                    {member} {member === currentRoom.host && "👑"}
                    {member === username && " (You)"}
                  </span>
                  {isHost && member !== username && (
                    <button 
                      className="member-action" 
                      onClick={() => manageMember(member, "remove")}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="room-actions">
              <button className="primary-button" onClick={startGame}>
                Play Game
              </button>
              <button className="secondary-button" onClick={leaveRoom}>
                Leave Room
              </button>
            </div>
          </div>
          
          <div className="room-main">
            <div className="chat-container">
              <div className="section-header">
                <h3>Room Chat</h3>
              </div>
              <div className="messages-container">
                {roomMessages.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`message ${msg.sender === username ? 'own-message' : ''} ${msg.type === 'system' ? 'system-message' : ''}`}
                  >
                    {msg.type !== 'system' && <span className="message-sender">{msg.sender}</span>}
                    <span className="message-content">{msg.content}</span>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  ref={chatInputRef}
                />
                <button className="chat-send-button" onClick={sendMessage}>
                  Send
                </button>
              </div>
            </div>
            
            {isHost && (
              <div className="word-management">
                <div className="section-header">
                  <h3>Word Management</h3>
                </div>
                <div className="word-input-container">
                  <input
                    type="text"
                    className="word-input"
                    placeholder="Add a new word..."
                    value={newWordInput}
                    onChange={(e) => setNewWordInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addWord()}
                  />
                  <button className="word-add-button" onClick={addWord}>
                    Add Word
                  </button>
                </div>
                <div className="word-list">
                  <h4>Current Words ({currentRoom.words?.length || 0})</h4>
                  <div className="words-grid">
                    {currentRoom.words?.map(wordObj => (
                      <div key={wordObj.word} className="word-item">
                        <span className="word-text">{wordObj.word}</span>
                        <button 
                          className="word-remove-button" 
                          onClick={() => removeWord(wordObj.word)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render room list
  const renderRoomList = () => {
    return (
      <div className="rooms-container">
        <div className="rooms-header">
          <h2>Game Rooms</h2>
          <div className="rooms-filter">
            <button 
              className={`filter-button ${!showPrivateRooms ? 'active' : ''}`} 
              onClick={() => setShowPrivateRooms(false)}
            >
              Public Rooms
            </button>
            <button 
              className={`filter-button ${showPrivateRooms ? 'active' : ''}`} 
              onClick={() => setShowPrivateRooms(true)}
            >
              Private Rooms
            </button>
          </div>
        </div>
        
        <div className="create-room">
          <h3>Create New Room</h3>
          <div className="create-room-form">
            <div className="form-group">
              <label>Room Name:</label>
              <input
                type="text"
                value={newRoomData.name}
                onChange={(e) => setNewRoomData({...newRoomData, name: e.target.value})}
                placeholder="Enter room name"
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <input
                type="text"
                value={newRoomData.description}
                onChange={(e) => setNewRoomData({...newRoomData, description: e.target.value})}
                placeholder="Short description (optional)"
              />
            </div>
            <div className="form-group checkbox">
              <input
                type="checkbox"
                id="isPrivate"
                checked={newRoomData.isPrivate}
                onChange={(e) => setNewRoomData({...newRoomData, isPrivate: e.target.checked})}
              />
              <label htmlFor="isPrivate">Private Room</label>
            </div>
            {newRoomData.isPrivate && (
              <div className="form-group">
                <label>Password:</label>
                <input
                  type="password"
                  value={newRoomData.password}
                  onChange={(e) => setNewRoomData({...newRoomData, password: e.target.value})}
                  placeholder="Room password"
                />
              </div>
            )}
            <button className="create-room-button" onClick={createRoom}>
              Create Room
            </button>
          </div>
        </div>
        
        <div className="rooms-list">
          <h3>{showPrivateRooms ? 'Private Rooms' : 'Public Rooms'}</h3>
          {rooms.length === 0 ? (
            <p className="no-rooms">No rooms available. Create one!</p>
          ) : (
            <div className="room-cards">
              {rooms.map(room => (
                <div key={room.id} className="room-card">
                  <div className="room-card-header">
                    <h4>{room.name}</h4>
                    <span className={`room-privacy ${room.isPrivate ? 'private' : 'public'}`}>
                      {room.isPrivate ? '🔒 Private' : '🌐 Public'}
                    </span>
                  </div>
                  {room.description && (
                    <p className="room-card-description">{room.description}</p>
                  )}
                  <div className="room-card-meta">
                    <span>Host: {room.host}</span>
                    <span>Members: {room.memberCount}</span>
                    <span>Words: {room.wordCount}</span>
                  </div>
                  {room.isPrivate ? (
                    <div className="room-card-password">
                      <input
                        type="password"
                        placeholder="Enter room password"
                        value={room.id === roomPassword.id ? roomPassword.password : ''}
                        onChange={(e) => setRoomPassword({id: room.id, password: e.target.value})}
                        onKeyPress={(e) => e.key === "Enter" && joinRoom(room.id, roomPassword.password)}
                      />
                      <button 
                        className="join-room-button" 
                        onClick={() => joinRoom(room.id, roomPassword.password)}
                      >
                        Join
                      </button>
                    </div>
                  ) : (
                    <button 
                      className="join-room-button" 
                      onClick={() => joinRoom(room.id)}
                    >
                      Join Room
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render login screen
  if (currentView === "login") {
    return (
      <div className="wordle-app">
        <h1 className="title">WORDLE ROOMS</h1>
        <div className="login-container">
          <h2>Enter your username to play</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="username-input"
            onKeyPress={(e) => e.key === "Enter" && handleLogin()}
          />
          <button className="login-button" onClick={() => handleLogin()}>
            Play
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wordle-app">
      <header>
        <div className="header-left">
          {currentView !== "rooms" && (
            <button 
              className="menu-button" 
              onClick={() => {
                if (currentView === "game") {
                  if (gameState === "playing" && !confirm("Are you sure you want to quit the current game?")) {
                    return;
                  }
                  returnToRoom();
                } else {
                  setCurrentView("rooms");
                }
              }}
            >
              {currentView === "game" ? "Back to Room" : "Back to Rooms"}
            </button>
          )}
        </div>
        <h1 className="title">WORDLE ROOMS</h1>
        <div className="header-right">
          <button className="menu-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {currentView === "rooms" && renderRoomList()}
      
      {currentView === "room" && renderRoomDetails()}
      
      {currentView === "game" && (
        <div className="game-container">
          <div className="game-header">
            {currentRoom && (
              <h3>Playing in {currentRoom.name}</h3>
            )}
          </div>
          
          <div className="game-board">
            {boardData.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className={`board-row row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <div 
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className={`cell ${cell.status}`}
                    onClick={() => handleCellClick(rowIndex, cellIndex)}
                  >
                    {rowIndex === currentAttempt ? (
                      <input
                        ref={el => {
                          if (gridRefs.current[rowIndex]) {
                            gridRefs.current[rowIndex][cellIndex] = el;
                          }
                        }}
                        type="text"
                        maxLength="1"
                        value={cell.letter}
                        onChange={(e) => handleCellInput(rowIndex, cellIndex, e.target.value)}
                        disabled={gameState !== "playing" || rowIndex !== currentAttempt}
                        className="cell-input"
                      />
                    ) : (
                      <span>{cell.letter}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          
          {gameState === "won" && (
            <div className="game-message success">
              <h2>Congratulations!</h2>
              <p>You guessed the word in {currentAttempt + 1} attempts.</p>
              <div className="button-group">
                <button onClick={shareResults}>Share Results</button>
                <button onClick={returnToRoom}>Back to Room</button>
              </div>
            </div>
          )}
          
          {gameState === "lost" && (
            <div className="game-message failure">
              <h2>Game Over</h2>
              <p>The word was: {targetWord}</p>
              <div className="button-group">
                <button onClick={shareResults}>Share Results</button>
                <button onClick={returnToRoom}>Back to Room</button>
              </div>
            </div>
          )}
          
          {gameState === "playing" && renderKeyboard()}
          
          <div className="game-info">
            <p>Guess the {targetWord.length}-letter WORD in {MAX_ATTEMPTS} tries</p>
            <p>
              <span className="color-box correct"></span> Correct letter, correct position
            </p>
            <p>
              <span className="color-box present"></span> Correct letter, wrong position
            </p>
            <p>
              <span className="color-box absent"></span> Letter not in word
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
