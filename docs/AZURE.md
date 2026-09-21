# Magnetball online mode on Azure

Online mode is four Azure services, created by one Bicep file and deployed by one GitHub
Actions workflow. Nothing about the game itself moves: `index.html` stays a single
dependency-free file, and the API under `api/` is never served to a browser.

| Piece | Azure service | Files |
| --- | --- | --- |
| Game hosting | Static Web App (Free) | `staticwebapp.config.json` |
| Real-time relay (rooms) | Web PubSub (Free) | `api/src/roomToken.js` |
| Leaderboard + replay API | Functions, Consumption plan, Node 20 | `api/` |
| Scores, rooms, replay files | Storage account: Table + Blob | created by `infra/main.bicep` |

Everything is created by `infra/main.bicep`; the three values that differ per environment
are in `infra/main.bicepparam`. `.github/workflows/azure.yml` runs on every push to `main`
and does the deploy in three jobs: resources, API, then the game with an `online.json`
beside it that names the API. That file is written by the workflow and never committed, so
a `file://` copy or GitHub Pages simply has no online mode.

## One-time setup (about 15 minutes, on your own machine)

These steps are the only part that needs your Azure login. Commands are for PowerShell on
Windows; on macOS or Linux they are the same words in bash.

1. **Azure subscription.** Sign up at portal.azure.com. A new account gets a free tier of
   every service above.

2. **Install the Azure CLI and log in.**

   ```powershell
   winget install Microsoft.AzureCLI
   # close and reopen PowerShell so `az` is on the path
   az login
   az account list --output table
   az account set --subscription "<subscription id from the table>"
   ```

3. **Register the three services once.** Each takes about a minute in the background.

   ```powershell
   az provider register --namespace Microsoft.Web
   az provider register --namespace Microsoft.SignalRService
   az provider register --namespace Microsoft.Storage
   ```

4. **Create the identity GitHub deploys as.** PowerShell continues a line with a backtick,
   not a backslash.

   ```powershell
   az ad sp create-for-rbac --name magnetball-deploy --role Contributor `
     --scopes /subscriptions/<subscription id> --sdk-auth
   ```

   It prints a JSON block starting with `clientId`. Copy the whole block.

5. **Store it as the repo's one secret.** On GitHub: the repo, Settings, Secrets and
   variables, Actions, New repository secret. Name `AZURE_CREDENTIALS`, value = the JSON.
   Never commit it or paste it anywhere else. Every other key is read by the workflow from
   Azure after Bicep has created the resources.

## The first deploy

Merge the branch carrying these files into `main`, or press **Run workflow** on
*Deploy to Azure* under the repo's Actions tab. The first run takes about four minutes,
creates the resource group `magnetball-rg` and every resource in it, and the last step of
the *Deploy the game* job prints the two addresses:

```
Game at https://magnetball-site.azurestaticapps.net  API at https://magnetball-api.azurewebsites.net
```

Then check each piece on its own, in this order, so a failure points at one thing:

| Check | How | Expected |
| --- | --- | --- |
| API alive | open `https://magnetball-api.azurewebsites.net/api/scores` | `[]` |
| Leaderboard write | `curl.exe -X POST -d "name=Test&rp=1200&country=usa" https://magnetball-api.azurewebsites.net/api/scores` then the GET again | one row |
| Room token | open `https://magnetball-api.azurewebsites.net/api/room-token?room=ABCD` | JSON with a `wss://` URL |
| Site | open `https://magnetball-site.azurestaticapps.net` and `/online.json` | the game boots; the JSON names the API |

Re-running the workflow with nothing changed reports every resource unchanged and finishes
in about a minute, which is what makes it safe to run on every push.

## What each file is

- `infra/main.bicep` — every resource. `uniqueString` makes the storage account name yours
  (they are global across Azure). The Function App's CORS list is the Static Web App's own
  hostname, so a browser on the site is the only origin the API answers; add
  `http://localhost:8080` while developing. Both keys are wired by `listKeys()` at deploy
  time into the Function App's settings and are never output.
- `infra/main.bicepparam` — `appName` (the prefix of every hostname) and `repo`.
- `api/src/scores.js` — GET and POST `/api/scores`. The POST takes exactly the form body
  `lbSubmit()` already sends and the GET returns rows in the shape `lbNormalize()` reads,
  so the game changes one URL and nothing else.
- `api/src/replays.js` — POST `/api/replays` stores a `magnetball-replay` JSON (2 MB cap)
  under a server-minted id; GET `/api/replays/{id}` returns it.
- `api/src/roomToken.js` — GET `/api/room-token?room=ABCD` mints a Web PubSub token that
  can join and send to that one room group and nothing else. The relay does the rest; no
  game state passes through the API.
- `api/package.json` and `api/package-lock.json` — the API's own dependencies. The repo root
  still has none, on purpose.
- `staticwebapp.config.json` — keeps `sw.js`, `online.json` and `index.html` uncached so a
  deploy reaches players on the next reload.
- `.github/workflows/azure.yml` — the deploy. The Static Web App's deployment token is read
  at deploy time under the service principal's login and masked, so `AZURE_CREDENTIALS`
  stays the only secret in GitHub.

## Running the API on your machine

`func start` (Azure Functions Core Tools v4, `npm install -g azure-functions-core-tools@4`)
reads `api/local.settings.json`, which you write once with the two connection strings from
the portal. It is gitignored and must stay that way.

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

## Costs and limits

As written everything is on a free or free-grant tier and a hobby game costs pennies a
month, all of it storage. The limit that bites first is Web PubSub's Free tier: 20
concurrent connections and 20,000 messages a day, which at 20 snapshots a second is about
16 minutes of play a day. `Standard_S1` in `main.bicep` lifts that to 1,000 connections and
a million messages a day for about 1.6 USD a day. Set a budget alert in Cost Management
(5 USD a month, email at 80%) in the first week.

## Game-side wiring

Not done yet. The game needs about sixty lines using only `fetch` and `WebSocket`: read
`./online.json` at boot (absent means online is off), point `lbLoad`/`lbSubmit` at the API
when it is set, and a `roomJoin`/`roomSend`/`roomLeave` trio over Web PubSub's
`json.webpubsub.azure.v1` subprotocol. The open design decision is what travels over the
socket: host-runs-the-match with the guest sending its pad and the host sending snapshots
is the one to build first.
