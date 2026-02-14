const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '.linear-config.json');

class LinearClient {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://api.linear.app/graphql';
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        this.apiKey = config.apiKey;
      }
    } catch (error) {
      // Config doesn't exist yet
    }
  }

  saveConfig(apiKey) {
    const config = { apiKey };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    this.apiKey = apiKey;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async query(graphqlQuery, variables = {}) {
    if (!this.apiKey) {
      throw new Error('Linear API key not configured. Run: node index.js linear-setup');
    }

    const response = await axios.post(
      this.baseUrl,
      { query: graphqlQuery, variables },
      {
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return response.data.data;
  }

  async getTeams() {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;
    const data = await this.query(query);
    return data.teams.nodes;
  }

  async getTeamLabels(teamId) {
    const query = `
      query($teamId: String!) {
        team(id: $teamId) {
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `;
    const data = await this.query(query, { teamId });
    return data.team.labels.nodes;
  }

  async createIssue(teamId, title, description, priority = 2, labelIds = []) {
    const query = `
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
    `;

    const input = {
      teamId,
      title,
      description,
      priority
    };

    if (labelIds.length > 0) {
      input.labelIds = labelIds;
    }

    const data = await this.query(query, { input });
    return data.issueCreate;
  }

  async findOrCreateLabel(teamId, labelName) {
    const labels = await this.getTeamLabels(teamId);
    const existing = labels.find(l => l.name.toLowerCase() === labelName.toLowerCase());

    if (existing) {
      return existing.id;
    }

    // Create new label
    const query = `
      mutation($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
          }
        }
      }
    `;

    const data = await this.query(query, {
      input: { teamId, name: labelName }
    });

    return data.issueLabelCreate.issueLabel.id;
  }
}

module.exports = LinearClient;
