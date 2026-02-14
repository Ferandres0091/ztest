const https = require('https');
const tls = require('tls');
const { URL } = require('url');

async function testSSL(url, logger) {
  logger.explain('🔒 Analizando certificado SSL/TLS...');
  logger.explain('   Verifico la validez del certificado, fechas de expiración y configuración de seguridad.');

  const results = {
    name: 'SSL/TLS',
    tests: []
  };

  try {
    const urlObj = new URL(url);

    if (urlObj.protocol !== 'https:') {
      results.tests.push({
        name: 'HTTPS',
        status: 'fail',
        value: 'No',
        details: 'El sitio no usa HTTPS - La conexión no está cifrada',
        severity: 'critical',
        recommendation: 'Implementar HTTPS con un certificado SSL válido'
      });
      logger.explain('   ⚠ El sitio no usa HTTPS');
      return results;
    }

    const certificate = await new Promise((resolve, reject) => {
      const options = {
        host: urlObj.hostname,
        port: urlObj.port || 443,
        method: 'GET',
        rejectUnauthorized: false,
        agent: false
      };

      const req = https.request(options, (res) => {
        const cert = res.socket.getPeerCertificate(true);
        resolve({
          cert,
          authorized: res.socket.authorized,
          authorizationError: res.socket.authorizationError,
          protocol: res.socket.getProtocol(),
          cipher: res.socket.getCipher()
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });

    // Certificate Validity
    results.tests.push({
      name: 'Certificado Válido',
      status: certificate.authorized ? 'pass' : 'fail',
      value: certificate.authorized ? 'Sí' : 'No',
      details: certificate.authorized
        ? 'El certificado SSL es válido y confiable'
        : `Certificado no válido: ${certificate.authorizationError}`,
      severity: certificate.authorized ? 'info' : 'critical',
      recommendation: certificate.authorized ? null : 'Renovar o reconfigurar el certificado SSL'
    });

    // Certificate Issuer
    if (certificate.cert.issuer) {
      const issuer = certificate.cert.issuer.O || certificate.cert.issuer.CN || 'Desconocido';
      results.tests.push({
        name: 'Emisor del Certificado',
        status: 'info',
        value: issuer,
        details: `Certificado emitido por: ${issuer}`,
        severity: 'info'
      });
    }

    // Certificate Expiration
    if (certificate.cert.valid_to) {
      const expirationDate = new Date(certificate.cert.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

      let status = 'pass';
      let severity = 'info';
      if (daysUntilExpiry < 0) {
        status = 'fail';
        severity = 'critical';
      } else if (daysUntilExpiry < 30) {
        status = 'warning';
        severity = 'high';
      } else if (daysUntilExpiry < 90) {
        status = 'warning';
        severity = 'medium';
      }

      results.tests.push({
        name: 'Expiración del Certificado',
        status,
        value: `${daysUntilExpiry} días`,
        details: daysUntilExpiry < 0
          ? `¡EXPIRADO! El certificado expiró hace ${Math.abs(daysUntilExpiry)} días`
          : `El certificado expira en ${daysUntilExpiry} días (${expirationDate.toLocaleDateString()})`,
        severity,
        recommendation: daysUntilExpiry < 30 ? 'Renovar el certificado SSL urgentemente' : null
      });
    }

    // Protocol Version
    if (certificate.protocol) {
      const secureProtocols = ['TLSv1.2', 'TLSv1.3'];
      const isSecure = secureProtocols.includes(certificate.protocol);

      results.tests.push({
        name: 'Versión de Protocolo',
        status: isSecure ? 'pass' : 'warning',
        value: certificate.protocol,
        details: isSecure
          ? `Usando ${certificate.protocol} - Protocolo seguro`
          : `Usando ${certificate.protocol} - Protocolo obsoleto`,
        severity: isSecure ? 'info' : 'medium',
        recommendation: isSecure ? null : 'Actualizar a TLS 1.2 o superior'
      });
    }

    // Cipher Suite
    if (certificate.cipher) {
      const weakCiphers = ['RC4', 'DES', '3DES', 'MD5'];
      const isWeak = weakCiphers.some(weak =>
        certificate.cipher.name.toUpperCase().includes(weak)
      );

      results.tests.push({
        name: 'Suite de Cifrado',
        status: isWeak ? 'warning' : 'pass',
        value: certificate.cipher.name,
        details: isWeak
          ? `Cifrado débil detectado: ${certificate.cipher.name}`
          : `Cifrado seguro: ${certificate.cipher.name}`,
        severity: isWeak ? 'medium' : 'info',
        recommendation: isWeak ? 'Configurar cifrados más fuertes en el servidor' : null
      });
    }

    // Subject Alternative Names (SAN)
    if (certificate.cert.subjectaltname) {
      const sans = certificate.cert.subjectaltname.split(', ').length;
      results.tests.push({
        name: 'Dominios Cubiertos (SAN)',
        status: 'info',
        value: `${sans} dominio(s)`,
        details: `El certificado cubre: ${certificate.cert.subjectaltname}`,
        severity: 'info'
      });
    }

    logger.explain(`   ✓ SSL analizado: ${certificate.protocol}, expira en ${certificate.cert.valid_to}`);

  } catch (error) {
    results.tests.push({
      name: 'Análisis SSL',
      status: 'fail',
      value: 'Error',
      details: `No se pudo analizar SSL: ${error.message}`,
      severity: 'high'
    });
    logger.explain(`   ✗ Error analizando SSL: ${error.message}`);
  }

  return results;
}

module.exports = { testSSL };
