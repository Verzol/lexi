import { StudentApp } from "@/components/apps/StudentApp";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export const metadata = { title: "Lexi — Review Today" };

export default function StudentPage() {
  return (
    <RequireAuth role="student">
      <StudentApp />
    </RequireAuth>
  );
}
