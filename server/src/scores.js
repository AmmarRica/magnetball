// Leaderboard. The POST takes exactly the form body lbSubmit() in index.html already sends
// (name, rp, country, eyes, color) and the GET returns rows in the shape lbNormalize()
// already reads ({n, rp, f, eyes, color}), so the game changes one URL and nothing else.
const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const scores = TableClient.fromConnectionString(process.env.STORAGE_CONNECTION, 'scores');
const clean = (s, n) => String(s ?? '').trim().slice(0, n);

app.http('scoresGet', {
  methods: ['GET'], route: 'scores', authLevel: 'anonymous',
  handler: async () => {
    const rows = [];
    for await (const e of scores.listEntities({ queryOptions: { filter: "PartitionKey eq 'global'" } })) {
      rows.push({ n: e.name, rp: e.rp, f: e.country, eyes: e.eyes, color: e.color });
    }
    rows.sort((a, b) => b.rp - a.rp);
    return { jsonBody: rows.slice(0, 100), headers: { 'Cache-Control': 'public, max-age=30' } };
  }
});

app.http('scoresPost', {
  methods: ['POST'], route: 'scores', authLevel: 'anonymous',
  handler: async (req) => {
    const f = await req.formData();                       // lbSubmit posts URLSearchParams
    const name = clean(f.get('name'), 24);
    const rp = Math.max(0, Math.min(100000, Math.round(+f.get('rp') || 0)));
    if (!name) return { status: 400, body: 'name required' };
    await scores.upsertEntity({
      partitionKey: 'global', rowKey: name.toLowerCase(),
      name, rp, country: clean(f.get('country') || 'none', 24),
      eyes: clean(f.get('eyes') || 'googly', 24), color: clean(f.get('color'), 12),
      at: new Date().toISOString(),
    }, 'Replace');
    return { status: 204 };
  }
});
