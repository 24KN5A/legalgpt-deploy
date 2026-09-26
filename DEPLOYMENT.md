# 🚀 LegalGPT Deployment Guide (Render + Vercel)

This project is now a **production-ready MERN Stack** powered by **Gemini AI** and **MongoDB Atlas**, with zero heavy local dependencies.

---

## 🏛️ Architecture Overview

| Layer | Technology | Deployment Platform |
|---|---|---|
| **Frontend** | React 19, Vite, TypeScript, TailwindCSS v4, Framer Motion | **Vercel** (or Netlify) |
| **Backend API** | Node.js, Express, Mongoose, Multer, Nodemailer | **Render** (or Railway) |
| **Database** | MongoDB Atlas (Cloud Cluster) | **MongoDB Atlas** |
| **LLM & Embeddings** | Google Gemini API (`gemini-flash-lite-latest` / `gemini-3.7-flash`) | **Google AI Studio** |
| **Auth & Security** | JWT, bcryptjs, 6-digit Email OTP Verification | Native Nodemailer + SMTP |

---

## 1. Deploy Backend on Render

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the following settings:
   - **Root Directory:** `server`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (Only uses ~45 MB RAM!)
4. Add the following **Environment Variables**:

| Variable | Value |
|---|---|
| `PORT` | `10000` |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://<username>:<password>@cluster0.e24bunz.mongodb.net/legalgpt?retryWrites=true&w=majority` |
| `GEMINI_API_KEY` | `YOUR_GEMINI_API_KEY` |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` |
| `JWT_SECRET` | `legalgpt_production_super_secret_jwt_key_2026_secure` |
| `OTP_CHANNEL` | `email` |
| `SMTP_HOST` | `smtp.gmail.com` *(optional for live Gmail)* |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | `yourgmail@gmail.com` *(optional)* |
| `SMTP_PASSWORD` | `your-16-char-app-password` *(optional)* |

5. Click **Create Web Service**. Your backend will be live at `https://legalgpt-backend.onrender.com`.

---

## 2. Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import your Git repository.
3. Configure settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add **Environment Variable**:
   - `VITE_API_BASE_URL` = `https://legalgpt-backend.onrender.com/api` (your deployed Render backend URL)
5. Click **Deploy**. Vercel will build and deploy your site in ~30 seconds with automatic HTTPS and SPA routing (`vercel.json`).

---

## 3. Local Development

To run the entire MERN app locally on localhost:

### Start Backend
```powershell
cd server
npm install
npm start
```
*Backend runs on http://127.0.0.1:8000*

### Start Frontend
```powershell
cd frontend
npm install
npm run dev
```
*Frontend runs on http://localhost:5173*
