import { Button, Card, PageHead, Pill } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export default async function RolesPage() {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHead title="Roles">Alcances de permisos por tipo de usuario.</PageHead>
      <Card>
        <div className="flex justify-end p-5"><Button>+ Nuevo rol</Button></div>
        <table className="tbl">
          <thead><tr><th>Rol</th><th>Descripción</th><th>Alcance</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td className="font-bold">{role.name}</td>
                <td>{role.description}</td>
                <td><Pill tone="accent">{role.scope}</Pill></td>
                <td><Pill tone={role.active ? "good" : "bad"}>{role.active ? "Activo" : "Inactivo"}</Pill></td>
                <td className="r"><Button variant="ghost" size="sm">Editar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
