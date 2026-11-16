import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const id = params.get('id');
const db = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const isVideo = item => /^video(?::|$)/i.test(String(item?.legenda || '')) ||
  /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(String(item?.url || ''));
const videoUrl = raw => {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./,'');
    if (host === 'youtu.be') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
    if (['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) {
      const videoId = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return videoId ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) : '';
    }
    if (['vimeo.com','player.vimeo.com'].includes(host)) {
      const videoId = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
      return videoId ? 'https://player.vimeo.com/video/' + videoId : '';
    }
  } catch {}
  return '';
};
function setMeta(name, content, property = false) {
  if (!content) return;
  const selector = property ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
  let node = document.head.querySelector(selector);
  if (!node) { node = document.createElement('meta'); node.setAttribute(property ? 'property' : 'name', name); document.head.append(node); }
  node.content = content;
}
function unavailable(message) {
  app.innerHTML = '<section class="error"><b>Anúncio não disponível</b><p>' + esc(message) + '</p><a href="/">Voltar ao BancoImob</a></section>';
}
async function render() {
  if (!id) return unavailable('Não foi informado um imóvel para apresentar.');
  if (!db) return unavailable('A configuração do BancoImob não está disponível.');
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return unavailable('Entre no BancoImob para visualizar este anúncio interno.');
  const [{ data: home, error: homeError }, { data: media, error: mediaError }] = await Promise.all([
    db.from('mare_imoveis').select('*').eq('id', id).single(),
    db.from('mare_fotos_imovel').select('*').eq('imovel_id', id).order('ordem', { ascending: true })
  ]);
  if (homeError || !home) return unavailable('O imóvel não foi encontrado ou sua conta não tem acesso a ele.');
  if (mediaError) return unavailable('Não foi possível carregar as fotos deste imóvel.');
  const photos = (media || []).filter(item => item.url);
  const images = photos.filter(item => !isVideo(item));
  const videos = photos.filter(isVideo);
  const cover = images.find(item => item.capa) || images[0] || null;
  const title = String(home.nome_anuncio || home.titulo || 'Imóvel para temporada').trim();
  const description = String(home.descricao || 'Descrição não cadastrada.');
  const neighborhood = String(home.bairro || 'Litoral Norte');
  const facts = [
    ['Dormitórios', home.dormitorios == null ? 'Não informado' : home.dormitorios],
    ['Suítes', home.suites == null ? 'Não informado' : home.suites],
    ['Capacidade', home.capacidade ? home.capacidade + ' hóspedes' : 'Não informada'],
    ['Distância do mar', home.distancia_praia === 0 ? 'Pé na areia' : home.distancia_praia == null ? 'Não informada' : home.distancia_praia + ' m']
  ];
  const amenities = [...new Set([
    ...(Array.isArray(home.comodidades) ? home.comodidades : []),
    home.piscina ? 'Piscina' : '',
    home.churrasqueira ? 'Churrasqueira' : '',
    home.area_gourmet ? 'Área gourmet' : '',
    home.servico_praia ? 'Serviço de praia' : ''
  ].filter(Boolean))];
  const imageUrls = images.map(item => item.url);
  document.title = title + ' | Anúncio interno — BancoImob';
  setMeta('description', description.slice(0, 250));
  setMeta('robots', 'noindex,nofollow');
  setMeta('og:type', 'website', true);
  setMeta('og:title', title, true);
  setMeta('og:description', description.slice(0, 250), true);
  setMeta('og:image', cover?.url || '', true);
  setMeta('og:locale', 'pt_BR', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description.slice(0, 200));
  setMeta('twitter:image', cover?.url || '');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: title,
    description,
    image: imageUrls,
    address: { '@type': 'PostalAddress', addressLocality: neighborhood, addressRegion: 'SP', addressCountry: 'BR' },
    numberOfBedrooms: Number(home.dormitorios || 0)
  };
  let jsonLd = document.querySelector('#listing-jsonld');
  if (!jsonLd) { jsonLd = document.createElement('script'); jsonLd.id = 'listing-jsonld'; jsonLd.type = 'application/ld+json'; document.head.append(jsonLd); }
  jsonLd.textContent = JSON.stringify(schema);
  const hero = cover
    ? '<img class="hero-photo" src="' + esc(cover.url) + '" alt="Foto de capa de ' + esc(title) + '">'
    : '<div class="empty-photo">Foto de capa ainda não cadastrada</div>';
  const gallery = images.filter(item => item !== cover).map((item, index) =>
    '<figure><img src="' + esc(item.url) + '" alt="' + esc(title) + ' — foto ' + (index + 2) + '" loading="lazy"><figcaption>Foto ' + (index + 2) + '</figcaption></figure>'
  ).join('');
  const videoGallery = videos.map((item, index) => {
    const embed = videoUrl(item.url);
    return '<figure>' + (embed
      ? '<iframe src="' + esc(embed) + '" title="Vídeo do imóvel ' + (index + 1) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
      : '<video src="' + esc(item.url) + '" controls preload="metadata"></video>') +
      '<figcaption>Vídeo ' + (index + 1) + '</figcaption></figure>';
  }).join('');
  const tags = [
    'Locação por temporada',
    neighborhood,
    home.dormitorios != null ? home.dormitorios + ' dormitórios' : '',
    home.distancia_praia === 0 ? 'Pé na areia' : home.distancia_praia != null ? home.distancia_praia + ' m do mar' : '',
    ...amenities
  ].filter(Boolean);
  app.innerHTML = '<div class="page">' +
    '<header class="topbar"><div class="brand"><span class="brand-mark">≈</span>BancoImob</div><span class="internal">ANÚNCIO INTERNO · ACESSO RESTRITO</span></header>' +
    '<section class="hero">' + hero + '<div class="hero-content"><div class="eyebrow">Locação por temporada</div><h1>' + esc(title) + '</h1><p class="hero-location">⌖ ' + esc(neighborhood) + '</p>' +
    '<div class="quickfacts">' + facts.filter((item, index) => index !== 1 || Number(home.suites || 0) > 0).map(item => '<span>' + esc(item[1]) + ' ' + (item[0] === 'Dormitórios' ? 'dormitórios' : item[0] === 'Suítes' ? 'suítes' : item[0] === 'Capacidade' ? '' : '') + '</span>').join('') + '</div></div></section>' +
    '<section class="section"><div class="section-head"><div><div class="section-kicker">CARACTERÍSTICAS</div><h2>Detalhes do imóvel</h2></div></div><div class="facts">' + facts.map(item => '<article class="fact"><small>' + esc(item[0]) + '</small><strong>' + esc(item[1]) + '</strong></article>').join('') + '</div></section>' +
    (amenities.length ? '<section class="section"><div class="section-kicker">CONFORTO E LAZER</div><h2>Comodidades</h2><div class="amenities">' + amenities.map(item => '<span>' + esc(item) + '</span>').join('') + '</div></section>' : '') +
    '<section class="section"><div class="section-head"><div><div class="section-kicker">APRESENTAÇÃO</div><h2>Sobre o imóvel</h2></div></div><div class="description">' + esc(description) + '</div></section>' +
    ((gallery || videoGallery) ? '<section class="section"><div class="section-head"><div><div class="section-kicker">AMBIENTES E ESPAÇOS</div><h2>Galeria de fotos</h2></div></div><div class="gallery">' + gallery + videoGallery + '</div></section>' : '') +
    '<footer class="footer"><div class="footer-top"><span class="footer-brand">BancoImob · Anúncio interno</span><small>Material de consulta comercial · Disponibilidade sujeita à confirmação</small></div><div class="meta-block"><b>Metadados do anúncio</b><div class="meta-tags">' + tags.map(tag => '<span>' + esc(tag) + '</span>').join('') + '</div></div></footer>' +
    '</div>';
}
render().catch(error => unavailable(error?.message || 'Ocorreu um erro ao abrir o anúncio.'));
