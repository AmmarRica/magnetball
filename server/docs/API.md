# What is hosted in `server/`

Three small Azure Functions in JavaScript, the same language as the game. They are the only
code that ever holds a storage key or a Web PubSub key; the browser only ever gets a
short-lived room token. Nothing under `server/` is served to a page, which is what keeps the
game itself dependency-free.

Hosted at `https://<appName>-api.azurewebsites.net`, on the Consumption plan (pay per call,
cold-starts after idle). The game learns the address from `online.json`, which the deploy
workflow writes next to `index.html`.

| Route | Method | Purpose | File |
| --- | --- | --- | --- |
| `/api/scores` | GET | The leaderboard, top 100 by RP | `src/scores.js` |
| `/api/scores` | POST | Add or update one player's row | `src/scores.js` |
| `/api/replays` | POST | Store a replay file, returns its id | `src/replays.js` |
| `/api/replays/{id}` | GET | Fetch a stored replay | `src/replays.js` |
| `/api/room-token` | GET | Mint a Web PubSub token for one room | `src/roomToken.js` |

Every route is `authLevel: 'anonymous'`: the game has no accounts, and what each route can
do is bounded by its inputs rather than by who is asking.

## Leaderboard: `/api/scores`

**GET** returns a JSON array of rows in exactly the shape `lbNormalize()` in `index.html`
already reads, sorted by RP descending, at most 100:

```json
[{ "n": "Kai", "rp": 1840, "f": "usa", "eyes": "googly", "color": "#5a7de0" }]
```

Cached for 30 seconds (`Cache-Control: public, max-age=30`).

**POST** takes the form body `lbSubmit()` already sends (`URLSearchParams`, so
`application/x-www-form-urlencoded`): `name`, `rp`, `country`, `eyes`, `color`. One row per
name, keyed case-insensitively, replaced on every submit. Returns `204`. A missing name is
`400`; RP is clamped to 0..100000 and every string is trimmed and capped.

Rows live in the `scores` table of the storage account, partition `global`.

## Replays: `/api/replays`

**POST** takes a replay document as the request body: the same JSON `saveReplayFile` writes
to disk, which must carry `"format": "magnetball-replay"`. About 25 KB for a goal and up to
~800 KB for a whole match; the cap is 2 MB (`413`). Anything that is not JSON or not a
Magnetball replay is `400`. Returns `{ "id": "<12 url-safe characters>" }`. The id is minted
server-side; the client never chooses a path.

**GET** `/api/replays/{id}` returns the stored document with `Content-Type:
application/json`, cached for a day, or `404`.

Files live in the `replays` blob container as `<id>.json`. Nothing lists or deletes them yet;
a blob lifecycle rule (delete after 90 days) is the intended cap.

## Room tokens: `/api/room-token`

**GET** `?room=ABCD&name=<display name>`. The room code is four letters, upper-cased and
stripped of anything else; anything that is not four letters is `400`. Returns:

```json
{ "url": "wss://...webpubsub.azure.com/client/hubs/match?access_token=...", "room": "ABCD", "userId": "Kai#k3j9x1" }
```

The token is valid for two hours and carries exactly two roles: join or leave the group
`ABCD`, and send to it. It can do nothing else on the hub. The browser opens `url` as a plain
`WebSocket` with the `json.webpubsub.azure.v1` subprotocol, sends
`{ "type": "joinGroup", "group": "ABCD" }`, and from then on every
`{ "type": "sendToGroup", "group": "ABCD", "data": ... }` reaches the other browsers in the
room. Web PubSub does the relaying; no game state passes through this API.

## Configuration

Read from the Function App's settings, which `infrastructure/main.bicep` writes at deploy
time:

| Setting | Meaning |
| --- | --- |
| `STORAGE_CONNECTION` | The storage account's connection string (tables and blobs) |
| `WEBPUBSUB_CONNECTION` | The Web PubSub connection string, used only to mint tokens |
| `WEBPUBSUB_HUB` | The hub name, `match` |
| `AzureWebJobsStorage` | The Functions runtime's own storage; same account |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Logs and failures, viewable in the portal |

## Running it on your machine

Needs Node.js 20 or newer and Azure Functions Core Tools v4:

```powershell
npm install -g azure-functions-core-tools@4
cd server
npm install
func start
```

`func start` reads `server/local.settings.json`, which you write once with the two connection
strings from the portal (Storage account, Access keys; Web PubSub, Keys). It is gitignored and
must stay that way:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "<storage connection string>",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "STORAGE_CONNECTION": "<storage connection string>",
    "WEBPUBSUB_CONNECTION": "<web pubsub connection string>",
    "WEBPUBSUB_HUB": "match"
  },
  "Host": { "CORS": "*" }
}
```

When it is right the console lists `scoresGet`, `scoresPost`, `replayPost`, `replayGet` and
`roomToken` with their local URLs.

## Deploying

`.github/workflows/azure.yml` does it on every push to `main`: `npm ci --omit=dev` in this
folder, then `Azure/functions-action` publishes it to the Function App the Bicep created.
`package-lock.json` is committed so that `npm ci` is reproducible; `node_modules/` is not.

## The match server is separate

`server/match/` is not a Function: it is a container running the game itself, and it has
its own document, `MATCH-SERVER.md`. `.funcignore` keeps it out of the Functions deploy.
The two meet at `/api/room-token`, which is how a player gets onto the hub the match
server broadcasts on.

## Not built yet

- Pointing `lbLoad`/`lbSubmit` at `/api/scores` when `online.json` names the API. The
  game reads `online.json` at boot now (`onlineLoad` in `index.html`) and uses it for the
  match server; the leaderboard still goes to the Google Sheet.
- Listing and deleting replays, and any rate limiting on the POST routes.
