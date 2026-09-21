// Replay store. A replay file is the same JSON saveReplayFile writes to disk — about 25 KB
// for a goal and up to ~800 KB for a whole match — so the cap is 2 MB. The blob name is
// minted here; the client never chooses a path.
const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const crypto = require('crypto');

const replays = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION).getContainerClient('replays');
const MAX = 2 * 1024 * 1024;

app.http('replayPost', {
  methods: ['POST'], route: 'replays', authLevel: 'anonymous',
  handler: async (req) => {
    const text = await req.text();
    if (text.length > MAX) return { status: 413, body: 'replay over 2 MB' };
    let doc; try { doc = JSON.parse(text); } catch { return { status: 400, body: 'not JSON' }; }
    if (doc.format !== 'magnetball-replay') return { status: 400, body: 'not a Magnetball replay' };
    const id = crypto.randomBytes(9).toString('base64url');
    await replays.getBlockBlobClient(id + '.json').upload(text, text.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    return { jsonBody: { id } };
  }
});

app.http('replayGet', {
  methods: ['GET'], route: 'replays/{id}', authLevel: 'anonymous',
  handler: async (req) => {
    const id = String(req.params.id).replace(/[^A-Za-z0-9_-]/g, '');
    const blob = replays.getBlockBlobClient(id + '.json');
    if (!(await blob.exists())) return { status: 404 };
    const buf = await blob.downloadToBuffer();
    return { body: buf, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } };
  }
});
