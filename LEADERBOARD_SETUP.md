# Magnetball — Google Sheet leaderboard setup

The game reads a **global leaderboard** straight from your Google Sheet, and can
submit each player's score back to it. There are two capabilities and they're
independent:

| Capability | What it needs | Effort |
|---|---|---|
| **Read** the board in-game | Sheet shared so anyone can *view* | 30 seconds |
| **Write** scores from the game | A tiny Apps Script Web App (below) | ~3 minutes |

> Why a script for writing? "Anyone can edit" in Google Sheets applies to
> **humans in the Google UI** — there is no anonymous public API that lets a web
> page append a row to your sheet. The standard, free, no-server fix is a Google
> **Apps Script Web App**: it runs *as you*, so it can write to the sheet, while
> being callable by anyone. The game talks to that.

Your sheet is already wired in: its ID is set in `index.html`
(`LB.sheetId = '1zaWdcOfWnmEEyHjVuczidZ6HtapPaiPl_Ls8NYVBE9U'`). If you make a
new sheet, update that value.

---

## 1. Set up the sheet (human-readable)

1. Open your sheet.
2. Rename the first tab to **`Scores`**.
3. Put these headers in row 1 (exact spelling, any capitalisation):

   | Timestamp | Name | RP | Country | Eyes | Colour |
   |-----------|------|----|---------|------|--------|

   The game reads the **Name**, **RP**, **Country**, **Eyes** and **Colour**
   columns by their header text, so the column order doesn't matter and extra
   columns are ignored. `RP` should be a number so the sheet sorts nicely.

That's it — the sheet stays perfectly readable if you just open it.

---

### Seed it with mock data (so you can see it working)

I can't write to your sheet for you (Google has no anonymous write API — that's
what the Apps Script in step 3 is for). But you can drop in a set of test rows in
5 seconds:

1. Open [`mock-scores.tsv`](./mock-scores.tsv) in this folder and **copy all of it**.
2. In your sheet, click cell **A1** of the `Scores` tab and **paste**. Google
   splits the tab-separated columns automatically, headers included.

Now open the in-game **Leaderboard** — once the sheet is view-shared (next step)
it should show these 24 players ranked, with your own RP slotted in. That proves
the live read path end-to-end. Delete the mock rows whenever you want real data
to take over.

## 2. Make the board readable in-game (READ)

Share so anyone can view (either option works):

- **Share button → General access → "Anyone with the link" → Viewer**, **or**
- **File → Share → Publish to web → Entire document → Publish.**

The game reads through Google's public `gviz` JSON endpoint, so no key is
needed. Open the in-game **Leaderboard** screen — the subtitle shows **· live**
when it's reading your sheet (and **· offline sample** if it can't reach it, so
the screen is never empty). Tap **↻ Refresh** to re-pull.

> If a match has been played, "You" always appears in the list using your local
> RP even before your row lands in the sheet.

---

## 3. Enable score submission (WRITE) — optional but recommended

1. In the sheet, go to **Extensions → Apps Script**.
2. Delete whatever is there and paste the script from
   [**`leaderboard.gs`**](./leaderboard.gs) (in this folder).
3. Click **Deploy → New deployment**.
   - Gear ⚙ → type **Web app**.
   - **Execute as:** *Me*.
   - **Who has access:** **Anyone**.
   - **Deploy**, authorise when prompted (it's your own script).
4. Copy the **Web app URL** — it ends in `/exec`.
5. In `index.html`, set:

   ```js
   const LB = {
     sheetId : '…',
     gid     : '0',
     endpoint: 'PASTE_YOUR_/exec_URL_HERE',   // ← this line
     top     : 100,
   };
   ```

6. Commit & deploy. Done — finishing a match now writes your score, and the
   board reads through the same script (one row per player, best RP kept).

### Replays (Save clip → sheet)
Once the Apps Script is deployed and `LB.endpoint` is set, the game's **Save clip**
button also posts the goal's **replay data** — the re-simulatable frame buffer, not
the video (a Sheet can't hold binary) — to a **Replays** tab. That tab is created
automatically on the first save, with columns `Timestamp | Name | Country | Field |
Players | Frames | Data`. The button shows **✓ Saved to sheet** on success, or
**⚠ Sheet not connected** if you haven't set `LB.endpoint` yet. Frames are
downsampled + rounded so each replay fits in one cell.

### How submission behaves
- Scores are posted automatically at the end of every ranked match
  (`recordResult`).
- The script **upserts by name**: one row per player, keeping their **highest**
  RP — so the sheet stays clean and sorted, not an endless append log.
- Requests are plain form-encoded POSTs (a "simple" CORS request), so there's no
  preflight and it works straight from the static GitHub Pages site.

---

## Testing the endpoint

- **Read:** open `YOUR_/exec_URL?action=top&n=10` in a browser → JSON array of
  `{name, rp, country, eyes, color}`.
- **Write:** `YOUR_/exec_URL?action=add&name=Test&rp=1234&country=japan` (the
  script also accepts writes via GET for easy testing) → `{ok:true}`, and a
  `Test` row appears in the sheet.

## Troubleshooting
- **Board says "offline sample":** the sheet isn't view-shared yet (step 2), or
  the tab `gid` isn't `0`. The `gid` is the number after `gid=` in the sheet URL.
- **Scores don't save:** `LB.endpoint` is empty, or the deployment's *Who has
  access* isn't **Anyone**. Re-deploy as a **New deployment** after edits (Apps
  Script versions the URL).
