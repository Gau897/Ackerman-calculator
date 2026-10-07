# Ackermann Function Calculator

A fully-featured, interactive web calculator for the **Ackermann function** A(m, n) — built with plain HTML, CSS, and JavaScript (no frameworks).

---

## 🔢 What is the Ackermann Function?

The Ackermann function is defined by three rules:

```
A(0, n) = n + 1
A(m, 0) = A(m−1, 1)
A(m, n) = A(m−1, A(m, n−1))
```

Despite its small definition, it grows faster than any primitive recursive function. A(4, 2) has **19,729 digits**.

---

## ✨ Features

| Feature | Description |
|---|---|
| **4 Computation Modes** | Pure Recursive · Iterative (explicit stack) · Memoized · Closed-Form |
| **Web Worker** | Computation runs off the main thread — page stays responsive |
| **Live Progress** | Real-time call count, depth, and elapsed time |
| **Stop Button** | Cancel long-running computations instantly |
| **Growth Chart** | Log-scale chart of call count vs n (Chart.js) |
| **Growth Table** | Tabulates A(m,n), calls, and depth for a range of n |
| **Call-Stack Trace** | Step-by-step playback for small inputs with Play/Pause/Step controls |
| **Stack Depth Graph** | Bar chart of depth at every step of the trace |
| **Comparison Table** | Precomputed A(m,n) grid for m=0..4, n=0..6, highlights current input |
| **Theory Section** | History, hyperoperations, closed forms, inverse Ackermann α(n) |
| **Light/Dark Theme** | Toggle with persistence via localStorage |
| **BigInt results** | Exact results up to thousands of digits |
| **Scientific notation** | Auto-formats results > 50 digits |
| **Copy Result** | One-click clipboard copy |
| **Export CSV** | Download results as a CSV file |
| **Quick Examples** | Pre-loaded examples: A(2,3), A(3,5), A(3,10), A(4,1) |
| **Keyboard shortcut** | Press `Enter` to calculate |
| **Accessibility** | ARIA labels, live regions, focus rings, color contrast |
| **Mobile Friendly** | Responsive CSS grid layout |
| **Test Suite** | `js/tests.js` verifies known values and edge cases |

---

## 📂 File Structure

```
ackermann-calculator/
├── index.html          # Main page — all sections and layout
├── style.css           # Dark/light theme, responsive layout
├── README.md           # This file
└── js/
    ├── ackermann.js    # Core engine (pure / iterative / memoized / closed-form)
    ├── worker.js       # Web Worker — runs computation off-thread
    ├── tracer.js       # Step-by-step call trace recorder
    ├── ui.js           # DOM wiring, chart rendering, all UI logic
    └── tests.js        # Test suite (run in browser console or Node.js)
```

---

## 🚀 Run Locally

Because the site uses a Web Worker (which requires a real HTTP server), you **cannot** open `index.html` directly as a `file://` URL — the worker will fail.

### Option A — Python (built-in)
```bash
cd ackermann-calculator
python -m http.server 8080
# Open http://localhost:8080
```

### Option B — Node.js `serve`
```bash
npm install -g serve
serve ackermann-calculator
```

### Option C — VS Code Live Server extension
Right-click `index.html` → *Open with Live Server*.

---

## 🧪 Running Tests

**In the browser console** (after opening the site):
```js
// Tests are in js/tests.js — paste or import them
// Quick spot-check:
const r = computeIterative(3, 5);
console.log(r.result === 253n); // true
```

**In Node.js:**
```bash
node js/tests.js
```

Expected output: all ✅ green, `🎉 All tests passed!`

---

## ⚠️ Input Limits

| m | Max safe n | Notes |
|---|---|---|
| 0–2 | Any | Instant via closed-form |
| 3 | ~12 | A(3,12) ≈ 4 billion calls |
| 4 | 1–2 | A(4,2) has 19,729 digits; takes seconds |
| ≥5 | Not supported | Values are incomprehensibly large |

---

## 🌐 Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `ackermann-calculator`)
2. Push the project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/ackermann-calculator.git
   git push -u origin main
   ```
3. In GitHub → Settings → Pages → Source: **Deploy from branch** → `main` / `/ (root)`
4. Your site will be live at `https://YOUR_USERNAME.github.io/ackermann-calculator/`

---

## 🌐 Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Deploy manually**
2. Drag-and-drop the `ackermann-calculator/` folder onto the Netlify dashboard
3. Netlify gives you a live URL instantly (e.g. `https://ackermann-abc.netlify.app`)

Or use the CLI:
```bash
npm install -g netlify-cli
netlify deploy --dir=ackermann-calculator --prod
```

---

## 📸 Screenshots

_(Add screenshots here after deployment)_

| Dark Mode | Light Mode |
|---|---|
| ![dark](screenshots/dark.png) | ![light](screenshots/light.png) |

---

## 📖 References

- [Wikipedia — Ackermann function](https://en.wikipedia.org/wiki/Ackermann_function)
- [Hyperoperation — Wikipedia](https://en.wikipedia.org/wiki/Hyperoperation)
- [Inverse Ackermann & Union-Find — Wikipedia](https://en.wikipedia.org/wiki/Disjoint-set_data_structure)
- Ackermann, W. (1928). *Zum Hilbertschen Aufbau der reellen Zahlen*

---

## 📄 License

MIT — free to use, modify, and distribute.

