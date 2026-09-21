// infrastructure/main.bicep — every Azure resource online mode needs, deployed into one resource group.
// Storage (Table rows + Blob replays), Web PubSub (the real-time relay), a Functions API on the
// Consumption plan, and a Static Web App that serves index.html. Every service is on its free
// or consumption tier. See infrastructure/docs/SETUP.md for the walkthrough.
@description('Short lowercase name used as a prefix for every resource, e.g. magnetball')
@minLength(3)
@maxLength(14)
param appName string

@description('Azure region for everything except the Static Web App, which picks its own')
param location string = resourceGroup().location

@description('GitHub repository the Static Web App deploys from, owner/repo')
param repo string

var suffix = uniqueString(resourceGroup().id)          // stable per resource group
var storageName = toLower('${appName}${suffix}')        // storage names: 3-24 chars, lowercase, no dashes

// 1. Storage: Table rows for scores and rooms, a Blob container for replay files.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(storageName, 24)
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}
resource tables 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource scoresTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tables
  name: 'scores'
}
resource roomsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tables
  name: 'rooms'
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource replays 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'replays'
  properties: { publicAccess: 'None' }
}

// 2. Web PubSub: the real-time relay. One hub called "match".
resource pubsub 'Microsoft.SignalRService/webPubSub@2023-02-01' = {
  name: '${appName}-pubsub'
  location: location
  sku: { name: 'Free_F1', capacity: 1 }
  properties: {
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false          // the API mints client tokens with the access key
  }
}
resource hub 'Microsoft.SignalRService/webPubSub/hubs@2023-02-01' = {
  parent: pubsub
  name: 'match'
  properties: {
    anonymousConnectPolicy: 'deny'   // every browser needs a token from the API
  }
}

// 3. Functions API on the Consumption plan, Node.js 20, Linux.
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'functionapp'
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }     // reserved = Linux
}
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-insights'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web' }
}
var storageConn = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: '${appName}-api'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      cors: {
        allowedOrigins: [ 'https://${site.properties.defaultHostname}' ]
      }
      appSettings: [
        { name: 'AzureWebJobsStorage', value: storageConn }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'STORAGE_CONNECTION', value: storageConn }
        { name: 'WEBPUBSUB_CONNECTION', value: pubsub.listKeys().primaryConnectionString }
        { name: 'WEBPUBSUB_HUB', value: hub.name }
      ]
    }
  }
}

// 4. Static Web App: serves index.html and friends. The Free tier's region list is short,
//    so it is pinned rather than following `location`.
resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${appName}-site'
  location: 'eastus2'
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    repositoryUrl: 'https://github.com/${repo}'
    branch: 'main'
    buildProperties: {
      appLocation: '/'
      skipGithubActionWorkflowGeneration: true   // .github/workflows/azure.yml is ours
    }
  }
}

// 5. What the workflow needs afterwards. Never output a key.
output apiHost string = api.properties.defaultHostName
output siteHost string = site.properties.defaultHostname
output apiName string = api.name
output siteName string = site.name
output pubsubHost string = pubsub.properties.hostName
