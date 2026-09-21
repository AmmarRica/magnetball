// Room tokens — the whole of the matchmaking backend. A room is a four-letter code; the token
// lets one browser join that room's group and send to it, and nothing else. Web PubSub does
// the relaying, so no game state ever passes through this function.
const { app } = require('@azure/functions');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const hub = new WebPubSubServiceClient(process.env.WEBPUBSUB_CONNECTION, process.env.WEBPUBSUB_HUB);

app.http('roomToken', {
  methods: ['GET'], route: 'room-token', authLevel: 'anonymous',
  handler: async (req) => {
    const room = String(req.query.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (room.length !== 4) return { status: 400, body: 'room must be four letters' };
    const userId = String(req.query.get('name') || 'player').slice(0, 24) + '#' + Math.random().toString(36).slice(2, 8);
    const token = await hub.getClientAccessToken({
      userId,
      roles: [`webpubsub.joinLeaveGroup.${room}`, `webpubsub.sendToGroup.${room}`],
      expirationTimeInMinutes: 120,
    });
    return { jsonBody: { url: token.url, room, userId } };
  }
});
