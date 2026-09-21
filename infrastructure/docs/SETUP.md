# Setting up Azure for Magnetball online mode

Step-by-step, from a fresh Azure account to the first deploy. Steps 1 to 5 are done once, on
your own machine, and are the only part that needs your Azure login. After that a push to
`main` deploys everything through `.github/workflows/azure.yml`.

Commands are for PowerShell on Windows. On macOS or Linux they are the same words in bash,
with a backslash instead of the backtick to continue a line.

## 1. Azure account and subscription

Sign up at portal.azure.com. A tenant is created for you but no subscription is, so if
`az login` later says "No subscriptions found", add one: in the portal search for
**Subscriptions**, press **Add**, and pick **Free Trial** or **Pay-As-You-Go**. Every service
this setup creates is on a free tier.

## 2. Install the Azure CLI and log in

```powershell
winget install Microsoft.AzureCLI
# close and reopen PowerShell so `az` is on the path
az login
az account list --output table
az account set --subscription "<subscription id from the table>"
```

If `az login` fails with `AADSTS50076` (multi-factor authentication required), log in to the
tenant it names so the browser runs the second-factor step:

```powershell
az login --tenant <tenant id from the error>
```

## 3. Register the three services once

Each takes about a minute in the background; "Registering is still on-going" is normal and
nothing waits on it.

```powershell
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.SignalRService
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

Web PubSub lives under the SignalRService namespace, which is why that name appears. The
last two are for the match server's container and its logs.

## 4. Create the identity GitHub deploys as

```powershell
$sub = az account show --query id -o tsv
az ad sp create-for-rbac --name magnetball-deploy --role Contributor `
  --scopes "/subscriptions/$sub" --sdk-auth
```

It prints a JSON block starting with `{ "clientId": ...`. Copy the whole block, braces
included. It is a client secret: it grants Contributor on the subscription and expires in a
year by default.

## 5. Store it as the repo's one secret

On GitHub: the repo, **Settings**, **Secrets and variables**, **Actions**, **New repository
secret**. Name `AZURE_CREDENTIALS`, value = the pasted JSON, **Add secret**.

Never commit it or paste it anywhere else. It is the only secret you create by hand; every
other key (storage, Web PubSub, the Static Web App's deployment token) is read by the
workflow from Azure after Bicep has created the resources, and none of them is ever written
to the repo or to a log.

## 6. The first deploy

Merge the branch carrying `infrastructure/`, `server/` and the workflow into `main`, or press
**Run workflow** on *Deploy to Azure* under the repo's **Actions** tab. The first run takes
about six minutes, in four jobs:

1. **Build the match server image** builds `server/match/Dockerfile` and pushes it to
   GitHub's container registry as `ghcr.io/<you>/magnetball-match`. Needs no Azure login.
2. **Create Azure resources (Bicep)** creates the resource group `magnetball-rg` and every
   resource in `infrastructure/main.bicep`, the match server's container included.
3. **Deploy the Functions API** installs `server/`'s dependencies and publishes it.
4. **Deploy the game** uploads `index.html` and the runtime files with an `online.json`
   beside them naming the API and the match server, and prints the addresses at the end:

```
Game at https://magnetball-site.azurestaticapps.net  API at https://magnetball-api.azurewebsites.net  Match server at https://magnetball-match.<region>.azurecontainerapps.io
```

⚠️ **Once, after the first run: make the image public.** Azure pulls it anonymously. On
GitHub, your profile → **Packages** → `magnetball-match` → **Package settings** → **Change
visibility** → Public. Then re-run the workflow (or wait for the next push). Until then the
container shows a pull error in the portal and *Play online* in the game fails with *could
not join*. See `server/docs/MATCH-SERVER.md` for the private-registry alternative.

Re-running with nothing changed reports every resource unchanged and finishes in about a
minute, which is what makes it safe to run on every push.

## 7. Check each piece

In this order, so a failure points at one thing.

| Check | How | Expected |
| --- | --- | --- |
| API alive | open `https://magnetball-api.azurewebsites.net/api/scores` | `[]` |
| Leaderboard write | `curl.exe -X POST -d "name=Test&rp=1200&country=usa" https://magnetball-api.azurewebsites.net/api/scores` then the GET again | one row |
| Room token | open `https://magnetball-api.azurewebsites.net/api/room-token?room=ABCD` | JSON with a `wss://` URL |
| Site | open `https://magnetball-site.azurestaticapps.net` and `/online.json` | the game boots; the JSON names the API |
| CORS | on the site, in the browser console: `fetch('/online.json').then(r=>r.json()).then(o=>fetch(o.api+'/api/scores'))` | 200, no CORS error |
| Match server | open `https://magnetball-match.<region>.azurecontainerapps.io/health` (the address the workflow printed) | `{"ok":true,...}` after a cold start of 10–20 s |
| A hosted match | on the site, **Match → Game → Online**: type `ABCD`, *Play online*, on two devices | the second one to press starts the match on both |

The first API call after a quiet spell can take two to three seconds: the Consumption plan
cold-starts. That is a delay, not an error.

## Changing things later

- **Region:** `LOCATION` at the top of `.github/workflows/azure.yml`. The Static Web App
  pins its own region in `main.bicep` because the Free tier is offered in few of them.
- **Hostnames:** `appName` in `infrastructure/main.bicepparam` is the prefix of every
  resource name. Changing it creates a new set of resources; delete the old resource group
  in the portal when you are sure.
- **Rotating a key:** regenerate it in the portal (Storage account, Access keys; Web PubSub,
  Keys) and re-run the workflow. `listKeys()` in the Bicep reads the new one and rewrites
  the Function App's settings. Nothing in the repo or in GitHub changes.
- **Tearing everything down:** `az group delete --name magnetball-rg`. One command, since
  every resource is in that group.

## Troubleshooting

| You see | Cause | Fix |
| --- | --- | --- |
| `StorageAccountAlreadyTaken` in the Bicep job | `appName` plus the hash collided with a name elsewhere on Azure | change `appName`; the hash is per resource group, so a new name is a new account |
| `The subscription is not registered to use namespace 'Microsoft.SignalRService'` | step 3 was skipped | run the three `az provider register` lines, wait a minute, re-run |
| `LocationNotAvailableForResourceType` on the Static Web App | the Free tier is only offered in a few regions | keep `location: 'eastus2'` in the `site` resource; it does not need to match the rest |
| `AuthorizationFailed` in the Bicep job | the service principal has no role on the subscription | re-run step 4 and update the `AZURE_CREDENTIALS` secret |
| API deploys but `/api/scores` is 404 | `main` in `server/package.json` does not point at `src/*.js` | it must be `"main": "src/*.js"`; `func start` locally lists the three functions when it is right |
| Browser console: blocked by CORS | the site is on a hostname the Function App's CORS list does not carry | add it to `allowedOrigins` in `main.bicep`, or for local work `az functionapp cors add --allowed-origins http://localhost:8080` |
| Game shows the offline sample leaderboard on the site | `online.json` missing or its `api` value is not `https://` | open `/online.json` in the browser; if 404 the *Deploy the game* job's staging step did not write it |
| WebSocket closes at once with code 1008 | the token's roles do not cover the group | join the group under the exact `room` value the token response returns |
| Web PubSub refuses connections after a busy evening | the Free tier's 20,000 messages a day is spent | wait for the daily reset or move `sku` to `Standard_S1` in `main.bicep` |
| Container App: `UNAUTHORIZED` or `manifest unknown` pulling the image | the GitHub package is private | make `magnetball-match` public under your GitHub Packages, then re-run |
| *Play online* says *could not join* | the match server is down or cold, or `online.json` has no `match` entry | open `/online.json` on the site, then the `/health` address in it; the first request after idle takes 10–20 s |
| A hosted match stops dead after five minutes | the container scaled to zero mid-match | the game sends a heartbeat every 30 s; check the browser can reach the match server's address (a blocked `GET /match/ABCD` is the usual cause) |
| `The subscription is not registered to use namespace 'Microsoft.App'` | step 3's last two lines were skipped | run them, wait a minute, re-run |
| Static Web App deploy: `The content server has rejected the request` | `app_location` has no `index.html`, or `skip_app_build` is missing | confirm `dist/index.html` exists in the log and keep `skip_app_build: true` |

For anything else, the two log sources are the Actions run for deployment and Application
Insights (portal, `magnetball-insights`, Failures) for what the API did at runtime.
