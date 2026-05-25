# Undercover - Multiplayer Party Game (with Voting & Excel Reports)

Undercover is a web-based, real-time multiplayer party game designed for a Host and up to 24 Players (total 25 participants). Players describe their secret words (revealed privately on their devices) and vote on who they suspect is the Undercover spy or Blank player.

This app is optimized for mobile screens, making it perfect for players to join on their phones while discussing/arguing over an external call (e.g., Microsoft Teams, Zoom, or Discord voice call)!

---

## 🎮 Game Rules & Lifecycle

1. **Roles**:
   - **Civilians**: Given the secret Civilian Word.
   - **Undercovers**: Given a word very similar to the Civilian Word.
   - **Blanks**: Given NO word at all!
2. **Phase 1: Word Reveal & Descriptions**:
   - Each player secretly views their word by holding the "Reveal My Word" button on their screen.
   - Players take turns describing their word out loud (e.g., via Teams call) using a single word or short phrase.
   - *Goal*: Civilians try to identify who has a different word. Undercovers try to blend in. Blanks try to sound like they have a word!
3. **Phase 2: Host-Controlled Voting**:
   - The host triggers the voting round once discussions finish by clicking **Start Voting Phase**.
   - A configurable timer counts down. Players select one target they suspect is the Undercover/Blank and click to submit. Votes can be changed until time ends.
   - **No Auto-Elimination**: Voting is for scoring only. The app does not eliminate any players or judge their roles in-app. When voting ends, players see a "Voting closed" confirmation.
4. **Phase 3: Points Calculation & Summary**:
   - Scores are computed server-side and cumulative scoreboard totals are updated.
   - The host reviews the **Round Summary** (who voted for whom, points earned, cumulative scores) and can download the round's spreadsheet.
   - Host clicks **Next Round** to return to the lobby (preserving cumulative scores, but resetting words/roles for the next round).

---

## 🗳️ Voting Configuration & Controls

- **Setting Voting Duration**: 
  - The host can set the voting duration (in seconds) during the **Lobby** settings panel or during the **Word Reveal** phase on the GameView.
  - Controls allow incrementing/decrementing duration in 15-second blocks (range: 15s to 300s, default 60s).
- **Manual Closing**:
  - The host can end the voting phase early at any time by clicking **End Voting Now**.
- **Timer Extensions**:
  - The host can add time to the countdown in 15-second increments at any time by clicking **Extend +15s**.

---

## 🏆 Scoring Rules (Computed Server-Side)

Points are awarded to the **voter** based on the secret role of the **voted target** at the end of the voting countdown:
- Voted target is **Undercover** => Voter receives **10 points**
- Voted target is **Blank** => Voter receives **5 points**
- Voted target is **Civilian** => Voter receives **0 points**
- **Non-Voter Penalty**: If a player does not submit a vote before the timer expires, they receive **0 points** (recorded as "No Vote").

*Note: Target roles are computed privately on the server and are not displayed to players in the app to maintain game integrity.*

---

## 📊 Excel Export & Data Storage

- **How to Download Reports**:
  - After each voting round finishes, the host can click **Download Round Report (.xlsx)** on the results screen.
  - The browser will download a file named like: `VotingRound_<roundNumber>_<YYYYMMDD_HHMM>.xlsx`.
  - The spreadsheet contains the following columns for each voter:
    - **Round**
    - **VotingStartTime**
    - **VotingEndTime**
    - **VoterName**
    - **VotedPlayerName** (or "No Vote")
    - **VotedPlayerRole** (Civilian, Undercover, Blank, or empty)
    - **PointsAwarded** (10, 5, or 0)
    - **CumulativePointsAfterThisRound**
- **Where Vote Data is Stored**:
  - Vote submissions, player roles, and scoring reports are stored **temporarily in-memory** on the Node.js server.
  - Session details and reconnect tokens are preserved in the clients' `sessionStorage` to recover from connection drops or refreshes.
  - If the host restarts the server or triggers **End Game / Return to Lobby (Reset Game)**, all scores and stored report data will be wiped.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
Run from the root directory:
```bash
npm install
```

### 2. Run in Development Mode
Starts both backend socket and frontend dev servers concurrently:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Build & Run
```bash
# Build React static bundles
npm run build

# Start the unified Express production server
npm run start
```
Open [http://localhost:5000](http://localhost:5000) in your browser.
