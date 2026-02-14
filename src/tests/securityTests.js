const axios = require('axios');
const https = require('https');

// Agent that ignores SSL errors (for internal/dev testing)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function testSecurityHeaders(url, logger) {
  logger.explain('🛡️  Analizando headers de seguridad...');
  logger.explain('   Los headers de seguridad protegen contra ataques comunes como XSS, clickjacking, etc.');

  const results = {
    name: 'Headers de Seguridad',
    tests: []
  };

  try {
    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      httpsAgent
    });

    const headers = response.headers;

    // Content-Security-Policy
    const csp = headers['content-security-policy'];
    results.tests.push({
      name: 'Content-Security-Policy (CSP)',
      status: csp ? 'pass' : 'fail',
      value: csp ? 'Configurado' : 'No configurado',
      details: csp
        ? `CSP configurado: "${csp.substring(0, 100)}${csp.length > 100 ? '...' : ''}"`
        : 'No hay Content-Security-Policy - El sitio es vulnerable a ataques XSS',
      severity: csp ? 'info' : 'high',
      recommendation: csp ? null : 'Implementar Content-Security-Policy para prevenir XSS'
    });

    // X-Frame-Options
    const xfo = headers['x-frame-options'];
    results.tests.push({
      name: 'X-Frame-Options',
      status: xfo ? 'pass' : 'warning',
      value: xfo || 'No configurado',
      details: xfo
        ? `Protección contra clickjacking: ${xfo}`
        : 'Sin protección contra clickjacking - El sitio puede ser embebido en iframes maliciosos',
      severity: xfo ? 'info' : 'medium',
      recommendation: xfo ? null : 'Agregar header X-Frame-Options: DENY o SAMEORIGIN'
    });

    // X-Content-Type-Options
    const xcto = headers['x-content-type-options'];
    results.tests.push({
      name: 'X-Content-Type-Options',
      status: xcto === 'nosniff' ? 'pass' : 'warning',
      value: xcto || 'No configurado',
      details: xcto === 'nosniff'
        ? 'Protección contra MIME sniffing activada'
        : 'Sin protección contra MIME sniffing - Riesgo de ataques de tipo MIME',
      severity: xcto === 'nosniff' ? 'info' : 'low',
      recommendation: xcto === 'nosniff' ? null : 'Agregar header X-Content-Type-Options: nosniff'
    });

    // Strict-Transport-Security (HSTS)
    const hsts = headers['strict-transport-security'];
    if (url.startsWith('https://')) {
      results.tests.push({
        name: 'Strict-Transport-Security (HSTS)',
        status: hsts ? 'pass' : 'warning',
        value: hsts ? 'Configurado' : 'No configurado',
        details: hsts
          ? `HSTS activado: ${hsts}`
          : 'Sin HSTS - Los usuarios pueden ser víctimas de ataques de downgrade',
        severity: hsts ? 'info' : 'medium',
        recommendation: hsts ? null : 'Agregar header Strict-Transport-Security con max-age apropiado'
      });

      // Check HSTS preload and includeSubDomains
      if (hsts) {
        const hasPreload = hsts.includes('preload');
        const hasSubdomains = hsts.includes('includeSubDomains');
        if (!hasPreload || !hasSubdomains) {
          results.tests.push({
            name: 'HSTS Configuración Completa',
            status: 'info',
            value: `preload: ${hasPreload ? 'Sí' : 'No'}, includeSubDomains: ${hasSubdomains ? 'Sí' : 'No'}`,
            details: 'Considerar agregar preload e includeSubDomains para máxima protección',
            severity: 'info'
          });
        }
      }
    }

    // X-XSS-Protection (deprecated but still checked)
    const xxss = headers['x-xss-protection'];
    results.tests.push({
      name: 'X-XSS-Protection',
      status: xxss ? 'info' : 'info',
      value: xxss || 'No configurado',
      details: xxss
        ? `Configurado: ${xxss} (Nota: Este header está deprecado, usar CSP en su lugar)`
        : 'No configurado (Este header está deprecado, CSP es la solución moderna)',
      severity: 'info'
    });

    // Referrer-Policy
    const referrer = headers['referrer-policy'];
    results.tests.push({
      name: 'Referrer-Policy',
      status: referrer ? 'pass' : 'info',
      value: referrer || 'No configurado',
      details: referrer
        ? `Política de referrer: ${referrer}`
        : 'Sin Referrer-Policy - Puede filtrar información de URLs a sitios externos',
      severity: referrer ? 'info' : 'low',
      recommendation: referrer ? null : 'Considerar agregar Referrer-Policy: strict-origin-when-cross-origin'
    });

    // Permissions-Policy (formerly Feature-Policy)
    const permissions = headers['permissions-policy'] || headers['feature-policy'];
    results.tests.push({
      name: 'Permissions-Policy',
      status: permissions ? 'pass' : 'info',
      value: permissions ? 'Configurado' : 'No configurado',
      details: permissions
        ? `Política de permisos configurada`
        : 'Sin Permissions-Policy - Considerar restringir acceso a APIs del navegador',
      severity: 'info',
      recommendation: permissions ? null : 'Considerar agregar Permissions-Policy para restringir features del navegador'
    });

    // Cache-Control
    const cacheControl = headers['cache-control'];
    results.tests.push({
      name: 'Cache-Control',
      status: 'info',
      value: cacheControl || 'No configurado',
      details: cacheControl
        ? `Configuración de caché: ${cacheControl}`
        : 'Sin Cache-Control explícito',
      severity: 'info'
    });

    logger.explain('   ✓ Headers de seguridad analizados');

  } catch (error) {
    results.tests.push({
      name: 'Análisis de Headers',
      status: 'fail',
      value: 'Error',
      details: `No se pudieron analizar los headers: ${error.message}`,
      severity: 'high'
    });
    logger.explain(`   ✗ Error: ${error.message}`);
  }

  return results;
}

async function testCookieSecurity(url, logger) {
  logger.explain('🍪 Analizando seguridad de cookies...');
  logger.explain('   Verifico si las cookies tienen las flags de seguridad apropiadas.');

  const results = {
    name: 'Seguridad de Cookies',
    tests: []
  };

  try {
    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      httpsAgent
    });

    const setCookieHeaders = response.headers['set-cookie'];

    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      results.tests.push({
        name: 'Cookies',
        status: 'info',
        value: 'Ninguna',
        details: 'No se establecen cookies en esta página',
        severity: 'info'
      });
      logger.explain('   ℹ No se encontraron cookies');
      return results;
    }

    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    cookies.forEach((cookie, index) => {
      const cookieName = cookie.split('=')[0];
      const hasHttpOnly = cookie.toLowerCase().includes('httponly');
      const hasSecure = cookie.toLowerCase().includes('secure');
      const hasSameSite = cookie.toLowerCase().includes('samesite');

      const issues = [];
      if (!hasHttpOnly) issues.push('Sin HttpOnly');
      if (!hasSecure) issues.push('Sin Secure');
      if (!hasSameSite) issues.push('Sin SameSite');

      const isSecure = hasHttpOnly && hasSecure && hasSameSite;

      results.tests.push({
        name: `Cookie: ${cookieName}`,
        status: isSecure ? 'pass' : 'warning',
        value: isSecure ? 'Segura' : issues.join(', '),
        details: isSecure
          ? `Cookie "${cookieName}" tiene todas las flags de seguridad`
          : `Cookie "${cookieName}" le faltan: ${issues.join(', ')}`,
        severity: isSecure ? 'info' : 'medium',
        recommendation: isSecure ? null : `Agregar flags: ${issues.join(', ')}`
      });
    });

    logger.explain(`   ✓ ${cookies.length} cookie(s) analizadas`);

  } catch (error) {
    results.tests.push({
      name: 'Análisis de Cookies',
      status: 'fail',
      value: 'Error',
      details: `No se pudieron analizar las cookies: ${error.message}`,
      severity: 'medium'
    });
    logger.explain(`   ✗ Error: ${error.message}`);
  }

  return results;
}

async function testCORS(url, logger) {
  logger.explain('🌐 Analizando configuración CORS...');
  logger.explain('   CORS controla qué orígenes pueden acceder a los recursos del sitio.');

  const results = {
    name: 'CORS',
    tests: []
  };

  try {
    // Test with Origin header
    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      httpsAgent,
      headers: {
        'Origin': 'https://evil-site.com'
      }
    });

    const acao = response.headers['access-control-allow-origin'];
    const acac = response.headers['access-control-allow-credentials'];

    if (!acao) {
      results.tests.push({
        name: 'CORS Habilitado',
        status: 'info',
        value: 'No',
        details: 'CORS no está habilitado (lo cual está bien si no es una API pública)',
        severity: 'info'
      });
    } else if (acao === '*') {
      results.tests.push({
        name: 'CORS Abierto',
        status: 'warning',
        value: 'Access-Control-Allow-Origin: *',
        details: 'CORS permite cualquier origen - Verificar si esto es intencional',
        severity: 'medium',
        recommendation: 'Si no es una API pública, restringir los orígenes permitidos'
      });

      if (acac === 'true') {
        results.tests.push({
          name: 'CORS con Credenciales',
          status: 'fail',
          value: 'Configuración insegura',
          details: 'CORS permite todos los orígenes Y credenciales - Esto es inseguro',
          severity: 'high',
          recommendation: 'No usar Access-Control-Allow-Credentials: true con origen comodín'
        });
      }
    } else if (acao === 'https://evil-site.com') {
      results.tests.push({
        name: 'CORS Refleja Origen',
        status: 'fail',
        value: 'Origen reflejado',
        details: 'El servidor refleja cualquier origen en ACAO - Vulnerabilidad de CORS',
        severity: 'high',
        recommendation: 'Implementar una whitelist de orígenes permitidos'
      });
    } else {
      results.tests.push({
        name: 'CORS Configurado',
        status: 'pass',
        value: acao,
        details: `CORS permite origen específico: ${acao}`,
        severity: 'info'
      });
    }

    logger.explain('   ✓ Configuración CORS analizada');

  } catch (error) {
    results.tests.push({
      name: 'Análisis CORS',
      status: 'warning',
      value: 'Error',
      details: `No se pudo analizar CORS: ${error.message}`,
      severity: 'low'
    });
    logger.explain(`   ✗ Error: ${error.message}`);
  }

  return results;
}

module.exports = { testSecurityHeaders, testCookieSecurity, testCORS };
