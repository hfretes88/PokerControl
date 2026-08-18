# ♠ PokerControl

A mobile app to manage amateur poker games among friends. Track buy-ins, register final results, calculate balances, and settle debts with the minimum number of transfers.

> Built with [React Native](https://reactnative.dev) and developed with the assistance of [Claude](https://claude.ai) by Anthropic.

---

## Features

- **Seasons** — Group sessions into seasons. Starting a new season closes the current one automatically and resets the podium/stats to zero; only one season is active at a time. A closed season can be reopened as the active one, and an empty season (no sessions) can be deleted. Debts and manual adjustments stay global across seasons.
- **Sessions** — Create and name poker sessions, set a starting buy-in per player, and close them when the game ends.
- **Players** — Maintain a roster of recurring players reused across sessions.
- **Buy-ins** — Record multiple chip purchases per player during a session, with timestamps.
- **Results** — Register each player's final chip count and instantly see their profit/loss.
- **Debt settlement** — Automatically calculates who owes whom using a minimum-transfers algorithm. Supports partial and full payments with payment history per debt, and nets pending debts between the same pair of players automatically.
- **Prior debts** — Register a debt from before you started using the app against a specific player; it behaves like any other debt (payable, shows up in Pending debts) and counts toward that player's balance until it's settled.
- **Pending debts** — Global view of all outstanding debts grouped by debtor, with running totals across multiple sessions.
- **Stats** — Per-player history with win rate, best/worst game, and a cumulative balance line chart, scoped to a season or all-time.
- **Ranking** — Leaderboard sorted by balance with a podium for the top 3 and a mini trend chart per player, scoped to a season or all-time.
- **WhatsApp sharing** — Share a formatted game summary or pending debts list directly to a WhatsApp chat.
- **Backup** — Export all data (players, sessions, seasons, debts) as a JSON file, and import a previously exported backup to restore it — this replaces all data currently on the device.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.85 (CLI) |
| Navigation | React Navigation — Native Stack |
| Storage | AsyncStorage (100% local, no backend) |
| Charts | Custom chart built with plain React Native views (no charting library) |
| Safe area | react-native-safe-area-context |

---

## Project Structure

```
src/
├── components/
│   ├── UI.js                  # Shared components (Card, Btn, BalanceBadge) and color tokens
│   ├── GlobalStyles.js        # Shared StyleSheet tokens used across screens
│   ├── InfoModal.js           # About modal with JSON export/import and theme toggle
│   └── PlayerDebtsSection.js  # Reusable debt summary for StatsScreen
├── screens/
│   ├── SeasonsScreen.js       # Season list and new season creation (initial screen)
│   ├── HomeScreen.js          # Session list and new session creation, scoped to a season
│   ├── SessionScreen.js       # Session detail: buy-ins, results, close
│   ├── DebtScreen.js          # Per-session debt settlement with payment tracking
│   ├── PendingDebtsScreen.js  # Global pending debts grouped by debtor
│   ├── PlayersScreen.js       # Player management
│   ├── RankingScreen.js       # Leaderboard with podium, scoped to a season or all-time
│   └── StatsScreen.js         # Per-player stats, balance chart, debt summary
└── storage/
    ├── storage.js             # AsyncStorage CRUD, balance/debt calculations, stats
    ├── debts.js               # Debt lifecycle: generation, payments, status tracking
    └── seasons.js             # Season lifecycle: creation, migration, active season
```

---

## Data Model

All data is stored locally in AsyncStorage under four keys:

```
poker_players   → Player[]
poker_sessions  → Session[]   (with embedded Participant[] and Buy[], tagged with seasonId)
poker_debts     → Debt[]      (generated on session close, tracks payment history)
poker_seasons   → Season[]    (only one can be status: 'active' at a time)
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
