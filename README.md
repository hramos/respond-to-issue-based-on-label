# GitHub Action: Respond to Issue Based on Label

A bot that responds with a comment whenever a particular label is applied to an issue. The bot also supports closing, reopening, locking issues, and adding labels.

## How It Works

If a label from a preconfigured list is applied to an issue, the bot will add a comment to the issue, close or reopen it, etc.

### Create `.github/label-actions.yml`

Create a `.github/label-actions.yml` file with a list of labels and actions.

The key is the name of the label in your repository that you want to match on (e.g. "Needs Issue Template") and the value is the action the bot should take when the label is applied to an issue.

#### Supported Commands

### `comment` (String)

The bot will add this string as a comment on the issue.

### `close` (Boolean)

The bot will close the issue if `true`.

### `reopen` (Boolean)

The bot will reopen the issue if `true`.

### `lock` (Boolean)

The bot will lock the issue if `true`.

### `labels` (Array)

The bot will apply these labels to the issue.

#### Basic Examples

Comment on, close and lock an issue:
```yml
needs-closing:
  comment: |
    This issue will be closed and locked because reasons.
  close: true
  lock: true
```

Adds a comment and applies the `needs-response` label to an issue:
```yml
needs-repro:
  comment: |
    Can you add reproduction steps to the issue?
  labels:
    - needs-response
```

### Create Workflow

Create a workflow (e.g. `.github/workflows/process-labels.yml`, see [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file)) to make use of the GitHub Action.

Handling issues:

```yml
name: Actions
# This workflow is triggered when a label is added to an issue.
on:
  issues:
    types: labeled

jobs:
  processLabelAction:
    name: Process Label Action
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Process Label Action
        uses: hramos/label-actions@v1
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

### `configuration-path`

Path to configuration file. Default `.github/label-actions.yml`.

### `repo-token`

_Note: This grants access to the `GITHUB_TOKEN` so the action can make calls to GitHub's API._

### `perform`

Set to false and the action will be omitted. Useful for dry-runs.

## Inspiration

This project is inspired by the [label-actions](https://github.com/dessant/label-actions) GitHub App by @dessant.
