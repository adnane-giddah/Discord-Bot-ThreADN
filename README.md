# private-BOT — Bulk Thread Creation Discord Bot

A production-grade Discord bot whose core feature is **bulk thread creation**: give it a list of names (typed, pasted, or uploaded as a `.txt`/`.csv` file) and it validates, deduplicates against live Discord state, shows a safety preview, creates the threads with live progress, and reports exactly what succeeded, was skipped, or failed.

## Requirements

- **Node.js 22.5+** (this project uses Node's built-in `node:sqlite` module — no native compilation / Visual Studio Build Tools required, unlike most SQLite libraries).

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` (from the Developer Portal). Set `DISCORD_GUILD_ID` during development for instant command registration to a single test server; leave it blank for global commands (propagation can take up to ~1 hour).
3. Invite the bot to your server with these scopes/permissions:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `View Channels`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Create Private Threads`, `Manage Threads` (also covers setting slowmode on created threads)
4. Register the slash command:
   ```
   npm run deploy-commands
   ```
5. Run the bot:
   ```
   npm run dev      # development, auto-reload
   # or
   npm run build && npm start   # production
   ```

## Commands

All functionality lives under one command group, `/thread`:

- **`/thread create names:<string> [channel] [visibility] [auto_archive] [slowmode] [starting_message]`**
  Quick path: paste a comma- or newline-separated list of names directly as a command option.

- **`/thread bulk [file] [channel] [visibility] [auto_archive] [slowmode] [starting_message]`**
  Bulk path. Attach a `.txt`/`.csv` file to parse it directly; omit `file` to get a popup (modal) with a large multiline paste box instead.

- **`/thread status operation_id:<THR-XXXXXX>`**
  Look up any past or in-progress operation — works even after a bot restart, since it reads straight from the database.

- **`/thread retry operation_id:<THR-XXXXXX>`**
  Re-attempts only the items that failed or were left pending (e.g. after a crash) for that operation. Re-checks live Discord state first, so it never double-creates a thread that already exists.

### Flow

1. You submit names via any of the input methods above.
2. The bot validates them (empty/too-long/duplicate-in-list/duplicate-of-existing-thread) and replies with a **preview embed**: counts of what will be created / skipped / rejected, plus Confirm/Cancel buttons.
3. Large operations (over `BULK_CONFIRM_THRESHOLD`) require typing `CONFIRM` in a follow-up popup before proceeding; operations over `BULK_HARD_MAX` require Administrator.
4. On confirm, the bot creates threads one at a time, editing a single progress message (no channel spam) and persisting each result to the database as it happens — a crash mid-batch never loses already-created threads.
5. A final report is posted with full created/skipped/failed breakdowns (large lists are attached as `.txt` files instead of overflowing the embed).

Re-running the exact same list is always safe: existing threads are detected live (by name, case-insensitively) and reported as "already exists" rather than duplicated.

## Configuration reference (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID` | Bot credentials & optional dev guild for instant command sync | — |
| `DB_PATH` | SQLite database file location | `./data/bot.sqlite3` |
| `LOG_LEVEL` / `LOG_DIR` | Logging verbosity and file output directory | `info` / `./logs` |
| `DEFAULT_AUTO_ARCHIVE_MINUTES` | Default thread auto-archive duration (60/1440/4320/10080) | `1440` |
| `DEFAULT_THREAD_TYPE` | `public` or `private` | `public` |
| `BULK_CONFIRM_THRESHOLD` | Above this thread count, typed `CONFIRM` is required | `25` |
| `BULK_HARD_MAX` | Above this thread count, Administrator is required | `500` |
| `REQUIRED_PERMISSION` | Discord permission (discord.js flag name) needed to run bulk commands | `ManageThreads` |
| `THREAD_CREATE_DELAY_MS` | Delay between individual thread-creation calls | `300` |

## Architecture

```
src/
  commands/thread/     slash command definitions + handlers (thin Discord adapters)
  interactions/        button/modal routing, short-lived interaction state
  services/            reusable core: parsing, validation, duplicate-check, execution, reporting
  thread_manager/      low-level Discord thread creation + error classification
  queue/                per-channel serialization so concurrent ops can't race
  validation/           name normalization + validation rules
  permissions/          Discord permission checks
  database/              SQLite (node:sqlite) schema, migrations, repositories
  logging/                structured logging (pino)
  utils/                  embeds, progress bar, id generation, TTL stores, text chunking
```

The bulk-creation engine (`services/threadCreationService.ts`) is fully decoupled from Discord's command/interaction layer — `planOperation()` and `executeOperation()`/`retryOperation()` take plain data (a channel, a name list, thread options) and can be driven from anything, not just a slash command.

### Restart safety

Every planned thread gets a `pending` database row *before* any Discord API call is made, and each row is updated the instant its outcome is known. If the process crashes or restarts mid-batch, on next boot any operation still `pending`/`running` is marked `interrupted` (never silently resumed) — `/thread status` will show it, and `/thread retry` picks up exactly where it left off.
