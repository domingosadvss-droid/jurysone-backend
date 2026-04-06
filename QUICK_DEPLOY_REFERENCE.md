# ⚡ QUICK DEPLOY REFERENCE
**JurysOne — 30-Minute Deployment**

---

## 🎯 ONE-PAGE CHECKLIST

### Step 1: Supabase (5 min)
- [ ] Go to https://app.supabase.com
- [ ] New Project → `jurysone`, region `sa-east-1`
- [ ] Wait for creation
- [ ] Settings → Database → Copy these 4 values:
  ```
  DATABASE_URL=postgresql://...?pgbouncer=true
  DIRECT_URL=postgresql://...
  SUPABASE_URL=https://xxxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  ```

### Step 2: Gemini (2 min)
- [ ] Go to https://aistudio.google.com/app/apikey
- [ ] Create API Key
- [ ] Copy:
  ```
  GEMINI_API_KEY=AIza...
  ```

### Step 3: Redis (2 min)
- [ ] Go to https://console.upstash.com
- [ ] New Redis Database
- [ ] Copy:
  ```
  REDIS_URL=redis://default:...
  ```

### Step 4: Render (10 min)
- [ ] Go to https://dashboard.render.com
- [ ] New → Web Service → Connect GitHub
- [ ] Search `jurysone`, click Connect
- [ ] Set:
  ```
  Name: jurysone
  Environment: Node
  Region: São Paulo (sa-east-1)
  Build: npm run build
  Start: node dist/main
  ```
- [ ] Environment → Add ALL 13 vars (see below)
- [ ] Deploy

### Step 5: Validate (5 min)
- [ ] Wait for build (3-5 min)
- [ ] Test: `curl https://jurysone-xxxxx.onrender.com/api/health`
- [ ] Should return: `{"status":"ok","timestamp":...}`
- [ ] Open login: `https://jurysone-xxxxx.onrender.com/login.html`
- [ ] Login: `domingos.advss@gmail.com` / `Admin@JurysOne2024!`
- [ ] Check 🤖 widget responds

**DONE!** ✅

---

## 📋 COPY-PASTE VARIABLES

Add these 13 to Render → Environment:

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://postgres.xxxxx:PASSWORD@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxxx:PASSWORD@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
JWT_SECRET=<GENERATE: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRES_IN=3600
FRONTEND_URL=https://jurysone-xxxxx.onrender.com
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=AIza...
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@jurysone.com.br
REDIS_URL=redis://default:password@host:port
```

---

## 🔧 IF SOMETHING BREAKS

### "Build failed: P1002"
- Copy DATABASE_URL again from Supabase Settings → Database
- Make sure it has `?pgbouncer=true`

### "JWT verification failed"
- Generate new JWT_SECRET:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Update in Render, redeploy

### "Widget doesn't respond"
- Check GEMINI_API_KEY is correct
- Test key at https://aistudio.google.com
- Redeploy after fixing

### "Can't connect to database"
- Test DATABASE_URL locally:
  ```bash
  psql "postgresql://..."
  ```
- If fails, regenerate in Supabase

---

## 📍 Key URLs During Deploy

| Service | URL |
|---------|-----|
| Supabase | https://app.supabase.com |
| Gemini | https://aistudio.google.com/app/apikey |
| Upstash | https://console.upstash.com |
| Render | https://dashboard.render.com |
| Your App | https://jurysone-xxxxx.onrender.com |
| API Health | https://jurysone-xxxxx.onrender.com/api/health |
| Dashboard | https://jurysone-xxxxx.onrender.com/ |
| Login | https://jurysone-xxxxx.onrender.com/login.html |

---

## ⏱️ Timeline

```
0-5 min:   Supabase setup
5-7 min:   Gemini key
7-9 min:   Redis
9-19 min:  Render config + deploy
19-24 min: Build in progress
24-29 min: Post-deploy tests
29-30 min: Success!
```

---

## ✅ Success Indicators

- ✅ `/api/health` returns 200
- ✅ Login works with token
- ✅ 🤖 Widget loads
- ✅ Widget responds to message
- ✅ No errors in Render Logs
- ✅ Database seed worked

---

## 📞 Full Docs (If You Need Details)

- `DEPLOYMENT_READINESS_REPORT.md` — Full assessment
- `RENDER_DEPLOYMENT_CHECKLIST.md` — Detailed walkthrough
- `API_CONFIGURATION_GUIDE.md` — Each API explained

---

**Est. Time:** 30 minutes
**Difficulty:** Easy (mostly copy-paste)
**Blocker Risk:** Low (all SDKs pre-installed)

🚀 **Let's go!**
