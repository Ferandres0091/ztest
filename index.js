#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

const { testHttpResponse, testRedirects } = require('./src/tests/httpTests');
const { testSSL } = require('./src/tests/sslTests');
const { testSecurityHeaders, testCookieSecurity, testCORS } = require('./src/tests/securityTests');
const { testWithBrowser, testPerformance } = require('./src/tests/browserTests');
const { testResponsive, takeScreenshots } = require('./src/tests/responsiveTests');
const Reporter = require('./src/reporter');
const Logger = require('./src/logger');
const LinearClient = require('./src/linearClient');

const VERSION = '1.0.0';

// Banner
function showBanner() {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         ███████╗████████╗███████╗███████╗████████╗            ║
║         ╚══███╔╝╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝            ║
║           ███╔╝    ██║   █████╗  ███████╗   ██║               ║
║          ███╔╝     ██║   ██╔══╝  ╚════██║   ██║               ║
║         ███████╗   ██║   ███████╗███████║   ██║               ║
║         ╚══════╝   ╚═╝   ╚══════╝╚══════╝   ╚═╝               ║
║                                                               ║
║         Testing de Desarrollo y Ciberseguridad v${VERSION}        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`));
}

// Test categories
const TEST_CATEGORIES = {
  http: {
    name: '📡 HTTP/Response',
    description: 'Códigos de estado, tiempos de respuesta, redirecciones',
    tests: [testHttpResponse, testRedirects]
  },
  ssl: {
    name: '🔒 SSL/TLS',
    description: 'Certificados, protocolos, cifrado',
    tests: [testSSL]
  },
  security: {
    name: '🛡️ Headers de Seguridad',
    description: 'CSP, HSTS, X-Frame-Options, Cookies',
    tests: [testSecurityHeaders, testCookieSecurity, testCORS]
  },
  browser: {
    name: '🌐 Análisis de Navegador',
    description: 'JS errors, recursos, contenido mixto',
    tests: [testWithBrowser]
  },
  performance: {
    name: '⚡ Rendimiento',
    description: 'TTFB, tiempos de carga, memoria',
    tests: [testPerformance]
  },
  responsive: {
    name: '📱 Responsive',
    description: 'Mobile, tablet, desktop - diseño adaptativo',
    tests: [testResponsive, takeScreenshots]
  }
};

// Run tests
async function runTests(url, categories, options) {
  const logger = new Logger(chalk, options.verbose);
  const reporter = new Reporter();

  reporter.setUrl(url);
  reporter.startTimer();

  logger.header(`Analizando: ${url}`);

  const totalTests = categories.length;
  let currentTest = 0;

  for (const categoryKey of categories) {
    const category = TEST_CATEGORIES[categoryKey];
    currentTest++;

    logger.step(currentTest, totalTests, category.name);
    logger.explain(`   ${category.description}`);

    for (const testFn of category.tests) {
      try {
        const spinner = ora({
          text: chalk.gray('Ejecutando test...'),
          spinner: 'dots'
        }).start();

        const results = await testFn(url, logger);
        spinner.stop();

        reporter.addResults(results);

      } catch (error) {
        logger.error(`Error en test: ${error.message}`);
      }
    }
  }

  reporter.endTimer();
  return reporter;
}

// Interactive mode
async function interactiveMode() {
  showBanner();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: '¿Qué URL quieres analizar?',
      validate: (input) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Por favor ingresa una URL válida (ej: https://example.com)';
        }
      }
    },
    {
      type: 'checkbox',
      name: 'categories',
      message: '¿Qué tests quieres ejecutar?',
      choices: Object.entries(TEST_CATEGORIES).map(([key, cat]) => ({
        name: `${cat.name} - ${cat.description}`,
        value: key,
        checked: true
      }))
    },
    {
      type: 'confirm',
      name: 'verbose',
      message: '¿Mostrar explicaciones detalladas?',
      default: true
    }
  ]);

  if (answers.categories.length === 0) {
    console.log(chalk.yellow('No seleccionaste ningún test. Saliendo...'));
    return;
  }

  const reporter = await runTests(answers.url, answers.categories, {
    verbose: answers.verbose
  });

  // Show console report
  reporter.generateConsoleReport(chalk, Table);

  // Ask what to do with report
  const reportAction = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '¿Qué quieres hacer con el reporte?',
      choices: [
        { name: '📋 Copiar al portapapeles (para Linear)', value: 'clipboard' },
        { name: '💾 Guardar en archivo', value: 'file' },
        { name: '👀 Ver en consola', value: 'console' },
        { name: '🚪 Salir', value: 'exit' }
      ]
    }
  ]);

  if (reportAction.action === 'clipboard') {
    const report = reporter.copyToClipboard();
    console.log('\n' + chalk.green('═'.repeat(60)));
    console.log(chalk.green.bold('\n📋 REPORTE PARA LINEAR - COPIA ESTO:\n'));
    console.log(chalk.green('═'.repeat(60)));
    console.log(report);
    console.log(chalk.green('═'.repeat(60)));
    console.log(chalk.cyan('\n💡 Copia todo el texto de arriba y pégalo en Linear\n'));

  } else if (reportAction.action === 'file') {
    const fileAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Nombre del archivo:',
        default: `report-${new Date().toISOString().split('T')[0]}.md`
      }
    ]);

    const filepath = reporter.saveToFile(fileAnswer.filename);
    console.log(chalk.green(`\n✓ Reporte guardado en: ${filepath}\n`));

  } else if (reportAction.action === 'console') {
    const report = reporter.copyToClipboard();
    console.log('\n' + report);
  }
}

// Automatic mode (CLI)
async function automaticMode(url, options) {
  showBanner();

  let categories = Object.keys(TEST_CATEGORIES);

  if (options.only) {
    categories = options.only.split(',').filter(c => TEST_CATEGORIES[c]);
  }

  if (options.skip) {
    const skip = options.skip.split(',');
    categories = categories.filter(c => !skip.includes(c));
  }

  const reporter = await runTests(url, categories, {
    verbose: !options.quiet
  });

  // Output
  if (options.output) {
    const filepath = reporter.saveToFile(options.output);
    console.log(chalk.green(`\n✓ Reporte guardado en: ${filepath}\n`));
  }

  // Send to Linear
  if (options.sendLinear) {
    await sendToLinear(reporter, options.team);
    return;
  }

  if (options.linear) {
    const report = reporter.copyToClipboard();
    console.log('\n' + chalk.green('═'.repeat(60)));
    console.log(chalk.green.bold('\n📋 REPORTE PARA LINEAR:\n'));
    console.log(chalk.green('═'.repeat(60)));
    console.log(report);
  }

  if (!options.output && !options.linear) {
    reporter.generateConsoleReport(chalk, Table);

    // Always show Linear-ready report at the end
    const report = reporter.copyToClipboard();
    console.log('\n' + chalk.green('═'.repeat(60)));
    console.log(chalk.green.bold('\n📋 REPORTE LISTO PARA LINEAR - COPIA DESDE AQUÍ:\n'));
    console.log(chalk.green('═'.repeat(60)));
    console.log(report);
    console.log(chalk.green('═'.repeat(60)) + '\n');
  }
}

// Linear setup
async function linearSetup() {
  showBanner();
  console.log(chalk.bold('\n🔧 Configuración de Linear\n'));

  const linear = new LinearClient();

  if (linear.isConfigured()) {
    const overwrite = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Ya hay una API key configurada. ¿Quieres reemplazarla?',
      default: false
    }]);

    if (!overwrite.overwrite) {
      console.log(chalk.yellow('Configuración cancelada.'));
      return;
    }
  }

  console.log(chalk.gray('Para obtener tu API key:'));
  console.log(chalk.gray('1. Ve a Linear → Settings → API'));
  console.log(chalk.gray('2. Crea un nuevo "Personal API Key"'));
  console.log(chalk.gray('3. Copia la key y pégala aquí\n'));

  const answers = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: 'Ingresa tu Linear API Key:',
    mask: '*',
    validate: (input) => input.length > 10 ? true : 'API key inválida'
  }]);

  const spinner = ora('Verificando API key...').start();

  try {
    linear.saveConfig(answers.apiKey);
    const teams = await linear.getTeams();

    spinner.succeed('API key válida');
    console.log(chalk.green(`\n✓ Encontrados ${teams.length} equipo(s):`));
    teams.forEach(team => {
      console.log(chalk.cyan(`  - ${team.name} (${team.key})`));
    });
    console.log(chalk.green('\n✓ Configuración guardada correctamente\n'));

  } catch (error) {
    spinner.fail('Error verificando API key');
    console.log(chalk.red(`\nError: ${error.message}`));
    console.log(chalk.yellow('Verifica que la API key sea correcta.\n'));
  }
}

// Send report to Linear
async function sendToLinear(reporter, teamKey) {
  const linear = new LinearClient();

  if (!linear.isConfigured()) {
    console.log(chalk.red('\n✗ Linear no está configurado.'));
    console.log(chalk.yellow('Ejecuta primero: node index.js linear-setup\n'));
    return;
  }

  const spinner = ora('Conectando con Linear...').start();

  try {
    const teams = await linear.getTeams();
    spinner.stop();

    let selectedTeam;

    if (teamKey) {
      selectedTeam = teams.find(t => t.key.toLowerCase() === teamKey.toLowerCase());
      if (!selectedTeam) {
        console.log(chalk.red(`\n✗ Equipo "${teamKey}" no encontrado.`));
        console.log(chalk.yellow(`Equipos disponibles: ${teams.map(t => t.key).join(', ')}\n`));
        return;
      }
    } else {
      const teamAnswer = await inquirer.prompt([{
        type: 'list',
        name: 'team',
        message: '¿A qué equipo quieres enviar el reporte?',
        choices: teams.map(t => ({ name: `${t.name} (${t.key})`, value: t }))
      }]);
      selectedTeam = teamAnswer.team;
    }

    // Get summary for title
    const summary = reporter.getSummary();
    const urlObj = new URL(reporter.url);
    const title = `🔍 Security Scan: ${urlObj.hostname} - ${summary.critical} críticos, ${summary.high} altos`;

    // Get priority based on findings
    let priority = 4; // Low
    if (summary.critical > 0) priority = 1; // Urgent
    else if (summary.high > 0) priority = 2; // High
    else if (summary.medium > 0) priority = 3; // Medium

    const description = reporter.generateLinearReport();

    spinner.text = 'Creando issue en Linear...';
    spinner.start();

    // Try to find or create security label
    let labelIds = [];
    try {
      const securityLabelId = await linear.findOrCreateLabel(selectedTeam.id, 'security');
      labelIds.push(securityLabelId);
    } catch (e) {
      // Label creation might fail due to permissions, continue anyway
    }

    const result = await linear.createIssue(
      selectedTeam.id,
      title,
      description,
      priority,
      labelIds
    );

    spinner.succeed('Issue creado en Linear');

    console.log('\n' + chalk.green('═'.repeat(60)));
    console.log(chalk.green.bold('\n✓ REPORTE ENVIADO A LINEAR\n'));
    console.log(chalk.white(`  Issue: ${result.issue.identifier}`));
    console.log(chalk.white(`  Título: ${result.issue.title}`));
    console.log(chalk.cyan(`  URL: ${result.issue.url}`));
    console.log(chalk.green('\n═'.repeat(60)) + '\n');

  } catch (error) {
    spinner.fail('Error enviando a Linear');
    console.log(chalk.red(`\nError: ${error.message}\n`));
  }
}

// CLI setup
program
  .name('ztest')
  .description('ZTEST - Herramienta de testing web para desarrollo y ciberseguridad')
  .version(VERSION);

program
  .command('scan <url>')
  .description('Escanear una URL (modo automático)')
  .option('-o, --output <file>', 'Guardar reporte en archivo')
  .option('-l, --linear', 'Mostrar reporte formateado para Linear')
  .option('-s, --send-linear', 'Enviar reporte directamente a Linear')
  .option('-t, --team <key>', 'Equipo de Linear (ej: HOR2)')
  .option('-q, --quiet', 'Modo silencioso (sin explicaciones)')
  .option('--only <categories>', 'Solo ejecutar categorías específicas (http,ssl,security,browser,performance)')
  .option('--skip <categories>', 'Saltar categorías específicas')
  .action(automaticMode);

program
  .command('interactive')
  .alias('i')
  .description('Modo interactivo (manual)')
  .action(interactiveMode);

program
  .command('list')
  .description('Listar categorías de tests disponibles')
  .action(() => {
    showBanner();
    console.log(chalk.bold('\nCategorías de tests disponibles:\n'));
    Object.entries(TEST_CATEGORIES).forEach(([key, cat]) => {
      console.log(chalk.cyan(`  ${key.padEnd(12)}`), `${cat.name}`);
      console.log(chalk.gray(`              ${cat.description}`));
      console.log();
    });
  });

program
  .command('linear-setup')
  .description('Configurar integración con Linear')
  .action(linearSetup);

program
  .command('linear-status')
  .description('Ver estado de la configuración de Linear')
  .action(async () => {
    showBanner();
    const linear = new LinearClient();

    if (!linear.isConfigured()) {
      console.log(chalk.yellow('\n⚠ Linear no está configurado.'));
      console.log(chalk.gray('Ejecuta: node index.js linear-setup\n'));
      return;
    }

    const spinner = ora('Verificando conexión...').start();
    try {
      const teams = await linear.getTeams();
      spinner.succeed('Conectado a Linear');
      console.log(chalk.green(`\nEquipos disponibles:`));
      teams.forEach(team => {
        console.log(chalk.cyan(`  - ${team.name} (${team.key})`));
      });
      console.log();
    } catch (error) {
      spinner.fail('Error conectando');
      console.log(chalk.red(`\nError: ${error.message}\n`));
    }
  });

// Default to interactive if no command
if (process.argv.length <= 2) {
  interactiveMode();
} else {
  program.parse();
}
