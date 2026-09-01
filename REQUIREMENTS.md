# 📋 System & Software Requirements

This document details all hardware, software, runtime, and network prerequisites required to develop, build, and run the **FPL Assistant** project.

---

## 💻 1. Development Environment Prerequisites

| Component | Minimum Version | Recommended Version | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS (Monterey+), Ubuntu 20.04+ | Windows 11 / macOS Sonoma | Cross-platform support |
| **Node.js** | `v18.0.0` | `v20.x` or `v24.x` (LTS) | Required for Expo & Express Server |
| **npm** | `v9.0.0` | `v10.x+` | Standard Node package manager |
| **Git** | `v2.30.0` | Latest | Version control |
| **Java Development Kit (JDK)**| OpenJDK 17 | Eclipse Temurin 17 / Zulu 17 | Required for Android build (`expo run:android`) |
| **Android SDK** | SDK Build-Tools 34.0.0 | Android SDK 34 / 35 | Required for local Android compilation |
| **Android NDK** | 26.1.10909125 | 26.1.10909125 | React Native Native C++ compilation |

---

## 📱 2. Mobile Device & Testing Requirements

- **Android Physical Device**:
  - Android 9.0 (API Level 28) or higher.
  - USB Debugging enabled in Developer Options.
  - Connected to the **same Wi-Fi network** as the development host machine.
- **Android Emulator**:
  - Pixel 8 / Pixel 7 device definition running Google Play Intel x86_64 Atom System Image (API 34/35).
- **iOS Device / Simulator** (macOS only):
  - iOS 15.0 or higher.
  - Xcode 15+ installed.

---

## 📦 3. Core Software Packages & Libraries

### 📱 Frontend Dependencies (`package.json`)
```json
{
  "expo": "~54.0.36",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo-router": "~6.0.24",
  "react-native-webview": "13.15.0",
  "@react-native-cookies/cookies": "^6.2.1",
  "@react-native-async-storage/async-storage": "2.2.0",
  "expo-constants": "~18.0.13",
  "expo-dev-client": "~6.0.21",
  "expo-font": "~14.0.12",
  "expo-linking": "~8.0.12",
  "expo-splash-screen": "~31.0.13",
  "expo-status-bar": "~3.0.9",
  "react-native-safe-area-context": "~5.6.0",
  "react-native-screens": "~4.16.0",
  "@expo/vector-icons": "^15.0.3",
  "@expo-google-fonts/archivo-narrow": "^0.4.2",
  "@expo-google-fonts/hanken-grotesk": "^0.4.3",
  "@expo-google-fonts/jetbrains-mono": "^0.4.1",
  "@expo-google-fonts/cairo": "^0.4.2",
  "@expo-google-fonts/ibm-plex-sans-arabic": "^0.4.2"
}
```

### 🖥️ Backend Server Dependencies (`server/package.json`)
```json
{
  "express": "^4.18.2",
  "axios": "^1.6.7",
  "axios-cookiejar-support": "^4.0.7",
  "tough-cookie": "^4.1.3",
  "cors": "^2.8.5",
  "dotenv": "^17.4.2"
}
```

---

## 🌐 4. Network & Firewall Requirements

1. **Port 3001**: Dedicated to the Express Backend Proxy (`http://<YOUR_LOCAL_IP>:3001`).
2. **Port 8081 / 8082**: Dedicated to the Metro Bundler development server.
3. **Outbound Internet Access**:
   - `https://fantasy.premierleague.com` (Official FPL API endpoints).
   - `https://auth.pingone.eu` (Official FPL OIDC OAuth authentication & token refresh).
   - `https://api.groq.com` (Groq Cloud LLM API for tactical AI insights).

---

## 🔑 5. API Keys & Configuration

- **Groq API Key**:
  - Required for AI Tactical Insights feature.
  - Sign up at [console.groq.com](https://console.groq.com/) and place key in `server/.env`:
  ```env
  PORT=3001
  GROQ_API_KEY=gsk_...
  ```
