// MEKI API — PM2 process definition for the Ubuntu 24.04 VPS (docs/54 §3). No secrets here.
// Secrets live in /etc/meki/api.env (root:meki, 0640), loaded by Node 24's --env-file, never by PM2.
//   pm2 start deploy/vps/ecosystem.config.cjs && pm2 save && pm2 startup systemd
module.exports = {
  apps: [
    {
      name: 'meki-api',
      cwd: '/srv/meki/current/apps/api',
      script: 'dist/main.js',
      node_args: '--env-file=/etc/meki/api.env --enable-source-maps',
      // ONE instance only: the Gala job poller and the in-memory rate-limit store must not run twice (docs/36 A).
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '30s',
      restart_delay: 3000,
      max_memory_restart: '700M',
      // SIGTERM → Nest shutdown hooks (job poller stopped, DB pool closed); hard kill only after 30 s.
      kill_timeout: 30000,
      listen_timeout: 60000,
      // PORT=6666 and NODE_ENV=production come from /etc/meki/api.env; logs are JSON lines (LOG_FORMAT=json).
      out_file: '/var/log/meki/api.out.log',
      error_file: '/var/log/meki/api.err.log',
      merge_logs: true,
      time: false,
    },
  ],
};
