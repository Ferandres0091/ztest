const puppeteer = require('puppeteer');

async function testSEO(url, logger) {
  logger.explain('🔍 Analizando SEO...');
  logger.explain('   Verifico meta tags, Open Graph, Schema.org y más.');

  const results = {
    name: 'SEO',
    tests: []
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Title
    const title = await page.title();
    const titleLength = title ? title.length : 0;
    results.tests.push({
      name: 'Title Tag',
      status: titleLength >= 30 && titleLength <= 60 ? 'pass' : titleLength > 0 ? 'warning' : 'fail',
      value: titleLength > 0 ? `${titleLength} caracteres` : 'No encontrado',
      details: titleLength === 0
        ? 'No hay title tag - Crítico para SEO'
        : titleLength < 30
        ? `"${title}" - Muy corto, debería tener 30-60 caracteres`
        : titleLength > 60
        ? `"${title.substring(0, 50)}..." - Muy largo, Google truncará`
        : `"${title}" - Longitud óptima`,
      severity: titleLength === 0 ? 'high' : titleLength >= 30 && titleLength <= 60 ? 'info' : 'low',
      recommendation: titleLength < 30 || titleLength > 60 ? 'Ajustar title a 30-60 caracteres' : null
    });

    // Meta Description
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    const descLength = metaDesc ? metaDesc.length : 0;
    results.tests.push({
      name: 'Meta Description',
      status: descLength >= 120 && descLength <= 160 ? 'pass' : descLength > 0 ? 'warning' : 'fail',
      value: descLength > 0 ? `${descLength} caracteres` : 'No encontrada',
      details: descLength === 0
        ? 'No hay meta description - Importante para CTR en búsquedas'
        : descLength < 120
        ? 'Meta description muy corta, debería tener 120-160 caracteres'
        : descLength > 160
        ? 'Meta description muy larga, Google truncará'
        : 'Meta description con longitud óptima',
      severity: descLength === 0 ? 'high' : descLength >= 120 && descLength <= 160 ? 'info' : 'medium',
      recommendation: descLength === 0 ? 'Agregar meta description' : descLength < 120 || descLength > 160 ? 'Ajustar a 120-160 caracteres' : null
    });

    // Canonical URL
    const canonical = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => null);
    results.tests.push({
      name: 'Canonical URL',
      status: canonical ? 'pass' : 'warning',
      value: canonical ? 'Configurado' : 'No configurado',
      details: canonical
        ? `Canonical: ${canonical}`
        : 'Sin canonical URL - Puede causar contenido duplicado',
      severity: canonical ? 'info' : 'medium',
      recommendation: canonical ? null : 'Agregar link rel="canonical"'
    });

    // H1 Tag
    const h1s = await page.$$eval('h1', elements => elements.map(el => el.textContent.trim()));
    results.tests.push({
      name: 'H1 Tag',
      status: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warning',
      value: h1s.length === 0 ? 'No encontrado' : `${h1s.length} encontrado(s)`,
      details: h1s.length === 0
        ? 'No hay H1 - Importante para SEO'
        : h1s.length === 1
        ? `H1: "${h1s[0].substring(0, 50)}${h1s[0].length > 50 ? '...' : ''}"`
        : `Múltiples H1 encontrados (${h1s.length}) - Debería haber solo uno`,
      severity: h1s.length === 0 ? 'high' : h1s.length === 1 ? 'info' : 'medium',
      recommendation: h1s.length !== 1 ? 'Usar exactamente un H1 por página' : null
    });

    // Heading Structure
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', elements =>
      elements.map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 30) }))
    );
    const h2Count = headings.filter(h => h.tag === 'H2').length;
    results.tests.push({
      name: 'Estructura de Headings',
      status: h2Count > 0 ? 'pass' : 'warning',
      value: `${headings.length} headings`,
      details: `H1: ${h1s.length}, H2: ${h2Count}, Total: ${headings.length}`,
      severity: 'info'
    });

    // Open Graph Tags
    const ogTags = await page.$$eval('meta[property^="og:"]', elements =>
      elements.map(el => ({ property: el.getAttribute('property'), content: el.content }))
    );
    const requiredOG = ['og:title', 'og:description', 'og:image', 'og:url'];
    const missingOG = requiredOG.filter(tag => !ogTags.find(t => t.property === tag));

    results.tests.push({
      name: 'Open Graph Tags',
      status: missingOG.length === 0 ? 'pass' : missingOG.length <= 2 ? 'warning' : 'fail',
      value: `${ogTags.length} tags`,
      details: missingOG.length === 0
        ? 'Todos los Open Graph tags presentes'
        : `Faltan: ${missingOG.join(', ')}`,
      severity: missingOG.length === 0 ? 'info' : missingOG.length <= 2 ? 'medium' : 'high',
      recommendation: missingOG.length > 0 ? `Agregar: ${missingOG.join(', ')}` : null
    });

    // Twitter Card Tags
    const twitterTags = await page.$$eval('meta[name^="twitter:"]', elements =>
      elements.map(el => ({ name: el.name, content: el.content }))
    );
    results.tests.push({
      name: 'Twitter Card Tags',
      status: twitterTags.length >= 3 ? 'pass' : twitterTags.length > 0 ? 'warning' : 'info',
      value: `${twitterTags.length} tags`,
      details: twitterTags.length === 0
        ? 'Sin Twitter Card tags'
        : `${twitterTags.length} Twitter tags configurados`,
      severity: 'info',
      recommendation: twitterTags.length === 0 ? 'Considerar agregar Twitter Card tags' : null
    });

    // Schema.org / JSON-LD
    const jsonLd = await page.$$eval('script[type="application/ld+json"]', elements =>
      elements.map(el => {
        try {
          return JSON.parse(el.textContent);
        } catch {
          return null;
        }
      }).filter(Boolean)
    );
    results.tests.push({
      name: 'Schema.org (JSON-LD)',
      status: jsonLd.length > 0 ? 'pass' : 'warning',
      value: jsonLd.length > 0 ? `${jsonLd.length} schema(s)` : 'No encontrado',
      details: jsonLd.length > 0
        ? `Schemas: ${jsonLd.map(s => s['@type'] || 'Unknown').join(', ')}`
        : 'Sin datos estructurados - Afecta rich snippets en Google',
      severity: jsonLd.length > 0 ? 'info' : 'medium',
      recommendation: jsonLd.length === 0 ? 'Agregar Schema.org JSON-LD para rich snippets' : null
    });

    // Robots Meta
    const robotsMeta = await page.$eval('meta[name="robots"]', el => el.content).catch(() => null);
    results.tests.push({
      name: 'Meta Robots',
      status: !robotsMeta || !robotsMeta.includes('noindex') ? 'pass' : 'warning',
      value: robotsMeta || 'No especificado (default: index)',
      details: robotsMeta?.includes('noindex')
        ? '⚠️ Página configurada como NOINDEX - No aparecerá en Google'
        : 'Página indexable',
      severity: robotsMeta?.includes('noindex') ? 'high' : 'info'
    });

    // Images Alt Text
    const images = await page.$$eval('img', elements => ({
      total: elements.length,
      withAlt: elements.filter(el => el.alt && el.alt.trim() !== '').length,
      withoutAlt: elements.filter(el => !el.alt || el.alt.trim() === '').length
    }));
    results.tests.push({
      name: 'Imágenes Alt Text',
      status: images.withoutAlt === 0 ? 'pass' : images.withoutAlt <= 3 ? 'warning' : 'fail',
      value: `${images.withAlt}/${images.total} con alt`,
      details: images.withoutAlt === 0
        ? 'Todas las imágenes tienen alt text'
        : `${images.withoutAlt} imágenes sin alt text`,
      severity: images.withoutAlt === 0 ? 'info' : images.withoutAlt <= 3 ? 'low' : 'medium',
      recommendation: images.withoutAlt > 0 ? 'Agregar alt text a todas las imágenes' : null
    });

    // Language
    const htmlLang = await page.$eval('html', el => el.lang).catch(() => null);
    results.tests.push({
      name: 'Atributo Lang',
      status: htmlLang ? 'pass' : 'warning',
      value: htmlLang || 'No especificado',
      details: htmlLang
        ? `Idioma: ${htmlLang}`
        : 'Sin atributo lang en <html> - Importante para SEO internacional',
      severity: htmlLang ? 'info' : 'low',
      recommendation: htmlLang ? null : 'Agregar lang="es" (o el idioma correspondiente) a <html>'
    });

    // Sitemap check (basic)
    const sitemapUrl = new URL('/sitemap.xml', url).href;
    const axios = require('axios');
    const https = require('https');
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    let hasSitemap = false;
    try {
      const sitemapRes = await axios.get(sitemapUrl, { httpsAgent, timeout: 5000, validateStatus: () => true });
      hasSitemap = sitemapRes.status === 200 && sitemapRes.data.includes('<urlset');
    } catch {}

    results.tests.push({
      name: 'Sitemap.xml',
      status: hasSitemap ? 'pass' : 'warning',
      value: hasSitemap ? 'Encontrado' : 'No encontrado',
      details: hasSitemap
        ? `Sitemap disponible en ${sitemapUrl}`
        : 'No se encontró sitemap.xml',
      severity: hasSitemap ? 'info' : 'medium',
      recommendation: hasSitemap ? null : 'Crear y configurar sitemap.xml'
    });

    // Robots.txt check
    const robotsUrl = new URL('/robots.txt', url).href;
    let hasRobots = false;
    try {
      const robotsRes = await axios.get(robotsUrl, { httpsAgent, timeout: 5000, validateStatus: () => true });
      hasRobots = robotsRes.status === 200;
    } catch {}

    results.tests.push({
      name: 'Robots.txt',
      status: hasRobots ? 'pass' : 'info',
      value: hasRobots ? 'Encontrado' : 'No encontrado',
      details: hasRobots
        ? `Robots.txt disponible`
        : 'No se encontró robots.txt',
      severity: 'info'
    });

    logger.explain('   ✓ Análisis SEO completado');

  } catch (error) {
    results.tests.push({
      name: 'Análisis SEO',
      status: 'fail',
      value: 'Error',
      details: `No se pudo completar: ${error.message}`,
      severity: 'high'
    });
    logger.explain(`   ✗ Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

module.exports = { testSEO };
