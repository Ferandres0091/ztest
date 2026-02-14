const puppeteer = require('puppeteer');

async function testAccessibility(url, logger) {
  logger.explain('♿ Analizando Accesibilidad (WCAG 2.1)...');
  logger.explain('   Verifico estándares de accesibilidad web.');

  const results = {
    name: 'Accesibilidad',
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

    // Images without alt
    const imagesA11y = await page.$$eval('img', elements => {
      const issues = [];
      elements.forEach((img, i) => {
        if (!img.alt) {
          issues.push({ src: img.src?.substring(0, 50), issue: 'sin alt' });
        } else if (img.alt.trim() === '') {
          issues.push({ src: img.src?.substring(0, 50), issue: 'alt vacío' });
        }
      });
      return { total: elements.length, issues };
    });

    results.tests.push({
      name: 'Imágenes Accesibles',
      status: imagesA11y.issues.length === 0 ? 'pass' : imagesA11y.issues.length <= 3 ? 'warning' : 'fail',
      value: `${imagesA11y.total - imagesA11y.issues.length}/${imagesA11y.total} OK`,
      details: imagesA11y.issues.length === 0
        ? 'Todas las imágenes tienen texto alternativo'
        : `${imagesA11y.issues.length} imágenes sin alt text adecuado`,
      severity: imagesA11y.issues.length === 0 ? 'info' : 'medium',
      recommendation: imagesA11y.issues.length > 0 ? 'Agregar alt descriptivo a todas las imágenes' : null
    });

    // Form labels
    const formA11y = await page.$$eval('input, select, textarea', elements => {
      const issues = [];
      elements.forEach(el => {
        const id = el.id;
        const type = el.type;
        if (type === 'hidden' || type === 'submit' || type === 'button') return;

        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        const hasAriaLabel = el.getAttribute('aria-label');
        const hasAriaLabelledby = el.getAttribute('aria-labelledby');
        const hasPlaceholder = el.placeholder;

        if (!hasLabel && !hasAriaLabel && !hasAriaLabelledby) {
          issues.push({ type: el.tagName, inputType: type, id: id || 'sin id' });
        }
      });
      return issues;
    });

    results.tests.push({
      name: 'Labels en Formularios',
      status: formA11y.length === 0 ? 'pass' : formA11y.length <= 2 ? 'warning' : 'fail',
      value: formA11y.length === 0 ? 'OK' : `${formA11y.length} sin label`,
      details: formA11y.length === 0
        ? 'Todos los campos tienen labels asociados'
        : `${formA11y.length} campos sin label o aria-label`,
      severity: formA11y.length === 0 ? 'info' : 'high',
      recommendation: formA11y.length > 0 ? 'Agregar <label for="id"> o aria-label a todos los campos' : null
    });

    // ARIA landmarks
    const landmarks = await page.$$eval('[role], header, nav, main, footer, aside, section, article', elements => {
      const roles = elements.map(el => el.getAttribute('role') || el.tagName.toLowerCase());
      return {
        hasMain: roles.includes('main') || elements.some(el => el.tagName === 'MAIN'),
        hasNav: roles.includes('navigation') || elements.some(el => el.tagName === 'NAV'),
        hasHeader: roles.includes('banner') || elements.some(el => el.tagName === 'HEADER'),
        hasFooter: roles.includes('contentinfo') || elements.some(el => el.tagName === 'FOOTER'),
        count: elements.length
      };
    });

    const landmarkIssues = [];
    if (!landmarks.hasMain) landmarkIssues.push('main');
    if (!landmarks.hasNav) landmarkIssues.push('nav');

    results.tests.push({
      name: 'ARIA Landmarks',
      status: landmarkIssues.length === 0 ? 'pass' : 'warning',
      value: landmarkIssues.length === 0 ? 'OK' : `Faltan: ${landmarkIssues.join(', ')}`,
      details: landmarkIssues.length === 0
        ? 'Landmarks principales presentes (main, nav)'
        : `Faltan landmarks: ${landmarkIssues.join(', ')}`,
      severity: landmarkIssues.length === 0 ? 'info' : 'medium',
      recommendation: landmarkIssues.length > 0 ? 'Agregar <main> y <nav> para navegación por lectores de pantalla' : null
    });

    // Skip links
    const skipLink = await page.$('a[href="#main"], a[href="#content"], a[href="#main-content"], .skip-link, .skip-to-content');
    results.tests.push({
      name: 'Skip Link',
      status: skipLink ? 'pass' : 'info',
      value: skipLink ? 'Presente' : 'No encontrado',
      details: skipLink
        ? 'Hay un enlace para saltar al contenido principal'
        : 'Sin skip link - Útil para usuarios de teclado',
      severity: 'info',
      recommendation: skipLink ? null : 'Considerar agregar skip link para accesibilidad de teclado'
    });

    // Focus visible
    const focusStyles = await page.evaluate(() => {
      const testElements = document.querySelectorAll('a, button, input, select, textarea');
      let hasFocusStyles = false;

      // Check if any focusable element has :focus styles defined
      const styleSheets = document.styleSheets;
      try {
        for (const sheet of styleSheets) {
          try {
            const rules = sheet.cssRules || sheet.rules;
            for (const rule of rules) {
              if (rule.selectorText && rule.selectorText.includes(':focus')) {
                hasFocusStyles = true;
                break;
              }
            }
          } catch (e) {
            // Cross-origin stylesheet
          }
          if (hasFocusStyles) break;
        }
      } catch (e) {}

      return hasFocusStyles;
    });

    results.tests.push({
      name: 'Estilos de Focus',
      status: focusStyles ? 'pass' : 'warning',
      value: focusStyles ? 'Definidos' : 'No detectados',
      details: focusStyles
        ? 'Hay estilos de :focus definidos'
        : 'No se detectaron estilos de :focus - Importante para navegación por teclado',
      severity: focusStyles ? 'info' : 'medium',
      recommendation: focusStyles ? null : 'Definir estilos visibles para :focus en elementos interactivos'
    });

    // Buttons and links accessibility
    const interactiveA11y = await page.$$eval('a, button', elements => {
      const issues = [];
      elements.forEach(el => {
        const text = el.textContent?.trim();
        const ariaLabel = el.getAttribute('aria-label');
        const title = el.getAttribute('title');

        if (!text && !ariaLabel && !title) {
          issues.push({ tag: el.tagName, issue: 'sin texto accesible' });
        } else if (text && ['click here', 'here', 'read more', 'learn more', 'ver más', 'leer más', 'aquí'].includes(text.toLowerCase())) {
          issues.push({ tag: el.tagName, text, issue: 'texto genérico' });
        }
      });
      return issues;
    });

    results.tests.push({
      name: 'Links y Botones Descriptivos',
      status: interactiveA11y.length === 0 ? 'pass' : interactiveA11y.length <= 3 ? 'warning' : 'fail',
      value: interactiveA11y.length === 0 ? 'OK' : `${interactiveA11y.length} problemas`,
      details: interactiveA11y.length === 0
        ? 'Links y botones tienen texto descriptivo'
        : `${interactiveA11y.length} elementos con texto no descriptivo o vacío`,
      severity: interactiveA11y.length === 0 ? 'info' : 'medium',
      recommendation: interactiveA11y.length > 0 ? 'Usar texto descriptivo en links (evitar "click aquí", "leer más")' : null
    });

    // Color contrast (basic check - checks if text is very light on white or very dark on dark)
    const contrastIssues = await page.evaluate(() => {
      const issues = [];
      const textElements = document.querySelectorAll('p, span, a, li, h1, h2, h3, h4, h5, h6, label');

      textElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = style.backgroundColor;

        // Parse RGB
        const parseRGB = (str) => {
          const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (match) {
            return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
          }
          return null;
        };

        const textRGB = parseRGB(color);
        const bgRGB = parseRGB(bgColor);

        if (textRGB && bgRGB) {
          // Calculate relative luminance
          const luminance = (rgb) => {
            const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
              c = c / 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };

          const l1 = luminance(textRGB);
          const l2 = luminance(bgRGB);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
          if (ratio < 4.5 && bgRGB.r !== 0 && bgRGB.g !== 0 && bgRGB.b !== 0) {
            issues.push({ ratio: ratio.toFixed(2), text: el.textContent?.substring(0, 20) });
          }
        }
      });

      return issues.slice(0, 10); // Limit to first 10
    });

    results.tests.push({
      name: 'Contraste de Color',
      status: contrastIssues.length === 0 ? 'pass' : contrastIssues.length <= 3 ? 'warning' : 'fail',
      value: contrastIssues.length === 0 ? 'OK' : `${contrastIssues.length}+ problemas`,
      details: contrastIssues.length === 0
        ? 'Contraste de texto adecuado detectado'
        : `${contrastIssues.length} elementos con posible bajo contraste`,
      severity: contrastIssues.length === 0 ? 'info' : 'medium',
      recommendation: contrastIssues.length > 0 ? 'Verificar contraste mínimo 4.5:1 para texto normal' : null
    });

    // Document language
    const htmlLang = await page.$eval('html', el => el.lang).catch(() => null);
    results.tests.push({
      name: 'Idioma del Documento',
      status: htmlLang ? 'pass' : 'fail',
      value: htmlLang || 'No definido',
      details: htmlLang
        ? `Idioma definido: ${htmlLang}`
        : 'Sin atributo lang - Lectores de pantalla no sabrán el idioma',
      severity: htmlLang ? 'info' : 'high',
      recommendation: htmlLang ? null : 'Agregar lang="es" al elemento <html>'
    });

    // Tabindex issues
    const tabindexIssues = await page.$$eval('[tabindex]', elements => {
      return elements.filter(el => {
        const val = parseInt(el.getAttribute('tabindex'));
        return val > 0; // Positive tabindex is bad practice
      }).length;
    });

    results.tests.push({
      name: 'TabIndex Positivo',
      status: tabindexIssues === 0 ? 'pass' : 'warning',
      value: tabindexIssues === 0 ? 'OK' : `${tabindexIssues} elementos`,
      details: tabindexIssues === 0
        ? 'No hay tabindex positivos (buena práctica)'
        : `${tabindexIssues} elementos con tabindex > 0 - Puede desordenar navegación`,
      severity: tabindexIssues === 0 ? 'info' : 'low',
      recommendation: tabindexIssues > 0 ? 'Evitar tabindex positivo, usar 0 o -1' : null
    });

    // Auto-playing media
    const autoplayMedia = await page.$$eval('video[autoplay], audio[autoplay]', elements => elements.length);
    results.tests.push({
      name: 'Autoplay Media',
      status: autoplayMedia === 0 ? 'pass' : 'warning',
      value: autoplayMedia === 0 ? 'No hay' : `${autoplayMedia} elemento(s)`,
      details: autoplayMedia === 0
        ? 'No hay media con autoplay'
        : `${autoplayMedia} elemento(s) con autoplay - Puede ser molesto para usuarios`,
      severity: autoplayMedia === 0 ? 'info' : 'low'
    });

    logger.explain('   ✓ Análisis de accesibilidad completado');

  } catch (error) {
    results.tests.push({
      name: 'Análisis de Accesibilidad',
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

module.exports = { testAccessibility };
