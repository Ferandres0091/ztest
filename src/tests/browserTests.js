const puppeteer = require('puppeteer');

async function testWithBrowser(url, logger) {
  logger.explain('🌐 Iniciando análisis con navegador headless...');
  logger.explain('   Esto carga la página como un navegador real para detectar errores de JS, recursos, etc.');

  const results = {
    name: 'Análisis de Navegador',
    tests: []
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Collect console errors
    const consoleErrors = [];
    const consoleWarnings = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });

    // Collect failed requests
    const failedRequests = [];
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        reason: request.failure()?.errorText || 'Unknown'
      });
    });

    // Collect all resources
    const resources = [];
    page.on('response', response => {
      resources.push({
        url: response.url(),
        status: response.status(),
        type: response.request().resourceType()
      });
    });

    logger.explain('   Cargando página...');

    const startTime = Date.now();
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    const loadTime = Date.now() - startTime;

    // Page Load Time
    results.tests.push({
      name: 'Tiempo de Carga Completa',
      status: loadTime < 5000 ? 'pass' : loadTime < 10000 ? 'warning' : 'fail',
      value: `${loadTime}ms`,
      details: loadTime < 5000
        ? `Página cargada en ${loadTime}ms - Buen rendimiento`
        : loadTime < 10000
        ? `Página cargada en ${loadTime}ms - Rendimiento aceptable`
        : `Página cargada en ${loadTime}ms - Rendimiento lento`,
      severity: loadTime < 5000 ? 'info' : loadTime < 10000 ? 'medium' : 'high',
      recommendation: loadTime >= 5000 ? 'Optimizar recursos y tiempo de carga' : null
    });

    // Console Errors
    if (consoleErrors.length > 0) {
      results.tests.push({
        name: 'Errores de JavaScript',
        status: 'fail',
        value: `${consoleErrors.length} error(es)`,
        details: `Errores encontrados:\n${consoleErrors.slice(0, 5).map(e => `  - ${e.substring(0, 100)}`).join('\n')}${consoleErrors.length > 5 ? `\n  ... y ${consoleErrors.length - 5} más` : ''}`,
        severity: 'high',
        recommendation: 'Revisar y corregir los errores de JavaScript en la consola'
      });
    } else {
      results.tests.push({
        name: 'Errores de JavaScript',
        status: 'pass',
        value: 'Ninguno',
        details: 'No se detectaron errores de JavaScript en la consola',
        severity: 'info'
      });
    }

    // Console Warnings
    if (consoleWarnings.length > 0) {
      results.tests.push({
        name: 'Advertencias de JavaScript',
        status: 'warning',
        value: `${consoleWarnings.length} advertencia(s)`,
        details: `Advertencias: ${consoleWarnings.slice(0, 3).join(', ')}`,
        severity: 'low'
      });
    }

    // Failed Requests
    if (failedRequests.length > 0) {
      results.tests.push({
        name: 'Recursos Fallidos',
        status: 'warning',
        value: `${failedRequests.length} recurso(s)`,
        details: `Recursos que no cargaron:\n${failedRequests.slice(0, 5).map(r => `  - ${r.url.substring(0, 60)}... (${r.reason})`).join('\n')}`,
        severity: 'medium',
        recommendation: 'Verificar que todos los recursos externos estén disponibles'
      });
    } else {
      results.tests.push({
        name: 'Recursos',
        status: 'pass',
        value: 'Todos cargados',
        details: `${resources.length} recursos cargados correctamente`,
        severity: 'info'
      });
    }

    // Mixed Content Check
    const mixedContent = resources.filter(r =>
      url.startsWith('https://') && r.url.startsWith('http://')
    );
    if (mixedContent.length > 0) {
      results.tests.push({
        name: 'Contenido Mixto',
        status: 'fail',
        value: `${mixedContent.length} recurso(s)`,
        details: `Recursos HTTP en página HTTPS:\n${mixedContent.slice(0, 3).map(r => `  - ${r.url}`).join('\n')}`,
        severity: 'high',
        recommendation: 'Cambiar todos los recursos a HTTPS'
      });
    } else if (url.startsWith('https://')) {
      results.tests.push({
        name: 'Contenido Mixto',
        status: 'pass',
        value: 'No detectado',
        details: 'No hay contenido mixto HTTP/HTTPS',
        severity: 'info'
      });
    }

    // Check for common security issues in page content
    const pageContent = await page.content();

    // Check for inline scripts (potential XSS surface)
    const inlineScripts = (pageContent.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [])
      .filter(s => !s.includes('src='));
    if (inlineScripts.length > 5) {
      results.tests.push({
        name: 'Scripts Inline',
        status: 'info',
        value: `${inlineScripts.length} scripts`,
        details: `${inlineScripts.length} scripts inline detectados - Considerar mover a archivos externos para mejor CSP`,
        severity: 'info'
      });
    }

    // Check for forms without CSRF protection hints
    const forms = await page.$$('form');
    if (forms.length > 0) {
      results.tests.push({
        name: 'Formularios Detectados',
        status: 'info',
        value: `${forms.length} formulario(s)`,
        details: `${forms.length} formulario(s) encontrado(s) - Verificar protección CSRF manualmente`,
        severity: 'info'
      });
    }

    // Page title
    const title = await page.title();
    results.tests.push({
      name: 'Título de Página',
      status: title ? 'pass' : 'warning',
      value: title || 'Sin título',
      details: title ? `Título: "${title}"` : 'La página no tiene título - Malo para SEO',
      severity: 'info'
    });

    // Meta description
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    results.tests.push({
      name: 'Meta Description',
      status: metaDesc ? 'pass' : 'info',
      value: metaDesc ? 'Presente' : 'Ausente',
      details: metaDesc ? `Descripción: "${metaDesc.substring(0, 100)}..."` : 'Sin meta description',
      severity: 'info'
    });

    // Viewport meta (mobile responsiveness)
    const viewport = await page.$eval('meta[name="viewport"]', el => el.content).catch(() => null);
    results.tests.push({
      name: 'Viewport (Mobile)',
      status: viewport ? 'pass' : 'warning',
      value: viewport ? 'Configurado' : 'No configurado',
      details: viewport
        ? 'Viewport configurado para responsive'
        : 'Sin viewport meta - Puede no ser responsive en móviles',
      severity: viewport ? 'info' : 'low'
    });

    logger.explain(`   ✓ Análisis completado: ${loadTime}ms carga, ${consoleErrors.length} errores JS`);

  } catch (error) {
    results.tests.push({
      name: 'Análisis de Navegador',
      status: 'fail',
      value: 'Error',
      details: `No se pudo completar el análisis: ${error.message}`,
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

async function testPerformance(url, logger) {
  logger.explain('⚡ Analizando métricas de rendimiento...');
  logger.explain('   Mido Core Web Vitals y otras métricas importantes.');

  const results = {
    name: 'Rendimiento',
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
    await page.setCacheEnabled(false);

    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Get performance metrics
    const performanceMetrics = await client.send('Performance.getMetrics');
    const metrics = {};
    performanceMetrics.metrics.forEach(m => {
      metrics[m.name] = m.value;
    });

    // Get timing from page
    const timing = await page.evaluate(() => {
      const t = performance.timing;
      return {
        dns: t.domainLookupEnd - t.domainLookupStart,
        tcp: t.connectEnd - t.connectStart,
        ttfb: t.responseStart - t.requestStart,
        download: t.responseEnd - t.responseStart,
        domReady: t.domContentLoadedEventEnd - t.navigationStart,
        load: t.loadEventEnd - t.navigationStart
      };
    });

    // DNS Lookup
    results.tests.push({
      name: 'DNS Lookup',
      status: timing.dns < 100 ? 'pass' : 'warning',
      value: `${timing.dns}ms`,
      details: `Resolución DNS: ${timing.dns}ms`,
      severity: 'info'
    });

    // TTFB (Time to First Byte)
    results.tests.push({
      name: 'Time to First Byte (TTFB)',
      status: timing.ttfb < 600 ? 'pass' : timing.ttfb < 1000 ? 'warning' : 'fail',
      value: `${timing.ttfb}ms`,
      details: timing.ttfb < 600
        ? `TTFB: ${timing.ttfb}ms - Excelente`
        : timing.ttfb < 1000
        ? `TTFB: ${timing.ttfb}ms - Aceptable`
        : `TTFB: ${timing.ttfb}ms - Lento, optimizar servidor`,
      severity: timing.ttfb < 600 ? 'info' : timing.ttfb < 1000 ? 'medium' : 'high',
      recommendation: timing.ttfb >= 600 ? 'Optimizar tiempo de respuesta del servidor' : null
    });

    // DOM Content Loaded
    results.tests.push({
      name: 'DOM Content Loaded',
      status: timing.domReady < 2000 ? 'pass' : timing.domReady < 4000 ? 'warning' : 'fail',
      value: `${timing.domReady}ms`,
      details: `DOM listo en ${timing.domReady}ms`,
      severity: timing.domReady < 2000 ? 'info' : 'medium'
    });

    // Full Load
    if (timing.load > 0) {
      results.tests.push({
        name: 'Carga Completa',
        status: timing.load < 3000 ? 'pass' : timing.load < 6000 ? 'warning' : 'fail',
        value: `${timing.load}ms`,
        details: `Carga completa en ${timing.load}ms`,
        severity: timing.load < 3000 ? 'info' : timing.load < 6000 ? 'medium' : 'high'
      });
    }

    // JS Heap Size
    if (metrics.JSHeapUsedSize) {
      const heapMB = (metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2);
      results.tests.push({
        name: 'Memoria JS',
        status: heapMB < 50 ? 'pass' : heapMB < 100 ? 'warning' : 'fail',
        value: `${heapMB} MB`,
        details: `Uso de memoria JavaScript: ${heapMB} MB`,
        severity: heapMB < 50 ? 'info' : 'medium'
      });
    }

    logger.explain(`   ✓ TTFB: ${timing.ttfb}ms, DOM: ${timing.domReady}ms`);

  } catch (error) {
    results.tests.push({
      name: 'Métricas de Rendimiento',
      status: 'warning',
      value: 'Error',
      details: `No se pudieron obtener métricas: ${error.message}`,
      severity: 'low'
    });
    logger.explain(`   ✗ Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

module.exports = { testWithBrowser, testPerformance };
