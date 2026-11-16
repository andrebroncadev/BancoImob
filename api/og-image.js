import sharp from 'sharp';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_HOST = 'ctfmuvtvjvlzjiapyrdh.supabase.co';
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 300 * 1024;

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

async function optimizedJpeg(input) {
  const base = sharp(input, { failOn: 'none' }).rotate().resize(1200, 800, {
    fit: 'cover', position: 'attention', withoutEnlargement: false
  });
  for (const quality of [76, 68, 60, 52, 44, 36]) {
    const output = await base.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
    if (output.length <= MAX_OUTPUT_BYTES) return output;
  }
  throw new Error('Unable to compress the cover below 300 KB');
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
    const sourceType = String(upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!sourceType.startsWith('image/')) { res.status(415).send('The selected file is not an image'); return; }
    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_INPUT_BYTES) { res.status(413).send('Source image is too large'); return; }
    const input = Buffer.from(await upstream.arrayBuffer());
    if (!input.length || input.length > MAX_INPUT_BYTES) { res.status(413).send('Source image is too large'); return; }

    const jpeg = await optimizedJpeg(input);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(jpeg.length));
    res.setHeader('Content-Disposition', 'inline; filename="bancoimob-og.jpg"');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-OG-Width', '1200');
    res.setHeader('X-OG-Height', '800');
    res.setHeader('X-OG-Bytes', String(jpeg.length));
    res.status(200).send(jpeg);
  } catch (error) {
    console.error('[BancoImob OG image] failed:', error?.message || error);
    res.status(500).send('Unable to load listing image');
  }
}
