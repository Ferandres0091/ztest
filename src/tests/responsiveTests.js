const puppeteer = require('puppeteer');

const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: 'Mobile (iPhone SE)', isMobile: true },
  mobileLarge: { width: 414, height: 896, name: 'Mobile Large (iPhone 11)', isMobile: true },
  tablet: { width: 768, height: 1024, name: 'Tablet (iPad)', isMobile: true },
  tabletLandscape: { width: 1024, height: 768, name: 'Tablet Landscape', isMobile: false },
  desktop: { width: 1366, height: 768, name: 'Desktop (Laptop)', isMobile: false },
  desktopLarge: { width: 1920, height: 1080, name: 'Desktop Large (Full HD)', isMobile: false }
};

async function testResponsive(url, logger) {
  logger.explain('📱 Analizando diseño responsive...');
  logger.explain('   Verifico cómo se ve la página en diferentes tamaños de pantalla.');

  const results = {
    name: 'Diseño Responsive',
    tests: []
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const [key, viewport] of Object.entries(VIEWPORTS)) {
      logger.explain(`   📐 Probando ${viewport.name}...`);

      const page = await browser.newPage();

      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile
      });

      if (viewport.isMobile) {
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1');
      }

      const issues = [];

      // Collect console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Check for horizontal overflow (common responsive issue)
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        if (hasHorizontalScroll) {
          issues.push('Scroll horizontal detectado (contenido desborda)');
        }

        // Check if viewport meta is present
        const hasViewportMeta = await page.evaluate(() => {
          const meta = document.querySelector('meta[name="viewport"]');
          return meta !== null;
        });

        if (!hasViewportMeta) {
          issues.push('Sin meta viewport');
        }

        // Check for elements that might be cut off or too small
        const tooSmallText = await page.evaluate(() => {
          const elements = document.querySelectorAll('p, span, a, li, td, th, label');
          let smallCount = 0;
          elements.forEach(el => {
            const style = window.getComputedStyle(el);
            const fontSize = parseFloat(style.fontSize);
            if (fontSize < 12) smallCount++;
          });
          return smallCount;
        });

        if (tooSmallText > 10 && viewport.isMobile) {
          issues.push(`${tooSmallText} elementos con texto muy pequeño (<12px)`);
        }

        // Check for touch targets that are too small (mobile)
        if (viewport.isMobile) {
          const smallTouchTargets = await page.evaluate(() => {
            const clickables = document.querySelectorAll('a, button, input, select, textarea, [onclick]');
            let smallCount = 0;
            clickables.forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                if (rect.width < 44 || rect.height < 44) {
                  smallCount++;
                }
              }
            });
            return smallCount;
          });

          if (smallTouchTargets > 5) {
            issues.push(`${smallTouchTargets} botones/links muy pequeños para touch (<44px)`);
          }
        }

        // Check for images without proper sizing
        const oversizedImages = await page.evaluate((vpWidth) => {
          const images = document.querySelectorAll('img');
          let count = 0;
          images.forEach(img => {
            if (img.naturalWidth > vpWidth * 1.5) {
              count++;
            }
          });
          return count;
        }, viewport.width);

        if (oversizedImages > 0) {
          issues.push(`${oversizedImages} imágenes no optimizadas para este tamaño`);
        }

        // Check for fixed width elements that might break layout
        const fixedWidthIssues = await page.evaluate((vpWidth) => {
          const elements = document.querySelectorAll('div, section, article, main, aside, nav');
          let count = 0;
          elements.forEach(el => {
            const style = window.getComputedStyle(el);
            const width = parseFloat(style.width);
            if (width > vpWidth) {
              count++;
            }
          });
          return count;
        }, viewport.width);

        if (fixedWidthIssues > 0) {
          issues.push(`${fixedWidthIssues} elementos más anchos que la pantalla`);
        }

        // Check if navigation is accessible
        const navCheck = await page.evaluate(() => {
          const nav = document.querySelector('nav, [role="navigation"], header');
          if (!nav) return { exists: false };

          const rect = nav.getBoundingClientRect();
          const isVisible = rect.height > 0 && rect.width > 0;

          // Check for hamburger menu on mobile
          const hamburger = document.querySelector('[class*="hamburger"], [class*="menu-toggle"], [class*="mobile-menu"], button[aria-label*="menu"], .navbar-toggler');

          return {
            exists: true,
            isVisible,
            hasHamburger: hamburger !== null
          };
        });

        if (viewport.isMobile && navCheck.exists && !navCheck.hasHamburger) {
          // Not necessarily an issue, just informational
        }

        // Take screenshot for reference
        const screenshotPath = `screenshot-${key}-${Date.now()}.png`;
        await page.screenshot({
          path: `${__dirname}/../../screenshots/${screenshotPath}`,
          fullPage: false
        }).catch(() => {}); // Ignore if screenshots folder doesn't exist

        // Determine status
        let status = 'pass';
        let severity = 'info';

        if (issues.length > 3) {
          status = 'fail';
          severity = 'high';
        } else if (issues.length > 0) {
          status = 'warning';
          severity = 'medium';
        }

        results.tests.push({
          name: viewport.name,
          status,
          value: issues.length === 0 ? 'OK' : `${issues.length} problema(s)`,
          details: issues.length === 0
            ? `Diseño correcto en ${viewport.width}x${viewport.height}`
            : `Problemas en ${viewport.width}x${viewport.height}: ${issues.join('; ')}`,
          severity,
          recommendation: issues.length > 0 ? `Revisar: ${issues[0]}` : null
        });

      } catch (error) {
        results.tests.push({
          name: viewport.name,
          status: 'fail',
          value: 'Error',
          details: `No se pudo cargar en ${viewport.name}: ${error.message}`,
          severity: 'high'
        });
      }

      await page.close();
    }

    // Summary
    const passedCount = results.tests.filter(t => t.status === 'pass').length;
    const totalCount = results.tests.length;

    logger.explain(`   ✓ Responsive: ${passedCount}/${totalCount} viewports OK`);

  } catch (error) {
    results.tests.push({
      name: 'Análisis Responsive',
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

async function takeScreenshots(url, logger) {
  logger.explain('📸 Capturando screenshots en diferentes dispositivos...');

  const results = {
    name: 'Screenshots',
    tests: []
  };

  let browser;
  try {
    const fs = require('fs');
    const path = require('path');
    const screenshotsDir = path.join(__dirname, '../../screenshots');

    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const timestamp = Date.now();
    const screenshots = [];

    for (const [key, viewport] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage();

      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        isMobile: viewport.isMobile
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const filename = `${key}-${timestamp}.png`;
        const filepath = path.join(screenshotsDir, filename);

        await page.screenshot({ path: filepath, fullPage: true });
        screenshots.push({ viewport: viewport.name, file: filepath });

        logger.explain(`   📸 ${viewport.name}: ${filename}`);
      } catch (error) {
        logger.explain(`   ✗ ${viewport.name}: Error`);
      }

      await page.close();
    }

    results.tests.push({
      name: 'Screenshots Capturados',
      status: 'pass',
      value: `${screenshots.length} screenshots`,
      details: `Screenshots guardados en: ${screenshotsDir}`,
      severity: 'info'
    });

  } catch (error) {
    results.tests.push({
      name: 'Screenshots',
      status: 'fail',
      value: 'Error',
      details: `No se pudieron capturar screenshots: ${error.message}`,
      severity: 'low'
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

module.exports = { testResponsive, takeScreenshots, VIEWPORTS };
