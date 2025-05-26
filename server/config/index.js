module.exports = {
  port: process.env.PORT || 3001,
  dockerSocket: "/var/run/docker.sock",
  corsOrigin: "*",
  logLevel: "info"
};
