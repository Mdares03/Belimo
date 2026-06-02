import { AdminShell } from "@/components/shell/admin-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
