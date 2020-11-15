"use strict";

const core = require("@actions/core");

const github = require("@actions/github");

const yaml = require("js-yaml");

const lockReasons = {
  "off-topic": "off-topic",
  "too heated": "too heated",
  resolved: "resolved",
  spam: "spam"
};

async function run() {
  try {
    const configPath = core.getInput("configuration-path");
    const token = core.getInput("repo-token");
    const client = new github.GitHub(token);
    const perform = core.getInput("perform");
    const {
      owner,
      repo
    } = github.context.repo;
    const {
      label,
      issue
    } = github.context.payload; // https://developer.github.com/v3/activity/events/types/#issuesevent

    core.debug(`Label added: ${label.name}`);
    const issue_number = issue.number;
    core.debug(`Loading config at ${configPath}`);
    const labelActions = await getLabelActions(client, configPath);

    if (labelActions.has(label.name)) {
      if (perform) {
        console.log(`${owner}/${repo}#${issue_number} performing action for label ${label.name}`); // $FlowFixMe

        await performAction(client, labelActions.get(label.name), issue_number);
      } else {
        console.log(`${owner}/${repo}#${issue_number} would have been actioned on (dry-run)`);
      }
    } else {
      core.debug(`Ignoring label ${label.name}, no action found in config.`);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function performAction(client, labelAction, issue_number) {
  if (labelAction.comment) {
    await addIssueComment(client, labelAction.comment, issue_number);
  }

  if (labelAction.close) {
    await closeIssue(client, issue_number);
  }

  if (labelAction.reopen) {
    await openIssue(client, issue_number);
  }

  if (labelAction.lock && labelAction.lockReason) {
    await lockIssueWithReason(client, issue_number, labelAction.lockReason);
  } else if (labelAction.lock) {
    await lockIssue(client, issue_number);
  }

  if (labelAction.labels && labelAction.labels.length > 0) {
    await addIssueLabels(client, issue_number, labelAction.labels);
  }
}

async function addIssueComment(client, body, issue_number) {
  try {
    const response = await client.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      body
    });
  } catch (e) {
    throw Error(`Action failed. Could not add comment: ${e}`);
  }
}

async function addIssueLabels(client, issue_number, labels) {
  try {
    const response = await client.issues.addLabels({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      labels
    });
  } catch (e) {
    throw Error(`Action failed. Could not add labels: ${e}`);
  }
}

async function closeIssue(client, issue_number) {
  try {
    const response = await client.issues.update({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      state: "closed"
    });
  } catch (e) {
    throw Error(`Action failed. Could not close issue: ${e}`);
  }
}

async function openIssue(client, issue_number) {
  try {
    const response = await client.issues.update({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      state: "open"
    });
  } catch (e) {
    throw Error(`Action failed. Could not re-open issue: ${e}`);
  }
}

async function lockIssue(client, issue_number) {
  try {
    const response = await client.issues.lock({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number
    });
  } catch (e) {
    throw Error(`Action failed. Could not lock issue: ${e}`);
  }
}

async function lockIssueWithReason(client, issue_number, lock_reason) {
  // TODO: Set application/vnd.github.sailor-v-preview+json Accept: header
  try {
    const response = await client.issues.lock({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      lock_reason
    });
  } catch (e) {
    throw Error(`Action failed. Could not lock issue with lock reason: ${e}`);
  }
}

async function getLabelActions(client, configurationPath) {
  const configurationContent = await fetchContent(client, configurationPath);
  const configObject = yaml.safeLoad(configurationContent);
  return getLabelActionMapFromObject(configObject);
}

async function fetchContent(client, repoPath) {
  try {
    const response = await client.repos.getContents({
      owner: github.context.payload.repository.owner.login,
      repo: github.context.payload.repository.name,
      path: repoPath,
      ref: github.context.sha
    });
    return Buffer.from(response.data.content, response.data.encoding).toString();
  } catch (e) {
    throw Error(`Could not fetch repo contents: ${e}`);
  }
}

function getLabelActionMapFromObject(configObject) {
  const labelActionsMap = new Map();

  for (const label in configObject) {
    const labelAction = {
      comment: undefined,
      lock: false,
      reopen: false,
      lockReason: undefined,
      close: false,
      labels: []
    };

    if (configObject[label].hasOwnProperty("comment")) {
      if (typeof configObject[label].comment === "string") {
        labelAction.comment = configObject[label].comment;
      } else {
        throw Error(`found unexpected type for comment in label ${label} (should be string)`);
      }
    }

    if (configObject[label].hasOwnProperty("close")) {
      if (typeof configObject[label].close === "boolean") {
        labelAction.close = configObject[label].close;
      } else {
        throw Error(`found unexpected type for close in label ${label} (should be boolean)`);
      }
    }

    if (configObject[label].hasOwnProperty("reopen")) {
      if (typeof configObject[label].reopen === "boolean") {
        labelAction.reopen = configObject[label].reopen;
      } else {
        throw Error(`found unexpected type for reopen in label ${label} (should be boolean)`);
      }
    }

    if (configObject[label].hasOwnProperty("lock")) {
      if (typeof configObject[label].lock === "boolean") {
        labelAction.lock = configObject[label].lock;
      } else {
        throw Error(`found unexpected type for lock in label ${label} (should be boolean)`);
      }
    }

    if (configObject[label].hasOwnProperty("lockReason")) {
      if (typeof configObject[label].lockReason === "string") {
        // $FlowFixMe
        labelAction.lockReason = configObject[label].lockReason;
      } else {
        throw Error(`found unexpected type for lockReason in label ${label} (should be string)`);
      }
    }

    if (configObject[label].hasOwnProperty("labels")) {
      if (Array.isArray(configObject[label].labels)) {
        labelAction.labels = configObject[label].labels;
      } else {
        throw Error(`found unexpected type for labels in label ${label} (should be array of strings)`);
      }
    }

    labelActionsMap.set(label, labelAction);
  }

  return labelActionsMap;
}

run();