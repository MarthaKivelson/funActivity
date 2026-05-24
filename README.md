# Undercover - Multiplayer Word Party Game

Undercover is a web-based, real-time multiplayer party game designed for a Host and up to 24 Players (total 25 participants). Players describe their secret words and vote to eliminate the undercover spies. 

This app is optimized for mobile screens, making it perfect for players to join on their phones while discussing/arguing over a Microsoft Teams, Zoom, or Discord voice call!

---

## 🎮 Game Rules

1. **Roles**:
   - **Civilians** (Majority): Given the secret Civilian Word.
   - **Undercovers** (Configurable count): Given a word that is very similar to the Civilian Word.
   - **Blanks** (Optional, 0-2 players): Given NO word at all!
2. **Phase 1: Word Reveal & Descriptions**:
   - Each player secretly views their word by holding the "Reveal My Word" button.
   - Players take turns describing their word out loud (e.g., via Teams call) using a single word or short phrase.
   - *Goal*: Civilians try to identify who has a different word. Undercovers try to deduce the Civilian word and blend in. Blanks try to sound like they have a word!
3. **Phase 2: Voting & Eliminations**:
   - The host triggers the voting round.
   - Players vote on their devices to eliminate who they think is the Undercover or Blank.
   - The player with the most votes is eliminated. Their role is revealed (but not their secret word).
4. **Winning Conditions**:
   - **Civilians Win**: If all Undercovers are successfully eliminated.
   - **Undercovers Win**: If the number of alive Undercovers equals or exceeds the number of alive Civilians.

---

## 🛠️ Technical Architecture

- **Frontend**: React (Vite) + Vanilla CSS (Custom dark theme with neon glassmorphism).
- **Backend**: Node.js + Express + Socket.io.
- **State Synchronization**: Real-time websocket messaging.
- **Persistence**: Sessions and IDs are saved in `localStorage`, meaning players can refresh their browser or rejoin after dropping connection without disrupting the game state.

---

## 🚀 Quick Start Guide

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v16.0.0 or higher recommended).

### 1. Install Dependencies
Navigate to the project root and run:
```bash
npm install
```

### 2. Run in Development Mode
To start both the backend Socket.io server and the Vite dev server concurrently, run:
```bash
npm run dev
```
- The backend server starts on port `5000`.
- The frontend dev server starts on port `5173`.
- Open [http://localhost:5173](http://localhost:5173) in your browser.

*Note: In development, Vite will automatically proxy websocket connections from port `5173` to port `5000`, preventing CORS issues.*

### 3. Production Build & Run
To compile the frontend bundle and run the unified Express app:
```bash
# Build the React production assets
npm run build

# Start the production server
npm run start
```
Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 📂 Project Structure

```
undercover-game/
├── server.js             # Express & Socket.io server logic
├── package.json          # Dependency configurations & scripts
├── vite.config.js        # Vite configurations (with dev proxy settings)
├── index.html            # Entry HTML page
├── README.md             # This readme file
└── src/
    ├── main.jsx          # React mount point
    ├── App.jsx           # Main router & socket events listener
    ├── index.css         # Styling system (Vanilla CSS variables & animations)
    ├── words.js          # Library of similar word pairs
    └── components/
        ├── JoinRoom.jsx  # Room creation and joining UI
        ├── Lobby.jsx     # Waiting room with Host settings panels
        ├── GameView.jsx  # Primary play flow (Reveal, Voting, and Results)
        └── WordReveal.jsx# Private press-to-reveal word module
```
