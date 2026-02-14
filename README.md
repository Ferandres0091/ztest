# ZTEST 🔍

Herramienta de testing web para desarrollo y ciberseguridad.

```
╔═══════════════════════════════════════════════════════════════╗
║         ███████╗████████╗███████╗███████╗████████╗            ║
║         ╚══███╔╝╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝            ║
║           ███╔╝    ██║   █████╗  ███████╗   ██║               ║
║          ███╔╝     ██║   ██╔══╝  ╚════██║   ██║               ║
║         ███████╗   ██║   ███████╗███████║   ██║               ║
║         ╚══════╝   ╚═╝   ╚══════╝╚══════╝   ╚═╝               ║
╚═══════════════════════════════════════════════════════════════╝
```

## 🚀 Características

- **Testing de Seguridad**: Headers HTTP, SSL/TLS, cookies, CORS
- **Testing de Rendimiento**: TTFB, tiempo de carga, memoria JS
- **Testing Responsive**: Mobile, tablet, desktop con screenshots
- **Integración con Linear**: Envío automático de reportes
- **Reportes en Markdown**: Listos para copiar y documentar

## 📦 Instalación

```bash
git clone https://github.com/TU_USUARIO/ztest.git
cd ztest
npm install
```

## 🔧 Uso

### Modo Interactivo
```bash
node index.js
```

### Escanear una URL
```bash
node index.js scan https://example.com
```

### Escanear y enviar a Linear
```bash
node index.js scan https://example.com --send-linear --team TEAM_KEY
```

### Solo categorías específicas
```bash
node index.js scan https://example.com --only http,ssl,security
node index.js scan https://example.com --only responsive
node index.js scan https://example.com --only performance,browser
```

### Ver categorías disponibles
```bash
node index.js list
```

## 📋 Categorías de Tests

| Categoría | Descripción |
|-----------|-------------|
| `http` | Códigos de estado, tiempos de respuesta, redirecciones |
| `ssl` | Certificados, protocolos TLS, cifrado |
| `security` | CSP, HSTS, X-Frame-Options, cookies, CORS |
| `browser` | Errores JS, recursos fallidos, contenido mixto |
| `performance` | TTFB, DOM ready, memoria JavaScript |
| `responsive` | Viewports mobile, tablet, desktop + screenshots |

## 🔗 Integración con Linear

### Configurar Linear
```bash
node index.js linear-setup
```

### Verificar conexión
```bash
node index.js linear-status
```

### Enviar reporte
```bash
node index.js scan https://example.com --send-linear --team HOR2
```

## 📊 Ejemplo de Reporte

```
📊 Resumen Ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | 0 |
| 🟠 Alto | 1 |
| 🟡 Medio | 2 |
| 🔵 Bajo | 3 |
| ✅ Pasados | 10 |
```

## 🛠️ Tecnologías

- Node.js
- Puppeteer (browser testing)
- Axios (HTTP requests)
- Commander (CLI)
- Inquirer (interactive mode)
- Chalk (colored output)

## 📁 Estructura

```
ztest/
├── index.js              # Entry point
├── src/
│   ├── tests/
│   │   ├── httpTests.js      # HTTP/response tests
│   │   ├── sslTests.js       # SSL/TLS tests
│   │   ├── securityTests.js  # Security headers tests
│   │   ├── browserTests.js   # Browser/JS tests
│   │   └── responsiveTests.js # Responsive design tests
│   ├── reporter.js       # Report generator
│   ├── logger.js         # Console logger
│   └── linearClient.js   # Linear API client
├── screenshots/          # Responsive screenshots
└── package.json
```

## 📄 Licencia

MIT

---

Desarrollado con ❤️ para testing de aplicaciones web.
