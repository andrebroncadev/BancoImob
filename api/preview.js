const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origin = 'https://bancoimob-bronca.vercel.app';

function isPublicImage(photo) {
  if (!photo?.url || /^video(?::|$)/i.test(String(photo.legenda || ''))) return false;
  try {
    const u = new URL(photo.url);
    return u.protocol === 'https:' &&
      !/\.(mp4|mov|webm|m4v|avi|m3u8)$/i.test(u.pathname) &&
      !/(youtube\.com|youtu\.be|vimeo\.com)/i.test(u.hostname);
  } catch { return false; }
}

function isSupabaseStorageImage(photo) {
  try {
    const imageUrl = new URL(photo?.url || '');
    const supabaseUrl = new URL(process.env.VITE_SUPABASE_URL || '');
    return imageUrl.protocol === 'https:' &&
      supabaseUrl.protocol === 'https:' &&
      imageUrl.hostname.toLowerCase() === supabaseUrl.hostname.toLowerCase() &&
      imageUrl.pathname.startsWith('/storage/v1/object/public/mare-imoveis/');
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

function pageHtml({ id, listing, canonical, version }) {
  const name = String(listing?.nome_anuncio || listing?.titulo || 'Imóvel para temporada').trim();
  const title = name + ' | BancoImob';
  const photos = (Array.isArray(listing?.fotos) ? listing.fotos : [])
    .filter(isPublicImage)
    .sort((a, b) => Number(a.ordem ?? 999999) - Number(b.ordem ?? 999999));
  const cover = photos.find(photo => photo.capa) || photos[0] || null;
  const gallery = cover
    ? [cover, ...photos.filter(photo => photo.url !== cover.url)]
    : photos;
  const location = [listing?.bairro, listing?.cidade].filter(Boolean).join(' · ');
  const facts = [
    listing?.dormitorios != null ? [listing.dormitorios, 'dormitórios'].join(' ') : '',
    listing?.suites ? [listing.suites, 'suítes'].join(' ') : '',
    listing?.capacidade ? 'Acomoda ' + listing.capacidade + ' hóspedes' : '',
    listing?.distancia_praia === 0 ? 'Pé na areia' :
      listing?.distancia_praia != null ? listing.distancia_praia + ' m da praia' : ''
  ].filter(Boolean);
  const amenities = [...new Set([
    ...(Array.isArray(listing?.comodidades) ? listing.comodidades : []),
    listing?.piscina ? 'Piscina' : '',
    listing?.churrasqueira ? 'Churrasqueira' : '',
    listing?.area_gourmet ? 'Área gourmet' : '',
    listing?.servico_praia ? 'Serviço de praia' : ''
  ].filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
  const description = String(listing?.descricao || '').trim();
  const summary = [
    location,
    facts.join(' · ')
  ].filter(Boolean).join(' — ') || 'Veja fotos e detalhes deste imóvel para temporada no BancoImob.';

  const optimizedSocialImage = Boolean(cover && isSupabaseStorageImage(cover));
  const socialImage = !cover ? '' : optimizedSocialImage
    ? origin + '/api/og-image?id=' + encodeURIComponent(id) + (version ? '&v=' + encodeURIComponent(version) : '')
    : cover.url;
  const imageTags = socialImage ? `
<meta property="og:image" content="${escapeHtml(socialImage)}">
<meta property="og:image:url" content="${escapeHtml(socialImage)}">
<meta property="og:image:secure_url" content="${escapeHtml(socialImage)}">
${optimizedSocialImage ? '<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">' : ''}
<meta property="og:image:alt" content="${escapeHtml(name)}">
<meta name="twitter:image" content="${escapeHtml(socialImage)}">` : '';

  const hero = cover
    ? '<img class="hero-image" src="' + escapeHtml(cover.url) + '" alt="' + escapeHtml(name) + '" fetchpriority="high">'
    : '<div class="hero-placeholder">Fotos em breve</div>';
  const galleryHtml = gallery.length > 1
    ? '<section class="section"><h2>Fotos do imóvel</h2><div class="gallery">' +
      gallery.slice(1).map((photo, index) =>
        '<figure><img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.legenda || ('Foto ' + (index + 2))) + '" loading="lazy"></figure>'
      ).join('') + '</div></section>'
    : '';
  const factsHtml = facts.map(fact => '<span class="fact">' + escapeHtml(fact) + '</span>').join('');
  const amenitiesHtml = amenities.length
    ? '<section class="section"><h2>Comodidades</h2><div class="tags">' + amenities.map(item => '<span>' + escapeHtml(item) + '</span>').join('') + '</div></section>'
    : '';
  const descriptionHtml = description
    ? '<section class="section"><h2>Sobre o imóvel</h2><p class="description">' + escapeHtml(description).replace(/\r?\n/g, '<br>') + '</p></section>'
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#17345b">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(summary)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BancoImob">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${imageTags}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(summary)}">
<style>
:root{color-scheme:light;font-family:Arial,Helvetica,sans-serif;color:#252a32;background:#f6f4ef;--navy:#17345b;--gold:#b49350;--line:#e7e1d6}
*{box-sizing:border-box}body{margin:0;min-width:320px}.site-header{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1120px)/2));background:#fffefa;border-bottom:1px solid var(--line)}.brand{font-size:19px;font-weight:800;color:var(--navy);text-decoration:none}.header-note{font-size:11px;color:#777}.container{width:min(1120px,calc(100% - 32px));margin:26px auto 52px}.hero{position:relative;min-height:370px;border-radius:20px;overflow:hidden;background:#d8d6d0;display:flex;align-items:flex-end;color:white;isolation:isolate}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,19,34,.82),rgba(8,19,34,.08) 78%);z-index:-1}.hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.hero-placeholder{display:grid;place-items:center;width:100%;min-height:370px;background:#273d5b;color:white}.hero-copy{padding:clamp(22px,5vw,48px);max-width:840px}.kicker{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#ead7a9}.hero h1{font-size:clamp(29px,5vw,49px);line-height:1.08;letter-spacing:-1px;margin:12px 0}.location{font-size:14px;margin:0;color:#f5f3ee}.facts{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.fact{font-size:12px;font-weight:650;padding:9px 12px;border:1px solid #ffffff55;background:#ffffff1c;border-radius:30px}.section{margin-top:30px}.section h2{font-size:20px;color:var(--navy);margin:0 0 13px}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.gallery figure{margin:0;border-radius:13px;overflow:hidden;background:#e9e5dc;min-height:170px}.gallery img{display:block;width:100%;height:220px;object-fit:cover}.tags{display:flex;flex-wrap:wrap;gap:8px}.tags span{padding:8px 12px;border:1px solid #e5dcc9;background:#fbf8f0;color:#6f5a32;border-radius:30px;font-size:12px}.description{margin:0;padding:20px;background:#fffefa;border:1px solid var(--line);border-radius:14px;color:#50555c;font-size:14px;line-height:1.8;overflow-wrap:anywhere}.contact{display:inline-flex;align-items:center;justify-content:center;margin-top:30px;padding:14px 22px;border-radius:10px;background:var(--navy);color:white;text-decoration:none;font-weight:700}.footer{padding:22px 0;border-top:1px solid var(--line);margin-top:38px;color:#777;font-size:11px}@media(max-width:700px){.container{margin-top:15px}.hero{min-height:320px;border-radius:15px}.hero-placeholder{min-height:320px}.gallery{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery img{height:170px}.section{margin-top:24px}}@media(max-width:430px){.gallery{grid-template-columns:1fr}.gallery img{height:220px}.header-note{font-size:9px}}
</style>
</head>
<body>
<header class="site-header"><a class="brand" href="/">≈ BancoImob</a><span class="header-note">Anúncio de temporada</span></header>
<main class="container">
<section class="hero">${hero}<div class="hero-copy"><span class="kicker">Locação por temporada</span><h1>${escapeHtml(name)}</h1><p class="location">${escapeHtml(location || 'Litoral Norte')}</p><div class="facts">${factsHtml}</div></div></section>
${amenitiesHtml}
${galleryHtml}
${descriptionHtml}
<footer class="footer">BancoImob · Informações sujeitas à confirmação de disponibilidade e condições para as datas desejadas.</footer>
</main>
</body>
</html>`;
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '');
  const version = String(req.query?.v || '').replace(/[^0-9a-z_-]/gi, '').slice(0, 24);
  const canonical = origin + '/imovel/' + id + (version ? '?v=' + encodeURIComponent(version) : '');
  if (!UUID.test(id)) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Link de imóvel inválido.');
    return;
  }

  let listing = null;
  try { listing = await getListing(id); }
  catch (error) { console.error('[BancoImob OG] listing lookup failed:', error?.message || error); }

  if (!listing) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Anúncio indisponível | BancoImob</title><body><main><h1>Anúncio indisponível</h1><p>Este link pode estar incorreto ou o imóvel não está mais publicado.</p><a href="/">Voltar ao BancoImob</a></main></body></html>');
    return;
  }

  const photos = Array.isArray(listing.fotos) ? listing.fotos.filter(isPublicImage) : [];
  const cover = photos.find(photo => photo.capa) || photos.sort((a, b) => Number(a.ordem ?? 999999) - Number(b.ordem ?? 999999))[0] || null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'pt-BR');
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-BancoImob-OG', cover ? 'listing-and-cover' : 'listing-without-cover');
  res.status(200).send(pageHtml({ id, listing, canonical, version }));
}
