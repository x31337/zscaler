const Docker = require("dockerode");
const si = require("systeminformation");
const docker = new Docker({socketPath: "/var/run/docker.sock"});

exports.getSystemStats = async () => {
  try {
    const [cpu, mem, network] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats()
    ]);
    return { cpu, mem, network: network[0] };
  } catch (error) {
    console.error("System stats error:", error);
    return { error: error.message };
  }
};

exports.getContainerStats = async () => {
  try {
    const containers = await docker.listContainers();
    const stats = await Promise.all(
      containers.map(async (container) => {
        const containerInfo = docker.getContainer(container.Id);
        const stats = await containerInfo.stats({ stream: false });
        return {
          id: container.Id,
          name: container.Names[0],
          status: container.State,
          cpu: stats.cpu_stats,
          memory: stats.memory_stats,
          network: stats.networks
        };
      })
    );
    return stats;
  } catch (error) {
    console.error("Docker stats error:", error);
    return [];
  }
};
