import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOverviewTool } from "./tools/overview";
import { registerProfileTools } from "./tools/profile";
import { registerRecoveryTools } from "./tools/recovery";
import { registerSleepTools } from "./tools/sleep";
import { registerWorkoutTools } from "./tools/workouts";

export function createWhoopMcpServer() {
  const server = new McpServer({
    name: "whoop-mcp-server",
    version: "2.0.0",
  });

  registerOverviewTool(server);
  registerProfileTools(server);
  registerRecoveryTools(server);
  registerSleepTools(server);
  registerWorkoutTools(server);

  return server;
}
