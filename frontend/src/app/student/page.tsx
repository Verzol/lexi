import { StudentApp } from "@/components/apps/StudentApp";
import { VerifyEmailBanner } from "@/components/ui/VerifyEmailBanner";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export const metadata = { title: "Lexi — Review Today" };

export default function StudentPage() {
  return (
    <RequireAuth role="student">
      <VerifyEmailBanner />
      <StudentApp />
    </RequireAuth>
  );
}
