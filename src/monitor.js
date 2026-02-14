const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const LinearClient = require('./linearClient');

const CONFIG_PATH = path.join(__dirname, '..', '.monitor-config.json');
const STATE_PATH = path.join(__dirname, '..', '.monitor-state.json');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Default assignee: Gonzalo Arrayaran
const DEFAULT_ASSIGNEE = '09375327-6e18-4035-ac85-233f290392bb';

class Monitor {
  constructor() {
    this.config = this.loadConfig();
    this.state = this.loadState();
    this.linear = new LinearClient();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      }
    } catch (e) {}
    return {
      urls: [],
      teamId: null,
      assigneeId: DEFAULT_ASSIGNEE,
      checks: {
        httpStatus: true,
        responseTime: true,
        sslExpiry: true,
        jsErrors: false // Requires puppeteer, slower
      },
      thresholds: {
        responseTime: 5000, // 5 seconds
        sslExpiryDays: 14  // Alert if SSL expires in less than 14 days
      }
    };
  }

  saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      }
    } catch (e) {}
    return {
      lastCheck: null,
      alerts: {}, // Track sent alerts to avoid duplicates
      history: []
    };
  }

  saveState() {
    fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  addUrl(url) {
    if (!this.config.urls.includes(url)) {
      this.config.urls.push(url);
      this.saveConfig();
      return true;
    }
    return false;
  }

  removeUrl(url) {
    const index = this.config.urls.indexOf(url);
    if (index > -1) {
      this.config.urls.splice(index, 1);
      this.saveConfig();
      return true;
    }
    return false;
  }

  setTeam(teamId) {
    this.config.teamId = teamId;
    this.saveConfig();
  }

  setAssignee(assigneeId) {
    this.config.assigneeId = assigneeId;
    this.saveConfig();
  }

  async checkUrl(url) {
    const issues = [];
    const results = {
      url,
      timestamp: new Date().toISOString(),
      status: 'ok',
      checks: {}
    };

    // HTTP Status Check
    if (this.config.checks.httpStatus) {
      try {
        const startTime = Date.now();
        const response = await axios.get(url, {
          timeout: 30000,
          httpsAgent,
          validateStatus: () => true
        });
        const responseTime = Date.now() - startTime;

        results.checks.httpStatus = response.status;
        results.checks.responseTime = responseTime;

        // Check for errors
        if (response.status >= 500) {
          issues.push({
            type: 'critical',
            title: `🔴 ERROR ${response.status} en ${new URL(url).hostname}`,
            description: `El servidor respondió con error ${response.status}.\n\nURL: ${url}\nTiempo: ${new Date().toLocaleString()}`,
            priority: 1 // Urgent
          });
        } else if (response.status >= 400) {
          issues.push({
            type: 'error',
            title: `🟠 ERROR ${response.status} en ${new URL(url).hostname}`,
            description: `La página respondió con error ${response.status}.\n\nURL: ${url}\nTiempo: ${new Date().toLocaleString()}`,
            priority: 2 // High
          });
        }

        // Response time check
        if (responseTime > this.config.thresholds.responseTime) {
          issues.push({
            type: 'warning',
            title: `🟡 Respuesta lenta en ${new URL(url).hostname}`,
            description: `El sitio tardó ${responseTime}ms en responder (umbral: ${this.config.thresholds.responseTime}ms).\n\nURL: ${url}\nTiempo: ${new Date().toLocaleString()}`,
            priority: 3 // Medium
          });
        }

      } catch (error) {
        results.checks.httpStatus = 'error';
        results.checks.error = error.message;

        issues.push({
          type: 'critical',
          title: `🔴 SITIO CAÍDO: ${new URL(url).hostname}`,
          description: `No se pudo conectar al sitio.\n\nURL: ${url}\nError: ${error.message}\nTiempo: ${new Date().toLocaleString()}`,
          priority: 1 // Urgent
        });
      }
    }

    // SSL Check
    if (this.config.checks.sslExpiry && url.startsWith('https://')) {
      try {
        const sslInfo = await this.checkSSL(url);
        results.checks.ssl = sslInfo;

        if (sslInfo.daysUntilExpiry !== null) {
          if (sslInfo.daysUntilExpiry < 0) {
            issues.push({
              type: 'critical',
              title: `🔴 CERTIFICADO SSL EXPIRADO: ${new URL(url).hostname}`,
              description: `El certificado SSL expiró hace ${Math.abs(sslInfo.daysUntilExpiry)} días.\n\nURL: ${url}\nExpiró: ${sslInfo.expiryDate}\nTiempo: ${new Date().toLocaleString()}`,
              priority: 1
            });
          } else if (sslInfo.daysUntilExpiry < this.config.thresholds.sslExpiryDays) {
            issues.push({
              type: 'warning',
              title: `🟡 SSL por expirar: ${new URL(url).hostname}`,
              description: `El certificado SSL expira en ${sslInfo.daysUntilExpiry} días.\n\nURL: ${url}\nExpira: ${sslInfo.expiryDate}\nTiempo: ${new Date().toLocaleString()}`,
              priority: 2
            });
          }
        }
      } catch (error) {
        results.checks.ssl = { error: error.message };
      }
    }

    results.issues = issues;
    results.status = issues.length > 0 ? (issues.some(i => i.type === 'critical') ? 'critical' : 'warning') : 'ok';

    return results;
  }

  async checkSSL(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        host: urlObj.hostname,
        port: urlObj.port || 443,
        method: 'GET',
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        const cert = res.socket.getPeerCertificate();
        if (cert && cert.valid_to) {
          const expiryDate = new Date(cert.valid_to);
          const now = new Date();
          const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

          resolve({
            valid: res.socket.authorized,
            expiryDate: expiryDate.toLocaleDateString(),
            daysUntilExpiry,
            issuer: cert.issuer?.O || 'Unknown'
          });
        } else {
          resolve({ valid: false, daysUntilExpiry: null });
        }
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  async runChecks(verbose = false) {
    const results = [];
    const newIssues = [];

    if (verbose) console.log(`\n🔍 Monitoreando ${this.config.urls.length} URL(s)...\n`);

    for (const url of this.config.urls) {
      if (verbose) console.log(`  Checking ${url}...`);

      const result = await this.checkUrl(url);
      results.push(result);

      // Check for new issues (not already reported)
      for (const issue of result.issues) {
        const alertKey = `${url}-${issue.type}-${issue.title}`;
        const lastAlert = this.state.alerts[alertKey];
        const now = Date.now();

        // Only alert if not reported in the last 4 hours
        if (!lastAlert || (now - lastAlert) > 4 * 60 * 60 * 1000) {
          newIssues.push({ ...issue, url });
          this.state.alerts[alertKey] = now;
        }
      }

      if (verbose) {
        const statusIcon = result.status === 'ok' ? '✅' : result.status === 'critical' ? '🔴' : '🟡';
        console.log(`    ${statusIcon} ${result.status.toUpperCase()} - ${result.checks.responseTime || 0}ms`);
      }
    }

    this.state.lastCheck = new Date().toISOString();
    this.state.history.push({
      timestamp: this.state.lastCheck,
      results: results.map(r => ({ url: r.url, status: r.status }))
    });

    // Keep only last 100 history entries
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(-100);
    }

    this.saveState();

    return { results, newIssues };
  }

  async sendAlerts(issues, verbose = false) {
    if (!this.config.teamId) {
      if (verbose) console.log('⚠️  No hay equipo configurado. Usa: node index.js monitor setup');
      return [];
    }

    if (!this.linear.isConfigured()) {
      if (verbose) console.log('⚠️  Linear no está configurado.');
      return [];
    }

    const createdIssues = [];

    for (const issue of issues) {
      try {
        const description = `${issue.description}\n\n---\n*Alerta automática de ZTEST Monitor*`;

        // Create issue with assignee
        const result = await this.linear.query(`
          mutation($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                url
                title
              }
            }
          }
        `, {
          input: {
            teamId: this.config.teamId,
            title: issue.title,
            description: description,
            priority: issue.priority,
            assigneeId: this.config.assigneeId
          }
        });

        if (result.issueCreate.success) {
          createdIssues.push(result.issueCreate.issue);
          if (verbose) {
            console.log(`  📨 Alerta enviada: ${result.issueCreate.issue.identifier} → Gonzalo`);
          }
        }
      } catch (error) {
        if (verbose) console.log(`  ❌ Error enviando alerta: ${error.message}`);
      }
    }

    return createdIssues;
  }

  async monitor(verbose = false) {
    const { results, newIssues } = await this.runChecks(verbose);

    if (newIssues.length > 0) {
      if (verbose) console.log(`\n🚨 ${newIssues.length} nueva(s) alerta(s) detectada(s):`);
      const created = await this.sendAlerts(newIssues, verbose);

      return { results, alerts: created };
    } else {
      if (verbose) console.log('\n✅ Todo OK, sin alertas nuevas.');
      return { results, alerts: [] };
    }
  }

  getStatus() {
    return {
      configured: this.config.urls.length > 0 && this.config.teamId,
      urls: this.config.urls,
      teamId: this.config.teamId,
      assigneeId: this.config.assigneeId,
      lastCheck: this.state.lastCheck,
      thresholds: this.config.thresholds
    };
  }
}

module.exports = Monitor;
