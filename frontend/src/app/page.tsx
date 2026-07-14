import { redirect } from "next/navigation";

export default function Home() {
  // RequireAuth on /student and /admin bounces to /login when there's no session,
  // and /login bounces back to the right home when there is one.
  redirect("/student");
}
