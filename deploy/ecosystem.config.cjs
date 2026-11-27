module.exports = {
  apps: [
    {
      name: 'raian-portfolio',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TRUST_PROXY_HOPS: 1
      }
    }
  ]
};
