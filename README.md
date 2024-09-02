# Draft Release Action

This action creates a draft release for the next version to be released. It reads the release file in `.github/release.yml` and creates a draft release with the next version number based on the current version number and the labels of the pull requests merged since the last release.

To use this action, you need to create a release file in `.github/release.yml` as shown in the GitHub documentation for [creating a release file](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes).

> **Note**
>
> This action requires read and write access to the repository's releases, this usually means `contents: write` permissions for the job running the action.
>
> You might need to change the permissions granted to the GITHUB_TOKEN or use a personal token with the appropriate permissions.

To decide whether the next release should be a major or minor release, the action looks at the labels of the pull requests merged since the last release. If there is at least one pull request with the label specified in the `major-label` input, the next release will be a major release. Otherwise, if there is at least one pull request with the label specified in the `minor-label` input, the next release will be a minor release. Otherwise, the next release will be a patch release.

When the action is triggered on a tag push, the action will create a release with the version number specified in the tag.

## Simple Usage

```yaml
name: Draft Release

on:
  push:
    branches:
      - main

jobs:
  draft-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: lucacome/draft-release@v1.1.1
        with:
          minor-label: 'enhancement'
          major-label: 'change'
```

## Inputs

| Name           | Type      | Description                                                       |
| -------------- | --------- | ----------------------------------------------------------------- |
| `github-token` | `string`  | The GitHub token to use for the release. (default `github.token`) |
| `minor-label`  | `string`  | The label to use for minor releases. (default `enhancement`)      |
| `major-label`  | `string`  | The label to use for major releases. (default `change`)           |
| `notes-header` | `string`  | The header to use for the release notes.                          |
| `notes-footer` | `string`  | The footer to use for the release notes.                          |
| `variables`    | `list`    | A list of variables to use in the header and footer.              |
| `publish`      | `boolean` | Whether to publish the release. (default `false`)                 |

## Outputs

| Name               | Type     | Description                                                                          |
| ------------------ | -------- | ------------------------------------------------------------------------------------ |
| `version`          | `string` | The version number of the next release.                                              |
| `previous-version` | `string` | The version number of the previous release.                                          |
| `release-id`       | `string` | The ID of the next release.                                                          |
| `release-notes`    | `string` | The release notes of the next release.                                               |
| `release-url`      | `string` | The URL of the next release.                                                         |
| `release-sections` | `string` | A JSON output containing the release sections and the pull requests in each section. |

## Header and Footer

The header and footer have four special placeholders that will be replaced with the version number of the next release:

- `{{version}}` will be replaced with the version number of the next release.
- `{{version-number}}` will be replaced with the version number of the next release without the `v` prefix.
- `{{previous-version}}` will be replaced with the version number of the previous release.
- `{{previous-version-number}}` will be replaced with the version number of the previous release without the `v` prefix.

Additionally, you can use the `variables` input to define additional variables that can be used in the header and footer. These variables should be provided as a list of key-value pairs, using the format key=variable, with each pair separated by a new line. The key represents the variable name, while the value corresponds to the variable's assigned value. The variables can be used in the header and footer by using the syntax `{{variable-name}}`.

## Examples

### Add Footer

```yaml
name: Draft Release

on:
  push:
    branches:
      - main
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

permissions:
  contents: read

jobs:
  draft-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v3
      - uses: lucacome/draft-release@v1.1.1
        with:
          minor-label: 'enhancement'
          major-label: 'change'
          variables: |
            my-variable=My Variable
          notes-footer: |
            This is a footer.
            It can be multiline.
            And can use variables like {{version}} and {{version-number}}.
            Or custom variables like {{my-variable}}.
```

### Get Version Number of Next Release

```yaml
name: Draft Release

on:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  draft-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v3
      - uses: lucacome/draft-release@v1.1.1
        id: draft-release
        with:
          minor-label: 'enhancement'
          major-label: 'change'

      - name: Get Version Number
        run: echo ${{ steps.draft-release.outputs.version }}
```
