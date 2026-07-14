import { AdminApp } from "@/components/apps/AdminApp";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export const metadata = { title: "Lexi — Class overview" };

export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <AdminApp />
    </RequireAuth>
  );
}
