// MEKI — PM2 process definitions for the DigitalOcean VPS (Ubuntu 24.04, Node 22, PM2 7). No secrets in this file.
// Runtime variables live in /etc/meki/{api,web,admin}.env (root:meki, 0640) and are loaded by Node's --env-file (Node >= 20.6),
// never by PM2 and never from the Git checkout. All three processes listen on 127.0.0.1 only; nginx is the only public entry.
//
//   pm2 start /srv/meki/current/deploy/vps/ecosystem.config.cjs && pm2 save && pm2 startup systemd -u meki --hp /home/meki
//   (redeploys: deploy/vps/deploy.sh switches /srv/meki/current and runs `pm2 reload ... --update-env`)
//
// Ports: meki-web 3000 (https://meki-us.org) · meki-admin 3001 (https://admin.meki-us.org) · meki-api 6666 (https://api.meki-us.org)
const ROOT = '/srv/meki/current';
const common = {
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_restarts: 20,
  min_uptime: '30s',
  restart_delay: 3000,
  kill_timeout: 30000,
  listen_timeout: 60000,
  merge_logs: true,
  time: false,
};
// Next.js is started through its own CLI with node, so --env-file applies (runtime, server-side variables only;
// NEXT_PUBLIC_* values are baked in at build time — see deploy/vps/web.env.example).
const next = (app, port) => ({
  ...common,
  name: `meki-${app}`,
  cwd: `${ROOT}/apps/${app}`,
  script: 'node_modules/next/dist/bin/next',
  args: `start --hostname 127.0.0.1 --port ${port}`,
  node_args: `--env-file=/etc/meki/${app}.env`,
  max_memory_restart: '900M',
  out_file: `/var/log/meki/${app}.out.log`,
  error_file: `/var/log/meki/${app}.err.log`,
});

module.exports = {
  apps: [
    {
      ...common,
      name: 'meki-api',
      cwd: `${ROOT}/apps/api`,
      script: 'dist/main.js',
      node_args: '--env-file=/etc/meki/api.env --enable-source-maps',
      // ONE instance only: the Gala job poller and the in-memory rate-limit store must not run twice (docs/36 A).
      // SIGTERM → Nest shutdown hooks (job poller stopped, DB pool closed); hard kill only after 30 s.
      max_memory_restart: '700M',
      // PORT=6666, API_BIND_HOST=127.0.0.1 and NODE_ENV=production come from /etc/meki/api.env; logs are JSON lines.
      out_file: '/var/log/meki/api.out.log',
      error_file: '/var/log/meki/api.err.log',
    },
    next('web', 3000),
    next('admin', 3001),
  ],
};
