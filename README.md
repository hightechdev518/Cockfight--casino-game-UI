# Casino Game Interface

A modern, responsive casino game interface built with React, TypeScript, and Vite. This project features live video streaming, real-time betting UI, interactive chips, and dynamic scorecards with seamless API integration.

## 🎮 Features

- **Live Video Streaming**: Responsive video player with fullscreen support and controls
- **Interactive Betting UI**: Real-time bet placement with odds display and payout calculations
- **Chip Selection**: Visual chip selector with multiple denominations ($5, $10, $25, $50, $100, $500)
- **Live Scorecards**: Dynamic score display with real-time updates
- **Real-time Updates**: WebSocket integration for bidirectional data flow
- **Responsive Design**: Fully responsive layout for desktop, tablet, and mobile devices
- **Modern UI/UX**: Casino-style design with smooth animations and transitions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Backend API server running (see API Configuration below)

### Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd website
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update the API URLs:
   ```env
   VITE_API_BASE_URL=http://localhost:8000/api
   VITE_WS_URL=ws://localhost:8000/ws
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. **Open your browser:**
   The application will automatically open at `http://localhost:3000`

## 📁 Project Structure

```
website/
├── src/
│   ├── components/          # React components
│   │   ├── LiveVideo/       # Live video streaming component
│   │   ├── BetUI/          # Betting interface component
│   │   ├── Chips/          # Chip selection component
│   │   └── Scorecards/     # Score display component
│   ├── hooks/              # Custom React hooks
│   │   └── useWebSocket.ts # WebSocket connection hook
│   ├── services/           # API service layer
│   │   └── apiService.ts   # API client and methods
│   ├── store/              # State management
│   │   └── gameStore.ts    # Zustand store for game state
│   ├── App.tsx             # Main application component
│   ├── App.css             # Main application styles
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── .env.example           # Environment variables template
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
└── README.md             # This file
```

## 🔌 API Integration

The application expects the following API endpoints:

### REST API Endpoints

- `POST /api/bets` - Place a bet
  ```json
  {
    "gameId": "string",
    "betType": "team1" | "team2" | "draw",
    "amount": number
  }
  ```

- `GET /api/scores` or `GET /api/scores/:gameId` - Get current scores
  ```json
  {
    "team1": "string",
    "team2": "string",
    "score1": number,
    "score2": number,
    "period": "string",
    "timeRemaining": "string" (optional)
  }
  ```

- `GET /api/game/status` or `GET /api/game/status/:gameId` - Get game status
  ```json
  {
    "isLive": boolean,
    "gameId": "string",
    "gameType": "string" (optional)
  }
  ```

- `GET /api/odds` or `GET /api/odds/:gameId` - Get betting odds
  ```json
  {
    "team1": number,
    "team2": number,
    "draw": number
  }
  ```

- `GET /api/bets/history` - Get betting history

### WebSocket Messages

The application connects to a WebSocket server and expects the following message format:

```json
{
  "type": "score_update" | "game_status" | "bet_confirmation",
  "payload": { ... }
}
```

**Message Types:**
- `score_update`: Updates the game scores
- `game_status`: Updates the game status
- `bet_confirmation`: Confirms a bet placement

## 🎨 Customization

### Styling

The application uses CSS custom properties for easy theming. Modify the variables in `src/index.css`:

```css
:root {
  --primary-dark: #0a0e27;
  --accent-gold: #ffd700;
  --accent-green: #00ff88;
  --accent-red: #ff4444;
  /* ... */
}
```

### Chip Values

Modify chip denominations in `src/components/Chips/Chips.tsx`:

```typescript
const CHIP_VALUES = [5, 10, 25, 50, 100, 500] // Add or modify values
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Building for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

## 📱 Responsive Breakpoints

- **Desktop**: > 1200px (Sidebar layout)
- **Tablet**: 768px - 1200px (Stacked layout)
- **Mobile**: < 768px (Single column)

## 🔒 Security Notes

- Never commit `.env` files with sensitive data
- Ensure your backend API implements proper authentication
- Use HTTPS/WSS in production
- Validate all user inputs on the backend

## 🐛 Troubleshooting

### WebSocket Connection Issues

If WebSocket connections fail:
1. Verify `VITE_WS_URL` in `.env` is correct
2. Check that your backend WebSocket server is running
3. Ensure CORS is properly configured on the backend

### API Connection Issues

If API calls fail:
1. Verify `VITE_API_BASE_URL` in `.env` is correct
2. Check browser console for CORS errors
3. Ensure your backend API is running and accessible

### Build Issues

If you encounter build errors:
1. Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check TypeScript errors: `npm run build`

## 📝 Future Enhancements

- [ ] Add authentication flow
- [ ] Implement bet history with filters
- [ ] Add sound effects for bet placement
- [ ] Implement chat functionality
- [ ] Add more game types
- [ ] Implement dark/light theme toggle
- [ ] Add unit and integration tests

## 🤝 Contributing

1. Follow the existing code style
2. Ensure all TypeScript types are properly defined
3. Test on multiple screen sizes
4. Verify API integration works correctly

## 📄 License

This project is proprietary and confidential.

## 📞 Support

For issues or questions, please contact the development team.

---

**Built with ❤️ using React, TypeScript, and Vite**

