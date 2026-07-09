<h1>This is a Todo app built entirely using Agentic CLI. Purpose is for my own experimentation and learning.</h1>

Model used for development: Sonnet 4.6 (subsequently changed to Sonnet 5)
Evaluaation Model: Opus 4.8 (generated evaluation_results.md)


## Clone and Setup Todo App

### Install Dependencies
```bash
# Install all npm packages (this may take a few minutes)
npm install
```

---

## Run the Application

### Start Development Server
```bash
npm run dev
```

Expected output:
```
  ▲ Next.js 16.0.1
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 1.5s
```

### Access the Application
1. Open browser
2. Navigate to: **http://localhost:3000**
3. You should see the **Login** page

### First-Time Setup
1. **Register a new account**:
   - Enter username (e.g., "testuser")
   - Click "Register"
   - Follow WebAuthn prompt (use fingerprint/face ID/PIN)
   
2. **Create your first todo**:
   - Enter todo title: "Test my first todo"
   - Click "Add"
   - Todo appears in list ✅

### Stop the Server
Press `Ctrl+C` in the terminal running `npm run dev`

---


## Verify Core Features

Use this checklist to verify the app is working correctly.

### ✅ Authentication
```bash
# Open http://localhost:3000/login
1. Register with username: "copilot-test-user"
2. Verify WebAuthn prompt appears
3. Complete registration
4. Logout and login again
5. Verify session persists after page reload
```

### ✅ Todo CRUD
```
1. Create todo: "Buy groceries"
2. Set priority: High
3. Set due date: Tomorrow 2:00 PM
4. Edit todo title to: "Buy groceries and cook"
5. Toggle completion checkbox
6. Delete todo
```

### ✅ Recurring Todos
```
1. Create todo: "Daily standup"
2. Check "Repeat" checkbox
3. Select "Daily" pattern
4. Set due date: Tomorrow 9:00 AM
5. Complete the todo
6. Verify new instance created for next day
```

### ✅ Subtasks
```
1. Create todo: "Prepare presentation"
2. Click to expand subtasks
3. Add subtask: "Create slides"
4. Add subtask: "Rehearse speech"
5. Check first subtask
6. Verify progress shows "1/2 completed (50%)"
```

### ✅ Tags
```
1. Click "Manage Tags" button
2. Create tag: "work" (color: #3B82F6)
3. Create tag: "urgent" (color: #EF4444)
4. Assign both tags to a todo
5. Filter by "work" tag
6. Verify only tagged todos shown
```

### ✅ Templates
```
1. Create todo with desired settings
2. Click "Save as Template"
3. Enter name: "Meeting Task"
4. Add subtasks before saving
5. Later, click "Use Template"
6. Verify new todo created with all settings
```

### ✅ Reminders
```
1. Click "Enable Notifications" (grant permission)
2. Create todo with due date in 20 minutes
3. Set reminder: "15 minutes before"
4. Wait 5 minutes
5. Browser notification should appear
```

### ✅ Calendar View
```
1. Navigate to http://localhost:3000/calendar
2. Verify current month displayed
3. Create todos with different due dates
4. Verify todos appear on correct calendar cells
5. Click prev/next month buttons
```

### ✅ Search & Filter
```
1. Create multiple todos
2. Type in search box: "meeting"
3. Verify filtered results
4. Select priority filter: "High"
5. Verify combined filters work
```

### ✅ Export/Import
```
1. Create several todos with tags and subtasks
2. Click "Export Todos"
3. Verify JSON file downloads
4. Delete all todos
5. Click "Import Todos" and select file
6. Verify todos restored with all metadata
```

---

### Node.js / npm Issues

**Problem**: `npm install` fails

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

**Problem**: Port 3000 already in use

**Solutions**:
```bash
# Option 1: Kill process on port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Option 2: Use different port
npm run dev -- -p 3001
```

---

### Database Issues

**Problem**: Database locked or corrupted

**Solutions**:
```bash
# Stop dev server (Ctrl+C)

# Delete database file
rm todos.db

# Restart server (recreates database)
npm run dev
```

**Problem**: Missing holidays

**Solutions**:
```bash
# Run seed script
npx tsx scripts/seed-holidays.ts
```

---

### WebAuthn / Authentication Issues

**Problem**: WebAuthn not working in browser

**Solutions**:
1. Use supported browser:
   - ✅ Chrome/Edge (recommended)
   - ✅ Firefox
   - ✅ Safari
2. Enable HTTPS or use localhost (required for WebAuthn)
3. Check browser supports WebAuthn:
   - Visit: https://webauthn.io
   - Test if authentication works

**Problem**: Can't login after registration

**Solutions**:
1. Clear browser data (cookies, localStorage)
2. Delete `todos.db` and re-register
3. Check browser console for errors (F12)

---

### Playwright Testing Issues

**Problem**: Tests fail to run

**Solutions**:
```bash
# Install Playwright browsers
npx playwright install

# Run with headed mode to see what's happening
npx playwright test --headed

# Run specific test
npx playwright test tests/01-authentication.spec.ts
```

---

### Run Tests
```bash
# Run all tests
npx playwright test

# View test report
npx playwright show-report
```

---


### 5. Build for Production
```bash
# Create production build
npm run build

# Start production server
npm start
```

---

## Quick Reference Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint

# Testing
npx playwright test                    # Run all tests
npx playwright test --ui              # Interactive mode
npx playwright test --headed          # See browser
npx playwright show-report            # View results

# Database
npx tsx scripts/seed-holidays.ts      # Seed holidays
sqlite3 todos.db                       # Inspect database

# Copilot
Ctrl+Alt+I (Cmd+Alt+I)                # Open Copilot Chat
Ctrl+I (Cmd+I)                        # Inline Copilot
Tab                                    # Accept suggestion
Esc                                    # Dismiss suggestion
```
