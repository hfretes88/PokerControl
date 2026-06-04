# ♠ PokerControl

A mobile app to manage amateur poker games among friends. Track buy-ins, register final results, calculate balances, and settle debts with the minimum number of transfers.

> Built with [React Native](https://reactnative.dev) and developed with the assistance of [Claude](https://claude.ai) by Anthropic.

---

## Features

- **Sessions** — Create and name poker sessions, set a starting buy-in per player, and close them when the game ends.
- **Players** — Maintain a roster of recurring players across sessions.
- **Buy-ins** — Record multiple chip purchases per player during a session, with timestamps.
- **Results** — Register each player's final chip count and instantly see their profit/loss.
- **Debt settlement** — Automatically calculates who owes whom using a minimum-transfers algorithm.
- **Stats** — Per-player history with win rate, best/worst game, and a balance chart for the last 6 sessions.
- **Ranking** — Global leaderboard sorted by historical balance with a podium for the top 3.
- **WhatsApp sharing** — Share a formatted game summary directly to a WhatsApp chat.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.76 |
| Navigation | React Navigation (Stack + Bottom Tabs) |
| Storage | AsyncStorage |
| Safe area | react-native-safe-area-context |

---

## Project Structure

```
src/
├── components/
│   ├── UI.js             # Shared components (Card, Btn, BalanceBadge) and color tokens
│   ├── GlobalStyles.js   # Shared StyleSheet tokens used across all screens
│   ├── LineChart.js      # Custom balance chart with zero-crossing color split
│   └── InfoModal.js      # Reusable info modal component
├── screens/
│   ├── HomeScreen.js     # Session list and new session creation
│   ├── SessionScreen.js  # Session detail: buy-ins, results, close
│   ├── DebtScreen.js     # Debt settlement view
│   ├── PlayersScreen.js  # Player management
│   ├── RankingScreen.js  # Global leaderboard
│   └── StatsScreen.js    # Per-player stats and balance chart
└── storage/
    └── storage.js        # AsyncStorage CRUD, calculations and stats logic
```

---

## Getting Started

### Prerequisites

Make sure you have completed the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment).

### Install dependencies

```sh
npm install
```

### iOS — install pods

```sh
bundle install
bundle exec pod install
```

### Run

```sh
# Start Metro
npm start

# Android
npm run android

# iOS
npm run ios
```

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

---

## License

MIT
