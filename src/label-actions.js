// @flow
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
type LockReasonT = $Keys<typeof lockReasons>;
type LabelActionT = {|
  comment?: string,
  close?: boolean,
  lock?: boolean,
  lockReason?: LockReasonT,
  reopen?: boolean,
  labels?: Array<string>
|};

async function run() {
  try {
    const configPath = core.getInput("configuration-path");
    const token = core.getInput("repo-token");
    const client = new github.GitHub(token);
    const perform = core.getInput("perform");

    const { owner, repo } = github.context.repo;
    const { label, issue } = github.context.payload; // https://developer.github.com/v3/activity/events/types/#issuesevent
    const issue_number = issue.number;

    const labelActions: Map<string, LabelActionT> = await getLabelActions(
      client,
      configPath
    );

    if (labelActions.has(label.name)) {
      if (perform) {
        console.log(`${owner}/${repo}#${issue_number} performing label action`);
        // $FlowFixMe
        await performAction(client, labelActions.get(label.name), issue_number);
      } else {
        console.log(
          `${owner}/${repo}#${issue_number} would have been actioned on (dry-run)`
        );
      }
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function performAction(
  client: github.GitHub,
  labelAction: LabelActionT,
  issue_number: number
) {
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

async function addIssueComment(
  client: github.GitHub,
  body: string,
  issue_number: number
) {
  try {
    const response = await client.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      body
    });
  } catch (e) {
    console.log("addIssueComment error:" + e);
  }
}

async function addIssueLabels(
  client: github.GitHub,
  issue_number: number,
  labels: Array<string>
) {
  try {
    const response = await client.issues.addLabels({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      labels
    });
  } catch (e) {
    console.log("addIssueLabels error:" + e);
  }
}

async function closeIssue(client: github.GitHub, issue_number: number) {
  try {
    const response = await client.issues.update({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      state: "closed"
    });
  } catch (e) {
    console.log("closeIssue error:" + e);
  }
}

async function openIssue(client: github.GitHub, issue_number: number) {
  try {
    const response = await client.issues.update({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      state: "open"
    });
  } catch (e) {
    console.log("openIssue error:" + e);
  }
}

async function lockIssue(client: github.GitHub, issue_number: number) {
  try {
    const response = await client.issues.lock({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number
    });
  } catch (e) {
    console.log("lockIssue error:" + e);
  }
}

async function lockIssueWithReason(
  client: github.GitHub,
  issue_number: number,
  lock_reason?: LockReasonT
) {
  // TODO: Set application/vnd.github.sailor-v-preview+json Accept: header
  try {
    const response = await client.issues.lock({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number,
      lock_reason
    });
  } catch (e) {
    console.log("lockIssueWithReason error:" + e);
  }
}

async function getLabelActions(
  client: github.GitHub,
  configurationPath: string
): Promise<Map<string, LabelActionT>> {
  const configurationContent = await fetchContent(client, configurationPath);
  const configObject: any = yaml.safeLoad(configurationContent);
  return getLabelActionMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string
  // $FlowFixMe
): Promise<string> {
  try {
    const response: any = await client.repos.getContents({
      owner: github.context.payload.repository.owner.login,
      repo: github.context.payload.repository.name,
      path: repoPath,
      ref: github.context.sha
    });
    return Buffer.from(
      response.data.content,
      response.data.encoding
    ).toString();
  } catch (e) {
    console.log("error:" + e);
  }
}

function getLabelActionMapFromObject(
  configObject: any
): Map<string, LabelActionT> {
  const labelActionsMap: Map<string, LabelActionT> = new Map();
  for (const label in configObject) {
    const labelAction: LabelActionT = {
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
        throw Error(
          `found unexpected type for comment in label ${label} (should be string)`
        );
      }
    }
    if (configObject[label].hasOwnProperty("close")) {
      if (typeof configObject[label].close === "boolean") {
        labelAction.close = configObject[label].close;
      } else {
        throw Error(
          `found unexpected type for close in label ${label} (should be boolean)`
        );
      }
    }
    if (configObject[label].hasOwnProperty("reopen")) {
      if (typeof configObject[label].reopen === "boolean") {
        labelAction.reopen = configObject[label].reopen;
      } else {
        throw Error(
          `found unexpected type for reopen in label ${label} (should be boolean)`
        );
      }
    }
    if (configObject[label].hasOwnProperty("lock")) {
      if (typeof configObject[label].lock === "boolean") {
        labelAction.lock = configObject[label].lock;
      } else {
        throw Error(
          `found unexpected type for lock in label ${label} (should be boolean)`
        );
      }
    }
    if (configObject[label].hasOwnProperty("lockReason")) {
      if (typeof configObject[label].lockReason === "string") {
        // $FlowFixMe
        labelAction.lockReason = configObject[label].lockReason;
      } else {
        throw Error(
          `found unexpected type for lockReason in label ${label} (should be string)`
        );
      }
    }
    if (configObject[label].hasOwnProperty("labels")) {
      if (Array.isArray(configObject[label].labels)) {
        labelAction.labels = configObject[label].labels;
      } else {
        throw Error(
          `found unexpected type for labels in label ${label} (should be array of strings)`
        );
      }
    }
  }

  return labelActionsMap;
}

run();
