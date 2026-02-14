const axios = require('axios');
const https = require('https');

// Agent that ignores SSL errors (for internal/dev testing)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function testHttpResponse(url, logger) {
  logger.explain('📡 Probando respuesta HTTP básica...');
  logger.explain('   Esto verifica que el servidor responda correctamente y mide el tiempo de carga.');

  const results = {
    name: 'Respuesta HTTP',
    tests: []
  };

  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      httpsAgent,
      headers: {
        'User-Agent': 'WebTester/1.0 Security Scanner'
      }
    });
    const responseTime = Date.now() - startTime;

    // Status Code Test
    const statusOk = response.status >= 200 && response.status < 400;
    results.tests.push({
      name: 'Código de Estado',
      status: statusOk ? 'pass' : 'fail',
      value: response.status,
      details: statusOk
        ? `El servidor respondió con código ${response.status} (OK)`
        : `El servidor respondió con código ${response.status} - Posible problema`,
      severity: statusOk ? 'info' : 'high'
    });

    // Response Time Test
    const timeOk = responseTime < 3000;
    results.tests.push({
      name: 'Tiempo de Respuesta',
      status: timeOk ? 'pass' : 'warning',
      value: `${responseTime}ms`,
      details: timeOk
        ? `Respuesta en ${responseTime}ms - Buen rendimiento`
        : `Respuesta en ${responseTime}ms - Considerar optimización`,
      severity: timeOk ? 'info' : 'medium'
    });

    // Content Type Test
    const contentType = response.headers['content-type'] || 'No especificado';
    results.tests.push({
      name: 'Content-Type',
      status: contentType.includes('text/html') ? 'pass' : 'info',
      value: contentType,
      details: `El servidor devuelve: ${contentType}`,
      severity: 'info'
    });

    // Server Header (Information Disclosure)
    const serverHeader = response.headers['server'];
    if (serverHeader) {
      results.tests.push({
        name: 'Header Server Expuesto',
        status: 'warning',
        value: serverHeader,
        details: `El servidor expone su versión: "${serverHeader}" - Esto puede ayudar a atacantes a encontrar vulnerabilidades conocidas`,
        severity: 'low',
        recommendation: 'Considerar ocultar o modificar el header Server'
      });
    }

    // X-Powered-By Header (Information Disclosure)
    const poweredBy = response.headers['x-powered-by'];
    if (poweredBy) {
      results.tests.push({
        name: 'X-Powered-By Expuesto',
        status: 'warning',
        value: poweredBy,
        details: `Tecnología expuesta: "${poweredBy}" - Revela información del stack tecnológico`,
        severity: 'low',
        recommendation: 'Eliminar el header X-Powered-By en producción'
      });
    }

    logger.explain(`   ✓ Completado: Código ${response.status}, Tiempo ${responseTime}ms`);

  } catch (error) {
    results.tests.push({
      name: 'Conexión',
      status: 'fail',
      value: 'Error',
      details: `No se pudo conectar: ${error.message}`,
      severity: 'critical'
    });
    logger.explain(`   ✗ Error de conexión: ${error.message}`);
  }

  return results;
}

async function testRedirects(url, logger) {
  logger.explain('🔀 Analizando redirecciones...');
  logger.explain('   Verifico si hay redirecciones HTTP→HTTPS y cómo se manejan.');

  const results = {
    name: 'Redirecciones',
    tests: []
  };

  try {
    const redirects = [];
    const response = await axios.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
      httpsAgent,
      beforeRedirect: (options, { headers }) => {
        redirects.push(options.href);
      }
    });

    if (redirects.length > 0) {
      results.tests.push({
        name: 'Cadena de Redirecciones',
        status: 'info',
        value: `${redirects.length} redirección(es)`,
        details: `Redirecciones: ${redirects.join(' → ')}`,
        severity: 'info'
      });

      // Check HTTP to HTTPS redirect
      if (url.startsWith('http://') && redirects.some(r => r.startsWith('https://'))) {
        results.tests.push({
          name: 'Redirección HTTP→HTTPS',
          status: 'pass',
          value: 'Sí',
          details: 'El sitio redirige correctamente de HTTP a HTTPS',
          severity: 'info'
        });
      }
    } else {
      results.tests.push({
        name: 'Redirecciones',
        status: 'info',
        value: 'Ninguna',
        details: 'No hay redirecciones configuradas',
        severity: 'info'
      });
    }

    logger.explain(`   ✓ ${redirects.length} redirección(es) encontrada(s)`);

  } catch (error) {
    results.tests.push({
      name: 'Análisis de Redirecciones',
      status: 'warning',
      value: 'Error',
      details: `No se pudo analizar: ${error.message}`,
      severity: 'low'
    });
  }

  return results;
}

module.exports = { testHttpResponse, testRedirects };
