# ⚽ FPL Assistant (مساعد الفانتاسي الذكي)

<div align="center">

![FPL Assistant Banner](https://img.shields.io/badge/React%20Native-Expo%2054-00FF87?style=for-the-badge&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-Express%20Proxy-37003C?style=for-the-badge&logo=node.js&logoColor=white)
![AI Powered](https://img.shields.io/badge/AI-Groq%20Llama%203.3-00DBE9?style=for-the-badge&logo=openai&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Language](https://img.shields.io/badge/Language-English%20%7C%20%D8%B9%D8%B1%D8%A8%D9%8A-white?style=for-the-badge)

**A professional, production-grade Fantasy Premier League (FPL) mobile companion application built with React Native (Expo Router) and a Node.js Express Proxy. Features official OAuth 2.0 authentication, silent PingOne token rotation, live squad and pitch visualization, automated transfer execution, and AI tactical insights powered by Groq LLaMA-3.3-70B.**

[Features](#-key-features) • [Architecture & Data Flow](#-architecture--system-design) • [API Documentation](#-backend-api-endpoints) • [Installation Guide](#-installation--setup-guide) • [Troubleshooting](#-troubleshooting--faq) • [بالعربية](#-دليل-التشغيل-باللغة-العربية)

</div>

---

## 🌟 Key Features

### 1. 🔐 Official FPL OAuth 2.0 & Silent Token Refresh
- **PingOne OIDC Integration**: Direct in-app WebView authentication against `account.premierleague.com`.
- **Automatic Silent Refresh**: Intercepts HTTP 401 responses and refreshes expired `access_token`s seamlessly using stored `refresh_token`s via `POST https://auth.pingone.eu/{env_id}/as/token` without interrupting user experience.
- **Proactive Expiry Detection**: Automatically refreshes credentials upon app launch if the token is within 5 minutes of expiration.
- **Read-Only Fallback**: Allows instant read-only connection via Team ID without entering credentials.

### 2. ⚽ Interactive Pitch Visualizer & Squad Management
- **Visual Pitch Grid**: Displays starting XI in custom formations (4-4-2, 3-5-2, 3-4-3, etc.) with goalkeeper, defenders, midfielders, and forwards.
- **Bench & Substitution Engine**: Swap bench players with active starters, with automatic validation against official FPL formation constraints (minimum 1 GK, 3 DEF, 2 MID, 1 FWD).
- **Captaincy Controls**: One-tap assignment of Captain (C) (2x points) and Vice-Captain (V).
- **Direct Cloud Sync**: Saves lineup modifications directly to official FPL servers (`/api/my-team/{id}/`).

### 3. 🔄 Real-Time Transfer Market & Execution
- **Player Explorer**: Filter the entire Premier League element pool by position, price, form, ownership percentage, and total points.
- **Financial & Transfer Validation**: Real-time tracking of Free Transfers count, Bank balance (£m), and Point Hit penalties (-4 per extra transfer).
- **Official Submission**: Executes transfer batches directly through FPL with CSRF cookie protection.

### 4. 🧠 AI Tactical Assistant (Groq LLaMA-3.3-70B)
- **Hybrid Rule + LLM Pipeline**: Combines deterministic heuristic scoring (form, upcoming fixture difficulty rating 1–5, and injury percentage) with Groq's `llama-3.3-70b-versatile` model.
- **Structured Recommendations**: Provides explicit Captain picks, Transfer targets (Sell/Buy candidates), and squad injury warnings.
- **24-Hour Per-User Caching**: Server-side in-memory caching to stay strictly within API rate limits while keeping latency under 50ms for returning users.
- **Dual-Language Generation**: Produces matched, natural advice in both English and Arabic.

### 5. 🌐 Full Bilingual (English & Arabic RTL) Experience
- Instant language toggle between English and Arabic across all screens.
- Custom typography supporting Google Fonts: **Archivo Narrow**, **Hanken Grotesk**, **JetBrains Mono**, **Cairo**, and **IBM Plex Sans Arabic**.

---

## 🏗️ Architecture & System Design

```
 ┌────────────────────────────────────────────────────────┐
 │                    React Native App                    │
 │               (Expo SDK 54 / Expo Router)              │
 └─────────────┬────────────────────────────▲─────────────┘
               │ HTTP Requests              │ JSON Data
               │ (LAN / Wi-Fi)              │
 ┌─────────────▼────────────────────────────┴─────────────┐
 │             Node.js Express Proxy Server               │
 │                   (Port: 3001)                         │
 ├────────────────────────────────────────────────────────┤
 │ • Axios CookieJar (CSRF & Session Cookie Persistence)  │
 │ • Silent Token Refresh & 401 Interceptor               │
 │ • Rule-Based Engine + Groq LLaMA-3.3 LLM Client        │
 │ • 24-Hour Per-User In-Memory Insight Cache             │
 └─────────────┬────────────────────────────┬─────────────┘
               │                            │
   OAuth / REST│                 Groq API   │ Chat Completions
               ▼                            ▼
 ┌──────────────────────────┐   ┌─────────────────────────┐
 │ Official FPL Endpoints   │   │ Groq Cloud API          │
 │ (fantasy.premierleague)  │   │ (api.groq.com)          │
 └──────────────────────────┘   └─────────────────────────┘
```

---

## 📡 Backend API Endpoints

The backend proxy runs on `http://localhost:3001` (and `http://<YOUR_LAN_IP>:3001`):

| Endpoint | Method | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `/api/auth/fpl-session` | `POST` | Validates OIDC Bearer token against FPL `/me/` and returns team ID. | Yes (`accessToken`) |
| `/api/auth/refresh` | `POST` | Silently exchanges `refresh_token` with PingOne for new `access_token`. | Yes (`refreshToken`) |
| `/api/fpl/bootstrap` | `GET` | Proxies official FPL static data (all players, teams, gameweeks). | No |
| `/api/fpl/entry/:teamId` | `GET` | Fetches overall points, rank, and manager details for a team. | No |
| `/api/fpl/picks/:teamId/:gw` | `GET` | Fetches gameweek picks and points for a given team. | No |
| `/api/team/:id/squad` | `GET` | Fetches current live squad picks, chips, and transfer bank. | Yes (`x-fpl-session`) |
| `/api/team/lineup` | `POST` | Updates active lineup, formation, captain, and sub order. | Yes (`x-fpl-session` + CSRF) |
| `/api/team/transfers` | `POST` | Submits official transfer transactions to FPL servers. | Yes (`x-fpl-session` + CSRF) |
| `/api/ai/insight` | `POST` | Computes rule-based tactical scores and queries Groq LLM for insights. | Optional (`teamId`) |
| `/health` | `GET` | Server health check status and server timestamp. | No |

---

## 🚀 Installation & Setup Guide

### 1. Clone the Repository
```bash
git clone https://github.com/24543amr/fpl-assistant.git
cd fpl-assistant
```

### 2. Install Project Dependencies

#### Install Frontend Dependencies:
```bash
npm install
```

#### Install Backend Server Dependencies:
```bash
cd server
npm install
cd ..
```

---

### 3. Configure Environment Variables

Create a `.env` file inside the `server/` directory:

```env
# server/.env
PORT=3001
GROQ_API_KEY=gsk_your_groq_api_key_here
```

> [!TIP]
> Get a free Groq API key with instant access from [console.groq.com](https://console.groq.com/).

---

## 📱 Running the App

### Step 1: Start the Backend Server
```bash
cd server
node index.js
```
*The server will display:*
```text
╔═══════════════════════════════════════════════════════════╗
║  FPL Assistant Backend Server                             ║
║  Listening on ALL interfaces (0.0.0.0:3001)             ║
╚═══════════════════════════════════════════════════════════╝
```

---

### Step 2: Start the Expo Metro Bundler
Open a **new terminal window** in the root directory:
```bash
npx expo start --dev-client
```

---

### Step 3: Run on Device / Emulator

#### A. On Android Emulator:
Press **`a`** in the Expo terminal window.

#### B. On Physical Android Phone (Direct Install):
1. Connect phone via USB with **USB Debugging** enabled.
2. Run:
   ```bash
   adb install "android/app/build/outputs/apk/debug/app-debug.apk"
   ```
3. Open the installed app and ensure your phone is connected to the **same Wi-Fi** as your PC.

---

## 🛠️ Diagnostic & Self-Test Tools

Inside the **Profile Screen** (`/profile`), developers and testers can run live verification:
- 🔄 **Test Token Refresh**: Validates silent OIDC rotation against PingOne.
- ⚡ **Test Proactive Launch Refresh**: Simulates cold app start with near-expired tokens.
- 🛡️ **Test 401 Silent Recovery**: Deliberately injects an invalid access token to verify automated self-healing.

---

## ❓ Troubleshooting & FAQ

<details>
<summary><b>1. "Could not reach the backend" error on phone</b></summary>
Make sure your phone and computer are on the same Wi-Fi network. Check your computer's local IP address using `ipconfig` (Windows) or `ifconfig` (Mac), and confirm port 3001 is permitted in Windows Firewall.
</details>

<details>
<summary><b>2. "Cannot read property 'trim' of null" on login</b></summary>
This was resolved with strict string guards and unexpired token filtering in `screens/ConnectTeam.tsx` and `utils/storage.ts`.
</details>

<details>
<summary><b>3. Why is development build required instead of Expo Go?</b></summary>
The app utilizes native dependencies (`react-native-webview`, `@react-native-cookies/cookies`) necessary for official OAuth cookie handling and security.
</details>

---

## 🇸🇦 دليل التشغيل باللغة العربية

### خطوات تشغيل المشروع:
1. **تثبيت الحزم البرمجية**:
   ```bash
   npm install
   cd server && npm install && cd ..
   ```
2. **إعداد ملف المتغيرات البيئية**:
   أنشئ ملف باسم `.env` داخل مجلد `server/` وضع بداخله مفتاح Groq:
   ```env
   PORT=3001
   GROQ_API_KEY=gsk_your_groq_api_key_here
   ```
3. **تشغيل السيرفر الخلفي**:
   ```bash
   cd server && node index.js
   ```
4. **تشغيل التطبيق**:
   ```bash
   npx expo start --dev-client
   ```
5. **التثبيت على الهاتف**:
   قم بتثبيت ملف الـ APK الموجود في `android/app/build/outputs/apk/debug/app-debug.apk` على تليفونك، وتأكد من اتصال الهاتف والكمبيوتر على نفس شبكة الواي فاي (Wi-Fi).

---

## 📄 License

Distributed under the [MIT License](LICENSE).

<div align="center">
Built with ❤️ for Fantasy Premier League Managers worldwide.
</div>
