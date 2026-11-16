const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_HOST = 'ctfmuvtvjvlzjiapyrdh.supabase.co';

async function getListing(id) {
  const base = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!base || !key) throw new Error('Supabase image environment is not configured');
  const response = await fetch(base + '/rest/v1/rpc/mare_public_listing', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_imovel_id: id })
  });
  if (!response.ok) throw new Error('Public listing RPC returned ' + response.status);
  const payload = await response.json();
  return Array.isArray(payload) ? (payload[0] || null) : payload;
}

function validPhoto(photo) {
  if (!photo?.url || /^video(?::|$)/i.test(String(photo.legenda || ''))) return false;
  try {
    const u = new URL(photo.url);
    return u.protocol === 'https:' && u.hostname === PROJECT_HOST &&
      u.pathname.startsWith('/storage/v1/object/public/mare-imoveis/') &&
      !/\.(mp4|mov|webm|m4v|avi|m3u8)$/i.test(u.pathname);
  } catch { return false; }
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '');
  if (!UUID.test(id)) { res.status(400).send('Invalid listing id'); return; }

  try {
    const listing = await getListing(id);
    const photos = Array.isArray(listing?.fotos) ? listing.fotos : [];
    const photo = photos.filter(validPhoto).sort((a, b) => {
      if (Boolean(a.capa) !== Boolean(b.capa)) return a.capa ? -1 : 1;
      return Number(a.ordem ?? 999999) - Number(b.ordem ?? 999999);
    })[0];
    if (!photo) { res.status(404).send('No public cover image'); return; }

    const upstream = await fetch(photo.url, { redirect: 'follow' });
    if (!upstream.ok) { res.status(502).send('Image source returned ' + upstream.status); return; }
    const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!contentType.startsWith('image/')) { res.status(415).send('The selected file is not an image'); return; }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) { res.status(413).send('Image size is not supported'); return; }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Content-Disposition', 'inline; filename="bancoimob-cover"');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  } catch (error) {
    console.error('[BancoImob OG image] failed:', error?.message || error);
    res.status(500).send('Unable to load listing image');
  }
}
