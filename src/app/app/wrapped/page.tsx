import { redirect } from "next/navigation";

/** DrinkWrapped vive dentro de Estadísticas */
export default function WrappedRedirectPage() {
  redirect("/app/stats#wrapped");
}
