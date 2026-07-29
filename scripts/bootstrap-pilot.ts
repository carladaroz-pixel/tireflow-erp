import { bootstrapPilot, readPilotBootstrapConfig } from "../src/lib/bootstrap/pilot.ts";
import { pool, prisma } from "../src/lib/db/prisma.ts";

async function main() {
  const result = await bootstrapPilot(readPilotBootstrapConfig());
  process.stdout.write(
    `Pilot bootstrap ready: ${result.email} | organization ${result.organizationSlug}\n`,
  );
}

main()
  .catch(() => {
    process.stderr.write("Pilot bootstrap failed. Check the required configuration.\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
