# 🇺🇸 USCIS 128 Civics Test Master (California Edition)

> **Official 128 Civics Questions & Answers Study Companion, Practice Quizzes, and Oral Interview Simulator.**  
> Built as an offline-first Progressive Web App (PWA) with zero-cost WebCrypto authentication and California state-specific updates.

🌐 **Live Website**: [https://civics-128-app.pages.dev](https://civics-128-app.pages.dev)

---

## ✨ Features

- **🏛️ Complete 128 Question Pool**:
  - Full official USCIS 128 naturalization questions.
  - Question taxonomy badges: `New in 128-Question Test`, `Amended / Expanded Wording`, and `★ 65/20 Special Exemption`.
- **📍 California State-Specific Integration**:
  - **Governor**: Gavin Newsom
  - **U.S. Senators**: Alex Padilla, Adam Schiff
  - **State Capital**: Sacramento
  - **U.S. Representatives**: 52 congressional districts (e.g. Nancy Pelosi CA-11, Ted Lieu CA-36, Ro Khanna CA-17, Kevin Kiley CA-03).
  - Built-in instant state picker to switch to any other U.S. state or territory.
- **🔒 Zero-Cost Authentication Gate**:
  - Entire application is gated behind account registration and login.
  - Native client-side **W3C WebCrypto SHA-256** credential vault ($0.00 forever, zero backend server costs).
  - Multi-user progress isolation (`civics128_state_<userId>`).
- **📱 PWA & Standalone Mode**:
  - **iOS (iPhone/iPad)**: Add to Home Screen via Safari Share sheet.
  - **macOS (Sonoma 14+)**: Native Dock & Launchpad web app via Safari `File > Add to Dock...`.
  - Service worker caching (`sw.js`) for full offline access without internet.
- **⚔️ USCIS Oral Exam Simulator**:
  - Follows official naturalization examination protocol: up to 20 randomized questions, pass upon reaching 12 correct (60%), or conclude at 9 strikes.
  - Integrated Text-to-Speech (TTS) audio engine with adjustable speech speed.

---

## 🛠️ Architecture & Build

The project is built with vanilla HTML5, Tailwind CSS, and JavaScript. `build.py` serves as the single source of truth for injecting datasets and synchronizing distribution assets:

```
civics_128_app/
├── civics128_full.json     # Official 128 civics questions database
├── states_data.json        # All 50 states + DC/territories officials database
├── template_head.html      # Meta tags, PWA manifests, icons, fonts
├── template_body.html      # App layout, auth gate, 4 views, modals
├── template_script.js      # App state engine, WebCrypto vault, TTS audio
├── build.py                # Compiles head + body + script into index.html & dist/
├── dist/                   # Production distribution synced for Cloudflare Pages
│   ├── index.html
│   ├── sw.js
│   ├── manifest.webmanifest
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── _headers
│   └── _redirects
└── wrangler.toml           # Cloudflare Pages deployment configuration
```

### Compiling & Updating
To rebuild after modifying templates or data:
```bash
python3 build.py
```

### Deploying to Cloudflare Pages
```bash
npx wrangler pages deploy dist --project-name civics-128-app
```

---

## 📄 License
MIT License. Created for naturalization applicants preparing for their U.S. citizenship examination.
