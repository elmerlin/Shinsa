module.exports = {
  apps: [{
    name: 'shinsa',
    script: 'server/index.js',
    env: {
      DB_PATH: '/var/data/shinsa/shinsa.db',
      NODE_ENV: 'production'
    }
  }]
};
