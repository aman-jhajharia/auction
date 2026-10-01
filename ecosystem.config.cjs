module.exports = {
  apps: [
    {
      name: 'muqabla-auction',
      script: 'server/dist/index.js',
      cwd: './',
      instances: 1, // Authoritative auction state requires a single primary engine instance
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
