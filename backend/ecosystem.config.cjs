const path = require("path");

module.exports = {
  apps: [
    {
      name: "drp-payment",
      cwd: __dirname,
      script: path.join(__dirname, "dist/server.cjs"),
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
