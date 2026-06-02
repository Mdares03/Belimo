import { hash } from "bcryptjs";
import { OrgType, RoleScope } from "@prisma/client";
import { prisma } from "../lib/db";

async function main() {
  const passwordHash = await hash("Evac2026!", 12);

  await prisma.reading.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingPeriod.deleteMany();
  await prisma.tariff.deleteMany();
  await prisma.valve.deleteMany();
  await prisma.local.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.building.deleteMany();
  await prisma.role.deleteMany();
  await prisma.organization.deleteMany();

  const evac = await prisma.organization.create({
    data: { name: "EVAC", type: OrgType.SYSTEM, contactEmail: "ddares@maliountech.com" },
  });

  const ownerOrg = await prisma.organization.create({
    data: { name: "Espacio Cancún", type: OrgType.OWNER, contactEmail: "espaciocancun@gmail.com" },
  });

  const adminRole = await prisma.role.create({
    data: {
      name: "Administrador",
      description: "Acceso total a operación, catálogos y configuración.",
      scope: RoleScope.ALL,
      active: true,
    },
  });

  const hvacRole = await prisma.role.create({
    data: {
      name: "Administrador HVAC",
      description: "Operación técnica de válvulas y lecturas Belimo.",
      scope: RoleScope.HVAC,
      active: true,
    },
  });

  const ownerRole = await prisma.role.create({
    data: {
      name: "Administrador Edificio",
      description: "Operación limitada a un edificio asignado.",
      scope: RoleScope.BUILDING,
      active: true,
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: "Cliente",
      description: "Consulta consumo, facturas y estado de cuenta propios.",
      scope: RoleScope.CLIENT,
      active: true,
    },
  });

  await prisma.user.create({
    data: {
      username: "ddareleo",
      name: "Daniel Dares",
      email: "ddares@maliountech.com",
      passwordHash,
      roleId: adminRole.id,
      orgId: evac.id,
    },
  });

  await prisma.user.create({
    data: {
      username: "expressairmty",
      name: "Express Air Mty",
      email: "cloud.belimo@expressairmty.com",
      passwordHash,
      roleId: hvacRole.id,
      orgId: evac.id,
    },
  });

  await prisma.user.create({
    data: {
      username: "espaciocancun",
      name: "Espacio Cancún",
      email: "espaciocancun@gmail.com",
      passwordHash,
      roleId: ownerRole.id,
      orgId: ownerOrg.id,
    },
  });

  await prisma.user.create({
    data: {
      username: "investport",
      name: "Invest Port",
      email: "contacto@investport.mx",
      passwordHash,
      roleId: clientRole.id,
      orgId: ownerOrg.id,
    },
  });

  console.log("Seed complete. Base orgs/roles/users created. Ingest Belimo data next.");
}

main().finally(async () => prisma.$disconnect());
