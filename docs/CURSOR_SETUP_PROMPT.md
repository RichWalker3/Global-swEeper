# One-time Cursor setup prompt

**Use this once** after you’ve cloned or downloaded Global-sweep and opened the project in Cursor.

1. In Cursor, open the **global-sweep** folder (File → Open Folder).
2. Start a **new chat** (Cmd+L or Ctrl+L).
3. **Copy everything in the box below** and paste it into the chat. Send.
4. Follow any steps the AI suggests (e.g. run `npm install`, copy `.env`).

---

**Copy from here (do not include this line):**

```
I'm setting up Global-sweep on my machine. Please:

1. Confirm Node is v18+ (I can run `node -v` if needed).
2. Run `npm install` in this project if dependencies aren't installed.
3. Remind me to run `npx playwright install chromium` if I haven't already.
4. Remind me to copy env.example to .env and add any keys my team lead provided.
5. Tell me the exact command to launch the app and the URL to open in my browser (e.g. http://localhost:3847).

After that, tell me how to use "/launch sweep" and "/update sweep" in future chats.
```

**Copy until here.**

---

After setup, you can use in any chat in this project:

- **Launch sweep** or **/launch sweep** → start the web app
- **Update sweep** or **/update sweep** → get latest code and reinstall
- **/wa https://example.com** → run a Website Assessment for that URL

See [TEAM_SETUP.md](./TEAM_SETUP.md) for full install and troubleshooting.
