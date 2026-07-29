# ♠ PokerControl

A mobile app to manage amateur poker games among friends. Track buy-ins, register final results, calculate balances, and settle debts with the minimum number of transfers.

> Built with [React Native](https://reactnative.dev) and developed with the assistance of [Claude](https://claude.ai) by Anthropic.

---

## Features

- **Sessions** — Create and name poker sessions, set a starting buy-in per player, and close them when the game ends.
- **Players** — Maintain a roster of recurring players reused across sessions.
- **Buy-ins** — Record multiple chip purchases per player during a session, with timestamps.
- **Results** — Register each player's final chip count and instantly see their profit/loss.
- **Debt settlement** — Automatically calculates who owes whom using a minimum-transfers algorithm. Supports partial and full payments with payment history per debt.
- **Pending debts** — Global view of all outstanding debts grouped by debtor, with running totals across multiple sessions.
- **Stats** — Per-player history with win rate, best/worst game, and a cumulative balance line chart.
- **Ranking** — Global leaderboard sorted by historical balance with a podium for the top 3 and a mini trend chart per player.
- **WhatsApp sharing** — Share a formatted game summary or pending debts list directly to a WhatsApp chat.
- **Backup & restore** — Export all data (players, sessions, debts) as a JSON file and import it back on any device.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.74 (CLI) |
| Navigation | React Navigation — Native Stack |
| Storage | AsyncStorage (100% local, no backend) |
| Charts | Custom SVG (react-native-svg) |
| Safe area | react-native-safe-area-context |

---

## Project Structure

```
src/
├── components/
│   ├── UI.js                  # Shared components (Card, Btn, BalanceBadge) and color tokens
│   ├── GlobalStyles.js        # Shared StyleSheet tokens used across screens
│   ├── InfoModal.js           # About modal with JSON export/import
│   └── PlayerDebtsSection.js  # Reusable debt summary for StatsScreen
├── screens/
│   ├── HomeScreen.js          # Session list and new session creation
│   ├── SessionScreen.js       # Session detail: buy-ins, results, close
│   ├── DebtScreen.js          # Per-session debt settlement with payment tracking
│   ├── PendingDebtsScreen.js  # Global pending debts grouped by debtor
│   ├── PlayersScreen.js       # Player management
│   ├── RankingScreen.js       # Global leaderboard with podium
│   └── StatsScreen.js         # Per-player stats, balance chart, debt summary
└── storage/
    ├── storage.js             # AsyncStorage CRUD, balance/debt calculations, stats
    └── debts.js               # Debt lifecycle: generation, payments, status tracking
```

---

## Data Model

All data is stored locally in AsyncStorage under three keys:

```
poker_players   → Player[]
poker_sessions  → Session[]   (with embedded Participant[] and Buy[])
poker_debts     → Debt[]      (generated on session close, tracks payment history)
```

Balances are always calculated on the fly: `balance = finalAmount - sum(buys)`.

Debt settlement uses a greedy algorithm that minimizes the number of transfers needed to settle all balances.

---

## Getting Started

### Prerequisites

Complete the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for your platform.

### Install dependencies

```sh
npm install
```

### iOS — install pods

```sh
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

### Build release APK (Android)

```sh
cd android && ./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

---

## License

MIT
