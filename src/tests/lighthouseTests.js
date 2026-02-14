const puppeteer = require('puppeteer');

async function testLighthouse(url, logger) {
  logger.explain('🔥 Ejecutando auditoría tipo Lighthouse...');
  logger.explain('   Analizo rendimiento, accesibilidad, mejores prácticas y SEO.');

  const results = {
    name: 'Auditoría Lighthouse',
    tests: []
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Scores for each category
    const scores = {
      performance: { points: 0, max: 0 },
      accessibility: { points: 0, max: 0 },
      bestPractices: { points: 0, max: 0 },
      seo: { points: 0, max: 0 }
    };

    // Enable performance metrics
    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');

    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const loadTime = Date.now() - startTime;

    // ===== PERFORMANCE CHECKS =====
    logger.explain('   ⚡ Evaluando rendimiento...');

    // Load time
    scores.performance.max += 25;
    if (loadTime < 3000) scores.performance.points += 25;
    else if (loadTime < 6000) scores.performance.points += 15;
    else if (loadTime < 10000) scores.performance.points += 5;

    // TTFB
    const timing = await page.evaluate(() => ({
      ttfb: performance.timing.responseStart - performance.timing.requestStart,
      domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
    }));

    scores.performance.max += 25;
    if (timing.ttfb < 600) scores.performance.points += 25;
    else if (timing.ttfb < 1000) scores.performance.points += 15;
    else if (timing.ttfb < 2000) scores.performance.points += 5;

    // DOM size
    const domSize = await page.evaluate(() => document.querySelectorAll('*').length);
    scores.performance.max += 15;
    if (domSize < 1500) scores.performance.points += 15;
    else if (domSize < 3000) scores.performance.points += 10;
    else if (domSize < 5000) scores.performance.points += 5;

    // Image optimization
    const imageIssues = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      let unoptimized = 0;
      imgs.forEach(img => {
        if (img.naturalWidth > 1920) unoptimized++;
        if (!img.loading) unoptimized++; // No lazy loading
      });
      return { total: imgs.length, unoptimized };
    });

    scores.performance.max += 20;
    const imgScore = imageIssues.total === 0 ? 20 : Math.max(0, 20 - (imageIssues.unoptimized * 2));
    scores.performance.points += imgScore;

    // JavaScript size (basic estimation)
    const jsCount = await page.$$eval('script', scripts => scripts.length);
    scores.performance.max += 15;
    if (jsCount < 10) scores.performance.points += 15;
    else if (jsCount < 20) scores.performance.points += 10;
    else if (jsCount < 30) scores.performance.points += 5;

    // ===== ACCESSIBILITY CHECKS =====
    logger.explain('   ♿ Evaluando accesibilidad...');

    // Lang attribute
    const hasLang = await page.$eval('html', el => !!el.lang).catch(() => false);
    scores.accessibility.max += 15;
    if (hasLang) scores.accessibility.points += 15;

    // Image alt texts
    const imgAlt = await page.$$eval('img', imgs => ({
      total: imgs.length,
      withAlt: imgs.filter(i => i.alt && i.alt.trim() !== '').length
    }));
    scores.accessibility.max += 20;
    const altScore = imgAlt.total === 0 ? 20 : Math.round((imgAlt.withAlt / imgAlt.total) * 20);
    scores.accessibility.points += altScore;

    // Form labels
    const formLabels = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
      let labeled = 0;
      inputs.forEach(input => {
        if (input.id && document.querySelector(`label[for="${input.id}"]`)) labeled++;
        else if (input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')) labeled++;
      });
      return { total: inputs.length, labeled };
    });
    scores.accessibility.max += 20;
    const labelScore = formLabels.total === 0 ? 20 : Math.round((formLabels.labeled / formLabels.total) * 20);
    scores.accessibility.points += labelScore;

    // Landmarks
    const hasMain = await page.$('main, [role="main"]') !== null;
    const hasNav = await page.$('nav, [role="navigation"]') !== null;
    scores.accessibility.max += 15;
    if (hasMain && hasNav) scores.accessibility.points += 15;
    else if (hasMain || hasNav) scores.accessibility.points += 8;

    // Focus styles
    const hasFocusStyles = await page.evaluate(() => {
      try {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.selectorText && rule.selectorText.includes(':focus')) return true;
            }
          } catch (e) {}
        }
      } catch (e) {}
      return false;
    });
    scores.accessibility.max += 15;
    if (hasFocusStyles) scores.accessibility.points += 15;

    // Heading structure
    const headingStructure = await page.$$eval('h1, h2, h3', hs => ({
      h1: hs.filter(h => h.tagName === 'H1').length,
      h2: hs.filter(h => h.tagName === 'H2').length
    }));
    scores.accessibility.max += 15;
    if (headingStructure.h1 === 1 && headingStructure.h2 > 0) scores.accessibility.points += 15;
    else if (headingStructure.h1 === 1) scores.accessibility.points += 10;
    else if (headingStructure.h1 > 0) scores.accessibility.points += 5;

    // ===== BEST PRACTICES CHECKS =====
    logger.explain('   ✅ Evaluando mejores prácticas...');

    // HTTPS
    scores.bestPractices.max += 20;
    if (url.startsWith('https://')) scores.bestPractices.points += 20;

    // Console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.reload({ waitUntil: 'networkidle2' });

    scores.bestPractices.max += 20;
    if (consoleErrors.length === 0) scores.bestPractices.points += 20;
    else if (consoleErrors.length < 3) scores.bestPractices.points += 10;

    // Doctype
    const hasDoctype = await page.evaluate(() => document.doctype !== null);
    scores.bestPractices.max += 10;
    if (hasDoctype) scores.bestPractices.points += 10;

    // Charset
    const hasCharset = await page.$('meta[charset], meta[http-equiv="Content-Type"]') !== null;
    scores.bestPractices.max += 10;
    if (hasCharset) scores.bestPractices.points += 10;

    // Viewport meta
    const hasViewport = await page.$('meta[name="viewport"]') !== null;
    scores.bestPractices.max += 15;
    if (hasViewport) scores.bestPractices.points += 15;

    // No deprecated APIs (basic check)
    const usesDocumentWrite = await page.evaluate(() => {
      return document.body.innerHTML.includes('document.write');
    });
    scores.bestPractices.max += 15;
    if (!usesDocumentWrite) scores.bestPractices.points += 15;

    // No vulnerable libraries (basic check for known old versions)
    const hasOldJquery = await page.evaluate(() => {
      if (typeof jQuery !== 'undefined') {
        const version = jQuery.fn.jquery;
        const major = parseInt(version.split('.')[0]);
        return major < 3;
      }
      return false;
    });
    scores.bestPractices.max += 10;
    if (!hasOldJquery) scores.bestPractices.points += 10;

    // ===== SEO CHECKS =====
    logger.explain('   🔍 Evaluando SEO...');

    // Title
    const title = await page.title();
    scores.seo.max += 15;
    if (title && title.length >= 30 && title.length <= 60) scores.seo.points += 15;
    else if (title && title.length > 0) scores.seo.points += 8;

    // Meta description
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    scores.seo.max += 15;
    if (metaDesc && metaDesc.length >= 120 && metaDesc.length <= 160) scores.seo.points += 15;
    else if (metaDesc && metaDesc.length > 0) scores.seo.points += 8;

    // Canonical
    const hasCanonical = await page.$('link[rel="canonical"]') !== null;
    scores.seo.max += 10;
    if (hasCanonical) scores.seo.points += 10;

    // Open Graph
    const ogTags = await page.$$eval('meta[property^="og:"]', els => els.length);
    scores.seo.max += 15;
    if (ogTags >= 4) scores.seo.points += 15;
    else if (ogTags > 0) scores.seo.points += 8;

    // Structured data
    const hasStructuredData = await page.$('script[type="application/ld+json"]') !== null;
    scores.seo.max += 15;
    if (hasStructuredData) scores.seo.points += 15;

    // Mobile friendly (viewport)
    scores.seo.max += 15;
    if (hasViewport) scores.seo.points += 15;

    // Links have descriptive text
    const linkCheck = await page.$$eval('a', links => {
      const badLinks = links.filter(l => {
        const text = l.textContent?.trim().toLowerCase();
        return text && ['click here', 'here', 'read more', 'learn more'].includes(text);
      });
      return badLinks.length;
    });
    scores.seo.max += 15;
    if (linkCheck === 0) scores.seo.points += 15;
    else if (linkCheck < 3) scores.seo.points += 8;

    // Calculate final scores
    const calcScore = (cat) => Math.round((cat.points / cat.max) * 100);

    const performanceScore = calcScore(scores.performance);
    const accessibilityScore = calcScore(scores.accessibility);
    const bestPracticesScore = calcScore(scores.bestPractices);
    const seoScore = calcScore(scores.seo);

    const getScoreStatus = (score) => score >= 90 ? 'pass' : score >= 50 ? 'warning' : 'fail';
    const getScoreEmoji = (score) => score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';

    // Add results
    results.tests.push({
      name: 'Performance Score',
      status: getScoreStatus(performanceScore),
      value: `${performanceScore}/100`,
      details: `${getScoreEmoji(performanceScore)} Rendimiento: ${performanceScore}/100 (Tiempo carga: ${loadTime}ms, TTFB: ${timing.ttfb}ms)`,
      severity: performanceScore >= 90 ? 'info' : performanceScore >= 50 ? 'medium' : 'high'
    });

    results.tests.push({
      name: 'Accessibility Score',
      status: getScoreStatus(accessibilityScore),
      value: `${accessibilityScore}/100`,
      details: `${getScoreEmoji(accessibilityScore)} Accesibilidad: ${accessibilityScore}/100`,
      severity: accessibilityScore >= 90 ? 'info' : accessibilityScore >= 50 ? 'medium' : 'high'
    });

    results.tests.push({
      name: 'Best Practices Score',
      status: getScoreStatus(bestPracticesScore),
      value: `${bestPracticesScore}/100`,
      details: `${getScoreEmoji(bestPracticesScore)} Mejores Prácticas: ${bestPracticesScore}/100`,
      severity: bestPracticesScore >= 90 ? 'info' : bestPracticesScore >= 50 ? 'medium' : 'high'
    });

    results.tests.push({
      name: 'SEO Score',
      status: getScoreStatus(seoScore),
      value: `${seoScore}/100`,
      details: `${getScoreEmoji(seoScore)} SEO: ${seoScore}/100`,
      severity: seoScore >= 90 ? 'info' : seoScore >= 50 ? 'medium' : 'high'
    });

    // Overall score
    const overallScore = Math.round((performanceScore + accessibilityScore + bestPracticesScore + seoScore) / 4);
    results.tests.push({
      name: 'Overall Score',
      status: getScoreStatus(overallScore),
      value: `${overallScore}/100`,
      details: `${getScoreEmoji(overallScore)} Puntuación General: ${overallScore}/100`,
      severity: overallScore >= 90 ? 'info' : overallScore >= 50 ? 'medium' : 'high',
      recommendation: overallScore < 90 ? 'Revisar categorías con puntaje bajo para mejorar' : null
    });

    logger.explain(`   ✓ Auditoría completada: ${overallScore}/100`);

  } catch (error) {
    results.tests.push({
      name: 'Auditoría Lighthouse',
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

module.exports = { testLighthouse };
