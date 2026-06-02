import { Avatar, Button, Card, PageHead, Pill } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export default async function UsuariosPage() {
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHead title="Usuarios">Personas con acceso a EVAC cloud.</PageHead>
      <Card>
        <div className="flex justify-end p-5"><Button>+ Nuevo</Button></div>
        <table className="tbl">
          <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><div className="flex items-center gap-3"><Avatar name={user.name} /><div><b>{user.name}</b><br /><span className="text-xs text-ink-3">@{user.username}</span></div></div></td>
                <td>{user.email}</td>
                <td><Pill tone={user.role.name === "Cliente" ? "accent" : "neutral"}>{user.role.name}</Pill></td>
                <td>{user.createdAt.toLocaleDateString("es-MX")}</td>
                <td className="r"><Button variant="ghost" size="sm">Editar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
