import { useState, useEffect, useRef } from "react";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 8;
const MAX_ATTEMPTS = 6;

// Sample word list (would be fetched from API in production)
const wordList = {
  3: ["cat", "dog", "run", "sun", "big", "one", "two", "red", "joy", "box"],
  4: ["word", "play", "love", "time", "game", "book", "code", "blue", "home", "jump"],
  5: ["world", "pizza", "house", "music", "water", "dance", "space", "dream", "peace", "happy"],
  6: ["player", "garden", "studio", "wonder", "coffee", "sunset", "future", "memory", "coding", "planet"],
  7: ["amazing", "dancing", "journey", "playing", "freedom", "gravity", "magical", "rainbow", "society", "destiny"],
  8: ["computer", "learning", "business", "creative", "friendly", "movement", "sunshine", "thinking", "beautiful", "developer"]
};

function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [gameState, setGameState] = useState("login"); // login, playing, won, lost
  const [leaderboard, setLeaderboard] = useState([]);
  const [targetWord, setTargetWord] = useState("");
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [boardData, setBoardData] = useState([]);
  const [currentRowData, setCurrentRowData] = useState([]);
  const [gameStats, setGameStats] = useState({
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
  });
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [letterStatus, setLetterStatus] = useState({});
  const gridRefs = useRef([]);
  
  // Initialize game board
  useEffect(() => {
    if (isLoggedIn) {
      startNewGame();
      loadUserStats();
      fetchLeaderboard();
    }
  }, [isLoggedIn]);

  // Save current attempt to board when currentRowData changes
  useEffect(() => {
    if (currentRowData.length > 0) {
      let newBoardData = [...boardData];
      if (newBoardData[currentAttempt]) {
        newBoardData[currentAttempt] = currentRowData;
        setBoardData(newBoardData);
      }
    }
  }, [currentRowData]);

  // Start a new game with random word
  const startNewGame = () => {
    // Pick a random word length between MIN_WORD_LENGTH and MAX_WORD_LENGTH
    const wordLength = Math.floor(Math.random() * (MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1)) + MIN_WORD_LENGTH;
    
    // Get a random word from the list
    const randomIndex = Math.floor(Math.random() * wordList[wordLength].length);
    const newTargetWord = wordList[wordLength][randomIndex].toUpperCase();
    setTargetWord(newTargetWord);
    
    // Initialize board data and current row
    const newBoardData = Array(MAX_ATTEMPTS).fill().map(() => 
      Array(newTargetWord.length).fill().map(() => ({ letter: "", status: "empty" }))
    );
    
    setBoardData(newBoardData);
    setCurrentRowData(Array(newTargetWord.length).fill().map(() => ({ letter: "", status: "empty" })));
    setCurrentAttempt(0);
    setGameState("playing");
    setLetterStatus({});
    gridRefs.current = Array(MAX_ATTEMPTS).fill().map(() => Array(newTargetWord.length).fill(null));
  };

  // Handle login
  const handleLogin = async () => {
    if (!username.trim()) {
      alert("Please enter a username");
      return;
    }
    
    try {
      // Save username to local storage
      localStorage.setItem("wordleUsername", username);
      
      // Register user in backend (if not exists)
      const response = await fetch(`${BACKEND_URL}/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      
      if (response.ok) {
        setIsLoggedIn(true);
        setGameState("playing");
      } else {
        alert("Error logging in. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      // Fall back to local mode if backend is not available
      setIsLoggedIn(true);
      setGameState("playing");
    }
  };

  // Load user stats
  const loadUserStats = () => {
    const savedStats = localStorage.getItem(`wordleStats_${username}`);
    if (savedStats) {
      setGameStats(JSON.parse(savedStats));
    }
  };

  // Save user stats
  const saveUserStats = (newStats) => {
    localStorage.setItem(`wordleStats_${username}`, JSON.stringify(newStats));
    setGameStats(newStats);
  };

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/leaderboard`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data);
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      // Fallback to local data if backend not available
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
          attempts: currentAttempt + 1
        }),
      });
      
      if (response.ok) {
        fetchLeaderboard();
      }
    } catch (error) {
      console.error("Error updating score:", error);
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
    let result = `Wordle ${targetWord.length}-letter: ${currentAttempt + 1}/${MAX_ATTEMPTS}\n\n`;
    
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

  // Logout user
  const handleLogout = () => {
    localStorage.removeItem("wordleUsername");
    setUsername("");
    setIsLoggedIn(false);
    setGameState("login");
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

  // Render login screen
  if (gameState === "login") {
    return (
      <div className="wordle-app">
        <h1 className="title">WORDLE</h1>
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
          <button className="login-button" onClick={handleLogin}>
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
          <button className="menu-button" onClick={() => setShowLeaderboard(!showLeaderboard)}>
            {showLeaderboard ? "Back to Game" : "Leaderboard"}
          </button>
        </div>
        <h1 className="title">WORDLE</h1>
        <div className="header-right">
          <button className="menu-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {showLeaderboard ? (
        <div className="leaderboard-container">
          <h2>Leaderboard</h2>
          {leaderboard.length > 0 ? (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Username</th>
                  <th>Words Solved</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((player, index) => (
                  <tr key={player.username} className={player.username === username ? "current-user" : ""}>
                    <td>{index + 1}</td>
                    <td>{player.username}</td>
                    <td>{player.wordsSolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No scores yet. Be the first to play!</p>
          )}
          <div className="stats-container">
            <h3>Your Stats</h3>
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value">{gameStats.played}</div>
                <div className="stat-label">Played</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{gameStats.won}</div>
                <div className="stat-label">Won</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">
                  {gameStats.played > 0 ? Math.round((gameStats.won / gameStats.played) * 100) : 0}%
                </div>
                <div className="stat-label">Win %</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{gameStats.currentStreak}</div>
                <div className="stat-label">Current Streak</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{gameStats.maxStreak}</div>
                <div className="stat-label">Max Streak</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
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
                <button onClick={startNewGame}>Play Again</button>
              </div>
            </div>
          )}

          {gameState === "lost" && (
            <div className="game-message failure">
              <h2>Game Over</h2>
              <p>The word was: {targetWord}</p>
              <div className="button-group">
                <button onClick={shareResults}>Share Results</button>
                <button onClick={startNewGame}>Play Again</button>
              </div>
            </div>
          )}

          {showKeyboard && gameState === "playing" && renderKeyboard()}

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
        </>
      )}
    </div>
  );
}

export default App;