# ⚽ FPL Assistant (مساعد الفانتاسي الذكي)

<div align="center">

![FPL Assistant](https://img.shields.io/badge/React%20Native-Expo%2054-00FF87?style=for-the-badge&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-Express%20Proxy-37003C?style=for-the-badge&logo=node.js&logoColor=white)
![AI Powered](https://img.shields.io/badge/AI-Groq%20Llama%203.3-00DBE9?style=for-the-badge&logo=openai&logoColor=black)
![Language](https://img.shields.io/badge/Language-English%20%7C%20%D8%B9%D8%B1%D8%A8%D9%8A-white?style=for-the-badge)

**A comprehensive, AI-powered Fantasy Premier League (FPL) management application featuring official OAuth 2.0 authentication, live squad visualization, automated transfers/lineups, and tactical AI insights powered by Groq's LLaMA-3.3-70B model.**

[Features](#-key-features) • [Installation Guide](#-installation--setup-guide) • [Environment Setup](#-environment-variables) • [Running the App](#-running-the-app) • [Architecture](#-architecture)

</div>

---

## 🌟 Key Features

- 🔐 **Official FPL OAuth 2.0 Login**: Seamlessly authenticate via Premier League PingOne OAuth with automatic, silent background token refresh.
- ⚽ **Interactive Pitch & Lineup Manager**: View your live starting XI and bench with pitch views, customize formations, and set Captain (C) / Vice-Captain (V).
- 🔄 **Live FPL Transfer System**: Search players, filter by position/price/form, and submit official transfers directly to FPL servers.
- 🧠 **AI Tactical Assistant**: Groq LLaMA-3.3-70B combined with rule-based algorithms to provide captain suggestions, transfer recommendations, and injury alerts.
- 🌐 **Full Dual-Language Support**: Complete English & Arabic (RTL) localized interfaces and matched bilingual AI insights.
- 🛡️ **Secure Backend Proxy Server**: Dedicated Express backend proxying FPL API calls, handling CORS, cookie jars, and safeguarding sensitive keys.

---

## 📋 Prerequisites

Make sure you have the following installed on your machine:

1. **[Node.js](https://nodejs.org/)** (v18.0.0 or higher)
2. **[Git](https://git-scm.com/)**
3. **[npm](https://www.npmjs.com/)** or **yarn**
4. **Android Studio** (for Android Emulator) or an Android physical device with USB Debugging enabled.

---

## 🚀 Installation & Setup Guide

### 1. Clone the Repository
```bash
git clone https://github.com/24543amr/fpl-assistant.git
cd fpl-assistant
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Install Backend Server Dependencies
```bash
cd server
npm install
cd ..
```

---

## 🔑 Environment Variables

Create a `.env` file inside the `server/` directory:

```bash
# In server/.env
PORT=3001
GROQ_API_KEY=your_groq_api_key_here
```

> [!TIP]
> You can obtain a free Groq API key by signing up at [console.groq.com](https://console.groq.com/).

---

## 📱 Running the App

### Step 1: Start the Backend Server
In your terminal, navigate to the `server/` folder or run from root:
```bash
cd server
node index.js
```
*The server will start listening on `0.0.0.0:3001` (accessible via localhost and local Wi-Fi LAN).*

---

### Step 2: Start the Expo Development Server
Open a **new terminal** in the root `fpl-assistant` folder:
```bash
npx expo start --dev-client
```

---

### Step 3: Launch on Your Device or Emulator

- **Android Emulator**: Press **`a`** in the Expo terminal.
- **Physical Android Phone (via USB)**:
  Make sure USB Debugging is enabled, then run:
  ```bash
  npx expo run:android
  ```
  Or install the pre-built APK:
  ```bash
  adb install "android/app/build/outputs/apk/debug/app-debug.apk"
  ```
- **Physical Phone (via Wi-Fi)**:
  Ensure your phone and computer are on the **same Wi-Fi network**, open the installed build on your phone, and scan the QR code displayed in the terminal.

---

## 📂 Project Structure

```text
fpl-assistant/
├── api/                  # FPL API clients & endpoints connector
│   └── fpl.ts            # Frontend-to-backend fetch wrappers & types
├── app/                  # Expo Router screens (file-based routing)
│   ├── _layout.tsx       # Root navigation layout & custom fonts loader
│   ├── index.tsx         # Startup authentication gatekeeper
│   ├── home.tsx          # Main dashboard & live gameweek overview
│   ├── squad.tsx         # Squad management, pitch view & transfer market
│   ├── ai.tsx            # AI Assistant screen (Groq insights & breakdown)
│   ├── news.tsx          # Premier League news & injury alerts
│   ├── profile.tsx       # User profile, session stats & diagnostic tests
│   └── login.tsx         # Authentication & team ID picker
├── constants/            # Design system, themes & color tokens
├── hooks/                # Custom React hooks (e.g. useHomeData)
├── screens/              # Screen components & OAuth WebView handlers
│   └── ConnectTeam.tsx   # PingOne OAuth login WebView & token extractor
├── server/               # Express.js backend proxy server
│   ├── index.js          # API proxy, token refresh engine & Groq LLM integration
│   └── package.json      # Server dependencies
└── utils/                # Token persistence & AsyncStorage manager
    └── storage.ts        # Secure token storage & JWT timing helpers
```

---

## 🧪 Key Diagnostic & Testing Tools

The app includes an in-app diagnostic suite inside the **Profile Screen** (`/profile`):
- **Test Token Refresh**: Manually tests PingOne OIDC silent token rotation.
- **Test Proactive Launch Refresh**: Simulates app launch with near-expiry tokens.
- **Test 401 Silent Recovery**: Tests automatic recovery when FPL access tokens expire during active calls.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

<div align="center">
Made with ❤️ for Fantasy Premier League Managers
</div>
