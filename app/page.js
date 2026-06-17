import { redirect } from "next/navigation";

// Al entrar al sitio, va directo a la pantalla de ingreso.
export default function Home() {
  redirect("/login");
}
