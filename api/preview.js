const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPublicImage(photo) {
  if (!photo?.url || /^video(?::|$)/i.test(String(photo.legenda || ''))) return false;
  try {
    const u = new URL(photo.url);
    return u.protocol === 'https:' &&
      !/\.(mp4|mov|webm|m4v|avi|m3u8)$/i.test(u.pathname) &&
      !/(youtube\.com|youtu\.be|vimeo\.com)/i.test(u.hostname);
  } catch { return false; }
}

async function getListing(id) {
  const base = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!base || !key) throw new Error('Supabase preview environment is not configured');
  const response = await fetch(base + '/rest/v1/rpc/mare_public_listing', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_imovel_id: id })
  });
  if (!response.ok) throw new Error('Public listing RPC returned ' + response.status);
  const payload = await response.json();
  return Array.isArray(payload) ? (payload[0] || null) : payload;
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '');
  const version = String(req.query?.v || '5').replace(/[^0-9a-z_-]/gi, '').slice(0, 24) || '5';
  if (!UUID.test(id)) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Link de imóvel inválido.');
    return;
  }

  let listing = null;
  try { listing = await getListing(id); }
  catch (error) { console.error('[BancoImob OG] listing lookup failed:', error?.message || error); }

  const origin = 'https://bancoimob-bronca.vercel.app';
  const canonical = origin + '/imovel/' + id + '?v=' + encodeURIComponent(version);
  const name = String(listing?.nome_anuncio || listing?.titulo || 'Imóvel para temporada').trim();
  const title = name + ' | BancoImob';
  const description = listing
    ? [listing.bairro, listing.cidade, listing.dormitorios ? listing.dormitorios + ' dormitórios' : '', listing.capacidade ? 'acomoda ' + listing.capacidade + ' hóspedes' : '']
        .filter(Boolean).join(' · ') || 'Veja fotos e detalhes deste imóvel para temporada.'
    : 'Veja fotos e detalhes deste imóvel para temporada no BancoImob.';

  const photos = Array.isArray(listing?.fotos) ? listing.fotos : [];
  const cover = photos.filter(isPublicImage).sort((a, b) => {
    if (Boolean(a.capa) !== Boolean(b.capa)) return a.capa ? -1 : 1;
    return Number(a.ordem ?? 999999) - Number(b.ordem ?? 999999);
  })[0] || null;
  // O Open Graph aponta diretamente para a foto de capa cadastrada no imóvel.
  // Sem conversão intermediária: a URL é a mesma imagem exibida no anúncio.
  const image = cover?.url || '';

  const imageTags = image ? `
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:url" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(name)}">
<meta name="twitter:image" content="${escapeHtml(image)}"> ` : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BancoImob">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${imageTags}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
</head>
<body><main><h1>${escapeHtml(name)}</h1><p>${escapeHtml(description)}</p>${image ? '<img src="' + escapeHtml(image) + '" width="1200" height="630" alt="' + escapeHtml(name) + '">' : ''}<p><a href="${escapeHtml(canonical)}">Abrir anúncio no BancoImob</a></p></main><script>setTimeout(()=>location.replace(${JSON.stringify(canonical)}),700)</script></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'pt-BR');
  res.setHeader('Cache-Control', 'public, s-maxage=0, stale-while-revalidate=0');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-BancoImob-OG', listing ? (cover ? 'listing-and-cover' : 'listing-without-cover') : 'listing-not-found');
  res.status(listing ? 200 : 404).send(html);
}
