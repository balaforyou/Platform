# CLAUDE.md — deploy/gcp-vm/

Loaded automatically alongside root `CLAUDE.md` whenever a session touches files in this directory (the Caddyfile, docker-compose.yml, and .env that the traps below actually reference).

- **`sudo` strips shell-exported env vars.** Use `sudo -E` when a variable needs to survive into a privileged command (relevant for deploy-time SHA checks).
- **A stale `migrate` Docker image reports success while skipping real migrations.** Always confirm via the build-SHA verification (`packages/database/scripts/verify-build-sha.mjs`), not just "no pending migrations" output.
- **Caddy needs `SITE_ADDRESS` and the real `Caddyfile` — check the VM's actual running config, don't assume it matches the repo.** Config drift between the VM and repo has caused real, hard-to-diagnose deploy failures.
- **SSH-to-VM commands lose `||` and `$VAR` to the intermediate shells.** `||` is read as the shell OR, and `$VAR` expands in the wrong shell. For anything beyond a trivial one-liner, ship a file: `scp` a `.sql`/script file → `docker cp` it into the container → run it there.
- **`scp` from Windows carries CRLF, which breaks heredoc terminators on the VM.** Run `sed -i 's/\r$//' <file>` after copying, or the script exits producing zero output and no error.
- **Compose reports `Started` without applying a changed `.env`.** Use `up -d --force-recreate <service>`, then confirm with `docker inspect <container> --format '{{json .Config.Env}}'` rather than trusting `docker compose config`, which resolves values the container may never receive.

See root `CLAUDE.md`'s "Deployment" section for the overall Docker Hub workflow and `docs/deploy_via_dockerhub_reference.md` for the full reference.
