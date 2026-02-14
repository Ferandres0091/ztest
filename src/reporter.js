const fs = require('fs');
const path = require('path');

class Reporter {
  constructor() {
    this.results = [];
    this.url = '';
    this.startTime = null;
    this.endTime = null;
  }

  setUrl(url) {
    this.url = url;
  }

  startTimer() {
    this.startTime = new Date();
  }

  endTimer() {
    this.endTime = new Date();
  }

  addResults(categoryResults) {
    this.results.push(categoryResults);
  }

  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪'
    };
    return emojis[severity] || '⚪';
  }

  getStatusEmoji(status) {
    const emojis = {
      pass: '✅',
      fail: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return emojis[status] || '❓';
  }

  getSummary() {
    let critical = 0, high = 0, medium = 0, low = 0, passed = 0;

    this.results.forEach(category => {
      category.tests.forEach(test => {
        if (test.status === 'pass') passed++;
        if (test.severity === 'critical') critical++;
        else if (test.severity === 'high') high++;
        else if (test.severity === 'medium') medium++;
        else if (test.severity === 'low') low++;
      });
    });

    return { critical, high, medium, low, passed };
  }

  generateLinearReport() {
    const summary = this.getSummary();
    const duration = this.endTime && this.startTime
      ? ((this.endTime - this.startTime) / 1000).toFixed(1)
      : '?';

    let report = `# 🔍 Reporte de Seguridad y Testing Web

**URL Analizada:** ${this.url}
**Fecha:** ${new Date().toLocaleString('es-ES')}
**Duración del Análisis:** ${duration} segundos

---

## 📊 Resumen Ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | ${summary.critical} |
| 🟠 Alto | ${summary.high} |
| 🟡 Medio | ${summary.medium} |
| 🔵 Bajo | ${summary.low} |
| ✅ Pasados | ${summary.passed} |

---

## 🎯 Hallazgos Principales

`;

    // Add critical and high severity findings first
    const criticalFindings = [];
    const highFindings = [];
    const mediumFindings = [];
    const otherFindings = [];

    this.results.forEach(category => {
      category.tests.forEach(test => {
        const finding = {
          category: category.name,
          ...test
        };
        if (test.severity === 'critical') criticalFindings.push(finding);
        else if (test.severity === 'high') highFindings.push(finding);
        else if (test.severity === 'medium') mediumFindings.push(finding);
        else otherFindings.push(finding);
      });
    });

    if (criticalFindings.length > 0) {
      report += `### 🔴 Problemas Críticos\n\n`;
      criticalFindings.forEach(f => {
        report += `- **${f.name}**: ${f.details}\n`;
        if (f.recommendation) report += `  - 💡 *Recomendación:* ${f.recommendation}\n`;
      });
      report += '\n';
    }

    if (highFindings.length > 0) {
      report += `### 🟠 Problemas de Alta Prioridad\n\n`;
      highFindings.forEach(f => {
        report += `- **${f.name}**: ${f.details}\n`;
        if (f.recommendation) report += `  - 💡 *Recomendación:* ${f.recommendation}\n`;
      });
      report += '\n';
    }

    if (mediumFindings.length > 0) {
      report += `### 🟡 Problemas de Prioridad Media\n\n`;
      mediumFindings.forEach(f => {
        report += `- **${f.name}**: ${f.details}\n`;
        if (f.recommendation) report += `  - 💡 *Recomendación:* ${f.recommendation}\n`;
      });
      report += '\n';
    }

    report += `---

## 📋 Detalle por Categoría

`;

    // Detailed results by category
    this.results.forEach(category => {
      report += `### ${category.name}\n\n`;
      report += `| Test | Estado | Valor | Detalles |\n`;
      report += `|------|--------|-------|----------|\n`;

      category.tests.forEach(test => {
        const status = this.getStatusEmoji(test.status);
        const value = test.value.toString().substring(0, 30);
        const details = test.details.substring(0, 50).replace(/\n/g, ' ');
        report += `| ${test.name} | ${status} | ${value} | ${details}... |\n`;
      });

      report += '\n';
    });

    report += `---

## 🛠️ Recomendaciones de Acción

`;

    // Collect all recommendations
    const recommendations = [];
    this.results.forEach(category => {
      category.tests.forEach(test => {
        if (test.recommendation) {
          recommendations.push({
            severity: test.severity,
            name: test.name,
            recommendation: test.recommendation
          });
        }
      });
    });

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    recommendations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    if (recommendations.length > 0) {
      recommendations.forEach((rec, index) => {
        const emoji = this.getSeverityEmoji(rec.severity);
        report += `${index + 1}. ${emoji} **${rec.name}**: ${rec.recommendation}\n`;
      });
    } else {
      report += `¡No hay recomendaciones pendientes! El sitio parece estar bien configurado.\n`;
    }

    report += `
---

## 📝 Notas para Linear

**Labels sugeridos:** \`security\`, \`testing\`, \`web\`
**Prioridad sugerida:** ${summary.critical > 0 ? 'Urgent' : summary.high > 0 ? 'High' : summary.medium > 0 ? 'Medium' : 'Low'}

---

*Reporte generado automáticamente por WebTester v1.0*
`;

    return report;
  }

  generateConsoleReport(chalk, Table) {
    const summary = this.getSummary();

    console.log('\n');
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.cyan('                    REPORTE DE ANÁLISIS                         '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
    console.log();
    console.log(chalk.white(`  URL: ${chalk.cyan(this.url)}`));
    console.log(chalk.white(`  Fecha: ${new Date().toLocaleString('es-ES')}`));
    console.log();

    // Summary table
    const summaryTable = new Table({
      head: [
        chalk.white('Severidad'),
        chalk.white('Cantidad')
      ],
      colWidths: [20, 15]
    });

    summaryTable.push(
      [chalk.red('🔴 Crítico'), summary.critical],
      [chalk.yellow('🟠 Alto'), summary.high],
      [chalk.yellow('🟡 Medio'), summary.medium],
      [chalk.blue('🔵 Bajo'), summary.low],
      [chalk.green('✅ Pasados'), summary.passed]
    );

    console.log(summaryTable.toString());
    console.log();

    // Detailed results
    this.results.forEach(category => {
      console.log(chalk.bold.magenta(`\n📁 ${category.name}`));
      console.log(chalk.gray('─'.repeat(60)));

      category.tests.forEach(test => {
        const statusIcon = test.status === 'pass' ? chalk.green('✓')
          : test.status === 'fail' ? chalk.red('✗')
          : test.status === 'warning' ? chalk.yellow('⚠')
          : chalk.blue('ℹ');

        const severityColor = test.severity === 'critical' ? chalk.red
          : test.severity === 'high' ? chalk.yellow
          : test.severity === 'medium' ? chalk.yellow
          : chalk.white;

        console.log(`  ${statusIcon} ${chalk.bold(test.name)}: ${severityColor(test.value)}`);
        console.log(chalk.gray(`     ${test.details.substring(0, 80)}`));
        if (test.recommendation) {
          console.log(chalk.cyan(`     💡 ${test.recommendation}`));
        }
      });
    });

    console.log();
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
  }

  saveToFile(filename) {
    const report = this.generateLinearReport();
    const filepath = path.resolve(filename);
    fs.writeFileSync(filepath, report, 'utf8');
    return filepath;
  }

  copyToClipboard() {
    const report = this.generateLinearReport();
    return report;
  }
}

module.exports = Reporter;
