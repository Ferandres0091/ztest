const puppeteer = require('puppeteer');

async function testWebVitals(url, logger) {
  logger.explain('📊 Analizando Core Web Vitals...');
  logger.explain('   Mido LCP, FID, CLS - Las métricas que usa Google para ranking.');

  const results = {
    name: 'Core Web Vitals',
    tests: []
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Enable performance metrics
    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');

    // Inject web-vitals measurement script
    await page.evaluateOnNewDocument(() => {
      window.webVitalsData = {
        LCP: null,
        FID: null,
        CLS: null,
        FCP: null,
        TTFB: null,
        INP: null
      };

      // LCP Observer
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        window.webVitalsData.LCP = lastEntry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // CLS Observer
      let clsValue = 0;
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        window.webVitalsData.CLS = clsValue;
      }).observe({ type: 'layout-shift', buffered: true });

      // FID Observer
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          window.webVitalsData.FID = entries[0].processingStart - entries[0].startTime;
        }
      }).observe({ type: 'first-input', buffered: true });

      // FCP Observer
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          window.webVitalsData.FCP = entries[0].startTime;
        }
      }).observe({ type: 'paint', buffered: true });
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Simulate some interaction to potentially trigger FID
    await page.mouse.move(100, 100);
    await page.mouse.click(100, 100).catch(() => {});

    // Wait a bit for metrics to settle
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the collected metrics
    const vitals = await page.evaluate(() => window.webVitalsData);

    // Get TTFB from performance timing
    const timing = await page.evaluate(() => {
      const t = performance.timing;
      return {
        ttfb: t.responseStart - t.requestStart,
        domReady: t.domContentLoadedEventEnd - t.navigationStart,
        load: t.loadEventEnd - t.navigationStart
      };
    });

    // LCP - Largest Contentful Paint
    // Good: < 2.5s, Needs Improvement: 2.5-4s, Poor: > 4s
    const lcp = vitals.LCP;
    if (lcp !== null) {
      results.tests.push({
        name: 'LCP (Largest Contentful Paint)',
        status: lcp < 2500 ? 'pass' : lcp < 4000 ? 'warning' : 'fail',
        value: `${(lcp / 1000).toFixed(2)}s`,
        details: lcp < 2500
          ? `LCP: ${(lcp / 1000).toFixed(2)}s - Bueno (< 2.5s)`
          : lcp < 4000
          ? `LCP: ${(lcp / 1000).toFixed(2)}s - Necesita mejora (2.5-4s)`
          : `LCP: ${(lcp / 1000).toFixed(2)}s - Pobre (> 4s)`,
        severity: lcp < 2500 ? 'info' : lcp < 4000 ? 'medium' : 'high',
        recommendation: lcp >= 2500 ? 'Optimizar imágenes hero, usar preload para recursos críticos' : null
      });
    } else {
      results.tests.push({
        name: 'LCP (Largest Contentful Paint)',
        status: 'info',
        value: 'No medido',
        details: 'No se pudo medir LCP - Puede requerir interacción real',
        severity: 'info'
      });
    }

    // CLS - Cumulative Layout Shift
    // Good: < 0.1, Needs Improvement: 0.1-0.25, Poor: > 0.25
    const cls = vitals.CLS;
    if (cls !== null) {
      results.tests.push({
        name: 'CLS (Cumulative Layout Shift)',
        status: cls < 0.1 ? 'pass' : cls < 0.25 ? 'warning' : 'fail',
        value: cls.toFixed(3),
        details: cls < 0.1
          ? `CLS: ${cls.toFixed(3)} - Bueno (< 0.1)`
          : cls < 0.25
          ? `CLS: ${cls.toFixed(3)} - Necesita mejora (0.1-0.25)`
          : `CLS: ${cls.toFixed(3)} - Pobre (> 0.25) - Elementos se mueven durante carga`,
        severity: cls < 0.1 ? 'info' : cls < 0.25 ? 'medium' : 'high',
        recommendation: cls >= 0.1 ? 'Definir dimensiones en imágenes/iframes, evitar contenido inyectado' : null
      });
    } else {
      results.tests.push({
        name: 'CLS (Cumulative Layout Shift)',
        status: 'pass',
        value: '0',
        details: 'CLS: 0 - Sin cambios de layout detectados',
        severity: 'info'
      });
    }

    // FID - First Input Delay (simulated)
    // Good: < 100ms, Needs Improvement: 100-300ms, Poor: > 300ms
    const fid = vitals.FID;
    if (fid !== null) {
      results.tests.push({
        name: 'FID (First Input Delay)',
        status: fid < 100 ? 'pass' : fid < 300 ? 'warning' : 'fail',
        value: `${fid.toFixed(0)}ms`,
        details: fid < 100
          ? `FID: ${fid.toFixed(0)}ms - Bueno (< 100ms)`
          : fid < 300
          ? `FID: ${fid.toFixed(0)}ms - Necesita mejora (100-300ms)`
          : `FID: ${fid.toFixed(0)}ms - Pobre (> 300ms)`,
        severity: fid < 100 ? 'info' : fid < 300 ? 'medium' : 'high',
        recommendation: fid >= 100 ? 'Reducir JavaScript bloqueante, usar code splitting' : null
      });
    } else {
      results.tests.push({
        name: 'FID (First Input Delay)',
        status: 'info',
        value: 'No medido',
        details: 'FID requiere interacción real del usuario',
        severity: 'info'
      });
    }

    // FCP - First Contentful Paint
    // Good: < 1.8s, Needs Improvement: 1.8-3s, Poor: > 3s
    const fcp = vitals.FCP;
    if (fcp !== null) {
      results.tests.push({
        name: 'FCP (First Contentful Paint)',
        status: fcp < 1800 ? 'pass' : fcp < 3000 ? 'warning' : 'fail',
        value: `${(fcp / 1000).toFixed(2)}s`,
        details: fcp < 1800
          ? `FCP: ${(fcp / 1000).toFixed(2)}s - Bueno (< 1.8s)`
          : fcp < 3000
          ? `FCP: ${(fcp / 1000).toFixed(2)}s - Necesita mejora (1.8-3s)`
          : `FCP: ${(fcp / 1000).toFixed(2)}s - Pobre (> 3s)`,
        severity: fcp < 1800 ? 'info' : fcp < 3000 ? 'medium' : 'high',
        recommendation: fcp >= 1800 ? 'Eliminar recursos que bloquean el renderizado' : null
      });
    }

    // TTFB - Time to First Byte
    // Good: < 800ms, Needs Improvement: 800-1800ms, Poor: > 1800ms
    const ttfb = timing.ttfb;
    results.tests.push({
      name: 'TTFB (Time to First Byte)',
      status: ttfb < 800 ? 'pass' : ttfb < 1800 ? 'warning' : 'fail',
      value: `${ttfb}ms`,
      details: ttfb < 800
        ? `TTFB: ${ttfb}ms - Bueno (< 800ms)`
        : ttfb < 1800
        ? `TTFB: ${ttfb}ms - Necesita mejora (800-1800ms)`
        : `TTFB: ${ttfb}ms - Pobre (> 1800ms)`,
      severity: ttfb < 800 ? 'info' : ttfb < 1800 ? 'medium' : 'high',
      recommendation: ttfb >= 800 ? 'Optimizar servidor, usar CDN, implementar caché' : null
    });

    // Speed Index estimation based on visual progress
    const speedIndex = timing.domReady;
    results.tests.push({
      name: 'Speed Index (estimado)',
      status: speedIndex < 3400 ? 'pass' : speedIndex < 5800 ? 'warning' : 'fail',
      value: `${speedIndex}ms`,
      details: speedIndex < 3400
        ? `Speed Index: ~${speedIndex}ms - Bueno`
        : `Speed Index: ~${speedIndex}ms - Necesita optimización`,
      severity: speedIndex < 3400 ? 'info' : 'medium'
    });

    // Total Blocking Time estimation
    const tbt = await page.evaluate(() => {
      const entries = performance.getEntriesByType('longtask');
      let totalBlockingTime = 0;
      entries.forEach(entry => {
        const blockingTime = entry.duration - 50;
        if (blockingTime > 0) {
          totalBlockingTime += blockingTime;
        }
      });
      return totalBlockingTime;
    });

    results.tests.push({
      name: 'TBT (Total Blocking Time)',
      status: tbt < 200 ? 'pass' : tbt < 600 ? 'warning' : 'fail',
      value: `${tbt.toFixed(0)}ms`,
      details: tbt < 200
        ? `TBT: ${tbt.toFixed(0)}ms - Bueno (< 200ms)`
        : tbt < 600
        ? `TBT: ${tbt.toFixed(0)}ms - Necesita mejora (200-600ms)`
        : `TBT: ${tbt.toFixed(0)}ms - Pobre (> 600ms)`,
      severity: tbt < 200 ? 'info' : tbt < 600 ? 'medium' : 'high',
      recommendation: tbt >= 200 ? 'Dividir tareas largas de JavaScript, usar web workers' : null
    });

    // Resource hints check
    const resourceHints = await page.$$eval('link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"]', elements => ({
      preload: elements.filter(el => el.rel === 'preload').length,
      prefetch: elements.filter(el => el.rel === 'prefetch').length,
      preconnect: elements.filter(el => el.rel === 'preconnect').length,
      dnsPrefetch: elements.filter(el => el.rel === 'dns-prefetch').length
    }));

    const totalHints = resourceHints.preload + resourceHints.prefetch + resourceHints.preconnect + resourceHints.dnsPrefetch;
    results.tests.push({
      name: 'Resource Hints',
      status: totalHints > 0 ? 'pass' : 'info',
      value: totalHints > 0 ? `${totalHints} hints` : 'No encontrados',
      details: `preload: ${resourceHints.preload}, preconnect: ${resourceHints.preconnect}, prefetch: ${resourceHints.prefetch}`,
      severity: 'info',
      recommendation: totalHints === 0 ? 'Considerar usar preload/preconnect para recursos críticos' : null
    });

    logger.explain('   ✓ Core Web Vitals analizados');

  } catch (error) {
    results.tests.push({
      name: 'Core Web Vitals',
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

module.exports = { testWebVitals };
