const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export default async function handler(req, res) {
  const id = String(req.query?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Link de imóvel inválido.');
    return;
  }

  const baseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  let listing = null;

  if (baseUrl && anonKey) {
    try {
      const response = await fetch(baseUrl + '/rest/v1/rpc/mare_public_listing', {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_imovel_id: id })
      });
      if (response.ok) listing = await response.json();
    } catch (error) {
      console.error('Falha ao carregar prévia do imóvel:', error);
    }
  }

  const canonical = 'https://bancoimob-bronca.vercel.app/imovel/' + id;
  const title = listing?.titulo ? String(listing.titulo) + ' | BancoImob' : 'Imóvel para temporada | BancoImob';
  const description = listing
    ? [listing.bairro, listing.cidade, listing.dormitorios ? listing.dormitorios + ' dormitórios' : '', listing.capacidade ? 'acomoda ' + listing.capacidade + ' hóspedes' : ''].filter(Boolean).join(' · ') || 'Veja fotos e detalhes deste imóvel para temporada.'
    : 'Veja fotos e detalhes deste imóvel para temporada no BancoImob.';
  const photos = Array.isArray(listing?.fotos) ? listing.fotos : [];
  const selected = photos.filter(photo => photo && photo.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(photo.url));
  const cover = selected.find(photo => photo.capa) || selected.sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999))[0];
  const image = cover?.url || 'https://bancoimob-bronca.vercel.app/og-bancoimob.jpg';
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BancoImob">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(listing?.titulo || 'Foto do imóvel')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0;url=${canonical}">
</head>
<body><p>Abrindo anúncio… <a href="${canonical}">Continuar para o imóvel</a></p></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(listing ? 200 : 200).send(html);
}
