# Weekly upstream Pages deploy

We keep the Cloudflare Pages app deployment in sync with the official upstream repository by running a scheduled GitHub Actions workflow in the fork.

## What it does

- runs every Monday at 03:00 UTC
- can also be triggered manually from GitHub Actions
- fetches `getpaseo/paseo@main`
- builds `packages/app`
- deploys to Cloudflare Pages project `paseo-zijieapi-de5-net`

## Required repository secrets

- `CLOUDFLARE_API_TOKEN`

## Required repository variables

- `CLOUDFLARE_ACCOUNT_ID`

## Workflow file

- `.github/workflows/weekly-upstream-pages-deploy.yml`

## Notes

- The workflow deploys the upstream commit directly.
- The fork branch does not need to mirror upstream history for the deployment itself.
- If the app build changes, update the workflow build command in the same file.
