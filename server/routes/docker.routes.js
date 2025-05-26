const express = require("express");
const router = express.Router();
const dockerService = require("../services/docker.service");

router.get("/stats", async (req, res) => {
  try {
    const [systemStats, containerStats] = await Promise.all([
      dockerService.getSystemStats(),
      dockerService.getContainerStats()
    ]);
    res.json({ system: systemStats, containers: containerStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
