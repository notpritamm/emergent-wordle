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
  const [roomSortOptions, setRoomSortOptions] = useState({
    sortBy: "createdAt",
    sortOrder: "desc"
  });
  const [newRoomData, setNewRoomData] = useState({
    name: "",
    description: "",
    isPrivate: false,
    password: ""
  });
  const [newWordInput, setNewWordInput] = useState("");
  const [socket, setSocket] = useState(null);
  const [gameStartOptions, setGameStartOptions] = useState({
    autoSelectWordCount: 0,
    ownerPlaying: true
  });
  
  // Refs
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Initialize on login
  useEffect(() => {
    const savedUsername = localStorage.getItem("wordleUsername");
    const savedRoomId = localStorage.getItem("wordleRoomId");
    
    if (savedUsername) {
      setUsername(savedUsername);
      handleLogin(savedUsername, true);
      
      // If there was a saved room, try to rejoin it after login
      if (savedRoomId) {
        // We'll handle this after login is successful in the handleLogin function
      }
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
      
      // Reset other players' boards when starting a new game
      setOtherPlayersBoards({});
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
      
      // Handle different message types
      if (message.type === "game_start") {
        // Start the game with the received word
        setTargetWord(message.word);
        setGameState("playing");
        setCurrentView("game");
      } else if (message.type === "game_state") {
        // Resume an existing game
        if (message.active && message.word) {
          setTargetWord(message.word);
          setGameState("playing");
          setCurrentView("game");
        }
      } else if (message.type === "game_update") {
        // Update other player's game board
        if (message.player !== username) {
          setOtherPlayersBoards(prev => ({
            ...prev,
            [message.player]: {
              boardData: message.boardData,
              currentAttempt: message.currentAttempt,
              gameOver: message.gameOver,
              won: message.won
            }
          }));
        }
      } else {
        // Regular chat message
        setRoomMessages(prev => [...prev, message]);
      }
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
        
        // Check if there was a saved room to join
        const savedRoomId = localStorage.getItem("wordleRoomId");
        if (savedRoomId) {
          try {
            // Try to fetch the room details first to see if it exists
            const roomResponse = await fetch(`${BACKEND_URL}/api/rooms/${savedRoomId}`);
            if (roomResponse.ok) {
              // Room exists, attempt to join it
              await joinRoom(savedRoomId);
            } else {
              // Room doesn't exist anymore, clear the saved room
              localStorage.removeItem("wordleRoomId");
            }
          } catch (roomError) {
            console.error("Error rejoining room:", roomError);
            localStorage.removeItem("wordleRoomId");
          }
        }
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
      const queryParams = new URLSearchParams({
        is_public: !showPrivateRooms,
        sort_by: roomSortOptions.sortBy,
        sort_order: roomSortOptions.sortOrder
      });
      
      const response = await fetch(`${BACKEND_URL}/api/rooms?${queryParams}`);
      if (response.ok) {
        const data = await response.json();
        setRooms(data);
      }
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  // Update room sort options
  const updateRoomSort = (sortBy, sortOrder) => {
    setRoomSortOptions({
      sortBy: sortBy || roomSortOptions.sortBy,
      sortOrder: sortOrder || roomSortOptions.sortOrder
    });
  };

  // Toggle public/private rooms
  const toggleRoomType = () => {
    setShowPrivateRooms(!showPrivateRooms);
  };

  useEffect(() => {
    if (isLoggedIn && currentView === "rooms") {
      fetchRooms();
    }
  }, [isLoggedIn, currentView, showPrivateRooms, roomSortOptions]);

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
        const roomData = await fetchRoomDetails(roomId);
        
        // Save the room ID in local storage for session persistence
        localStorage.setItem("wordleRoomId", roomId);
        
        setCurrentView("room");
        connectToRoom(roomId);
        
        // Check if there's an active game in the room
        if (roomData && roomData.gameState && roomData.gameState.active) {
          // Fetch the full game state to see if this user is part of it
          const gameStateResponse = await fetch(`${BACKEND_URL}/api/game/state/${roomId}?username=${username}`);
          if (gameStateResponse.ok) {
            const gameStateData = await gameStateResponse.json();
            
            if (gameStateData.active && gameStateData.currentWord && 
                username in gameStateData.playerStates) {
              // This user is part of an active game, resume it
              setTargetWord(gameStateData.currentWord);
              
              // Load their board if they had one
              const playerState = gameStateData.playerStates[username];
              if (playerState.boardData && playerState.boardData.length > 0) {
                setBoardData(playerState.boardData);
                setCurrentAttempt(playerState.currentAttempt);
              }
              
              // Load other players' boards
              const othersBoards = {};
              for (const [player, state] of Object.entries(gameStateData.playerStates)) {
                if (player !== username && state.boardData) {
                  othersBoards[player] = {
                    boardData: state.boardData,
                    currentAttempt: state.currentAttempt,
                    gameOver: state.completed,
                    won: state.won
                  };
                }
              }
              setOtherPlayersBoards(othersBoards);
              
              // Set game state based on player state
              if (playerState.completed) {
                setGameState(playerState.won ? "won" : "lost");
              } else {
                setGameState("playing");
              }
              
              setCurrentView("game");
            }
          }
        }
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
      localStorage.removeItem("wordleRoomId");
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
      
      // Clear the saved room ID
      localStorage.removeItem("wordleRoomId");
      
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

  // Start a game with a chosen word from the room
  const startGame = async () => {
    if (!currentRoom) return;
    
    try {
      // Check if room has words
      if (!currentRoom.words || currentRoom.words.length === 0) {
        alert("This room has no words yet. Add some words first!");
        return;
      }
      
      // Start the game with server
      const response = await fetch(`${BACKEND_URL}/api/rooms/start-game`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game_data: {
            roomId: currentRoom.id,
            autoSelectWordCount: gameStartOptions.autoSelectWordCount,
            ownerPlaying: gameStartOptions.ownerPlaying
          },
          user: { username }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Game started:", data);
        // Game start will be handled by WebSocket message
      } else {
        const error = await response.json();
        alert(error.detail || "Error starting game");
      }
    } catch (error) {
      console.error("Error starting game:", error);
      alert("Error starting game. Please try again.");
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

  // Update game state on the server
  const updateGameState = async (gameOver = false, won = false) => {
    if (!currentRoom || gameState !== "playing") return;
    
    try {
      await fetch(`${BACKEND_URL}/api/game/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: currentRoom.id,
          username: username,
          boardData: boardData,
          currentAttempt: currentAttempt,
          gameOver: gameOver,
          won: won
        }),
      });
    } catch (error) {
      console.error("Error updating game state:", error);
    }
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
      updateGameState(true, true);
      
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
      updateGameState(true, false);
      
    } else {
      // Continue to next attempt
      setCurrentAttempt(currentAttempt + 1);
      setCurrentRowData(Array(targetWord.length).fill().map(() => ({ letter: "", status: "empty" })));
      
      // Update the game state on the server
      updateGameState();
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
    localStorage.removeItem("wordleRoomId");
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

  // Delete test rooms
  const cleanupTestRooms = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Cleaned up ${data.deletedCount} test rooms`);
        fetchRooms();
      }
    } catch (error) {
      console.error("Error cleaning up test rooms:", error);
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

  // Render other players' boards
  const renderOtherPlayersBoards = () => {
    if (!otherPlayersBoards || Object.keys(otherPlayersBoards).length === 0) {
      return null;
    }
    
    return (
      <div className="other-players-boards">
        <h3>Other Players</h3>
        <div className="other-players-container">
          {Object.entries(otherPlayersBoards).map(([player, state]) => (
            <div key={player} className="other-player-board">
              <h4>{player} {state.gameOver && (state.won ? '✅' : '❌')}</h4>
              <div className="mini-board">
                {state.boardData.map((row, rowIndex) => (
                  <div key={`mini-row-${player}-${rowIndex}`} className="mini-row">
                    {row.map((cell, cellIndex) => (
                      <div 
                        key={`mini-cell-${player}-${rowIndex}-${cellIndex}`}
                        className={`mini-cell ${cell.status}`}
                      >
                        {cell.letter}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render room details
  const renderRoomDetails = () => {
    if (!currentRoom) return null;
    
    const isHost = currentRoom.host === username;
    const gameActive = currentRoom.gameState && currentRoom.gameState.active;
    
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
            {gameActive && (
              <span className="game-status active">
                Game in progress! 🎮
              </span>
            )}
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
            
            {isHost && !gameActive && (
              <div className="game-settings">
                <div className="section-header">
                  <h3>Game Settings</h3>
                </div>
                <div className="settings-form">
                  <div className="form-group checkbox">
                    <input
                      type="checkbox"
                      id="ownerPlaying"
                      checked={gameStartOptions.ownerPlaying}
                      onChange={(e) => setGameStartOptions({
                        ...gameStartOptions,
                        ownerPlaying: e.target.checked
                      })}
                    />
                    <label htmlFor="ownerPlaying">I want to play too</label>
                  </div>
                  <div className="form-group">
                    <label>Auto-select words:</label>
                    <select
                      value={gameStartOptions.autoSelectWordCount}
                      onChange={(e) => setGameStartOptions({
                        ...gameStartOptions,
                        autoSelectWordCount: parseInt(e.target.value) || 0
                      })}
                    >
                      <option value="0">No auto-selection</option>
                      <option value="1">Auto-select 1 word</option>
                      <option value="3">Auto-select 3 words</option>
                      <option value="5">Auto-select 5 words</option>
                      <option value="10">Auto-select 10 words</option>
                    </select>
                    <p className="setting-help">
                      Auto-selection lets the game randomly pick words from your word list
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="room-actions">
              {isHost && !gameActive && (
                <button 
                  className="primary-button" 
                  onClick={startGame}
                  disabled={!currentRoom.words || currentRoom.words.length === 0}
                >
                  Start Game
                </button>
              )}
              {!isHost && gameActive && currentRoom.gameState?.playerStates?.[username] && !currentRoom.gameState.playerStates[username].completed && (
                <button className="primary-button" onClick={() => setCurrentView("game")}>
                  Join Game
                </button>
              )}
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
            
            {isHost && !gameActive && (
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
          <div className="admin-actions">
            <button 
              className="secondary-button cleanup-button" 
              onClick={cleanupTestRooms}
              title="Delete old test rooms"
            >
              🧹 Cleanup Test Rooms
            </button>
          </div>
        </div>
        
        <div className="rooms-filter-bar">
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
          
          <div className="rooms-sort">
            <span>Sort by:</span>
            <select 
              value={roomSortOptions.sortBy}
              onChange={(e) => updateRoomSort(e.target.value, roomSortOptions.sortOrder)}
            >
              <option value="createdAt">Created Date</option>
              <option value="name">Room Name</option>
              <option value="memberCount">Member Count</option>
              <option value="wordCount">Word Count</option>
            </select>
            <button 
              className={`sort-order-button ${roomSortOptions.sortOrder === 'asc' ? 'asc' : 'desc'}`} 
              onClick={() => updateRoomSort(
                roomSortOptions.sortBy, 
                roomSortOptions.sortOrder === 'asc' ? 'desc' : 'asc'
              )}
              title={roomSortOptions.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {roomSortOptions.sortOrder === 'asc' ? '↑' : '↓'}
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
                <div key={room.id} className={`room-card ${room.isTest ? 'test-room' : ''} ${room.gameActive ? 'game-active' : ''}`}>
                  <div className="room-card-header">
                    <h4>{room.name}</h4>
                    <div className="room-badges">
                      <span className={`room-privacy ${room.isPrivate ? 'private' : 'public'}`}>
                        {room.isPrivate ? '🔒 Private' : '🌐 Public'}
                      </span>
                      {room.isTest && (
                        <span className="room-test-badge">TEST</span>
                      )}
                      {room.gameActive && (
                        <span className="room-game-badge">GAME IN PROGRESS</span>
                      )}
                    </div>
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
          <span className="user-display">{username}</span>
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
          
          <div className="game-layout">
            <div className="game-board-container">
              <div className="game-board">
                {boardData.map((row, rowIndex) => (
                  <div key={`row-${rowIndex}`} className={`board-row row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <div 
                        key={`cell-${rowIndex}-${cellIndex}`}
                        className={`cell ${cell.status}`}
                        onClick={() => handleCellClick(rowIndex, cellIndex)}
                      >
                        {rowIndex === currentAttempt && gameState === "playing" ? (
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
            
            <div className="game-sidebar">
              {renderOtherPlayersBoards()}
              
              {/* Game Chat */}
              <div className="game-chat">
                <div className="chat-container game-chat-container">
                  <div className="section-header">
                    <h3>Game Chat</h3>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
